import os
import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database.postgres import get_db
from api.staff_deps import require_role
from services.invoice_pdf import generate_invoice_pdf

router = APIRouter()
logger = logging.getLogger(__name__)

# Canonical invoice PDF directory — all served files must live inside this path.
_PDF_DIR = (Path(__file__).parent.parent / "invoice_pdfs").resolve()


def _safe_pdf_path(raw_path: str) -> Path:
    """
    Resolve *raw_path* and verify it is inside _PDF_DIR.
    Raises HTTPException 403 if the resolved path escapes the directory
    (guards against path-traversal in stored invoice_pdf_path values).
    """
    resolved = Path(raw_path).resolve()
    try:
        resolved.relative_to(_PDF_DIR)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access to requested file is not allowed.")
    return resolved


# ── Pydantic models ───────────────────────────────────────────────────────────

class VoidRequest(BaseModel):
    void_reason: str
    voided_by: Optional[str] = "admin"


class ResendRequest(BaseModel):
    pass  # no body required; kept as a model for future extension


# ── Shared helper: post-insert credit memo linkage ────────────────────────────

async def apply_credit_memo_to_invoice(
    db,
    memo_id: str,
    invoice_id: str,
    memo_amount: float,
) -> None:
    """
    After a credit memo row has been inserted, call this to:
      1. Write memo_id → invoices.credit_note_id (last-write wins; field stores the
         most recent memo; full history is always in the credit_memos table).
      2. Recalculate and persist invoices.balance_due_inr.
      3. Update payment_status to 'partial' or 'paid' accordingly.
      4. Append an INVOICE_CREDIT_APPLIED row to audit_log.

    All steps are wrapped in individual try/except so a logging failure
    never rolls back the credit itself.
    """
    try:
        inv = await db.fetchrow(
            "SELECT balance_due_inr, total_amount_inr, payment_status FROM invoices WHERE invoice_id = $1",
            invoice_id,
        )
        if not inv:
            logger.warning("apply_credit_memo_to_invoice: invoice %s not found", invoice_id)
            return

        current_balance = float(inv["balance_due_inr"] or 0)
        new_balance     = max(round(current_balance - memo_amount, 2), 0.0)
        new_status      = "paid" if new_balance == 0.0 else (
            "partial" if new_balance < float(inv["total_amount_inr"] or 0) else inv["payment_status"]
        )

        await db.execute(
            """UPDATE invoices
               SET credit_note_id    = $1,
                   balance_due_inr   = $2,
                   payment_status    = $3,
                   updated_at        = NOW()
               WHERE invoice_id = $4""",
            memo_id,
            new_balance,
            new_status,
            invoice_id,
        )
    except Exception as exc:
        logger.error("apply_credit_memo_to_invoice UPDATE failed for %s: %s", invoice_id, exc)
        return  # skip audit log if the update itself failed

    try:
        await db.execute(
            """INSERT INTO audit_log
               (event_type, agent_name, invoice_id, action, details)
               VALUES ($1, $2, $3, $4, $5)""",
            "INVOICE_CREDIT_APPLIED",
            "credit_memo_api",
            invoice_id,
            "apply_credit_memo",
            json.dumps({
                "memo_id":         memo_id,
                "memo_amount_inr": memo_amount,
                "balance_before":  current_balance,
                "balance_after":   new_balance,
                "new_status":      new_status,
            }),
        )
    except Exception as exc:
        logger.error("audit_log insert failed for credit memo %s on invoice %s: %s", memo_id, invoice_id, exc)


INVOICE_READ_ROLES = ["admin", "dispute_manager", "collections_analyst"]

@router.get("")
async def list_invoices(
    status: str = None,
    customer_id: str = None,
    limit: int = 50,
    offset: int = 0,
    db=Depends(get_db),
    staff=Depends(require_role(INVOICE_READ_ROLES)),
):
    q = "SELECT * FROM invoices WHERE 1=1"
    params = []
    if status:
        params.append(status)
        q += f" AND payment_status = ${len(params)}"
    if customer_id:
        params.append(customer_id)
        q += f" AND customer_id = ${len(params)}"
    params.extend([limit, offset])
    q += f" ORDER BY created_at DESC LIMIT ${len(params)-1} OFFSET ${len(params)}"
    rows = await db.fetch(q, *params)
    return {"invoices": [dict(r) for r in rows]}


