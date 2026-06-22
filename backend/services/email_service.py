"""
Optional SMTP email helper for customer portal disputes.
Email delivery is intentionally non-blocking for business actions: callers should
log the returned boolean but should not fail dispute creation/replies if email fails.
"""
import os
import logging
import smtplib
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email import encoders
from config import settings

logger = logging.getLogger(__name__)


def send_optional_email(
    to: str,
    subject: str,
    body: str,
    attachments: list[str] | None = None,
) -> bool:
    """
    Send a plain-text email when SMTP is configured. Returns True on success.

    Parameters
    ----------
    to          : Recipient email address.
    subject     : Email subject line.
    body        : Plain-text message body.
    attachments : Optional list of absolute file paths to attach.
                  Files that do not exist are skipped with a warning.
                  PDFs are sent as application/pdf; all others as
                  application/octet-stream.
    """
    if not to:
        return False

    if not settings.smtp_user or not settings.smtp_password:
        logger.info("SMTP not configured; email skipped: %s", subject)
        return False

    try:
        # Use 'mixed' subtype when attachments are present so MIME structure
        # is correct; fall back to 'alternative' for plain text-only messages.
        subtype = "mixed" if attachments else "alternative"
        msg = MIMEMultipart(subtype)
        msg["Subject"] = subject
        msg["From"] = settings.email_from
        msg["To"] = to
        msg.attach(MIMEText(body, "plain"))

        for path in (attachments or []):
            if not os.path.isfile(path):
                logger.warning("Attachment not found, skipping: %s", path)
                continue
            fname = os.path.basename(path)
            mime_type = "application/pdf" if path.lower().endswith(".pdf") else "application/octet-stream"
            main_type, sub_type = mime_type.split("/", 1)
            with open(path, "rb") as f:
                part = MIMEBase(main_type, sub_type)
                part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=fname)
            msg.attach(part)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_tls:
                server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.email_from, [to], msg.as_string())

        logger.info("Email sent to %s: %s (attachments: %d)", to, subject, len(attachments or []))
        return True
    except Exception as exc:
        logger.warning("Email send failed to %s: %s", to, exc)
        return False


async def log_invoice_email(
    db,
    invoice_id: str,
    recipient: str,
    status: str,
    error: str | None = None,
) -> None:
    """
    Append a row to invoice_email_log.
    Also updates invoices.sent_at when status == 'sent'.
    Silently logs on DB failure so callers are never broken.

    Parameters
    ----------
    db         : asyncpg connection (FastAPI dependency).
    invoice_id : Invoice primary key.
    recipient  : Email address the invoice was sent to.
    status     : 'sent' or 'failed'.
    error      : Error message string when status == 'failed'.
    """
    try:
        await db.execute(
            """INSERT INTO invoice_email_log
               (invoice_id, recipient, status, error_message, sent_at)
               VALUES ($1, $2, $3, $4, NOW())""",
            invoice_id,
            recipient,
            status,
            error or "",
        )
        if status == "sent":
            await db.execute(
                "UPDATE invoices SET sent_at = NOW(), updated_at = NOW() WHERE invoice_id = $1",
                invoice_id,
            )
    except Exception as exc:
        logger.error(
            "invoice_email_log insert failed for %s (status=%s): %s",
            invoice_id, status, exc,
        )
