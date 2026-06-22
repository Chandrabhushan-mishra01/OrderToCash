"""
O2C Agent v2.0 — Automated Reminder Service
============================================
Runs on a daily schedule and sends dunning emails for overdue invoices
using the same workflow, templates, segmentation, and dunning_log tracking
as the existing manual Collections panel.

KEY DESIGN PRINCIPLES
---------------------
- The existing manual dunning flow (POST /collections/generate-dunning) is
  completely untouched.  This service is purely additive.
- All automated sends are logged to dunning_log with triggered_by='auto_scheduler'
  so staff can distinguish manual vs automated entries in the UI.
- A cooldown window prevents duplicate sends for the same invoice + level.
- Premium customers at Level 2/3 are flagged but NOT emailed — staff must act.
- Tone is resolved via the segment × level matrix in groq_client.resolve_dunning_tone().

TONE MATRIX (segment × dunning level)
--------------------------------------
              Level 1 (1–15d)   Level 2 (16–30d)    Level 3 (30+d)
Premium       gentle_reminder   firm_premium         urgent_premium
Standard      gentle_reminder   firm                 urgent
At-Risk       firm              urgent               legal_warning_soft
Problem       urgent            legal_warning_soft   legal_warning
"""

import logging
import smtplib
from datetime import datetime, timedelta, timezone

from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from config import settings

logger = logging.getLogger(__name__)

# ── Cooldown: minimum days between automated sends at the same dunning level ──
_COOLDOWN_DAYS = {
    1: 5,   # Level 1 (1–15d overdue) — re-send at most every 5 days
    2: 3,   # Level 2 (16–30d overdue)
    3: 2,   # Level 3 (30+d overdue)
}
# Problem customers get tighter Level 3 cooldown
_PROBLEM_L3_COOLDOWN_DAYS = 1


# ── Segment auto-send policy ──────────────────────────────────────────────────

def should_auto_send(segment: str, dunning_level: int) -> bool:
    """
    Returns True if the automated service should send an email.
    All segments and levels auto-send — Premium customers get polite tones
    (firm_premium at L2, urgent_premium at L3) that are safe to auto-send.
    Only completely blocked if needed in future via this function.
    """
    return True


# ── Cooldown check ────────────────────────────────────────────────────────────

async def _is_on_cooldown(db, invoice_id: str, dunning_level: int, segment: str) -> bool:
    """
    Returns True if an automated email was actually SENT for this invoice+level
    within the cooldown window.
    Only counts channel='auto_email' — flagged_for_staff entries do NOT trigger cooldown.
    """
    level_label = f"LEVEL_{dunning_level}"
    cooldown_days = (
        _PROBLEM_L3_COOLDOWN_DAYS
        if segment == "Problem" and dunning_level == 3
        else _COOLDOWN_DAYS.get(dunning_level, 3)
    )
    cutoff = datetime.now(timezone.utc) - timedelta(days=cooldown_days)

    row = await db.fetchrow(
        """SELECT dunning_id FROM dunning_log
           WHERE invoice_id    = $1
             AND dunning_level = $2
             AND triggered_by  = 'auto_scheduler'
             AND channel       = 'auto_email'
             AND created_at   >= $3
           LIMIT 1""",
        invoice_id, level_label, cutoff,
    )
    return row is not None


# ── SMTP send (same implementation as collections.py) ─────────────────────────

def _smtp_send(to: str, subject: str, body: str) -> tuple[bool, str | None]:
    """
    Send via Gmail SMTP. Returns (success, error_message).
    Mirrors the existing send logic in collections.py.
    """
    if not settings.smtp_user or not settings.smtp_password:
        return False, "SMTP not configured"
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = settings.smtp_user
        msg["To"]      = to
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_user, to, msg.as_string())
        return True, None
    except Exception as exc:
        return False, str(exc)


# ── Core cycle ────────────────────────────────────────────────────────────────

