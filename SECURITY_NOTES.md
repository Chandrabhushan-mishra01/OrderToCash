# Recovery Patch — Security & Auth Notes

## 1. Removed from the repo

The following runtime / secret files were removed from version control (and from the working tree where they contained secrets):

- `backend/.env`
- `backend/email_intake/credentials.json`
- `backend/email_intake/token.json`
- `backend/intake_state.db`
- `backend/chroma_data/`
- All `__pycache__/` directories and `*.pyc` files

A safe template is provided in `backend/.env.example`.

## 2. `.gitignore` fixes

- `.env` and `backend/.env` are now ignored.
- `backend/email_intake/credentials.json` and `backend/email_intake/token.json` are ignored.
- `backend/email_intake/*.db` and `backend/intake_state.db` are ignored.
- `backend/chroma_data/` is ignored.
- `__pycache__/` and `*.pyc` are ignored.
- Removed the malformed `credentials.jsonuvicorn` line.

## 3. RBAC-protected staff/admin endpoints

All endpoints below now require a valid staff JWT and an authorized role via `api.staff_deps.require_role`. The `Authorization: Bearer <token>` header is required.

### Orders (`/api/orders`)
| Method | Path | Allowed roles | Notes |
|--------|------|---------------|-------|
| GET | `/` | admin, dispute_manager, controller | |
| GET | `/{order_id}` | admin, dispute_manager, controller | Includes optional nested `reservation` details |
| GET | `/stats/summary` | admin, dispute_manager, controller | |
| POST | `/` | admin, controller | |
| POST | `/ingest-email` | admin, controller | |
| PATCH | `/{order_id}/status` | admin, controller | Blocks `fulfilled` and `cancelled` — use dedicated endpoints |
| POST | `/{order_id}/fulfill` | admin, controller | Deducts stock via inventory service; idempotent |
| POST | `/{order_id}/cancel` | admin, controller | Releases reservation then marks cancelled inside one transaction |

### Purchase Orders (`/api/purchase-orders`)
| Method | Path | Allowed roles | Notes |
|--------|------|---------------|-------|
| GET | `/` | admin, controller | List POs with line items |
| GET | `/{po_id}` | admin, controller | Read PO with line items |
| POST | `/` | admin, controller | Create draft PO; no stock mutation |
| POST | `/{po_id}/confirm` | admin, controller | Calls inventory service; increments incoming stock |
| POST | `/{po_id}/receive` | admin, controller | Calls inventory service; releases incoming, increments on-hand, auto-clears backorders |

### Products (`/api/products`)
| Method | Path | Allowed roles | Notes |
|--------|------|---------------|-------|
| GET | `/` | admin, controller | Read-only product stock summary |
| GET | `/{sku_id}` | admin, controller | Read-only product detail, transactions, incoming PO lines |

### Inventory (`/api/inventory`)
| Method | Path | Allowed roles | Notes |
|--------|------|---------------|-------|
| GET | `/transactions` | admin, controller | Inventory transaction ledger |
| POST | `/adjust` | admin, controller | Manual adjustment through inventory service |
| GET | `/stock-summary` | admin, controller | Live stock summary |
| GET | `/forecast/{sku_id}` | admin, controller | Forecast, depletion, reorder suggestion |
| POST | `/forecast/refresh` | admin, controller | Refresh one SKU or all active SKU forecast snapshots |
| GET | `/dashboard-summary` | admin, controller | Inventory KPI summary, low stock, backorders, recent transactions |
| GET | `/incoming` | admin, controller | Confirmed/partially received incoming PO lines |

### Invoices (`/api/invoices`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/` | admin, dispute_manager |
| GET | `/stats/summary` | admin, dispute_manager |
| GET | `/{invoice_id}` | admin, dispute_manager |

### Customers (`/api/customers`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/` | admin, dispute_manager, collections_analyst |
| GET | `/{customer_id}` | admin, dispute_manager, collections_analyst |

### Analytics (`/api/analytics`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/kpis` | admin, controller, collections_analyst |
| GET | `/dso-trend` | admin, controller, collections_analyst |
| GET | `/revenue-forecast` | admin, controller, collections_analyst |
| GET | `/demand-forecast` | admin, controller, collections_analyst |

### ML Monitor (`/api/ml`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/models` | admin |

### Legacy portal quick-view (`/api/portal`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/{customer_id}/invoices` | admin, controller |
| GET | `/{customer_id}/orders` | admin, controller |
| GET | `/{customer_id}/summary` | admin, controller |

### Collections (`/api/collections`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/` | admin, collections_analyst |
| GET | `/segments` | admin, collections_analyst |
| GET | `/overdue-invoices` | admin, collections_analyst |
| POST | `/generate-dunning` | admin, collections_analyst *(already gated)* |

