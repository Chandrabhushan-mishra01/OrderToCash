import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, CheckCircle, PackageCheck, Sparkles, X, ChevronDown, ChevronUp, AlertCircle, TrendingUp } from 'lucide-react'
import { purchaseOrdersApi } from '../lib/api'

const emptyLine = { sku_id: '', quantity_ordered: 1, unit_cost_inr: 0 }

const CONFIDENCE_STYLE = {
  HIGH:   { bg: '#052e16', border: '#166534', text: '#4ade80', icon: '✓' },
  MEDIUM: { bg: '#1c1917', border: '#92400e', text: '#fbbf24', icon: '⚠' },
  LOW:    { bg: '#1c0a0a', border: '#7f1d1d', text: '#f87171', icon: '✗' },
}

function fmt(n) { return n ? Number(n).toLocaleString('en-IN') : '—' }

// ── NLP Describe & Fill ──────────────────────────────────────────────────────
function NLPSection({ onPrefill }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  // Per-item overrides for selling price
  const [sellingOverrides, setSellingOverrides] = useState({})

  const nlpMut = useMutation({
    mutationFn: () => purchaseOrdersApi.nlpPreview(text),
    onSuccess: (res) => {
      setPreview(res.data)
      // Init overrides from suggested prices
      const init = {}
      ;(res.data?.prefilled?.items || []).forEach((item, i) => {
        init[i] = item.suggested_selling_price_inr || ''
      })
      setSellingOverrides(init)
    },
  })

  const handleApply = () => {
    if (preview?.prefilled) {
      const prefilled = {
        ...preview.prefilled,
        items: preview.prefilled.items.map((item, i) => ({
          ...item,
          selling_price_inr: parseFloat(sellingOverrides[i]) || item.suggested_selling_price_inr || 0,
        })),
      }
      onPrefill(prefilled)
      setPreview(null)
      setText('')
      setIsOpen(false)
    }
  }

  const conf = preview ? (CONFIDENCE_STYLE[preview.confidence] || CONFIDENCE_STYLE.MEDIUM) : null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0d1f3c 0%, #0f172a 100%)',
      border: '1px solid #1e3a5f', borderRadius: 14, marginBottom: 20, overflow: 'hidden',
    }}>
      <button onClick={() => setIsOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
        color: '#e2e8f0', textAlign: 'left',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={16} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>🤖 Describe PO in Plain English</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>GLiNER + Groq extracts supplier, SKUs, quantities, costs & recommends selling prices (+10%)</div>
        </div>
        {isOpen ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
      </button>

      {isOpen && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #1e3a5f' }}>
          <div style={{ marginTop: 14, marginBottom: 10 }}>
            <textarea
              value={text} onChange={e => setText(e.target.value)} rows={3}
              placeholder={`e.g. "Order 100 units of SKU-001 from Motorco at ₹1200 each, and 50 of SKU-004 from PLCTech, expected by 2026-07-20"`}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0a0c1a', border: '1px solid #2e3150', borderRadius: 10,
                padding: '10px 14px', color: '#e2e8f0', fontSize: 13, resize: 'vertical',
                fontFamily: 'inherit', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = '#2e3150'}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={!text.trim() || nlpMut.isPending} onClick={() => nlpMut.mutate()} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: (!text.trim() || nlpMut.isPending) ? '#1e293b' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
              color: (!text.trim() || nlpMut.isPending) ? '#475569' : 'white',
              fontWeight: 700, fontSize: 13,
            }}>
              <Sparkles size={13} />
              {nlpMut.isPending ? 'Analyzing…' : 'Extract Fields'}
            </button>
            {preview && (
              <button onClick={() => setPreview(null)} style={{
                background: 'transparent', border: '1px solid #2e3150', borderRadius: 8,
                padding: '7px 12px', cursor: 'pointer', color: '#94a3b8', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 4,
              }}><X size={12} /> Clear</button>
            )}
            {nlpMut.isError && (
              <div style={{ color: '#f87171', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={13} /> {nlpMut.error?.response?.data?.detail || 'NLP failed'}
              </div>
            )}
          </div>

          {preview && (
            <div style={{ marginTop: 16, background: conf.bg, border: `1px solid ${conf.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: conf.text, letterSpacing: '0.06em' }}>
                  {conf.icon} AI EXTRACTED — {preview.confidence} CONFIDENCE
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase' }}>Supplier</div>
                  <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 600 }}>{preview.prefilled.supplier_id || <span style={{ color: '#475569', fontStyle: 'italic' }}>Not detected</span>}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase' }}>Expected Arrival</div>
                  <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 600 }}>{preview.prefilled.expected_arrival_date || <span style={{ color: '#475569', fontStyle: 'italic' }}>Not detected</span>}</div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Line Items & Selling Prices</div>
                {preview.prefilled.items.map((item, i) => {
                  const purchaseCost = item.unit_cost_inr || 0
                  const suggested = item.suggested_selling_price_inr || 0
                  const currentVal = parseFloat(sellingOverrides[i]) || 0
                  const margin = currentVal > 0 && purchaseCost > 0
                    ? Math.round((currentVal - purchaseCost) / currentVal * 100)
                    : null

                  return (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                      padding: '10px 12px', marginBottom: 8,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 10, color: '#64748b' }}>SKU</span>
                          <div style={{ fontFamily: 'monospace', color: '#60a5fa', fontSize: 13, fontWeight: 700 }}>{item.sku_id || '—'}</div>
                        </div>
                        <div style={{ flex: 0.6 }}>
                          <span style={{ fontSize: 10, color: '#64748b' }}>Qty</span>
                          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{item.quantity_ordered}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 10, color: '#64748b' }}>Purchase Cost</span>
                          <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
                            {purchaseCost > 0 ? `₹${fmt(purchaseCost)}` : '—'}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <TrendingUp size={11} color="#10b981" />
                          <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700, textTransform: 'uppercase' }}>
                            Selling Price
                          </span>
                          {item.selling_price_source === 'explicit' ? (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981',
                              borderRadius: 4, padding: '1px 6px', color: '#4ade80',
                            }}>
                              ✓ Explicitly set by you
                            </span>
                          ) : item.selling_price_source === 'suggested_10pct' ? (
                            <span style={{ fontSize: 10, color: '#64748b' }}>
                              💡 AI-suggested +10% on purchase cost — edit as needed
                            </span>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }}>₹</span>
                            <input
                              type="number"
                              min="0"
                              value={sellingOverrides[i] ?? suggested}
                              onChange={e => setSellingOverrides(s => ({ ...s, [i]: e.target.value }))}
                              style={{
                                width: '100%', boxSizing: 'border-box',
                                background: '#0a1628', border: '1px solid #10b981',
                                borderRadius: 7, padding: '7px 10px 7px 24px',
                                color: '#10b981', fontSize: 14, fontWeight: 700,
                                outline: 'none',
                              }}
                            />
                          </div>
                          {margin !== null && (
                            <div style={{
                              background: margin >= 10 ? '#052e16' : '#1c1917',
                              border: `1px solid ${margin >= 10 ? '#166534' : '#92400e'}`,
                              borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700,
                              color: margin >= 10 ? '#4ade80' : '#fbbf24',
                            }}>
                              {margin}% margin
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <button onClick={handleApply} style={{
                width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <CheckCircle size={14} /> Apply to Form & Review
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Receive Modal with Selling Price ────────────────────────────────────────
function ReceiveModal({ receive, setReceive, receiveMut }) {
  if (!receive) return null

  const updateLine = (idx, key, val) =>
    setReceive(po => ({
      ...po,
      items: po.items.map((l, i) => i === idx ? { ...l, [key]: val } : l),
    }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReceive(null)}>
      <div className="card animate-slide" style={{ width: 'min(860px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="card-header">
          <div>
            <div className="card-title">📦 Receive {receive.po_id}</div>
            <div className="card-subtitle">Set quantities received and the new selling price for each SKU</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setReceive(null)}>Close</button>
        </div>

        {/* Pricing banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0d2818, #0a1628)',
          border: '1px solid #166534', borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <TrendingUp size={14} color="#4ade80" />
          <div style={{ fontSize: 12, color: '#86efac' }}>
            <strong>Selling Price Management:</strong> The AI pre-fills a <strong>+10% markup</strong> on purchase cost as a suggestion.
            You can edit each selling price before receiving. Prices update instantly across the system — customer portal, invoices, orders.
          </div>
        </div>

        {(receive.items || []).map((line, idx) => {
          const purchaseCost = parseFloat(line.new_unit_price_inr || line.unit_cost_inr || 0)
          const sellingPrice = parseFloat(line.new_selling_price_inr || 0)
          const margin = sellingPrice > 0 && purchaseCost > 0
            ? Math.round((sellingPrice - purchaseCost) / sellingPrice * 100)
            : null
          const remainingQty = (line.quantity_ordered || 0) - (line.quantity_received || 0)

          return (
            <div key={line.sku_id} style={{
              background: 'rgba(255,255,255,0.02)', borderRadius: 10,
              border: '1px solid var(--border-subtle)', padding: '14px 16px', marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent-blue)', fontWeight: 700, fontSize: 14 }}>{line.sku_id}</span>
                <span style={{ color: '#64748b', fontSize: 12 }}>· Open: {remainingQty} units</span>
                {line.base_price_inr && (
                  <span style={{ color: '#64748b', fontSize: 12 }}>· Current selling price: ₹{fmt(line.base_price_inr)}</span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1.2fr', gap: 10, alignItems: 'end' }}>
                {/* Quantity received */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 10 }}>Qty to Receive</label>
                  <input
                    className="form-input" type="number" min="0" max={remainingQty}
                    value={line.quantity_to_receive ?? remainingQty}
                    onChange={e => updateLine(idx, 'quantity_to_receive', +e.target.value)}
                  />
                </div>

                {/* Purchase cost */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 10 }}>Purchase Cost / Unit (₹)</label>
                  <input
                    className="form-input" type="number" min="0"
                    value={line.new_unit_price_inr ?? ''}
                    placeholder={line.unit_cost_inr ? `PO: ₹${fmt(line.unit_cost_inr)}` : ''}
                    onChange={e => {
                      const cost = parseFloat(e.target.value) || 0
                      updateLine(idx, 'new_unit_price_inr', cost)
                      // Auto-suggest +10% selling price if not manually edited
                      if (!line._selling_manually_edited) {
                        updateLine(idx, 'new_selling_price_inr', Math.round(cost * 1.10 * 100) / 100)
                      }
                    }}
                  />
                </div>

                {/* Selling price */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 10 }}>
                    <span style={{ color: '#10b981' }}>⬆ New Selling Price / Unit (₹)</span>
                    {purchaseCost > 0 && (
                      <span style={{ color: '#64748b', marginLeft: 4 }}>
                        · Suggested: ₹{fmt(Math.round(purchaseCost * 1.10))}
                      </span>
                    )}
                  </label>
                  <input
                    className="form-input" type="number" min="0"
                    value={line.new_selling_price_inr ?? ''}
                    placeholder="e.g. 18500"
                    style={{ borderColor: '#10b981', color: '#10b981' }}
                    onChange={e => {
                      updateLine(idx, 'new_selling_price_inr', parseFloat(e.target.value) || 0)
                      updateLine(idx, '_selling_manually_edited', true)
                    }}
                  />
                </div>

                {/* Live margin badge */}
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                  {margin !== null ? (
                    <div style={{
                      background: margin >= 10 ? 'rgba(16,185,129,0.15)' : margin >= 0 ? 'rgba(245,158,11,0.15)' : 'rgba(248,113,113,0.15)',
                      border: `1px solid ${margin >= 10 ? '#10b981' : margin >= 0 ? '#f59e0b' : '#f87171'}`,
                      borderRadius: 8, padding: '8px 14px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: margin >= 10 ? '#10b981' : margin >= 0 ? '#f59e0b' : '#f87171' }}>
                        {margin}%
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>Gross Margin</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#475569', padding: '8px 0' }}>Enter prices to see margin</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-secondary" onClick={() => setReceive(null)}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={receiveMut.isPending}
            onClick={() => receiveMut.mutate({
              poId: receive.po_id,
              payload: {
                idempotency_key: `recv-${Date.now()}`,
                items: receive.items
                  .filter(l => (l.quantity_to_receive || 0) > 0)
                  .map(l => ({
                    sku_id: l.sku_id,
                    quantity_received: l.quantity_to_receive,
                    new_unit_price_inr: l.new_unit_price_inr || null,
                    new_selling_price_inr: l.new_selling_price_inr || null,
                  })),
              },
            })}
          >
            <PackageCheck size={14} /> {receiveMut.isPending ? 'Processing…' : 'Receive & Update Prices'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ supplier_id: '', expected_arrival_date: '', items: [{ ...emptyLine }] })
  const [receive, setReceive] = useState(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => purchaseOrdersApi.list({ limit: 100 }).then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: purchaseOrdersApi.create,
    onSuccess: () => {
      setShowCreate(false)
      setForm({ supplier_id: '', expected_arrival_date: '', items: [{ ...emptyLine }] })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })

  const confirmMut = useMutation({
    mutationFn: purchaseOrdersApi.confirm,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  })

  const receiveMut = useMutation({
    mutationFn: ({ poId, payload }) => purchaseOrdersApi.receive(poId, payload),
    onSuccess: (res) => {
      setReceive(null)
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['inventory-dashboard-summary'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      // Show price update summary
      const updated = res.data?.movements?.filter(m => m.new_selling_price_inr) || []
      if (updated.length) {
        console.log('Selling prices updated for:', updated.map(m => `${m.sku_id}: ₹${m.new_selling_price_inr}`).join(', '))
      }
    },
  })

  const orders = data?.purchase_orders || []
  const setLine = (idx, key, value) =>
    setForm(f => ({ ...f, items: f.items.map((l, i) => i === idx ? { ...l, [key]: value } : l) }))
  const addLine = () => setForm(f => ({ ...f, items: [...f.items, { ...emptyLine }] }))
  const removeLine = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const handleNLPPrefill = (prefilled) => {
    setForm({
      supplier_id: prefilled.supplier_id || '',
      expected_arrival_date: prefilled.expected_arrival_date || '',
      items: prefilled.items.length > 0 ? prefilled.items.map(i => ({
        sku_id: i.sku_id,
        quantity_ordered: i.quantity_ordered,
        unit_cost_inr: i.unit_cost_inr,
        suggested_selling_price_inr: i.selling_price_inr,
      })) : [{ ...emptyLine }],
    })
    setShowCreate(true)
    setTimeout(() => document.getElementById('po-create-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  return (
    <div className="page-content animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Purchase Orders</h1>
          <p className="page-subtitle">Draft, confirm, and receive replenishment POs — with AI selling price recommendations</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => refetch()}><RefreshCw size={13} /> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(v => !v)}><Plus size={13} /> New PO</button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>Could not load purchase orders.</div>}
      {createMut.isError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{createMut.error?.response?.data?.detail || 'Create failed'}</div>}
      {confirmMut.isError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{confirmMut.error?.response?.data?.detail || 'Confirm failed'}</div>}
      {receiveMut.isError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{receiveMut.error?.response?.data?.detail || 'Receive failed'}</div>}

      {/* AI NLP Panel */}
      <NLPSection onPrefill={handleNLPPrefill} />

      {/* Create Form */}
      {showCreate && (
        <div id="po-create-form" className="card animate-slide" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">Create Draft PO</div>
            <button onClick={() => setShowCreate(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Supplier ID</label>
              <input className="form-input" placeholder="e.g. SUPPLIER-MOTORCO" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Expected Arrival Date</label>
              <input className="form-input" type="date" value={form.expected_arrival_date} onChange={e => setForm(f => ({ ...f, expected_arrival_date: e.target.value }))} />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>Line Items</label>
              <button className="btn btn-secondary btn-sm" onClick={addLine}><Plus size={12} /> Add Line</button>
            </div>
            {form.items.map((line, idx) => (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10,
                alignItems: 'flex-end', marginBottom: 10,
                background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border-subtle)',
              }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 10 }}>SKU ID</label>
                  <input className="form-input" placeholder="SKU-001" value={line.sku_id} onChange={e => setLine(idx, 'sku_id', e.target.value.toUpperCase())} style={{ fontFamily: 'monospace' }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 10 }}>Quantity</label>
                  <input className="form-input" type="number" min="1" value={line.quantity_ordered} onChange={e => setLine(idx, 'quantity_ordered', +e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 10 }}>Purchase Cost (₹)</label>
                  <input className="form-input" type="number" min="0" value={line.unit_cost_inr} onChange={e => setLine(idx, 'unit_cost_inr', +e.target.value)} />
                </div>
                <button onClick={() => removeLine(idx)} disabled={form.items.length === 1} style={{
                  background: 'transparent', border: '1px solid #7f1d1d', borderRadius: 6,
                  padding: '6px 8px', cursor: 'pointer', color: form.items.length === 1 ? '#374151' : '#f87171',
                }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={() => createMut.mutate(form)} disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create Draft PO'}
            </button>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      <ReceiveModal receive={receive} setReceive={setReceive} receiveMut={receiveMut} />

      {/* PO Table */}
      <div className="card">
        {isLoading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PO</th><th>Supplier</th><th>Status</th><th>Expected</th><th>Lines</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><div className="empty-title">No purchase orders — use the AI box above to create one!</div></div></td></tr>
                ) : orders.map(po => (
                  <tr key={po.po_id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{po.po_id}</td>
                    <td>{po.supplier_id || '—'}</td>
                    <td><span className={`badge badge-${po.status === 'confirmed' ? 'blue' : po.status === 'received' ? 'green' : 'gray'}`}>{po.status}</span></td>
                    <td>{po.expected_arrival_date ? new Date(po.expected_arrival_date).toLocaleDateString() : '—'}</td>
                    <td>
                      {(po.items || []).map(i => (
                        <div key={i.sku_id} style={{ fontSize: 12 }}>
                          <span style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{i.sku_id}</span>
                          {': '}
                          <span style={{ color: i.quantity_received >= i.quantity_ordered ? '#10b981' : '#f59e0b' }}>
                            {i.quantity_received}/{i.quantity_ordered}
                          </span>
                          {i.unit_cost_inr > 0 && <span style={{ color: '#64748b' }}> · Cost ₹{fmt(i.unit_cost_inr)}</span>}
                        </div>
                      ))}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {po.status === 'draft' && (
                          <button className="btn btn-success btn-sm" onClick={() => confirmMut.mutate(po.po_id)}>
                            <CheckCircle size={12} /> Confirm
                          </button>
                        )}
                        {['confirmed', 'partially_received'].includes(po.status) && (
                          <button className="btn btn-primary btn-sm" onClick={() => setReceive({
                            ...po,
                            items: (po.items || []).map(i => ({
                              ...i,
                              quantity_to_receive: Math.max(0, (i.quantity_ordered || 0) - (i.quantity_received || 0)),
                              new_unit_price_inr: i.unit_cost_inr || '',
                              new_selling_price_inr: i.suggested_selling_price_inr ? i.suggested_selling_price_inr : (i.unit_cost_inr ? Math.round(i.unit_cost_inr * 1.10 * 100) / 100 : ''),
                            })),
                          })}>
                            Receive & Set Price
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
