"""Read-only product stock API + price management endpoints."""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.staff_deps import require_role
from database.postgres import get_db


router = APIRouter()

PRODUCT_READ_ROLES = ["admin", "inventory_manager"]
PRODUCT_WRITE_ROLES = ["admin", "inventory_manager"]

VALID_REORDER_STATUSES = {"URGENT", "REORDER", "OK"}

REORDER_STATUS_CASE = """CASE
  WHEN available_stock <= safety_stock THEN 'URGENT'
  WHEN available_stock > safety_stock AND available_stock <= reorder_level THEN 'REORDER'
  ELSE 'OK'
END"""


def _with_reorder_status(row) -> dict:
    item = dict(row)
    available = item.get("available_stock") or 0
    safety = item.get("safety_stock") or 0
    reorder = item.get("reorder_level") or 0
    if available <= safety:
        item["reorder_status"] = "URGENT"
    elif available <= reorder:
        item["reorder_status"] = "REORDER"
    else:
        item["reorder_status"] = "OK"
    # Compute gross margin % if both prices are available
    selling = float(item.get("base_price_inr") or 0)
    cost = float(item.get("cost_price_inr") or 0)
    if selling > 0 and cost > 0:
        item["gross_margin_pct"] = round((selling - cost) / selling * 100, 1)
    else:
        item["gross_margin_pct"] = None
    return item


class UpdatePriceRequest(BaseModel):
    selling_price_inr: float
    cost_price_inr: Optional[float] = None


@router.get("")
async def list_products(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    reorder_status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db=Depends(get_db),
    staff=Depends(require_role(PRODUCT_READ_ROLES)),
):
    if reorder_status and reorder_status not in VALID_REORDER_STATUSES:
        raise HTTPException(400, f"Invalid reorder_status '{reorder_status}'. Must be one of: {sorted(VALID_REORDER_STATUSES)}")

    conditions = ["p.is_active = TRUE"]
    params = []
    if search:
        params.append(f"%{search.lower()}%")
        conditions.append(f"(LOWER(p.sku_id) LIKE ${len(params)} OR LOWER(p.product_name) LIKE ${len(params)})")
    if category:
        params.append(category)
        conditions.append(f"p.category = ${len(params)}")
    if reorder_status:
        conditions.append(f"{REORDER_STATUS_CASE.replace('available_stock', 'pss.available_stock').replace('safety_stock', 'p.safety_stock').replace('reorder_level', 'p.reorder_level')} = ${len(params) + 1}")

    where = "WHERE " + " AND ".join(conditions)

    if reorder_status:
        params.append(reorder_status)

    base_from = """
        FROM products p
        JOIN product_stock_summary pss ON p.sku_id = pss.sku_id
    """

    total = await db.fetchval(
        f"SELECT COUNT(*) {base_from} {where}",
        *params,
    )

    params.extend([limit, offset])
    rows = await db.fetch(
        f"""SELECT p.sku_id, p.product_name, p.category, p.unit_of_measure,
                   p.base_price_inr, p.cost_price_inr,
                   pss.stock_on_hand, pss.reserved_stock, pss.available_stock, pss.incoming_stock,
                   p.reorder_level, p.safety_stock, p.lead_time_days, p.reorder_qty, p.is_active
            {base_from}
            {where}
            ORDER BY p.sku_id
            LIMIT ${len(params)-1} OFFSET ${len(params)}""",
        *params,
    )

    products = [_with_reorder_status(r) for r in rows]
    return {"products": products, "total": total, "limit": limit, "offset": offset}


