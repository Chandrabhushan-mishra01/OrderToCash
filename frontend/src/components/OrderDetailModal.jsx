import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { ordersApi, invoicesApi } from '../lib/api'
import { ActionGuard } from './RoleGuard'
import {
  X, CheckCircle, AlertTriangle, Clock, XCircle, ShieldAlert,
  CreditCard, FileText, Package, Zap, DollarSign, Download, Send
} from 'lucide-react'

// ── Agent metadata (mirrors OrderLifecyclePage) ─────────────────────────────
const AGENT_META = {
  'agent_01_order_ingestion':    { label: 'Agent 1 — Order Ingestion',    color: '#3b82f6', model: 'GLiNER NER + Groq',              icon: Package },
  'agent_02_credit_assessment':  { label: 'Agent 2 — Credit Check',       color: '#06b6d4', model: 'XGBoost Credit + PD Logistic',   icon: CreditCard },
  'agent_03_fraud_detection':    { label: 'Agent 3 — Fraud Detection',    color: '#ef4444', model: 'Isolation Forest + XGBoost',     icon: ShieldAlert },
  'agent_04_demand_forecasting': { label: 'Agent 4 — Demand Forecast',    color: '#8b5cf6', model: 'Prophet',                        icon: Zap },
  'agent_05_fulfillment':        { label: 'Agent 5 — Fulfillment',        color: '#22c55e', model: 'Rule-based',                     icon: CheckCircle },
  'agent_06_invoice_generation': { label: 'Agent 6 — Invoice',            color: '#f59e0b', model: 'Template engine',               icon: FileText },
  'agent_07_payment_monitoring': { label: 'Agent 7 — Payment Monitor',    color: '#f59e0b', model: 'XGBoost Delay',                  icon: Clock },
  'agent_08_collections':        { label: 'Agent 8 — Collections',        color: '#f59e0b', model: 'K-Means + Groq Dunning',         icon: AlertTriangle },
  'COMPLIANCE':                  { label: 'Policy Engine / Compliance',   color: '#8b5cf6', model: 'Rule Engine RULE-001 to RULE-008', icon: AlertTriangle },
}

function getAgentMeta(entry) {
  const agent = entry.agent_name || entry.source_agent || ''
  if (AGENT_META[agent]) return AGENT_META[agent]
  for (const key of Object.keys(AGENT_META)) {
    if (agent.startsWith(key.slice(0, 8))) return AGENT_META[key]
  }
  return { label: agent || entry.event_type || 'System', icon: CheckCircle, color: 'var(--accent-blue)', model: '' }
}