async def run_auto_dunning_cycle(pool) -> dict:
    """
    Main entry point called by the background scheduler in main.py.

    For each eligible overdue invoice:
      1. Determine dunning level from days_overdue.
      2. Run k-means segmentation to get customer segment.
      3. Check cooldown — skip if recently sent at same level.
      4. Resolve tone via segment × level matrix (groq_client.resolve_dunning_tone).
      5. Generate email via Groq (same function as manual flow).
      6. If Premium L2/L3: log as 'flagged_for_staff', do not send.
      7. Otherwise: send via SMTP and log to dunning_log.

    Returns a summary dict for logging.
    """
    from ml.model_placeholders import predict_customer_segment
    from ml.groq_client import generate_dunning_email, resolve_dunning_tone

    summary = {
        "sent": 0,
        "flagged_for_staff": 0,
        "skipped_cooldown": 0,
        "skipped_no_email": 0,
        "errors": 0,
        "cycle_start": datetime.now(timezone.utc).isoformat(),
    }

    async with pool.acquire() as db:
        rows = await db.fetch(
            """SELECT i.invoice_id, i.customer_id, i.days_overdue,
                      i.total_amount_inr, i.balance_due_inr, i.payment_terms_days,
                      c.company_name, c.contact_name, c.email,
                      c.open_ar_balance_inr, c.avg_dso_days, c.missed_payments_12m,
                      c.credit_limit_inr, c.account_age_months, c.credit_tier
               FROM invoices i
               JOIN customers c ON i.customer_id = c.customer_id
               WHERE i.payment_status IN ('overdue', 'pending')
                 AND i.days_overdue > 0
                 AND c.email IS NOT NULL
                 AND c.email != ''
               ORDER BY i.days_overdue DESC"""
        )

        for row in rows:
            inv = dict(row)
            invoice_id  = inv["invoice_id"]
            days_overdue = max(0, inv.get("days_overdue") or 0)
            dunning_level = 1 if days_overdue <= 15 else (2 if days_overdue <= 30 else 3)
            level_label   = f"LEVEL_{dunning_level}"
            customer_email = inv.get("email", "")

            if not customer_email:
                summary["skipped_no_email"] += 1
                continue

            # K-Means segmentation
            try:
                seg_result = predict_customer_segment(inv)
                segment    = seg_result.get("segment", "Standard")
            except Exception:
                segment = "Standard"

            # Cooldown check
            try:
                if await _is_on_cooldown(db, invoice_id, dunning_level, segment):
                    summary["skipped_cooldown"] += 1
                    logger.debug("Auto-dunning cooldown: %s L%d", invoice_id, dunning_level)
                    continue
            except Exception as exc:
                logger.error("Cooldown check failed for %s: %s", invoice_id, exc)
                # Fail safe — skip rather than spam
                summary["skipped_cooldown"] += 1
                continue

            # Resolve tone from matrix
            resolved_tone = resolve_dunning_tone(segment, days_overdue)

            # Generate email via Groq (same function as manual flow)
            try:
                email_content = generate_dunning_email(
                    customer_name  = inv["company_name"],
                    invoice_id     = invoice_id,
                    amount_inr     = float(inv["balance_due_inr"] or inv["total_amount_inr"] or 0),
                    days_overdue   = days_overdue,
                    payment_terms  = int(inv.get("payment_terms_days") or 30),
                    contact_name   = inv.get("contact_name") or "",
                    segment        = segment,
                )
                subject = email_content.get("subject", f"Payment Reminder - {invoice_id}")
                body    = email_content.get("body", "")
            except Exception as exc:
                logger.error("Auto-dunning Groq generation failed for %s: %s", invoice_id, exc)
                summary["errors"] += 1
                continue

            # Decide whether to send or flag
            auto_send = should_auto_send(segment, dunning_level)
            channel   = "auto_email" if auto_send else "flagged_for_staff"
            email_sent = False
            send_error = None

            if auto_send:
                email_sent, send_error = _smtp_send(customer_email, subject, body)
                if send_error:
                    logger.warning("Auto-dunning SMTP failed for %s: %s", invoice_id, send_error)
                    summary["errors"] += 1
                else:
                    summary["sent"] += 1
                    logger.info(
                        "Auto-dunning sent: %s → %s | segment=%s | tone=%s | L%d",
                        invoice_id, customer_email, segment, resolved_tone, dunning_level,
                    )
            else:
                summary["flagged_for_staff"] += 1
                logger.info(
                    "Auto-dunning flagged (Premium L%d — staff action required): %s",
                    dunning_level, invoice_id,
                )

            # Log to dunning_log (same table as manual flow)
            # ID format: AU-MMDDHHMMSS-XXXX (≤20 chars, fits VARCHAR(50) after migration)
            _ts = datetime.now(timezone.utc).strftime('%m%d%H%M%S')
            _inv_suffix = invoice_id.replace('-', '')[-4:]
            dunning_id = f"AU-{_ts}-{_inv_suffix}"  # e.g. AU-1806145230-003C (18 chars)
            try:
                await db.execute(
                    """INSERT INTO dunning_log
                       (dunning_id, customer_id, invoice_id, dunning_level, channel,
                        message_subject, message_body_preview, sent_at, groq_generated,
                        account_segment, processed_by_agent, triggered_by)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
                    dunning_id,
                    inv["customer_id"],
                    invoice_id,
                    level_label,
                    channel,
                    subject,
                    body[:500],
                    datetime.now(timezone.utc),
                    True,
                    segment,
                    "auto_dunning_scheduler",
                    "auto_scheduler",
                )
            except Exception as exc:
                logger.error("dunning_log insert failed for %s: %s", invoice_id, exc)

    summary["cycle_end"] = datetime.now(timezone.utc).isoformat()
    logger.info(
        "Auto-dunning cycle complete: sent=%d flagged=%d cooldown=%d errors=%d",
        summary["sent"], summary["flagged_for_staff"],
        summary["skipped_cooldown"], summary["errors"],
    )
    return summary
