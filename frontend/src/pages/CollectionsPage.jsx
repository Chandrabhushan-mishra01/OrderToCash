import React, { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { collectionsApi } from '../lib/api'
import { Mail, AlertTriangle, Clock, CheckCircle, Send, Bot, ChevronDown, ChevronUp, Zap, Flag } from 'lucide-react'

const LEVEL_CONFIG = {
  1: { label: 'Level 1 — Polite Reminder',  color: 'var(--accent-green)',  bg: 'rgba(16,185,129,0.1)',  days: '1–15 days' },
  2: { label: 'Level 2 — Firm Reminder',    color: 'var(--accent-amber)',  bg: 'rgba(245,158,11,0.1)',  days: '16–30 days' },
  3: { label: 'Level 3 — Urgent Notice',    color: 'var(--accent-red)',    bg: 'rgba(239,68,68,0.1)',   days: '31+ days' },
}

function getDunningLevel(daysOverdue) {
  if (daysOverdue <= 15) return 1
  if (daysOverdue <= 30) return 2
  return 3
}

function InvoiceCard({ inv, onGenerate, generating, result }) {
  const level = getDunningLevel(inv.days_overdue || 0)
  const cfg   = LEVEL_CONFIG[level]
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${cfg.color}`, padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{inv.invoice_id}</span>
            <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>
              {cfg.label}
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>{inv.company_name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span><span style={{color: 'var(--text-muted)'}}>Due:</span> <span style={{fontWeight: 600, color: 'var(--text-primary)'}}>₹{Number(inv.balance_due_inr || inv.total_amount_inr).toLocaleString('en-IN')}</span></span>
            <span style={{ color: cfg.color, fontWeight: 600 }}>{inv.days_overdue} days overdue</span>
            {inv.reminder_count > 0 && <span>{inv.reminder_count} reminder(s)</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, minWidth: 200 }}>
          {inv.customer_segment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600}}>AI Segment</span>
              <span className="badge" style={{
                background: {Premium:'rgba(16,185,129,.15)',Standard:'rgba(59,130,246,.15)',
                             'At-Risk':'rgba(245,158,11,.15)',Problem:'rgba(239,68,68,.15)'}[inv.customer_segment] || 'rgba(255,255,255,.08)',
                color: {Premium:'#10b981',Standard:'#3b82f6','At-Risk':'#f59e0b',Problem:'#ef4444'}[inv.customer_segment] || 'var(--text-muted)',
                fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid currentColor', fontWeight: 600
              }}>
                {inv.customer_segment}
              </span>
            </div>
          )}
          <button
            className="btn btn-primary"
            style={{ background: cfg.color, borderColor: cfg.color, width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 13 }}
            onClick={() => onGenerate(inv.invoice_id)}
            disabled={generating}
          >
            {generating ? (
              <><span className="loading-dot" />  Drafting with Groq...</>
            ) : (
              <><Bot size={16} />  Generate Dunning Email</>
            )}
          </button>
        </div>
      </div>

      {/* Generated email result */}
      {result && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <Bot size={13} style={{ color: 'var(--accent-violet)' }} />
              <span style={{ color: 'var(--accent-violet)', fontWeight: 600 }}>AI-generated via Groq LLaMA 3.3 70B</span>
              {result.customer_segment && (
                <span className="badge" style={{
                  background: {Premium:'rgba(16,185,129,.15)',Standard:'rgba(59,130,246,.15)',
                               'At-Risk':'rgba(245,158,11,.15)',Problem:'rgba(239,68,68,.15)'}[result.customer_segment] || 'rgba(255,255,255,.08)',
                  color: {Premium:'#10b981',Standard:'#3b82f6','At-Risk':'#f59e0b',Problem:'#ef4444'}[result.customer_segment] || 'var(--text-muted)',
                  fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid currentColor'
                }}>{result.customer_segment} tone</span>
              )}
              {result.email_sent && (
                <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                  <CheckCircle size={12} style={{ verticalAlign: 'middle' }} /> Sent
                </span>
              )}
              {result.send_error && (
                <span style={{ color: 'var(--accent-red)', fontSize: 11 }}>⚠ {result.send_error}</span>
              )}
            </div>
            <button className="btn-icon" onClick={() => setExpanded(e => !e)} style={{ padding: 4 }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Subject: {result.subject}
          </div>
          {expanded && (
            <div style={{ marginTop: 6 }}>
              <pre style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12,
                color: 'var(--text-primary)', margin: 0, lineHeight: 1.6,
                background: 'var(--bg)', padding: 10, borderRadius: 6
              }}>
                {result.body}
              </pre>
              {!result.email_sent && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12, width: '100%', background: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}
                  onClick={() => onGenerate(inv.invoice_id, true)}
                  disabled={generating}
                >
                  {generating ? 'Sending...' : <><Send size={14} /> Send this Email Now</>}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CollectionsPage() {
  const [generated, setGenerated] = useState({})   // invoiceId → result
  const [generatingId, setGeneratingId] = useState(null)
  const [logFilter, setLogFilter] = useState('all')  // 'all' | 'manual' | 'auto'

  const { data: overdueData, isLoading } = useQuery({
    queryKey: ['overdue-invoices'],
    queryFn: () => collectionsApi.overdue().then(r => r.data),
  })

  const { data: dunningLogData } = useQuery({
    queryKey: ['dunning-log'],
    queryFn: () => collectionsApi.list({}).then(r => r.data),
    refetchInterval: 30000,
  })

  const dunningMutation = useMutation({
    mutationFn: ({ invoiceId, sendEmail }) => collectionsApi.generateDunning({ invoice_id: invoiceId, send_email: sendEmail }),
    onSuccess: (res, { invoiceId, sendEmail }) => {
      setGenerated(prev => ({ ...prev, [invoiceId]: res.data }))
      setGeneratingId(null)
      if (sendEmail) {
        alert(res.data.email_sent ? 'Email sent successfully!' : `Email generation succeeded but sending failed: ${res.data.send_error || 'Check SMTP settings'}`)
      }
    },
    onError: (err, { invoiceId }) => {
      setGeneratingId(null)
      alert(`Failed to process dunning for ${invoiceId}: ${err.response?.data?.detail || err.message}`)
    }
  })

  const handleGenerate = (invoiceId, sendEmail = false) => {
    setGeneratingId(invoiceId)
    dunningMutation.mutate({ invoiceId, sendEmail })
  }

  const invoices = overdueData?.overdue_invoices || []
  const byLevel  = {
    3: invoices.filter(i => getDunningLevel(i.days_overdue) === 3),
    2: invoices.filter(i => getDunningLevel(i.days_overdue) === 2),
    1: invoices.filter(i => getDunningLevel(i.days_overdue) === 1),
  }

  const allLogs = dunningLogData?.dunning_log || []
  const filteredLogs = allLogs.filter(d => {
    if (logFilter === 'manual') return !d.triggered_by || d.triggered_by === 'manual'
    if (logFilter === 'auto')   return d.triggered_by === 'auto_scheduler'
    return true
  })

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Collections</h1>
          <p className="page-subtitle">AI-generated dunning emails via Groq LLaMA 3.3 70B · k-means segment-driven tone · {invoices.length} overdue invoices</p>
        </div>
      </div>
      {/* Stats */}
      <div className="kpi-grid" style={{ marginBottom: 32 }}>
        {[3, 2, 1].map(level => {
          const cfg = LEVEL_CONFIG[level]
          return (
            <div className="kpi-card" key={level} style={{ borderTop: `3px solid ${cfg.color}` }}>
              <div className="kpi-label" style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
              <div className="kpi-value">{byLevel[level].length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{cfg.days} overdue</div>
            </div>
          )
        })}
        <div className="kpi-card" style={{ borderTop: `3px solid var(--accent-blue)` }}>
          <div className="kpi-label" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Total Outstanding</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            {invoices.reduce((s, i) => s + Number(i.balance_due_inr || i.total_amount_inr || 0), 0)
              .toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Across all overdue</div>
        </div>
      </div>

      {/* Invoices by urgency */}
      {isLoading ? (
        <div className="empty-state"><div className="loading-dot" /> Loading overdue invoices…</div>
      ) : invoices.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={32} style={{ color: 'var(--accent-green)', marginBottom: 8 }} />
          <div>No overdue invoices — all caught up!</div>
        </div>
      ) : (
        <>
          {[3, 2, 1].map(level => byLevel[level].length > 0 && (
            <div key={level} style={{ marginBottom: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                paddingBottom: 8, borderBottom: '1px solid var(--border)'
              }}>
                {level === 3 && <AlertTriangle size={15} style={{ color: LEVEL_CONFIG[3].color }} />}
                {level === 2 && <Clock size={15} style={{ color: LEVEL_CONFIG[2].color }} />}
                {level === 1 && <Mail size={15} style={{ color: LEVEL_CONFIG[1].color }} />}
                <span style={{ fontWeight: 600, fontSize: 13, color: LEVEL_CONFIG[level].color }}>
                  {LEVEL_CONFIG[level].label} ({byLevel[level].length})
                </span>
              </div>
              {byLevel[level].map(inv => (
                <InvoiceCard
                  key={inv.invoice_id}
                  inv={inv}
                  onGenerate={handleGenerate}
                  generating={generatingId === inv.invoice_id}
                  result={generated[inv.invoice_id]}
                />
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── Dunning History (manual + automated) ─────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={15} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
              Dunning History
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({filteredLogs.length} entries)</span>
          </div>
          {/* Filter tabs */}
          <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
            {[['all', 'All'], ['manual', 'Manual'], ['auto', 'Auto']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setLogFilter(val)}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: logFilter === val ? 700 : 400,
                  border: 'none', cursor: 'pointer',
                  background: logFilter === val ? 'var(--accent-blue)' : 'transparent',
                  color: logFilter === val ? 'white' : 'var(--text-muted)',
                  transition: 'all .15s',
                }}
              >{label}</button>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>No dunning history yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredLogs.slice(0, 50).map(d => {
              const isAuto     = d.triggered_by === 'auto_scheduler'
              const isFlagged  = d.channel === 'flagged_for_staff'
              const levelNum   = d.dunning_level === 'LEVEL_3' ? 3 : d.dunning_level === 'LEVEL_2' ? 2 : 1
              const cfg        = LEVEL_CONFIG[levelNum]
              return (
                <div key={d.dunning_id} style={{
                  background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  borderLeft: `3px solid ${isFlagged ? 'var(--accent-amber)' : cfg.color}`,
                }}>
                  {/* Source badge */}
                  {isAuto ? (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 4,
                      background: isFlagged ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                      color: isFlagged ? 'var(--accent-amber)' : 'var(--accent-violet)',
                      border: `1px solid ${isFlagged ? 'var(--accent-amber)' : 'var(--accent-violet)'}`,
                      flexShrink: 0,
                    }}>
                      {isFlagged ? <Flag size={9} /> : <Zap size={9} />}
                      {isFlagged ? 'STAFF FLAG' : 'AUTO'}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                      border: '1px solid var(--border)', flexShrink: 0,
                    }}>MANUAL</span>
                  )}

                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent-cyan)', minWidth: 130 }}>{d.invoice_id}</span>
                  <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: 10 }}>{d.dunning_level?.replace('_', ' ')}</span>
                  {d.account_segment && (
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
                      background: {Premium:'rgba(16,185,129,.1)',Standard:'rgba(59,130,246,.1)','At-Risk':'rgba(245,158,11,.1)',Problem:'rgba(239,68,68,.1)'}[d.account_segment] || 'rgba(255,255,255,.06)',
                      color: {Premium:'#10b981',Standard:'#3b82f6','At-Risk':'#f59e0b',Problem:'#ef4444'}[d.account_segment] || 'var(--text-muted)',
                    }}>{d.account_segment}</span>
                  )}
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.message_subject}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {d.sent_at ? new Date(d.sent_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