@router.get("/{sku_id}")
async def get_product(
    sku_id: str,
    db=Depends(get_db),
    staff=Depends(require_role(PRODUCT_READ_ROLES)),
):
    row = await db.fetchrow(
        """SELECT p.sku_id, p.product_name, p.category, p.unit_of_measure,
                  p.base_price_inr, p.cost_price_inr,
                  pss.stock_on_hand, pss.reserved_stock, pss.available_stock, pss.incoming_stock,
                  p.reorder_level, p.safety_stock, p.lead_time_days, p.reorder_qty, p.is_active
           FROM products p
           JOIN product_stock_summary pss USING (sku_id)
           WHERE p.sku_id = $1 AND p.is_active = TRUE""",
        sku_id,
    )
    if not row:
        raise HTTPException(404, f"Product {sku_id} not found")

    transactions = await db.fetch(
        """SELECT txn_id, sku_id, txn_type, quantity_delta, field_affected,
                  balance_after, order_id, purchase_order_id, reason, performed_by,
                  actor_type, created_at
           FROM inventory_transactions
           WHERE sku_id = $1
           ORDER BY created_at DESC
           LIMIT 20""",
        sku_id,
    )
    incoming = await db.fetch(
        """SELECT po.po_id, po.supplier_id, po.status, po.expected_arrival_date,
                  poi.sku_id, poi.quantity_ordered, poi.quantity_received,
                  poi.unit_cost_inr,
                  (poi.quantity_ordered - poi.quantity_received) AS remaining_incoming,
                  poi.line_status
           FROM purchase_orders po
           JOIN purchase_order_items poi ON po.po_id = poi.po_id
           WHERE poi.sku_id = $1
             AND po.status IN ('confirmed','partially_received')
             AND (poi.quantity_ordered - poi.quantity_received) > 0
           ORDER BY po.expected_arrival_date ASC NULLS LAST, po.po_id""",
        sku_id,
    )
    product = _with_reorder_status(row)
    product["recent_transactions"] = [dict(r) for r in transactions]
    product["incoming_po_lines"] = [dict(r) for r in incoming]
    return product


@router.patch("/{sku_id}/price")
async def update_product_price(
    sku_id: str,
    payload: UpdatePriceRequest,
    db=Depends(get_db),
    staff=Depends(require_role(PRODUCT_WRITE_ROLES)),
):
    """
    Admin endpoint to set the selling price (base_price_inr) for a product.
    Optionally also records the cost_price_inr for margin tracking.
    Writes an audit_log entry.
    """
    if payload.selling_price_inr <= 0:
        raise HTTPException(400, "selling_price_inr must be > 0")

    product = await db.fetchrow(
        "SELECT sku_id, product_name, base_price_inr, cost_price_inr FROM products WHERE sku_id = $1 AND is_active = TRUE",
        sku_id,
    )
    if not product:
        raise HTTPException(404, f"Product {sku_id} not found")

    old_selling = float(product["base_price_inr"] or 0)
    old_cost = float(product["cost_price_inr"] or 0) if product["cost_price_inr"] else None

    if payload.cost_price_inr is not None:
        await db.execute(
            "UPDATE products SET base_price_inr=$1, cost_price_inr=$2, updated_at=NOW() WHERE sku_id=$3",
            payload.selling_price_inr, payload.cost_price_inr, sku_id,
        )
    else:
        await db.execute(
            "UPDATE products SET base_price_inr=$1, updated_at=NOW() WHERE sku_id=$2",
            payload.selling_price_inr, sku_id,
        )

    # Audit log
    audit_detail = json.dumps({
        "sku_id": sku_id,
        "old_selling_price": old_selling,
        "new_selling_price": payload.selling_price_inr,
        "old_cost_price": old_cost,
        "new_cost_price": payload.cost_price_inr,
        "updated_by": staff["username"],
    })
    await db.execute(
        """INSERT INTO audit_log (event_type, agent_name, action, details)
           VALUES ('PRICE_UPDATE', 'admin_price_management', 'update_selling_price', $1)""",
        audit_detail,
    )

    # Compute margin
    selling = payload.selling_price_inr
    cost = payload.cost_price_inr or old_cost or 0
    margin = round((selling - cost) / selling * 100, 1) if selling > 0 and cost > 0 else None

    return {
        "sku_id": sku_id,
        "product_name": product["product_name"],
        "old_selling_price_inr": old_selling,
        "new_selling_price_inr": payload.selling_price_inr,
        "cost_price_inr": payload.cost_price_inr or old_cost,
        "gross_margin_pct": margin,
        "message": f"Selling price updated from ₹{old_selling:,.0f} → ₹{payload.selling_price_inr:,.0f}",
    }
