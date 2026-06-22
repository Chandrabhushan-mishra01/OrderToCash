"""
O2C Agent v2.0 — GLiNER Zero-Shot NER + Groq LLM Evaluator
Model: urchade/gliner_medium-v2.1

Pipeline:
  1. GLiNER extracts entities locally (~150ms, no API cost)
  2. Groq evaluates the result, corrects mistakes, fills missing fields
  3. Merged result returned with source tags per field (gliner / groq / groq_corrected)

Used by: Agent 1 (Order Ingestion), Agent 4 (Disputes), Purchase Orders NLP
"""

import logging
from typing import List, Dict, Any
from config import settings

logger = logging.getLogger(__name__)

_model = None

ORDER_ENTITIES = [
    "product name",
    "item code or SKU",
    "quantity or number of units",
    "delivery date",
    "company name or customer name",
    "shipping address",
    "purchase order reference",
    "unit price",
]

# Entity types for Dispute emails (fallback to Groq for dispute)
DISPUTE_ENTITIES = [
    "invoice_reference",
    "claim_amount",
    "dispute_reason",
    "evidence_type",
    "contact_name",
]

# Entity types for Purchase Order free-text entry (admin side)
PO_ENTITIES = [
    "supplier name or supplier ID",
    "SKU code or product code or item code",
    "product name or material name",
    "quantity or number of units",
    "unit cost or unit price or purchase cost",
    "selling price or sale price or retail price",
    "expected arrival date or delivery date",
]


def get_gliner_model():
    """Load GLiNER model once (lazy init)."""
    global _model
    if _model is None:
        from gliner import GLiNER
        logger.info(f"Loading GLiNER model: {settings.gliner_model}")
        _model = GLiNER.from_pretrained(settings.gliner_model)
        logger.info("GLiNER loaded — zero-shot NER, BERT-based, ~150ms CPU inference")
    return _model


def extract_order_entities(text: str, threshold: float = 0.35) -> Dict[str, Any]:
    """
    Extract order entities from unstructured email text.
    Returns dict of entity_type -> extracted_value.
    """
    try:
        model = get_gliner_model()
        entities = model.predict_entities(text, ORDER_ENTITIES, threshold=threshold)
        result = {}
        # Map verbose labels back to canonical keys
        label_map = {
            "product name": "product_name",
            "item code or SKU": "item_code",
            "quantity or number of units": "quantity",
            "delivery date": "delivery_date",
            "company name or customer name": "customer_name",
            "shipping address": "shipping_address",
            "purchase order reference": "order_reference",
            "unit price": "unit_price",
        }
        for ent in entities:
            label = label_map.get(ent["label"], ent["label"])
            value = ent["text"]
            score = ent.get("score", 0)
            if label not in result or score > result[label].get("confidence", 0):
                result[label] = {"value": value, "confidence": round(score, 4)}
        return result
    except Exception as e:
        logger.error(f"GLiNER extraction failed: {e}")
        return {}


def extract_order_entities_with_llm_backup(text: str, threshold: float = 0.35) -> Dict[str, Any]:
    """
    MAIN ENTRY POINT for order NER.
    Step 1: GLiNER extracts entities locally (fast, no API cost)
    Step 2: Groq evaluates the GLiNER result, corrects mistakes, fills missing fields
    Returns merged result with per-field source tags.
    """
    # Step 1 — GLiNER (always runs)
    gliner_result = extract_order_entities(text, threshold=threshold)
    logger.info(f"GLiNER found {len(gliner_result)} entities: {list(gliner_result.keys())}")

    # Step 2 — Groq evaluates and corrects
    try:
        from ml.groq_client import evaluate_and_correct_ner
        merged = evaluate_and_correct_ner(text, gliner_result)
        corrections = merged.get("_groq_corrections", [])
        if corrections:
            logger.info(f"Groq made {len(corrections)} correction(s): {corrections}")
        else:
            logger.info("Groq validated GLiNER result — no corrections needed")
        return merged
    except Exception as e:
        logger.warning(f"Groq NER evaluation unavailable ({e}), using GLiNER result only")
        return gliner_result


def extract_dispute_entities(text: str, threshold: float = 0.5) -> Dict[str, Any]:
    """
    Dispute NER — uses Groq directly (disputes are always free-form, messy emails).
    Falls back to GLiNER if Groq is unavailable.
    """
    try:
        from ml.groq_client import extract_dispute_entities_groq
        return extract_dispute_entities_groq(text)
    except Exception as e:
        logger.warning(f"Groq dispute NER unavailable ({e}), falling back to GLiNER")
        # GLiNER fallback
        try:
            model = get_gliner_model()
            entities = model.predict_entities(text, DISPUTE_ENTITIES, threshold=threshold)
            result = {}
            for ent in entities:
                result[ent["label"]] = {"value": ent["text"], "confidence": round(ent.get("score", 0), 4)}
            return result
        except Exception as e2:
            logger.error(f"GLiNER dispute fallback also failed: {e2}")
            return {}