@router.get("/stats/summary")
async def invoice_summary(db=Depends(get_db), staff=Depends(require_role(INVOICE_READ_ROLES))):
    total = await db.fetchval("SELECT COUNT(*) FROM invoices")
    overdue = await db.fetchval("SELECT COUNT(*) FROM invoices WHERE payment_status = 'overdue'")
    total_outstanding = (
        await db.fetchval(
            "SELECT COALESCE(SUM(balance_due_inr),0) FROM invoices WHERE payment_status != 'paid'"
        ) or 0
    )
    return {"total": total, "overdue": overdue, "total_outstanding_inr": float(total_outstanding)}


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(invoice_id: str, db=Depends(get_db)):
    """
    Return the invoice PDF as a downloadable attachment.

    - Serves the cached file if invoice_pdf_path exists and the file is present.
    - Regenerates the PDF on-the-fly if the path is missing or the file has been deleted.
    - Path-traversal safe: only files inside the invoice_pdfs directory are served.
    """
    inv = await db.fetchrow("SELECT * FROM invoices WHERE invoice_id = $1", invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv = dict(inv)

    # Block PDF download for voided invoices
    if inv.get("payment_status") == "voided":
        raise HTTPException(
            status_code=409,
            detail=f"Invoice {invoice_id} has been voided and its PDF cannot be downloaded.",
        )

    pdf_path: str | None = inv.get("invoice_pdf_path")

    # ── Try to serve the cached PDF ──────────────────────────────────────────
    if pdf_path:
        try:
            safe = _safe_pdf_path(pdf_path)
            if safe.is_file():
                return FileResponse(
                    path        = str(safe),
                    media_type  = "application/pdf",
                    filename    = f"invoice-{invoice_id}.pdf",
                    headers     = {"Content-Disposition": f'attachment; filename="invoice-{invoice_id}.pdf"'},
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Cached PDF unreadable for %s (%s) — regenerating", invoice_id, exc)

    # ── Regenerate PDF ───────────────────────────────────────────────────────
    logger.info("Regenerating invoice PDF for %s", invoice_id)

    order_id = inv.get("order_id")
    order = await db.fetchrow("SELECT * FROM orders WHERE order_id = $1", order_id) if order_id else None

    customer_id = inv.get("customer_id")
    customer = (
        await db.fetchrow("SELECT * FROM customers WHERE customer_id = $1", customer_id)
        if customer_id else None
    )

    sku_id = order["sku_id"] if order and order.get("sku_id") else None
    product = (
        await db.fetchrow("SELECT * FROM products WHERE sku_id = $1", sku_id)
        if sku_id else None
    )

    try:
        new_path = generate_invoice_pdf(
            invoice  = inv,
            order    = dict(order) if order else {},
            customer = dict(customer) if customer else {},
            product  = dict(product) if product else {},
        )
    except Exception as exc:
        logger.error("PDF regeneration failed for %s: %s", invoice_id, exc)
        raise HTTPException(status_code=500, detail=f"Could not generate invoice PDF: {exc}")

    # Persist the new path so future requests hit the cache
    await db.execute(
        "UPDATE invoices SET invoice_pdf_path = $1, updated_at = NOW() WHERE invoice_id = $2",
        new_path, invoice_id,
    )

    safe_new = _safe_pdf_path(new_path)
    return FileResponse(
        path        = str(safe_new),
        media_type  = "application/pdf",
        filename    = f"invoice-{invoice_id}.pdf",
        headers     = {"Content-Disposition": f'attachment; filename="invoice-{invoice_id}.pdf"'},
    )


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, db=Depends(get_db), staff=Depends(require_role(INVOICE_READ_ROLES))):
    row = await db.fetchrow("SELECT * FROM invoices WHERE invoice_id = $1", invoice_id)
    if not row:
        raise HTTPException(404, "Invoice not found")
    inv = dict(row)

    # Enrich with linked credit memos
    memo_rows = await db.fetch(
        "SELECT * FROM credit_memos WHERE invoice_id = $1 ORDER BY created_at ASC",
        invoice_id,
    )
    inv["credit_memos"] = [dict(m) for m in memo_rows]
    inv["total_credited_inr"] = sum(float(m.get("amount_inr") or 0) for m in inv["credit_memos"])

    return inv


# ── POST /invoices/{invoice_id}/void ─────────────────────────────────────────

@router.post("/{invoice_id}/void")
async def void_invoice(invoice_id: str, body: VoidRequest, db=Depends(get_db)):
    """
    Void an invoice.

    - A **paid** invoice cannot be voided (a credit memo / refund workflow
      should be used instead).
    - An already-voided invoice cannot be voided again.
    - Sets payment_status = 'voided', records voided_at / voided_by /
      void_reason, and appends an audit_log entry.
    - The invoice row is never deleted.
    - PDF download is blocked for voided invoices (enforced in the /pdf endpoint).
    """
    inv = await db.fetchrow("SELECT * FROM invoices WHERE invoice_id = $1", invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    inv = dict(inv)
    current_status = inv.get("payment_status", "")

    if current_status == "paid":
        raise HTTPException(
            status_code=409,
            detail=(
                "Invoice is already paid and cannot be voided. "
                "Use a credit memo or refund workflow instead."
            ),
        )

    if current_status == "voided":
        raise HTTPException(
            status_code=409,
            detail="Invoice is already voided.",
        )

    # Apply void
    await db.execute(
        """UPDATE invoices
           SET payment_status = 'voided',
               voided_at      = NOW(),
               voided_by      = $1,
               void_reason    = $2,
               updated_at     = NOW()
           WHERE invoice_id = $3""",
        body.voided_by or "admin",
        body.void_reason,
        invoice_id,
    )

    # Audit log entry
    try:
        await db.execute(
            """INSERT INTO audit_log
               (event_type, agent_name, invoice_id, customer_id, order_id, action, details)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            "INVOICE_VOIDED",
            "admin_invoice_api",
            invoice_id,
            inv.get("customer_id", ""),
            inv.get("order_id", ""),
            "void_invoice",
            json.dumps({
                "invoice_id":      invoice_id,
                "previous_status": current_status,
                "void_reason":     body.void_reason,
                "voided_by":       body.voided_by or "admin",
            }),
        )
    except Exception as exc:
        # Audit failure must not roll back the void
        logger.error("audit_log insert failed for void of %s: %s", invoice_id, exc)

    logger.info("Invoice %s voided by %s: %s", invoice_id, body.voided_by, body.void_reason)

    return {
        "invoice_id":     invoice_id,
        "payment_status": "voided",
        "voided_by":      body.voided_by or "admin",
        "void_reason":    body.void_reason,
        "message":        f"Invoice {invoice_id} has been voided.",
    }


# ── POST /invoices/{invoice_id}/resend ────────────────────────────────────────

@router.post("/{invoice_id}/resend")
async def resend_invoice(invoice_id: str, db=Depends(get_db)):
    """
    Resend the invoice email (with PDF attachment) to the customer.

    - Voided invoices cannot be resent.
    - Regenerates the PDF if the file is missing.
    - Logs the send attempt to invoice_email_log.
    """
    inv = await db.fetchrow("SELECT * FROM invoices WHERE invoice_id = $1", invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    inv = dict(inv)

    if inv.get("payment_status") == "voided":
        raise HTTPException(
            status_code=409,
            detail="Cannot resend a voided invoice.",
        )

    customer_id = inv.get("customer_id")
    customer = (
        await db.fetchrow("SELECT * FROM customers WHERE customer_id = $1", customer_id)
        if customer_id else None
    )
    if not customer or not customer.get("email"):
        raise HTTPException(status_code=422, detail="Customer email not found for this invoice.")

    customer = dict(customer)

    # Ensure PDF exists
    pdf_path: str | None = inv.get("invoice_pdf_path")
    if not pdf_path or not Path(pdf_path).is_file():
        order_id = inv.get("order_id")
        order    = await db.fetchrow("SELECT * FROM orders WHERE order_id = $1", order_id) if order_id else None
        sku_id   = order["sku_id"] if order and order.get("sku_id") else None
        product  = await db.fetchrow("SELECT * FROM products WHERE sku_id = $1", sku_id) if sku_id else None
        try:
            pdf_path = generate_invoice_pdf(
                invoice  = inv,
                order    = dict(order) if order else {},
                customer = customer,
                product  = dict(product) if product else {},
            )
            await db.execute(
                "UPDATE invoices SET invoice_pdf_path = $1, updated_at = NOW() WHERE invoice_id = $2",
                pdf_path, invoice_id,
            )
        except Exception as exc:
            logger.error("PDF regeneration failed during resend for %s: %s", invoice_id, exc)
            pdf_path = None  # send without attachment rather than failing

    # Send email
    from api.customer_portal import send_email_with_attachment
    from services.email_service import log_invoice_email
    from config import settings as app_settings

    pay_link = f"{app_settings.frontend_url}/portal/outstanding"
    email_err = None
    try:
        send_email_with_attachment(
            to              = customer["email"],
            subject         = f"Invoice {invoice_id} (Resent) — ₹{float(inv.get('total_amount_inr', 0)):,.0f} | MAQ Manufacturing",
            body            = (
                f"Dear {customer.get('contact_name') or customer.get('company_name')},\n\n"
                f"Please find your invoice attached (resent copy).\n\n"
                f"Invoice ID : {invoice_id}\n"
                f"Total      : ₹{float(inv.get('total_amount_inr', 0)):,.0f}\n"
                f"Status     : {inv.get('payment_status', '').upper()}\n"
                f"Due Date   : {inv.get('due_date', '—')}\n\n"
                f"Pay online : {pay_link}\n\n"
                f"Regards,\nMAQ Manufacturing — Finance Team"
            ),
            attachment_path = pdf_path,
            attachment_name = f"{invoice_id}.pdf",
        )
    except Exception as exc:
        email_err = str(exc)
        logger.error("Resend email failed for %s: %s", invoice_id, exc)

    await log_invoice_email(
        db         = db,
        invoice_id = invoice_id,
        recipient  = customer["email"],
        status     = "failed" if email_err else "sent",
        error      = email_err,
    )

    if email_err:
        raise HTTPException(status_code=500, detail=f"Email delivery failed: {email_err}")

    return {
        "invoice_id": invoice_id,
        "resent_to":  customer["email"],
        "message":    f"Invoice {invoice_id} resent successfully to {customer['email']}.",
    }
