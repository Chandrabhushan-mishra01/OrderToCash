"""
Test script: Insert a 35-day overdue invoice for Satya Manufacturing (tammasatya25@gmail.com)
and preview the dunning email that would be generated.

Run from backend/ directory:
    python test_scripts/insert_overdue_and_preview_email.py
"""

import sys
import os
# Ensure backend/ is on the path regardless of where the script is run from
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from datetime import datetime, timedelta, timezone

# ── Config ────────────────────────────────────────────────────────────────────
CUSTOMER_ID   = "CUST-0001"
CUSTOMER_NAME = "Satya Manufacturing Pvt Ltd"
CONTACT_NAME  = "Satya Tamma"
CUSTOMER_EMAIL = "tammasatya25@gmail.com"
INVOICE_ID    = "INV-TEST-A1"
ORDER_ID      = "ORD-TEST-A1"
SKU_ID        = "SKU-002"
QUANTITY      = 50
UNIT_PRICE    = 4500
DAYS_OVERDUE  = 35          # 30–60 days bracket → Level 3
PAYMENT_TERMS = 30


async def run():
    from database.postgres import get_pool, init_schema
    from ml.model_placeholders import predict_customer_segment
    from ml.groq_client import generate_dunning_email, resolve_dunning_tone

    pool = await get_pool()

    async with pool.acquire() as db:

        # ── Step 1: Insert a test order ───────────────────────────────────
        order_date = datetime.now(timezone.utc) - timedelta(days=DAYS_OVERDUE + PAYMENT_TERMS)
        subtotal   = UNIT_PRICE * QUANTITY
        gst_amt    = round(subtotal * 0.18, 2)
        total      = subtotal + gst_amt

        # Clean up any prior test run
        await db.execute("DELETE FROM invoices WHERE invoice_id = $1", INVOICE_ID)
        await db.execute("DELETE FROM ar_ledger  WHERE invoice_id = $1", INVOICE_ID)
        await db.execute("DELETE FROM orders     WHERE order_id  = $1", ORDER_ID)

        await db.execute(
            """INSERT INTO orders
               (order_id, customer_id, sku_id, quantity, unit_price_inr,
                subtotal_inr, gst_pct, gst_amount_inr, total_amount_inr,
                order_date, channel, status, fraud_score, isolation_forest_score)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'portal','fulfilled',0.05,0.10)""",
            ORDER_ID, CUSTOMER_ID, SKU_ID, QUANTITY, UNIT_PRICE,
            subtotal, 18, gst_amt, total, order_date,
        )

        # ── Step 2: Insert invoice with days_overdue = 35 ─────────────────
        invoice_date = order_date
        due_date     = invoice_date + timedelta(days=PAYMENT_TERMS)
        payment_token = "999888777666"

        await db.execute(
            """INSERT INTO invoices
               (invoice_id, order_id, customer_id, invoice_date, due_date,
                subtotal_inr, gst_amount_inr, total_amount_inr,
                balance_due_inr, days_overdue, payment_status,
                payment_terms_days, payment_token)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'overdue',$11,$12)""",
            INVOICE_ID, ORDER_ID, CUSTOMER_ID,
            invoice_date, due_date,
            subtotal, gst_amt, total,
            total, DAYS_OVERDUE, PAYMENT_TERMS, payment_token,
        )

        await db.execute(
            """INSERT INTO ar_ledger
               (ar_id, invoice_id, customer_id, amount_inr, outstanding_balance_inr,
                aging_bucket, payment_status, days_overdue, last_action)
               VALUES ($1,$2,$3,$4,$5,'31-60','overdue',$6,'invoice_sent')""",
            f"AR-{INVOICE_ID}", INVOICE_ID, CUSTOMER_ID, total, total, DAYS_OVERDUE,
        )

        print(f"\n[OK] Test invoice {INVOICE_ID} inserted:")
        print(f"   Customer : {CUSTOMER_NAME} ({CUSTOMER_EMAIL})")
        print(f"   Amount   : Rs.{total:,.0f}  (Subtotal Rs.{subtotal:,.0f} + GST Rs.{gst_amt:,.0f})")
        print(f"   Overdue  : {DAYS_OVERDUE} days  ->  Level 3 (31+ days)")

        # ── Step 3: Segment prediction ────────────────────────────────────
        customer_row = await db.fetchrow(
            "SELECT * FROM customers WHERE customer_id = $1", CUSTOMER_ID
        )
        seg_result = predict_customer_segment(dict(customer_row))
        segment    = seg_result["segment"]
        tone       = resolve_dunning_tone(segment, DAYS_OVERDUE)

        print(f"\n[SEGMENT] Customer Segment : {segment}")
        print(f"   Tone Selected    : {tone}")

        # ── Step 4: Auto-send policy ──────────────────────────────────────
        from services.auto_dunning import should_auto_send
        will_auto_send = should_auto_send(segment, 3)   # Level 3
        print(f"\n[POLICY] Auto-send policy:")
        if will_auto_send:
            print(f"   Email WILL be sent automatically")
        else:
            print(f"   Email will NOT be auto-sent for {segment} Level 3")
            print(f"   -> Flagged for staff review in Collections panel")
            print(f"   -> Use 'Generate Dunning Email' button manually to send")

        # ── Step 5: Generate email preview via Groq ───────────────────────
        print(f"\n[GROQ] Generating email preview via Groq (tone={tone})...")
        email = generate_dunning_email(
            customer_name  = CUSTOMER_NAME,
            invoice_id     = INVOICE_ID,
            amount_inr     = total,
            days_overdue   = DAYS_OVERDUE,
            payment_terms  = PAYMENT_TERMS,
            contact_name   = CONTACT_NAME,
            segment        = segment,
        )

        print("\n" + "═" * 70)
        print(f"TO      : {CUSTOMER_EMAIL}")
        print(f"SUBJECT : {email.get('subject', '')}")
        print(f"TONE    : {email.get('tone', tone)}")
        print("─" * 70)
        print(email.get("body", ""))
        print("═" * 70)

        print(f"\n[DONE] Done. Check the Collections page -> Dunning History tab.")
        print(f"   Invoice {INVOICE_ID} is now visible in the Level 3 section.")


if __name__ == "__main__":
    asyncio.run(run())