// ── Timeline step ─────────────────────────────────────────────────────────────
function TimelineStep({ entry, isLast }) {
  const [expanded, setExpanded] = useState(false)
  const meta = getAgentMeta(entry)
  const Icon = meta.icon
  const hasDetails = entry.details && entry.details !== '{}'

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: `${meta.color}22`, border: `2px solid ${meta.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={12} style={{ color: meta.color }} />
        </div>
        {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--border)', margin: '3px 0' }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14, paddingLeft: 10 }}>
        <div
          onClick={() => hasDetails && setExpanded(p => !p)}
          style={{ cursor: hasDetails ? 'pointer' : 'default' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</span>
            {meta.model && <span className="badge badge-gray" style={{ fontSize: 9 }}>{meta.model}</span>}
            {hasDetails && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{entry.action || entry.event_type}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {entry.created_at ? new Date(entry.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
          </div>
        </div>
        {expanded && hasDetails && (
          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 5, padding: '8px 12px', marginTop: 5 }}>
            {(() => {
              try {
                const parsed = typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details
                return Object.entries(parsed).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11 }}>
                    <span style={{ color: 'var(--accent-cyan)', minWidth: 130 }}>{k}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                  </div>
                ))
              } catch {
                return <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{entry.details}</div>
              }
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Overlay backdrop ──────────────────────────────────────────────────────────
const BACKDROP = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(4px)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '20px',
}
const MODAL = {
  background: 'var(--bg-800)', border: '1px solid var(--border)',
  borderRadius: 12, width: '100%', maxWidth: 860,
  maxHeight: '88vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
}
const TABS = ['Lifecycle', 'Fraud Detail', 'Invoice']

// ── OrderDetailModal (exported) ───────────────────────────────────────────────
export default function OrderDetailModal({ orderId, onClose }) {
  const [tab, setTab] = useState('Lifecycle')
  const qc = useQueryClient()
  const [pdfLoading, setPdfLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  const { data: traceData, isLoading: traceLoading } = useQuery({
    queryKey: ['order-trace', orderId],
    queryFn: () => api.get('/compliance/audit-log', { params: { order_id: orderId, limit: 50 } }).then(r => r.data),
    enabled: !!orderId,
  })
  const { data: orderData } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: () => api.get(`/orders/${orderId}`).then(r => r.data),
    enabled: !!orderId,
  })
  const { data: fraudData } = useQuery({
    queryKey: ['order-fraud-modal', orderId],
    queryFn: () => api.get('/fraud', { params: { order_id: orderId } }).then(r => r.data),
    enabled: !!orderId,
  })
  const { data: invoiceData, isLoading: invoiceLoading } = useQuery({
    queryKey: ['order-invoice', orderId],
    queryFn: () => api.get('/invoices', { params: { order_id: orderId, limit: 1 } }).then(r => r.data),
    enabled: !!orderId && tab === 'Invoice',
  })

  const auditLog     = traceData?.audit_log || []
  const order        = orderData?.order || orderData || {}
  const reservations = order?.reservations || (order?.reservation ? [order.reservation] : [])
  const fraudRecord  = (fraudData?.fraud_records || [])[0]
  const invoice      = (invoiceData?.invoices || [])[0] || null
  const fulfillMut = useMutation({ mutationFn: () => ordersApi.fulfill(orderId, { idempotency_key: `fulfill-${Date.now()}` }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['order-detail', orderId] }); qc.invalidateQueries({ queryKey: ['orders'] }) } })
  const cancelMut = useMutation({ mutationFn: () => ordersApi.cancel(orderId), onSuccess: () => { qc.invalidateQueries({ queryKey: ['order-detail', orderId] }); qc.invalidateQueries({ queryKey: ['orders'] }) } })

  const handleDownloadPdf = async (inv) => {
    setPdfLoading(true)
    try {
      const res = await invoicesApi.downloadPdf(inv.invoice_id)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${inv.invoice_id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`PDF download failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setPdfLoading(false)
    }
  }

  const handleResend = async (inv) => {
    setResendLoading(true)
    setResendMsg('')
    try {
      const res = await invoicesApi.resend(inv.invoice_id)
      setResendMsg(res.data?.message || 'Invoice resent successfully.')
    } catch (err) {
      setResendMsg(`Resend failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setResendLoading(false)
    }
  }

  const statusColor = (s) => {
    if (['fulfilled', 'approved', 'closed', 'credit_approved', 'invoiced'].includes(s)) return 'var(--accent-green)'
    if (['fraud_review', 'cancelled'].includes(s)) return 'var(--accent-red)'
    if (s?.includes('hitl') || s === 'pending_credit') return 'var(--accent-amber)'
    return 'var(--text-muted)'
  }

  return (
    <div style={BACKDROP} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={MODAL}>
        {/* Modal Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Order Lifecycle</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{orderId}</div>
          </div>
          {/* Quick stats */}
          {order?.order_id && (
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Customer</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{order.customer_id}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Amount</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)' }}>₹{(+(order.total_amount_inr || 0)).toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: statusColor(order.status) }}>{order.status}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fraud Score</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: (+order.fraud_score) > 0.7 ? 'var(--accent-red)' : (+order.fraud_score) > 0.4 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
                  {order.fraud_score != null ? `${((+order.fraud_score)*100).toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>
          )}
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, cursor: 'pointer', color: 'var(--text-muted)', transition: 'all .15s', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

<ActionGuard allowed={['admin', 'controller', 'inventory_manager']}>
          <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid var(--border)' }}>
            {order.status !== 'fulfilled' && <button className="btn btn-success btn-sm" onClick={() => fulfillMut.mutate()} disabled={fulfillMut.isPending || order.status === 'cancelled'}>Mark Fulfilled</button>}
            {order.status !== 'cancelled' && <button className="btn btn-danger btn-sm" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending || order.status === 'fulfilled'}>Cancel Order</button>}
            {fulfillMut.isError && <span className="badge badge-red">Fulfill failed</span>}
            {cancelMut.isError && <span className="badge badge-red">Cancel failed</span>}
          </div>
        </ActionGuard>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingLeft: 20 }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 16px', fontSize: 13, fontWeight: tab === t ? 700 : 500,
                color: tab === t ? 'var(--accent-blue)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
                marginBottom: -1, transition: 'all .15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab Content — scrollable body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

          {/* ── LIFECYCLE TAB ─────────────────────────────── */}
          {tab === 'Lifecycle' && (
            traceLoading ? (
              <div className="loading-wrap"><div className="spinner" /></div>
            ) : (
              <div>
{reservations.map((res, idx) => (
                  <div key={res.reservation_id || idx} className="card" style={{ marginBottom: 14, padding: 14 }}>
                    <div className="card-title" style={{ marginBottom: 10 }}>Inventory Reservation{reservations.length > 1 ? ` #${idx + 1}` : ''}</div>
                    <div className="grid-4">
                      <div><div className="kpi-label">Reserved</div><div className="stat-val">{res.quantity_reserved}</div></div>
                      <div><div className="kpi-label">Backordered</div><div className="stat-val">{res.quantity_backordered}</div></div>
                      <div><div className="kpi-label">ETA</div><div className="stat-val">{res.expected_availability_date ? new Date(res.expected_availability_date).toLocaleDateString() : '—'}</div></div>
                      <div><div className="kpi-label">Status</div><span className="badge badge-blue">{res.status}</span></div>
                    </div>
                  </div>
                ))}
                {auditLog.length === 0 ? (
                  <div className="empty-state"><Clock size={28} style={{ opacity: 0.3 }} /><div className="empty-title">No audit trail yet</div><div className="empty-text">Audit log is populated as the order flows through the pipeline.</div></div>
                ) : (
                  <div style={{ padding: '4px 0' }}>{auditLog.map((entry, i) => <TimelineStep key={i} entry={entry} isLast={i === auditLog.length - 1} />)}</div>
                )}
              </div>
            )
          )}

          {/* ── FRAUD DETAIL TAB ──────────────────────────── */}
          {tab === 'Fraud Detail' && (
            fraudRecord ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    ['Verdict',        fraudRecord.fraud_verdict,  fraudRecord.fraud_verdict === 'FRAUD' ? 'var(--accent-red)' : 'var(--accent-green)'],
                    ['IF Score',       (+fraudRecord.isolation_forest_score||0).toFixed(4), (+fraudRecord.isolation_forest_score||0) > 0.55 ? 'var(--accent-amber)' : 'var(--accent-green)'],
                    ['XGB Probability',`${((+(fraudRecord.xgboost_fraud_probability||0))*100).toFixed(1)}%`, (+fraudRecord.xgboost_fraud_probability||0) > 0.7 ? 'var(--accent-red)' : 'var(--accent-green)'],
                    ['Top SHAP',       fraudRecord.shap_top_feature || '—', 'var(--accent-cyan)'],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', flex: '1 1 120px' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {fraudRecord.shap_values && (
                  <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>SHAP Feature Importance</div>
                    {(() => {
                      try {
                        const shap = typeof fraudRecord.shap_values === 'string' ? JSON.parse(fraudRecord.shap_values) : fraudRecord.shap_values
                        return Object.entries(shap).sort(([,a],[,b]) => Math.abs(b) - Math.abs(a)).map(([feat, val]) => (
                          <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 160 }}>{feat}</span>
                            <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(Math.abs(+val) * 300, 100)}%`, height: '100%', background: +val > 0 ? 'var(--accent-red)' : 'var(--accent-green)', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 10, fontFamily: 'monospace', color: +val > 0 ? 'var(--accent-red)' : 'var(--accent-green)', minWidth: 50, textAlign: 'right' }}>{(+val).toFixed(4)}</span>
                          </div>
                        ))
                      } catch { return null }
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <ShieldAlert size={28} style={{ opacity: 0.3 }} />
                <div className="empty-title">No fraud record</div>
                <div className="empty-text">This order has not been scored by the fraud detection pipeline yet.</div>
              </div>
            )
          )}

          {/* ── INVOICE TAB ───────────────────────────────── */}
          {tab === 'Invoice' && (
            invoiceLoading ? (
              <div className="loading-wrap"><div className="spinner" /></div>
            ) : !invoice ? (
              <div className="empty-state">
                <FileText size={28} style={{ opacity: 0.3 }} />
                <div className="empty-title">No invoice yet</div>
                <div className="empty-text">An invoice is generated automatically when the order is approved.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── KPI row ── */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    ['Invoice ID',     invoice.invoice_id,     'var(--accent-cyan)'],
                    ['Status',         (invoice.payment_status || '—').toUpperCase(),
                      invoice.payment_status === 'paid' ? 'var(--accent-green)'
                        : invoice.payment_status === 'overdue' ? 'var(--accent-red)'
                        : 'var(--accent-amber)'],
                    ['Total',          `₹${(+(invoice.total_amount_inr||0)).toLocaleString('en-IN')}`, 'var(--text-primary)'],
                    ['Balance Due',    `₹${(+(invoice.balance_due_inr||0)).toLocaleString('en-IN')}`,
                      +(invoice.balance_due_inr||0) > 0 ? 'var(--accent-amber)' : 'var(--accent-green)'],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', flex: '1 1 110px' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: k === 'Invoice ID' ? 'monospace' : 'inherit' }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* ── Detail rows ── */}
                <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                  {[
                    ['Invoice Date',   invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'],
                    ['Due Date',       invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'],
                    ['Subtotal',       `₹${(+(invoice.subtotal_inr||0)).toLocaleString('en-IN')}`],
                    ['GST Amount',     `₹${(+(invoice.gst_amount_inr||0)).toLocaleString('en-IN')}`],
                    ['Payment Terms',  invoice.payment_terms_days ? `${invoice.payment_terms_days} days` : '30 days'],
                    ['Days Overdue',   invoice.days_overdue > 0 ? `${invoice.days_overdue} days` : '—'],
                    ...(invoice.irn ? [['IRN (Mock)', invoice.irn]] : []),
                    ...(invoice.ack_no ? [['Ack No (Mock)', invoice.ack_no]] : []),
                    ...(invoice.eway_bill_no ? [['e-Way Bill (Mock)', invoice.eway_bill_no]] : []),
                    ...(invoice.po_reference ? [['PO Reference', invoice.po_reference]] : []),
                    ...(invoice.sent_at ? [['Email Sent', new Date(invoice.sent_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })]] : []),
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: k.includes('IRN') || k.includes('Ack') || k.includes('Bill') ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* ── Action buttons ── */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleDownloadPdf(invoice)}
                    disabled={pdfLoading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 7, border: 'none', cursor: pdfLoading ? 'not-allowed' : 'pointer',
                      background: pdfLoading ? 'rgba(59,130,246,0.4)' : 'var(--accent-blue)',
                      color: 'white', fontWeight: 600, fontSize: 13, opacity: pdfLoading ? 0.7 : 1,
                      transition: 'opacity .15s',
                    }}
                  >
                    <Download size={14} />
                    {pdfLoading ? 'Downloading…' : 'Download PDF'}
                  </button>

                  <button
                    onClick={() => handleResend(invoice)}
                    disabled={resendLoading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 7, border: '1px solid var(--border)', cursor: resendLoading ? 'not-allowed' : 'pointer',
                      background: 'rgba(255,255,255,.05)', color: 'var(--text-primary)',
                      fontWeight: 600, fontSize: 13, opacity: resendLoading ? 0.7 : 1,
                      transition: 'opacity .15s',
                    }}
                  >
                    <Send size={14} />
                    {resendLoading ? 'Sending…' : 'Resend Email'}
                  </button>

                  {resendMsg && (
                    <span style={{ fontSize: 12, color: resendMsg.startsWith('Resend failed') ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {resendMsg}
                    </span>
                  )}
                </div>

              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