def extract_po_entities(text: str, threshold: float = 0.30) -> Dict[str, Any]:
    """
    Purchase Order NER — GLiNER + Groq for admin free-text PO entry.
    Extracts: supplier, SKU(s), quantity(s), unit cost(s), expected arrival date.
    Returns canonical dict for pre-filling the PO creation form.
    """
    try:
        model = get_gliner_model()
        entities = model.predict_entities(text, PO_ENTITIES, threshold=threshold)
    except Exception as e:
        logger.error(f"GLiNER PO extraction failed: {e}")
        entities = []

    label_map = {
        "supplier name or supplier ID": "supplier_id",
        "SKU code or product code or item code": "sku_id",
        "product name or material name": "product_name",
        "quantity or number of units": "quantity",
        "unit cost or unit price or purchase cost": "unit_cost",
        "selling price or sale price or retail price": "selling_price",
        "expected arrival date or delivery date": "expected_arrival_date",
    }

    # Collect all found entities; allow multiple SKUs/quantities
    result: Dict[str, Any] = {}
    sku_list: List[Dict] = []
    qty_list: List[Dict] = []
    cost_list: List[Dict] = []
    selling_list: List[Dict] = []

    for ent in entities:
        label = label_map.get(ent["label"], ent["label"])
        value = ent["text"]
        score = round(ent.get("score", 0), 4)
        if label == "sku_id":
            sku_list.append({"value": value, "confidence": score})
        elif label == "quantity":
            qty_list.append({"value": value, "confidence": score})
        elif label == "unit_cost":
            cost_list.append({"value": value, "confidence": score})
        elif label == "selling_price":
            selling_list.append({"value": value, "confidence": score})
        else:
            if label not in result or score > result[label].get("confidence", 0):
                result[label] = {"value": value, "confidence": score}

    # Now use Groq to fill gaps and validate
    try:
        from ml.groq_client import _call_groq
        import json as _json
        prompt = f"""You are a procurement assistant. Extract Purchase Order fields from the admin's text.

TEXT: {text}

Return JSON only:
{{
  "supplier_id": "<supplier name or ID, e.g. SUPPLIER-ABC>",
  "items": [
    {{
      "sku_id": "<SKU code>",
      "quantity_ordered": <integer>,
      "unit_cost_inr": <purchase cost as float, or 0 if not mentioned>,
      "selling_price_inr": <explicit selling/sale/retail price as float, or null if not stated by admin>
    }}
  ],
  "expected_arrival_date": "<ISO date YYYY-MM-DD or null>",
  "confidence": "HIGH|MEDIUM|LOW"
}}
Rules:
- For supplier_id: if given a name like 'Motorco', format it as 'SUPPLIER-MOTORCO'.
- For unit_cost_inr: this is the PURCHASE cost paid to the supplier (keywords: 'at', 'costs', 'purchase price', 'each').
- For selling_price_inr: ONLY set this if the admin EXPLICITLY states a selling/sale/retail price (keywords: 'sell at', 'selling price', 'retail at', 'set price to', 'sell for'). If no explicit selling price is mentioned, set to null — do NOT compute it.
- If multiple SKUs are mentioned, list all as separate items.
- If no unit cost is mentioned, use 0."""
        raw = _call_groq([{"role": "user", "content": prompt}], json_mode=True)
        groq_result = _json.loads(raw)
        logger.info(f"Groq PO NER result: {groq_result}")
        return {
            "groq": groq_result,
            "gliner_supplier": result.get("supplier_id"),
            "gliner_arrival": result.get("expected_arrival_date"),
            "_confidence": groq_result.get("confidence", "MEDIUM"),
        }
    except Exception as e:
        logger.warning(f"Groq PO NER unavailable ({e}), using GLiNER only")
        # Build best-effort response from GLiNER
        items = []
        for i, sku in enumerate(sku_list):
            qty = qty_list[i] if i < len(qty_list) else {"value": "1"}
            cost = cost_list[i] if i < len(cost_list) else {"value": "0"}
            selling = selling_list[i] if i < len(selling_list) else {"value": None}
            try:
                qty_val = int(''.join(c for c in str(qty["value"]) if c.isdigit()) or 1)
            except Exception:
                qty_val = 1
            try:
                cost_clean = ''.join(c for c in str(cost["value"]) if c.isdigit() or c == '.')
                cost_val = float(cost_clean) if cost_clean else 0.0
            except Exception:
                cost_val = 0.0
            try:
                sell_clean = ''.join(c for c in str(selling["value"]) if c.isdigit() or c == '.') if selling["value"] else ''
                sell_val = float(sell_clean) if sell_clean else None
            except Exception:
                sell_val = None
            items.append({
                "sku_id": sku["value"].upper(),
                "quantity_ordered": qty_val,
                "unit_cost_inr": cost_val,
                "selling_price_inr": sell_val,
            })
        return {
            "groq": {
                "supplier_id": (result.get("supplier_id") or {}).get("value", ""),
                "items": items,
                "expected_arrival_date": (result.get("expected_arrival_date") or {}).get("value"),
                "confidence": "LOW",
            },
            "_confidence": "LOW",
        }
