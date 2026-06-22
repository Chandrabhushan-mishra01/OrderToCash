# O2C Agent v2.0

An AI-powered Order-to-Cash (O2C) automation system. This system uses multi-agent architecture (GLiNER for NER, Groq LLaMA for validation and generation, XGBoost for ML predictions) to automate order ingestion, credit checks, fraud detection, cash application, and collections.

## 🚀 Prerequisites

Before you start, make sure you have the following installed:
- **Python 3.10+** (v3.13 recommended)
- **Node.js 18+** & npm
- **PostgreSQL 14+**
- **Redis Server** (For Celery task queues and WebSocket pub/sub)
- **Git**

---

## 🛠️ Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/TSP2005/O2C.git
cd O2C/o2c-agent
```

### 2. Database Setup (PostgreSQL)
1. Open PostgreSQL (pgAdmin or psql) and create a new database and user:
```sql
CREATE USER o2c_admin WITH PASSWORD 'changeme';
CREATE DATABASE o2c_agent OWNER o2c_admin;
```
*(If you use different credentials, update `backend/.env`).*

### 3. Redis Setup
The application uses Celery for background tasks, which requires Redis.
- **Mac/Linux:** `brew install redis` and `brew services start redis`
- **Windows:** Download a pre-compiled Windows binary (Memurai or the older Microsoft archive), extract it, and run `redis-server.exe`.

### 4. Backend Setup
Open a terminal in the repo root:
```bash
# Create and activate a virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Copy the example env file and fill in your credentials
copy backend\.env.example backend\.env   # Windows
# cp backend/.env.example backend/.env  # Mac/Linux

# Run migrations and seed the database
python seed_data/rich_seed.py
```

> **Note:** `rich_seed.py` creates the tables and loads synthetic datasets (customers, products,
> invoices, etc.) so you don't start with an empty system.
> Development staff users (admin/admin123, controller/ctrl123, inventory_manager/inv123, etc.) are seeded **only** when `APP_ENV=development`
> (the default). Set `APP_ENV=production` to skip them.

### 5. Frontend Setup
Open a *new* terminal in the `frontend` folder:
```bash
cd frontend
npm install
```

---

## 🏃‍♂️ Running the Application Locally

You will need **3 separate terminal windows** to run the full stack:

### Terminal 1: Backend API (FastAPI)
```bash
# from repo root, venv activated
uvicorn backend.main:app --reload --port 8000
```

### Terminal 2: Celery Worker (Background tasks & AI processing)
```bash
# from repo root, venv activated
# On Windows (requires gevent/eventlet or solo pool):
celery -A backend.workers.celery_worker.celery_app worker --loglevel=info --pool=solo
# On Mac/Linux:
# celery -A backend.workers.celery_worker.celery_app worker --loglevel=info
```

### Terminal 3: Frontend (React/Vite)
```bash
cd frontend
npm run dev
```

The app will be running at [http://localhost:5173](http://localhost:5173).

---

## 🧪 Running Tests

From the **repo root** (venv activated):
```bash
python -m pytest backend/tests -q
```

---

## 📦 Inventory Capabilities

The inventory module includes backend APIs and staff UI pages for:

- Inventory dashboard with low-stock, backorder, incoming PO, and transaction summaries.
- Products page and product detail view with available/on-hand/reserved/incoming stock.
- Purchase order creation, confirmation, receiving, and incoming-stock tracking.
- Order reservation, fulfillment, and cancellation flows that mutate stock only through `inventory_service.py`.
- Forecast snapshot APIs for demand, depletion date, and reorder recommendations.

Key staff routes:

- `/inventory`
- `/products`
- `/products/:skuId`
- `/purchase-orders`

`inventory_manager` can access these inventory routes plus order inventory actions, without finance, dispute, analytics, or compliance access.

Key backend routes:

- `/api/inventory/*`
- `/api/products/*`
- `/api/purchase-orders/*`
- `/api/orders/{order_id}/fulfill`
- `/api/orders/{order_id}/cancel`

---

## 🔑 Environment Variables & API Keys

`backend/.env` is **not committed** to the repository. Copy the example file and fill in your values:
```bash
copy backend\.env.example backend\.env   # Windows
# cp backend/.env.example backend/.env  # Mac/Linux
```

Key variables to configure:

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq LLaMA API key — get one free at [console.groq.com](https://console.groq.com) |
| `SMTP_USER` / `SMTP_PASSWORD` | Gmail credentials for outbound email (collections, OTPs) |
| `POSTGRES_*` | PostgreSQL connection details |
| `JWT_SECRET_KEY` | Change this in production (min 32 chars) |
| `APP_ENV` | `development` (default) seeds staff demo users; set to `production` to skip |
