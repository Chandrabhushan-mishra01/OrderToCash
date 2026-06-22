import asyncio
import asyncpg
from datetime import datetime, timedelta

async def fix():
    conn = await asyncpg.connect(
        user="postgres",
        password="TSPranav@123",
        host="localhost",
        port=5432,
        database="postgres"
    )
    
    order = await conn.fetchrow("SELECT * FROM orders WHERE order_id = 'ORD-20260618114924-R'")
    if not order:
        print("Order not found")
        return
        
    print(f"Found order: {order['order_id']}")
    
    invoice_id = f"INV-{order['order_id'].split('-')[1]}"
    due_date = datetime.utcnow() + timedelta(days=30)
    payment_token = "123456789012"
    
    existing = await conn.fetchrow("SELECT invoice_id FROM invoices WHERE invoice_id=$1", invoice_id)
    if existing:
        print(f"Invoice {invoice_id} already exists")
        return
        
    await conn.execute(
        """INSERT INTO invoices (invoice_id, order_id, customer_id, due_date,
           subtotal_inr, total_amount_inr, balance_due_inr, payment_status, payment_token)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)""",
        invoice_id, order['order_id'], order['customer_id'], due_date,
        order['subtotal_inr'], order['total_amount_inr'], order['total_amount_inr'], payment_token
    )
    
    await conn.execute(
        """INSERT INTO ar_ledger (ar_id, invoice_id, customer_id, amount_inr,
           outstanding_balance_inr, aging_bucket, payment_status, last_action)
           VALUES ($1, $2, $3, $4, $5, '0-30', 'pending', 'invoice_generated')""",
        f"AR-{invoice_id}", invoice_id, order['customer_id'], order['total_amount_inr'], order['total_amount_inr']
    )
    print(f"Successfully generated invoice {invoice_id} for order {order['order_id']}")
    
    await conn.close()

asyncio.run(fix())
