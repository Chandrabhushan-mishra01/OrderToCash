"""
MOCK IRP / e-Invoice Service
=============================
WARNING: This is DEMO/MOCK only. No real GST or IRP API is called here.
All IRNs, acknowledgement numbers, e-way bill numbers, and QR codes produced
by this module are entirely fabricated for demonstration purposes and are
NOT valid for any GST compliance or tax submission.

For production use, replace this module with actual calls to the NIC IRP
sandbox (https://einvoice1.gst.gov.in) or a licensed GSP (e.g. Tata Consultancy,
Karvy, IRIS).
"""

import hashlib
from datetime import datetime, timezone


def generate_mock_irp_data(
    invoice_number: str,
    invoice_id: str,
    total_amount: float,
    gst_amount: float,
    seller_gstin: str,
    customer_gstin: str,
) -> dict:
    """
    Return a mock e-invoice payload that mimics the structure of a real IRP
    response (IRN, ack number, ack date, signed QR, e-way bill).

    DEMO ONLY — not a valid GST submission. See module docstring.

    Parameters
    ----------
    invoice_number  : Human-readable invoice number, e.g. "INV-2026-00042"
    invoice_id      : Internal DB primary key, e.g. "INV-20260617120000"
    total_amount    : Invoice grand total (₹), inclusive of GST
    gst_amount      : Total GST component (₹)
    seller_gstin    : Seller's GSTIN (15-char alphanumeric)
    customer_gstin  : Buyer's GSTIN (15-char alphanumeric)

    Returns
    -------
    dict with keys: irn, ack_no, ack_date, signed_qr_code, eway_bill_no
    """

    # --- IRN ------------------------------------------------------------------
    # Real IRN: SHA-256 of (seller_gstin + doc_type + fin_year + doc_number).
    # Mock: deterministic prefix + short hash so it looks stable across calls.
    _hash_input = f"{seller_gstin}|{invoice_number}|{total_amount}"
    _short_hash = hashlib.sha256(_hash_input.encode()).hexdigest()[:24].upper()
    irn = f"MOCK-IRN-{_short_hash}"

    # --- Acknowledgement number -----------------------------------------------
    # Real ack_no: 15-digit numeric string assigned by IRP.
    # Mock: deterministic prefix + numeric-looking suffix derived from hash.
    _ack_suffix = str(int(_short_hash[:10], 16))[:12].zfill(12)
    ack_no = f"MOCK-ACK-{_ack_suffix}"

    # --- Acknowledgement date -------------------------------------------------
    ack_date = datetime.now(timezone.utc).isoformat()

    # --- Signed QR code -------------------------------------------------------
    # Real signed QR: JWT signed by IRP containing invoice data.
    # Mock: pipe-separated plaintext — clearly not a real JWT/signature.
    signed_qr_code = "|".join([
        invoice_number,
        seller_gstin,
        customer_gstin,
        f"{total_amount:.2f}",
        f"{gst_amount:.2f}",
        "MOCK",
    ])

    # --- e-Way Bill number ---------------------------------------------------
    # Real EWB: 12-digit number issued by NIC e-way bill portal for goods > ₹50K.
    # Mock: deterministic prefix + numeric suffix.
    _ewb_suffix = str(int(_short_hash[10:20], 16))[:10].zfill(10)
    eway_bill_no = f"MOCK-EWB-{_ewb_suffix}"

    return {
        "irn": irn,
        "ack_no": ack_no,
        "ack_date": ack_date,
        "signed_qr_code": signed_qr_code,
        "eway_bill_no": eway_bill_no,
    }
