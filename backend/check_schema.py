import asyncio
import asyncpg

async def run():
    conn = await asyncpg.connect(
        user='postgres', password='TSPranav@123',
        host='localhost', port=5432, database='postgres'
    )
    row = await conn.fetchrow(
        "SELECT definition FROM pg_views WHERE viewname='product_stock_summary'"
    )
    if row:
        print('View exists:', row['definition'][:300])
    else:
        print('View not found - using products table directly')

    cols = await conn.fetch(
        "SELECT column_name FROM information_schema.columns WHERE table_name='products' ORDER BY column_name"
    )
    print('Products columns:', [r['column_name'] for r in cols])
    await conn.close()

asyncio.run(run())