### HITL (`/api/hitl`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/payment-queue` | admin, controller |
| POST | `/payment/{hitl_ref}/decide` | admin, controller *(already gated)* |
| GET | `/queue` | admin, controller |
| GET | `/stats` | admin, controller |
| GET | `/kyc-queue` | admin, controller |
| POST | `/kyc/{kyc_id}/decide` | admin, controller |

### Disputes (`/api/disputes`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/` | admin, dispute_manager |
| GET | `/stats` | admin, dispute_manager |
| GET | `/{alert_id}/ai-suggest` | admin, dispute_manager |
| POST | `/{alert_id}/request-info` | admin, dispute_manager |
| POST | `/{alert_id}/resolve` | admin, dispute_manager *(already gated)* |

> **Intentionally public:** `POST /api/disputes/submit-email` remains open. It performs registered-sender verification inside the endpoint and is the external email submission channel.

### Cash application (`/api/cash-app`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/payments` | admin, collections_analyst |
| GET | `/match-stats` | admin, collections_analyst |
| POST | `/process-payment` | admin, collections_analyst *(already gated)* |
| POST | `/process-payment-semantic` | admin, collections_analyst *(already gated)* |

### AR Ledger (`/api/ar-ledger`)
| Method | Path | Allowed roles |
|--------|------|---------------|
| GET | `/` | admin, dispute_manager, collections_analyst, controller *(already gated)* |
| GET | `/aging-summary` | admin, dispute_manager, collections_analyst, controller *(already gated)* |
| POST | `/refresh-aging` | admin, controller *(already gated)* |
| GET | `/outstanding/{customer_id}` | admin, dispute_manager, collections_analyst, controller |
| POST | `/{ar_id}/mark-received` | admin, collections_analyst *(already gated)* |

### Already-protected endpoints (no change)
- `/api/fraud/*` — admin, controller
- `/api/compliance/*` — admin, controller
- `/api/credit-memos/*` — admin, dispute_manager, collections_analyst, controller
- `/api/portal-disputes/*` — authenticated staff (`get_current_staff`) or `require_admin`

## 4. Customer portal remains separate

`/api/customer-portal/*` routes (login, register, KYC OTP, profile, orders, outstanding, payments, disputes) are **not** gated by `require_role`. They use the customer JWT dependency `get_current_customer` and are documented separately.

### 4a. Order status transition controls

- **PATCH `/{order_id}/status`** rejects `fulfilled` and `cancelled` — these must go through `POST /{order_id}/fulfill` and `POST /{order_id}/cancel` respectively, which route through the inventory service to maintain stock consistency.
- **POST `/{order_id}/cancel`** locks the order row with `SELECT ... FOR UPDATE` and verifies the order exists **before** releasing inventory, all within the same database transaction. This prevents releasing reservations for non-existent or already-cancelled orders.
- **GET `/{order_id}`** now returns an optional nested `reservation` object alongside the order row so callers can see inventory status without a separate request.

## 5. Service-to-service authentication

Internal callers that need to hit protected staff endpoints now sign a short-lived service JWT with the same `JWT_SECRET_KEY`:

- `backend/email_intake/router.py` — sends a service token for ORDER and PAYMENT forwards.
- `backend/api/hitl.py` — sends a service token when re-processing pending order emails after KYC approval.

The dispute email forward intentionally does **not** send a service token, preserving the public submission behavior.

## 6. Staff authentication foundation

- Staff users are stored in `staff_users` with bcrypt password hashes.
- `/api/auth/login` verifies the bcrypt hash from the database and rejects inactive users.
- `/api/auth/me` requires a Bearer token, decodes it, loads the active staff user, and returns `username`, `display_name`, and `role`.
- `require_role` validates human staff tokens against `staff_users`, so disabled or deleted staff users lose access immediately.
- Development demo staff users are seeded only when `settings.app_env.lower() == "development"`.

## 7. Verification run

- `python -m compileall backend`
- `python -m pytest backend/tests -q`
- `npm run build` in `frontend/`

## 8. Remaining risks

- Secrets in earlier git history may still be reachable via `git log`; consider `git-filter-repo` or rotating credentials if these secrets were ever exposed in a public/tracked `.env`.
- Rotate any credentials that were present in `backend/.env`, Gmail OAuth credential/token files, or other removed runtime artifacts.
- Development seed users use known demo passwords and must never be seeded outside development.
- `JWT_SECRET_KEY` defaults to a placeholder in `.env.example`; production deployments must set a strong, unique secret.
- `/api/health` and `/api/auth/login` remain public by design.
- The WebSocket endpoint `/ws/pipeline` does not authenticate connections in this patch.
