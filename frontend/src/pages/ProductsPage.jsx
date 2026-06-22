import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, Pencil, X, TrendingUp, CheckCircle } from 'lucide-react'
import { productsApi } from '../lib/api'

function statusClass(status) {
  return status === 'URGENT' ? 'badge badge-red' : status === 'REORDER' ? 'badge badge-amber' : 'badge badge-green'
}

function fmt(n) { return n ? Number(n).toLocaleString('en-IN') : '—' }

function marginColor(pct) {
  if (pct === null || pct === undefined) return '#475569'
  if (pct >= 20) return '#10b981'
  if (pct >= 10) return '#f59e0b'
  return '#f87171'
}

// ── Edit Price Modal ─────────────────────────────────────────────────────────
function EditPriceModal({ product, onClose, onSave }) {
  const [sellingPrice, setSellingPrice] = useState(product?.base_price_inr || '')
  const [costPrice, setCostPrice] = useState(product?.cost_price_inr || '')

  const sellingVal = parseFloat(sellingPrice) || 0
  const costVal = parseFloat(costPrice) || 0
  const margin = sellingVal > 0 && costVal > 0
    ? Math.round((sellingVal - costVal) / sellingVal * 100)
    : null

  const handleSave = () => {
    if (!sellingVal || sellingVal <= 0) return
    onSave({
      selling_price_inr: sellingVal,
      cost_price_inr: costVal > 0 ? costVal : undefined,
    })
  }

  if (!product) return null

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card animate-slide" style={{ width: 'min(500px, 96vw)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">✏️ Update Selling Price</div>
            <div className="card-subtitle" style={{ fontFamily: 'monospace' }}>{product.sku_id} — {product.product_name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Info banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0d2818, #0a1628)',
          border: '1px solid #166534', borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <TrendingUp size={14} color="#4ade80" style={{ marginTop: 1 }} />
          <div style={{ fontSize: 12, color: '#86efac' }}>
            The <strong>Selling Price</strong> is what customers pay — it updates immediately across the portal, invoices and all future orders.
            {product.cost_price_inr && (
              <> Current cost: <strong>₹{fmt(product.cost_price_inr)}</strong></>
            )}
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">
              <span style={{ color: '#10b981' }}>⬆ Selling Price (₹)</span>
              <span style={{ color: '#64748b', marginLeft: 4, fontSize: 10 }}>— what customers pay</span>
            </label>
            <input
              className="form-input"
              type="number" min="0" step="100"
              value={sellingPrice}
              onChange={e => setSellingPrice(e.target.value)}
              style={{ borderColor: '#10b981', fontSize: 16, fontWeight: 700, color: '#10b981' }}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              Cost Price (₹) <span style={{ color: '#64748b', fontSize: 10 }}>— optional, for margin tracking</span>
            </label>
            <input
              className="form-input"
              type="number" min="0" step="100"
              value={costPrice}
              onChange={e => setCostPrice(e.target.value)}
              placeholder="e.g. 15000"
            />
          </div>
        </div>

        {/* Live preview */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Current Price</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8' }}>₹{fmt(product.base_price_inr)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>New Price</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>
                {sellingVal > 0 ? `₹${fmt(sellingVal)}` : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Gross Margin</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: marginColor(margin) }}>
                {margin !== null ? `${margin}%` : '—'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-success"
            disabled={!sellingVal || sellingVal <= 0}
            onClick={handleSave}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <CheckCircle size={13} /> Save & Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [reorderStatus, setReorderStatus] = useState('')
  const [editProduct, setEditProduct] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)

  const params = {
    search: search || undefined,
    category: category || undefined,
    reorder_status: reorderStatus || undefined,
    limit: 200,
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', params],
    queryFn: () => productsApi.list(params).then(r => r.data),
  })

  const updatePriceMut = useMutation({
    mutationFn: ({ skuId, body }) => productsApi.updatePrice(skuId, body),
    onSuccess: (res) => {
      setEditProduct(null)
      setSaveSuccess(res.data?.message || 'Price updated!')
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product'] })
      setTimeout(() => setSaveSuccess(null), 4000)
    },
  })

  const products = data?.products || []
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))]

  return (
    <div className="page-content animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Products & Pricing</h1>
          <p className="page-subtitle">Inventory stock summary — click ✏️ to update selling prices</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => refetch()}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>Could not load products.</div>}
      {saveSuccess && (
        <div className="alert alert-success" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={14} /> {saveSuccess}
        </div>
      )}
      {updatePriceMut.isError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {updatePriceMut.error?.response?.data?.detail || 'Failed to update price'}
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="search-wrap" style={{ width: 280 }}>
            <Search className="search-icon" size={13} />
            <input className="form-input" placeholder="Search SKU or product..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input" style={{ width: 160 }} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input" style={{ width: 160 }} value={reorderStatus} onChange={e => setReorderStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>URGENT</option>
            <option>REORDER</option>
            <option>OK</option>
          </select>
        </div>

        {isLoading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th style={{ color: '#94a3b8' }}>Cost Price</th>
                  <th style={{ color: '#10b981' }}>Selling Price</th>
                  <th style={{ color: '#f59e0b' }}>Margin</th>
                  <th>Available</th>
                  <th>On Hand</th>
                  <th>Incoming</th>
                  <th>Reorder</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={11}><div className="empty-state"><div className="empty-title">No products found</div></div></td></tr>
                ) : products.map(p => (
                  <tr key={p.sku_id}>
                    <td>
                      <Link style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }} to={`/products/${p.sku_id}`}>
                        {p.sku_id}
                      </Link>
                    </td>
                    <td>{p.product_name}</td>
                    <td>{p.category}</td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>
                      {p.cost_price_inr ? `₹${fmt(p.cost_price_inr)}` : <span style={{ color: '#374151' }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: '#10b981' }}>
                        ₹{fmt(p.base_price_inr)}
                      </span>
                    </td>
                    <td>
                      {p.gross_margin_pct !== null && p.gross_margin_pct !== undefined ? (
                        <span style={{
                          fontWeight: 700, fontSize: 12,
                          color: marginColor(p.gross_margin_pct),
                        }}>
                          {p.gross_margin_pct}%
                        </span>
                      ) : <span style={{ color: '#374151', fontSize: 12 }}>—</span>}
                    </td>
                    <td>{p.available_stock}</td>
                    <td>{p.stock_on_hand}</td>
                    <td>{p.incoming_stock}</td>
                    <td><span className={statusClass(p.reorder_status)}>{p.reorder_status}</span></td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditProduct(p)}
                        style={{ gap: 4 }}
                      >
                        <Pencil size={11} /> Price
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Price Modal */}
      {editProduct && (
        <EditPriceModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSave={(body) => updatePriceMut.mutate({ skuId: editProduct.sku_id, body })}
        />
      )}
    </div>
  )
}
