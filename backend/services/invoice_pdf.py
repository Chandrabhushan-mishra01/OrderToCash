"""
O2C Agent v2.0 — Invoice PDF Generator
========================================
Generates a ReportLab PDF invoice for each approved order.

DISCLAIMER: This produces DEMO invoices only.
No real GST/IRP submission is made. The e-invoice section
is populated by mock_irp.py and is NOT valid for tax purposes.
"""

import os
import logging
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.platypus.flowables import KeepTogether

from services.mock_irp import generate_mock_irp_data

logger = logging.getLogger(__name__)

# ── Colour palette ────────────────────────────────────────────────────────────
DARK_NAVY   = colors.HexColor("#1E2A4A")
ACCENT_TEAL = colors.HexColor("#0D9488")
LIGHT_GRAY  = colors.HexColor("#F1F5F9")
MID_GRAY    = colors.HexColor("#94A3B8")
TEXT_DARK   = colors.HexColor("#0F172A")
RED_ALERT   = colors.HexColor("#DC2626")
WHITE       = colors.white

# ── Page geometry ─────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4          # 595.27 x 841.89 pt
MARGIN        = 18 * mm
CONTENT_W     = PAGE_W - 2 * MARGIN


# ── Helper: defensive field accessor ─────────────────────────────────────────
def _get(row, *keys, default=""):
    """
    Try each key in order against a dict-like or object-like row.
    Returns the first non-None hit; falls back to *default*.
    Works with asyncpg Record, plain dict, dataclass, or anything with __getitem__.
    """
    for key in keys:
        # dict / asyncpg Record
        try:
            val = row[key]
            if val is not None:
                return val
        except (KeyError, TypeError, IndexError):
            pass
        # object attribute
        try:
            val = getattr(row, key, None)
            if val is not None:
                return val
        except Exception:
            pass
    return default


def _fmt_inr(amount) -> str:
    """Format a number as Indian Rupee string, e.g. ₹1,23,456.78"""
    try:
        f = float(amount)
    except (TypeError, ValueError):
        return "₹0.00"
    # Indian grouping: last 3 digits, then pairs
    negative = f < 0
    f = abs(f)
    integer_part = int(f)
    decimal_part  = round((f - integer_part) * 100)
    s = str(integer_part)
    if len(s) > 3:
        # last 3 then groups of 2
        result = s[-3:]
        s = s[:-3]
        while s:
            result = s[-2:] + "," + result
            s = s[:-2]
    else:
        result = s
    formatted = ("−" if negative else "") + "₹" + result + f".{decimal_part:02d}"
    return formatted


def _fmt_date(dt) -> str:
    if dt is None:
        return "—"
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except ValueError:
            return dt
    try:
        return dt.strftime("%d %b %Y")
    except Exception:
        return str(dt)


