import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Truck, Pencil, X, TrendingUp, CheckCircle } from 'lucide-react'
import { inventoryApi, productsApi } from '../lib/api'

function Card({ label, value, tone = 'var(--accent-blue)' }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="kpi-label">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone }}>{value ?? '—'}</div>
    </div>
  )
}

function fmt(n) { return n ? Number(n).toLocaleString('en-IN') : '—' }

function marginColor(pct) {
  if (!pct) return '#475569'
  if (pct >= 20) return '#10b981'
  if (pct >= 10) return '#f59e0b'
  return '#f87171'
}

export default function ProductDetailPage() {
  const { skuId } = useParams()
  const qc = useQueryClient()
  const [showPriceEdit, setShowPriceEdit] = useState(false)
  const [newSelling, setNewSelling] = useState('')
  const [newCost, setNewCost] = useState('')
  const [priceMsg, setPriceMsg] = useState(null)

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', skuId],
    queryFn: () => productsApi.get(skuId).then(r => r.data),
    enabled: !!skuId,
  })
  const { data: forecast } = useQuery({
    queryKey: ['inventory-forecast', skuId],
    queryFn: () => inventoryApi.forecast(skuId, { days: 30 }).then(r => r.data),
    enabled: !!skuId,
  })
  const { data: txns } = useQuery({
    queryKey: ['inventory-transactions', skuId],
    queryFn: () => inventoryApi.transactions({ sku_id: skuId, limit: 20 }).then(r => r.data),
    enabled: !!skuId,
  })

  const updatePriceMut = useMutation({
    mutationFn: (body) => productsApi.updatePrice(skuId, body),
    onSuccess: (res) => {
      setShowPriceEdit(false)
      setNewSelling('')
      setNewCost('')
      setPriceMsg(res.data?.message || 'Price updated!')
      qc.invalidateQueries({ queryKey: ['product', skuId] })
      qc.invalidateQueries({ queryKey: ['products'] })
      setTimeout(() => setPriceMsg(null), 4000)
    },
  })

  if (isLoading) return <div className="page-content"><div className="loading-wrap"><div className="spinner" /></div></div>

  const sellingVal = parseFloat(newSelling) || 0
  const costVal = parseFloat(newCost) || 0
  const previewMargin = sellingVal > 0 && costVal > 0
    ? Math.round((sellingVal - costVal) / sellingVal * 100)
    : null

  const currentMargin = product?.gross_margin_pct ?? (
    product?.base_price_inr && product?.cost_price_inr
      ? Math.round((product.base_price_inr - product.cost_price_inr) / product.base_price_inr * 100)
      : null
  )

  return (
    <div className="page-content animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <Link to="/products" className="btn btn-secondary btn-sm" style={{ marginBottom: 10 }}>
            <ArrowLeft size={13} /> Products
          </Link>
          <h1 className="page-title">{skuId}</h1>
          <p className="page-subtitle">{product?.product_name || 'Product detail'}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowPriceEdit(v => !v)}>
            <Pencil size={12} /> Edit Price
          </button>
          <Link to="/purchase-orders" className="btn btn-primary btn-sm">
            <Truck size={13} /> Purchase Orders
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">Could not load product.</div>}
      {priceMsg && (
        <div className="alert alert-success" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={14} /> {priceMsg}
        </div>
      )}
      {updatePriceMut.isError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {updatePriceMut.error?.response?.data?.detail || 'Failed to update price'}
        </div>
      )}

      {/* Inline price editor */}
      {showPriceEdit && (
        <div className="card animate-slide" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div>
              <div className="card-title">✏️ Update Selling Price</div>
              <div className="card-subtitle">Changes apply to all future orders and customer portal immediately</div>
            </div>
            <button onClick={() => setShowPriceEdit(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, alignItems: 'end', marginBottom: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">
                <span style={{ color: '#10b981' }}>New Selling Price (₹)</span>
              </label>
              <input
                className="form-input" type="number" min="0" step="100"
                value={newSelling}
                placeholder={`Current: ₹${fmt(product?.base_price_inr)}`}
                onChange={e => setNewSelling(e.target.value)}
                style={{ borderColor: '#10b981', fontWeight: 700, color: '#10b981', fontSize: 16 }}
                autoFocus
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cost Price (₹) <span style={{ color: '#64748b', fontSize: 10 }}>optional</span></label>
              <input
                className="form-input" type="number" min="0" step="100"
                value={newCost}
                placeholder={product?.cost_price_inr ? `Current: ₹${fmt(product.cost_price_inr)}` : 'e.g. 14000'}
                onChange={e => setNewCost(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {previewMargin !== null && (
                <div style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', textAlign: 'center',
                  border: `1px solid ${marginColor(previewMargin)}33`,
                }}>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Preview Margin</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: marginColor(previewMargin) }}>{previewMargin}%</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowPriceEdit(false)}>Cancel</button>
                <button
                  className="btn btn-success btn-sm"
                  disabled={!sellingVal || sellingVal <= 0 || updatePriceMut.isPending}
                  onClick={() => updatePriceMut.mutate({
                    selling_price_inr: sellingVal,
                    cost_price_inr: costVal > 0 ? costVal : undefined,
                  })}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <CheckCircle size={12} /> {updatePriceMut.isPending ? 'Saving…' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {product && (
        <>
          {/* Stock KPIs */}
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <Card label="Available" value={product.available_stock} tone="var(--accent-green)" />
            <Card label="On Hand" value={product.stock_on_hand} />
            <Card label="Reserved" value={product.reserved_stock} tone="var(--accent-amber)" />
            <Card label="Incoming" value={product.incoming_stock} tone="var(--accent-cyan)" />
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            {/* Product & Pricing Summary */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Product & Pricing Summary</div>
                  <div className="card-subtitle">Category {product.category || '—'} · {product.unit_of_measure || 'unit'}</div>
                </div>
                <span className={`badge ${product.reorder_status === 'URGENT' ? 'badge-red' : product.reorder_status === 'REORDER' ? 'badge-amber' : 'badge-green'}`}>
                  {product.reorder_status}
                </span>
              </div>

              {/* Price highlight box */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                gap: 10, marginBottom: 14,
                background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px',
                border: '1px solid var(--border-subtle)',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Cost Price</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#94a3b8' }}>
                    {product.cost_price_inr ? `₹${fmt(product.cost_price_inr)}` : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Selling Price</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>₹{fmt(product.base_price_inr)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Gross Margin</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: marginColor(currentMargin) }}>
                    {currentMargin !== null ? `${currentMargin}%` : '—'}
                  </div>
                </div>
              </div>

              <div className="stat-row">
                <span className="stat-label">Reorder level</span>
                <span className="stat-val">{product.reorder_level}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Safety stock</span>
                <span className="stat-val">{product.safety_stock}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Lead time</span>
                <span className="stat-val">{product.lead_time_days || 0} days</span>
              </div>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPriceEdit(true)}
                style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}
              >
                <Pencil size={11} /> <TrendingUp size={11} /> Update Selling Price
              </button>
            </div>

            {/* Forecast */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Forecast Summary</div>
                {forecast?.reorder_needed && <span className="badge badge-amber">Reorder suggested</span>}
              </div>
              <div className="stat-row">
                <span className="stat-label">Projected demand (30d)</span>
                <span className="stat-val">{Math.round(forecast?.projected_30d_demand || 0)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Avg daily demand</span>
                <span className="stat-val">{(forecast?.average_daily_demand || 0).toFixed(1)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Depletion date</span>
                <span className="stat-val">{forecast?.depletion_date || '—'}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Recommended reorder qty</span>
                <span className="stat-val">{Math.ceil(forecast?.recommended_reorder_qty || 0)}</span>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header"><div className="card-title">Incoming PO Lines</div></div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>PO</th><th>Status</th><th>ETA</th><th>Cost/Unit</th><th>Remaining</th></tr>
                  </thead>
                  <tbody>
                    {(product.incoming_po_lines || []).length === 0
                      ? <tr><td colSpan={5}>No open incoming lines.</td></tr>
                      : product.incoming_po_lines.map(l => (
                        <tr key={`${l.po_id}-${l.sku_id}`}>
                          <td style={{ fontFamily: 'monospace' }}>{l.po_id}</td>
                          <td>{l.status}</td>
                          <td>{l.expected_arrival_date ? new Date(l.expected_arrival_date).toLocaleDateString() : '—'}</td>
                          <td style={{ color: '#94a3b8' }}>{l.unit_cost_inr ? `₹${fmt(l.unit_cost_inr)}` : '—'}</td>
                          <td>{l.remaining_incoming}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">Recent Transactions</div></div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Type</th><th>Delta</th><th>Field</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {(txns?.transactions || product.recent_transactions || []).length === 0
                      ? <tr><td colSpan={4}>No recent transactions.</td></tr>
                      : (txns?.transactions || product.recent_transactions || []).map(t => (
                        <tr key={t.txn_id}>
                          <td>
                            <span style={{
                              fontFamily: 'monospace', fontSize: 11,
                              color: t.txn_type === 'PRICE_REVALUATION' ? '#f59e0b' : 'inherit',
                            }}>
                              {t.txn_type}
                            </span>
                          </td>
                          <td style={{ color: t.quantity_delta > 0 ? '#10b981' : t.quantity_delta < 0 ? '#f87171' : '#94a3b8' }}>
                            {t.quantity_delta > 0 ? '+' : ''}{t.quantity_delta}
                          </td>
                          <td>{t.field_affected}</td>
                          <td>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
