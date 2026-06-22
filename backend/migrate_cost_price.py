import asyncio
import asyncpg

async def run():
    conn = await asyncpg.connect(
        user='postgres', password='TSPranav@123',
        host='localhost', port=5432, database='postgres'
    )
    exists = await conn.fetchval(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_name='products' AND column_name='cost_price_inr'"
    )
    if exists:
        print('Column cost_price_inr already exists')
    else:
        await conn.execute('ALTER TABLE products ADD COLUMN cost_price_inr NUMERIC(12,2)')
        print('Added cost_price_inr column to products table')
    await conn.close()

asyncio.run(run())
