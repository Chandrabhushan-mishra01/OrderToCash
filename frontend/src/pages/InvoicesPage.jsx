import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoicesApi } from '../lib/api'
import { Search, RefreshCw, Download, Send } from 'lucide-react'

function payBadge(s) {
  const m = { paid: 'badge-green', pending: 'badge-amber', overdue: 'badge-red', partial: 'badge-violet' }
  return 'badge ' + (m[s] || 'badge-gray')
}

export default function InvoicesPage() {
  const [search, setSearch] = useState('')
  const [sf, setSf] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [resendMsg, setResendMsg] = useState({})

  const handleDownload = async (invoiceId) => {
    setDownloadingId(invoiceId)
    try {
      const res = await invoicesApi.downloadPdf(invoiceId)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = `invoice-${invoiceId}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Download failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleResend = async (invoiceId) => {
    setResendingId(invoiceId)
    setResendMsg(prev => ({ ...prev, [invoiceId]: '' }))
    try {
      const res = await invoicesApi.resend(invoiceId)
      setResendMsg(prev => ({ ...prev, [invoiceId]: '✓ Sent' }))
      setTimeout(() => setResendMsg(prev => ({ ...prev, [invoiceId]: '' })), 3000)
    } catch (err) {
      setResendMsg(prev => ({ ...prev, [invoiceId]: `✗ ${err.response?.data?.detail || err.message}` }))
    } finally {
      setResendingId(null)
    }
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoices', sf],
    queryFn: () => invoicesApi.list({ status: sf || undefined, limit: 100 }).then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: summary } = useQuery({
    queryKey: ['invoices-summary'],
    queryFn: () => invoicesApi.summary().then(r => r.data),
  })

  const invs = (data?.invoices || []).filter(i =>
    !search ||
    i.invoice_id.toLowerCase().includes(search.toLowerCase()) ||
    (i.customer_id || '').toLowerCase().includes(search.toLowerCase())
  )
  const s = summary || {}

  return (
    <div className="page-content animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Agent 6 — ReportLab PDF · Gmail SMTP · Auto-send on generation</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => refetch()}><RefreshCw size={13} /> Refresh</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total</div><div className="kpi-value">{s.total || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Overdue</div><div className="kpi-value" style={{ color: 'var(--accent-red)' }}>{s.overdue || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Outstanding</div><div className="kpi-value">₹{(((s.total_outstanding_inr || 0)) / 100000).toFixed(1)}L</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <div className="search-wrap" style={{ flex: 1, maxWidth: 300 }}>
              <Search size={13} className="search-icon" />
              <input className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-input" style={{ width: 'auto' }} value={sf} onChange={e => setSf(e.target.value)}>
              <option value="">All</option>
              {['paid', 'pending', 'overdue', 'partial'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {isLoading ? <div className="loading-wrap"><div className="spinner" /></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Invoice ID</th><th>Customer</th><th>Invoice Date</th><th>Due Date</th>
                <th>Total</th><th>Balance</th><th>Status</th><th>Days Overdue</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {invs.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><div className="empty-icon">📄</div><div className="empty-title">No invoices</div></div></td></tr>
                ) : invs.map(inv => (
                  <tr key={inv.invoice_id}>
                    <td><span style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)', fontSize: 12 }}>{inv.invoice_id}</span></td>
                    <td>{inv.customer_id}</td>
                    <td style={{ fontSize: 11 }}>{new Date(inv.invoice_date).toLocaleDateString()}</td>
                    <td style={{ fontSize: 11 }}>{new Date(inv.due_date).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{(+inv.total_amount_inr || 0).toLocaleString('en-IN')}</td>
                    <td style={{ color: +inv.balance_due_inr > 0 ? 'var(--accent-amber)' : 'var(--accent-green)', fontWeight: 600 }}>₹{(+inv.balance_due_inr || 0).toLocaleString('en-IN')}</td>
                    <td><span className={payBadge(inv.payment_status)}>{inv.payment_status}</span></td>
                    <td>{inv.days_overdue > 0 ? <span className="badge badge-red">{inv.days_overdue}d</span> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => handleDownload(inv.invoice_id)}
                          disabled={downloadingId === inv.invoice_id || inv.payment_status === 'voided'}
                          title="Download PDF"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
                            background: 'rgba(59,130,246,0.12)', color: 'var(--accent-blue)',
                            fontSize: 11, fontWeight: 600, cursor: downloadingId === inv.invoice_id ? 'not-allowed' : 'pointer',
                            opacity: (downloadingId === inv.invoice_id || inv.payment_status === 'voided') ? 0.5 : 1,
                          }}
                        >
                          <Download size={11} />
                          {downloadingId === inv.invoice_id ? '…' : 'PDF'}
                        </button>
                        <button
                          onClick={() => handleResend(inv.invoice_id)}
                          disabled={resendingId === inv.invoice_id || inv.payment_status === 'voided'}
                          title="Resend email"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
                            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                            fontSize: 11, fontWeight: 600, cursor: resendingId === inv.invoice_id ? 'not-allowed' : 'pointer',
                            opacity: (resendingId === inv.invoice_id || inv.payment_status === 'voided') ? 0.5 : 1,
                          }}
                        >
                          <Send size={11} />
                          {resendingId === inv.invoice_id ? '…' : 'Resend'}
                        </button>
                        {resendMsg[inv.invoice_id] && (
                          <span style={{ fontSize: 10, color: resendMsg[inv.invoice_id].startsWith('✓') ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {resendMsg[inv.invoice_id]}
                          </span>
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