# ── Style helpers ─────────────────────────────────────────────────────────────
def _styles():
    base = getSampleStyleSheet()
    custom = {}

    def add(name, **kw):
        custom[name] = ParagraphStyle(name, **kw)

    add("company_name",  fontName="Helvetica-Bold",  fontSize=16, textColor=WHITE,       leading=20, alignment=TA_LEFT)
    add("company_sub",   fontName="Helvetica",        fontSize=8,  textColor=colors.HexColor("#CBD5E1"), leading=11, alignment=TA_LEFT)
    add("invoice_title", fontName="Helvetica-Bold",   fontSize=22, textColor=WHITE,       leading=26, alignment=TA_RIGHT)
    add("invoice_meta",  fontName="Helvetica",        fontSize=9,  textColor=colors.HexColor("#CBD5E1"), leading=13, alignment=TA_RIGHT)
    add("invoice_meta_val", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE,       leading=13, alignment=TA_RIGHT)
    add("section_head",  fontName="Helvetica-Bold",   fontSize=8,  textColor=ACCENT_TEAL, leading=12, alignment=TA_LEFT, spaceAfter=2)
    add("body_label",    fontName="Helvetica-Bold",   fontSize=8,  textColor=TEXT_DARK,   leading=11, alignment=TA_LEFT)
    add("body_val",      fontName="Helvetica",         fontSize=9,  textColor=TEXT_DARK,   leading=12, alignment=TA_LEFT)
    add("body_val_right",fontName="Helvetica",         fontSize=9,  textColor=TEXT_DARK,   leading=12, alignment=TA_RIGHT)
    add("tbl_head",      fontName="Helvetica-Bold",   fontSize=8,  textColor=WHITE,       leading=11, alignment=TA_CENTER)
    add("tbl_cell",      fontName="Helvetica",         fontSize=8,  textColor=TEXT_DARK,   leading=11, alignment=TA_LEFT)
    add("tbl_cell_right",fontName="Helvetica",         fontSize=8,  textColor=TEXT_DARK,   leading=11, alignment=TA_RIGHT)
    add("tbl_cell_center",fontName="Helvetica",        fontSize=8,  textColor=TEXT_DARK,   leading=11, alignment=TA_CENTER)
    add("total_label",   fontName="Helvetica-Bold",   fontSize=9,  textColor=TEXT_DARK,   leading=13, alignment=TA_RIGHT)
    add("total_val",     fontName="Helvetica-Bold",   fontSize=9,  textColor=TEXT_DARK,   leading=13, alignment=TA_RIGHT)
    add("grand_label",   fontName="Helvetica-Bold",   fontSize=11, textColor=WHITE,       leading=15, alignment=TA_RIGHT)
    add("grand_val",     fontName="Helvetica-Bold",   fontSize=11, textColor=WHITE,       leading=15, alignment=TA_RIGHT)
    add("irp_head",      fontName="Helvetica-Bold",   fontSize=8,  textColor=DARK_NAVY,   leading=11, alignment=TA_LEFT)
    add("irp_val",       fontName="Helvetica",         fontSize=7,  textColor=TEXT_DARK,   leading=10, alignment=TA_LEFT, wordWrap="CJK")
    add("pay_head",      fontName="Helvetica-Bold",   fontSize=9,  textColor=ACCENT_TEAL, leading=13, alignment=TA_LEFT)
    add("pay_val",       fontName="Helvetica",         fontSize=9,  textColor=TEXT_DARK,   leading=13, alignment=TA_LEFT)
    add("disclaimer",    fontName="Helvetica-Oblique", fontSize=7, textColor=MID_GRAY,    leading=10, alignment=TA_CENTER)
    add("qr_text",       fontName="Courier",           fontSize=6,  textColor=MID_GRAY,    leading=8,  alignment=TA_LEFT, wordWrap="CJK")
    return custom


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_invoice_pdf(
    invoice,
    order,
    customer,
    product,
    output_dir: str | None = None,
) -> str:
    """
    Generate a PDF invoice and return the saved file path.

    Parameters
    ----------
    invoice    : dict-like or asyncpg Record for the invoices table row
    order      : dict-like or asyncpg Record for the orders table row
    customer   : dict-like or asyncpg Record for the customers table row
    product    : dict-like or asyncpg Record for the products table row
    output_dir : directory to save PDFs (default: ./invoice_pdfs)

    Returns
    -------
    str — absolute path to the generated PDF
    """

    # ── Output directory ──────────────────────────────────────────────────────
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(__file__), "..", "invoice_pdfs")
    out_path = Path(output_dir).resolve()
    out_path.mkdir(parents=True, exist_ok=True)

    invoice_id  = _get(invoice, "invoice_id", default="INV-UNKNOWN")
    pdf_path    = str(out_path / f"{invoice_id}.pdf")

    # ── Env-supplied company info ──────────────────────────────────────────────
    company_name    = os.environ.get("INVOICE_COMPANY_NAME",    "MAQ Manufacturing Pvt Ltd")
    company_address = os.environ.get("INVOICE_COMPANY_ADDRESS", "Plot 42, MIDC Industrial Area, Pune, Maharashtra – 411019")
    seller_gstin    = os.environ.get("MOCK_SELLER_GSTIN",        "27AABCM1234F1ZY")  # Maharashtra demo GSTIN

    # ── Field extraction ──────────────────────────────────────────────────────
    # Invoice
    inv_date   = _get(invoice, "invoice_date",   "created_at",   default=datetime.now(timezone.utc))
    due_date   = _get(invoice, "due_date",        default=datetime.now(timezone.utc))
    subtotal   = float(_get(invoice, "subtotal_inr",           default=0) or 0)
    gst_amt    = float(_get(invoice, "gst_amount_inr",         default=0) or 0)
    total_amt  = float(_get(invoice, "total_amount_inr",       default=0) or 0)
    pay_status = _get(invoice, "payment_status",  default="pending")
    pay_token  = _get(invoice, "payment_token",   default="")
    po_ref     = _get(invoice, "po_reference",    default="")

    # Derive missing subtotal/gst from total if needed
    if subtotal == 0 and total_amt > 0:
        gst_rate_pct = float(_get(product, "gst_rate_pct", default=18) or 18)
        subtotal = round(total_amt / (1 + gst_rate_pct / 100), 2)
        gst_amt  = round(total_amt - subtotal, 2)

    cgst_amt = round(gst_amt / 2, 2)
    sgst_amt = round(gst_amt - cgst_amt, 2)

    # Order
    quantity    = int(_get(order, "quantity",     default=1) or 1)
    unit_price  = float(_get(order, "unit_price_inr", default=subtotal / max(quantity, 1)) or 0)
    gst_pct     = float(_get(order, "gst_pct",    default=18) or 18)

    # Customer
    cust_name   = _get(customer, "company_name",  default="Unknown Customer")
    cust_email  = _get(customer, "email",          default="")
    cust_gstin  = _get(customer, "gstin",          default="")
    billing_addr= _get(customer, "billing_address", default="")
    city        = _get(customer, "city",            default="")
    state       = _get(customer, "state",           default="")
    pincode     = _get(customer, "pincode",         default="")
    address_parts = [p for p in [billing_addr, city, state, pincode] if p]
    full_address  = ", ".join(address_parts) or "Address not on record"

    # Product
    prod_name = _get(product, "product_name", default=_get(order, "sku_id", default="—"))
    hsn_code  = _get(product, "hsn_code",     default="—")
    uom       = _get(product, "unit_of_measure", default="Units")
    sku_id    = _get(order,   "sku_id",        default="—")

    # ── Mock IRP data ─────────────────────────────────────────────────────────
    irp_data = generate_mock_irp_data(
        invoice_number  = invoice_id,
        invoice_id      = invoice_id,
        total_amount    = total_amt,
        gst_amount      = gst_amt,
        seller_gstin    = seller_gstin,
        customer_gstin  = cust_gstin or "UNREGISTERED",
    )

    # ── Build PDF document ────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize   = A4,
        leftMargin  = MARGIN,
        rightMargin = MARGIN,
        topMargin   = 12 * mm,
        bottomMargin= 14 * mm,
        title       = f"Invoice {invoice_id}",
        author      = company_name,
    )

    S = _styles()
    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # 1. HEADER BANNER — dark navy background
    # ══════════════════════════════════════════════════════════════════════════
    header_left = [
        [Paragraph(company_name, S["company_name"])],
        [Paragraph(company_address, S["company_sub"])],
        [Spacer(1, 4)],
        [Paragraph(f"GSTIN: {seller_gstin}", S["company_sub"])],
    ]
    header_right = [
        [Paragraph("TAX INVOICE", S["invoice_title"])],
        [Paragraph(f"Invoice No: <b>{invoice_id}</b>", S["invoice_meta_val"])],
        [Paragraph(f"Invoice Date: {_fmt_date(inv_date)}", S["invoice_meta"])],
        [Paragraph(f"Due Date: {_fmt_date(due_date)}", S["invoice_meta"])],
    ]
    if po_ref:
        header_right.append([Paragraph(f"PO Ref: {po_ref}", S["invoice_meta"])])

    banner_table = Table(
        [[
            Table(header_left,  colWidths=[CONTENT_W * 0.55]),
            Table(header_right, colWidths=[CONTENT_W * 0.45]),
        ]],
        colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45],
    )
    banner_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), DARK_NAVY),
        ("ROUNDEDCORNERS", [6]),
        ("TOPPADDING",   (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 12),
        ("LEFTPADDING",  (0, 0), (0,  -1), 14),
        ("RIGHTPADDING", (1, 0), (1,  -1), 14),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 8))

    # ══════════════════════════════════════════════════════════════════════════
    # 2. BILL-TO / SELLER INFO BAR
    # ══════════════════════════════════════════════════════════════════════════
    bill_to_data = [
        [Paragraph("BILL TO", S["section_head"]),
         Paragraph("FROM", S["section_head"])],
        [Paragraph(cust_name,    S["body_label"]),
         Paragraph(company_name, S["body_label"])],
        [Paragraph(full_address, S["body_val"]),
         Paragraph(company_address, S["body_val"])],
    ]
    if cust_email:
        bill_to_data.append([
            Paragraph(f"Email: {cust_email}", S["body_val"]),
            Paragraph(f"GSTIN: {seller_gstin}", S["body_val"]),
        ])
    if cust_gstin:
        bill_to_data.append([
            Paragraph(f"GSTIN: {cust_gstin}", S["body_val"]),
            Paragraph("", S["body_val"]),
        ])

    bill_table = Table(bill_to_data, colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
    bill_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), LIGHT_GRAY),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LINEAFTER",    (0, 0), (0, -1),  0.5, MID_GRAY),
        ("ROUNDEDCORNERS", [4]),
    ]))
    story.append(bill_table)
    story.append(Spacer(1, 10))

    # ══════════════════════════════════════════════════════════════════════════
    # 3. LINE ITEMS TABLE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("LINE ITEMS", S["section_head"]))

    col_w = [
        CONTENT_W * 0.04,   # #
        CONTENT_W * 0.25,   # Description
        CONTENT_W * 0.10,   # SKU
        CONTENT_W * 0.08,   # HSN
        CONTENT_W * 0.07,   # UOM
        CONTENT_W * 0.07,   # Qty
        CONTENT_W * 0.13,   # Unit Price
        CONTENT_W * 0.08,   # GST%
        CONTENT_W * 0.10,   # GST Amt
        CONTENT_W * 0.08,   # Line Total
    ]

    def _ph(text, style="tbl_head"):
        return Paragraph(str(text), S[style])

    items_header = [
        _ph("#"), _ph("Description"), _ph("SKU"), _ph("HSN"),
        _ph("UOM"), _ph("Qty"), _ph("Unit Price (₹)"),
        _ph("GST %"), _ph("GST Amt (₹)"), _ph("Total (₹)"),
    ]

    line_total    = subtotal
    gst_line_amt  = gst_amt

    items_row = [
        _ph("1", "tbl_cell_center"),
        _ph(prod_name, "tbl_cell"),
        _ph(sku_id, "tbl_cell"),
        _ph(hsn_code, "tbl_cell_center"),
        _ph(uom, "tbl_cell_center"),
        _ph(str(quantity), "tbl_cell_center"),
        _ph(_fmt_inr(unit_price), "tbl_cell_right"),
        _ph(f"{gst_pct:.0f}%", "tbl_cell_center"),
        _ph(_fmt_inr(gst_line_amt), "tbl_cell_right"),
        _ph(_fmt_inr(line_total + gst_line_amt), "tbl_cell_right"),
    ]

    items_table = Table(
        [items_header, items_row],
        colWidths=col_w,
        repeatRows=1,
    )
    items_table.setStyle(TableStyle([
        # Header row
        ("BACKGROUND",    (0, 0), (-1, 0),  DARK_NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("TOPPADDING",    (0, 0), (-1, 0),  7),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  7),
        # Data rows
        ("BACKGROUND",    (0, 1), (-1, -1), WHITE),
        ("TOPPADDING",    (0, 1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        # Grid
        ("LINEBELOW",     (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
        ("LINEBELOW",     (0, 0), (-1,  0), 0,   WHITE),  # no line inside header
        ("BOX",           (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 6))

    # ══════════════════════════════════════════════════════════════════════════
    # 4. TOTALS (right-aligned block)
    # ══════════════════════════════════════════════════════════════════════════
    totals_rows = [
        [Paragraph("Subtotal (before GST)", S["total_label"]),
         Paragraph(_fmt_inr(subtotal), S["total_val"])],
        [Paragraph(f"CGST @ {gst_pct/2:.1f}%", S["total_label"]),
         Paragraph(_fmt_inr(cgst_amt), S["total_val"])],
        [Paragraph(f"SGST @ {gst_pct/2:.1f}%", S["total_label"]),
         Paragraph(_fmt_inr(sgst_amt), S["total_val"])],
        [Paragraph("Total GST", S["total_label"]),
         Paragraph(_fmt_inr(gst_amt), S["total_val"])],
    ]
    grand_row = [
        [Paragraph("GRAND TOTAL", S["grand_label"]),
         Paragraph(_fmt_inr(total_amt), S["grand_val"])],
    ]

    totals_col_w = [CONTENT_W * 0.55, CONTENT_W * 0.17, CONTENT_W * 0.28]

    totals_container = Table(
        [[
            "",  # left spacer
            Table(totals_rows,  colWidths=[CONTENT_W * 0.21, CONTENT_W * 0.24]),
        ]],
        colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45],
    )
    totals_container.setStyle(TableStyle([
        ("VALIGN",  (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",  (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    inner_totals = Table(totals_rows, colWidths=[CONTENT_W * 0.27, CONTENT_W * 0.18])
    inner_totals.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("LINEBELOW",     (0, -2), (-1, -2), 0.6, MID_GRAY),
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_GRAY),
    ]))

    grand_table = Table(grand_row, colWidths=[CONTENT_W * 0.27, CONTENT_W * 0.18])
    grand_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), DARK_NAVY),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ]))

    right_col = Table([[inner_totals], [grand_table]], colWidths=[CONTENT_W * 0.45])
    right_col.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))

    totals_wrapper = Table(
        [["", right_col]],
        colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45],
    )
    totals_wrapper.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))
    story.append(totals_wrapper)
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MID_GRAY))
    story.append(Spacer(1, 8))

    # ══════════════════════════════════════════════════════════════════════════
    # 5. MOCK E-INVOICE SECTION
    # ══════════════════════════════════════════════════════════════════════════
    irp_left_rows = [
        [Paragraph("IRN",       S["irp_head"]), Paragraph(irp_data["irn"],        S["irp_val"])],
        [Paragraph("Ack No",    S["irp_head"]), Paragraph(irp_data["ack_no"],     S["irp_val"])],
        [Paragraph("Ack Date",  S["irp_head"]), Paragraph(irp_data["ack_date"],   S["irp_val"])],
        [Paragraph("e-Way Bill",S["irp_head"]), Paragraph(irp_data["eway_bill_no"], S["irp_val"])],
    ]
    irp_right_rows = [
        [Paragraph("Signed QR (DEMO — not a valid IRP QR)", S["irp_head"])],
        [Paragraph(irp_data["signed_qr_code"], S["qr_text"])],
    ]

    irp_left_table = Table(irp_left_rows, colWidths=[CONTENT_W * 0.12, CONTENT_W * 0.38])
    irp_left_table.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("LINEBELOW",     (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
    ]))

    irp_right_table = Table(irp_right_rows, colWidths=[CONTENT_W * 0.40])
    irp_right_table.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("BACKGROUND",    (0, 1), (-1, -1), colors.HexColor("#F8FAFC")),
    ]))

    irp_wrapper = Table(
        [[irp_left_table, irp_right_table]],
        colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5],
    )
    irp_wrapper.setStyle(TableStyle([
        ("BOX",         (0, 0), (-1, -1), 0.6, ACCENT_TEAL),
        ("LINEAFTER",   (0, 0), (0, -1),  0.5, ACCENT_TEAL),
        ("BACKGROUND",  (0, 0), (-1, -1), colors.HexColor("#F0FDFA")),
        ("TOPPADDING",  (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",(0, 0), (-1, -1), 0),
    ]))

    story.append(KeepTogether([
        Paragraph("e-INVOICE DETAILS  (DEMO / MOCK — NOT A VALID GST SUBMISSION)", S["section_head"]),
        irp_wrapper,
        Spacer(1, 10),
    ]))

    # ══════════════════════════════════════════════════════════════════════════
    # 6. PAYMENT SECTION
    # ══════════════════════════════════════════════════════════════════════════
    pay_status_color = {
        "paid":    ACCENT_TEAL,
        "overdue": RED_ALERT,
        "pending": colors.HexColor("#F59E0B"),
    }.get(str(pay_status).lower(), MID_GRAY)

    pay_rows = [
        [Paragraph("Payment Status", S["pay_head"]),
         Paragraph(str(pay_status).upper(), ParagraphStyle(
             "pay_status_dyn", fontName="Helvetica-Bold", fontSize=10,
             textColor=pay_status_color, leading=13,
         ))],
    ]
    if pay_token:
        pay_rows.append([
            Paragraph("Payment Token", S["pay_head"]),
            Paragraph(
                f'<font name="Courier" size="11"><b>{pay_token}</b></font>'
                " &nbsp;<font size='7' color='#64748B'>"
                "(12-digit auth code — include in NEFT/RTGS remittance)</font>",
                S["pay_val"],
            ),
        ])
    pay_rows.append([
        Paragraph("Bank Details", S["pay_head"]),
        Paragraph(
            f"Account Name: {company_name}<br/>"
            "Bank: HDFC Bank &nbsp;|&nbsp; A/C: 50100123456789 &nbsp;|&nbsp; IFSC: HDFC0001234<br/>"
            "(Demo bank details — not real)",
            S["pay_val"],
        ),
    ])

    pay_table = Table(pay_rows, colWidths=[CONTENT_W * 0.22, CONTENT_W * 0.78])
    pay_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_GRAY),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.4, colors.HexColor("#E2E8F0")),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BOX",           (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
    ]))

    story.append(KeepTogether([
        Paragraph("PAYMENT DETAILS", S["section_head"]),
        pay_table,
        Spacer(1, 14),
    ]))

    # ══════════════════════════════════════════════════════════════════════════
    # 7. DISCLAIMER FOOTER
    # ══════════════════════════════════════════════════════════════════════════
    story.append(HRFlowable(width="100%", thickness=0.4, color=MID_GRAY))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Demo invoice only. Not a valid tax invoice. No real GST/IRP submission has been made.",
        S["disclaimer"],
    ))
    story.append(Paragraph(
        f"Generated by O2C Agent v2.0 &nbsp;·&nbsp; {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')} &nbsp;·&nbsp; {company_name}",
        S["disclaimer"],
    ))

    # ── Build ─────────────────────────────────────────────────────────────────
    try:
        doc.build(story)
        logger.info("Invoice PDF generated: %s", pdf_path)
    except Exception as exc:
        logger.error("Failed to generate invoice PDF %s: %s", invoice_id, exc)
        raise

    return pdf_path
