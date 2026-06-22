import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi, cashAppApi } from '../lib/api'
import { AlertCircle, CheckCircle, Download } from 'lucide-react'

function getDaysColor(days) {
  if (days > 30) return { color: '#dc2626', bg: '#fef2f2' }
  if (days > 15) return { color: '#f59e0b', bg: '#fffbeb' }
  return { color: '#2563eb', bg: '#eff6ff' }
}

export default function PortalOutstandingPage() {
  const queryClient = useQueryClient()
  const [downloadingId, setDownloadingId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['portal-outstanding'],
    queryFn: () => portalApi.outstanding().then(r => r.data),
  })

  const payMutation = useMutation({
    mutationFn: (inv) => cashAppApi.processPayment({
      remittance_text: `Portal payment for ${inv.invoice_id} amount Rs ${inv.balance_due_inr}`,
      expected_invoice_id: inv.invoice_id,
      payment_token: inv.payment_token,   // 12-digit token stored with invoice — required for authorization
    }),
    onSuccess: (res) => {
      if (res.data.success) {
        alert(`✅ ${res.data.agent_reason}`)
        queryClient.invalidateQueries(['portal-outstanding'])
        queryClient.invalidateQueries(['portal-payments'])
      } else {
        alert(`❌ Payment not processed: ${res.data.agent_reason}`)
      }
    },
    onError: (err) => {
      alert(`Payment failed: ${err.response?.data?.detail || err.message}`)
    }
  })

  const invoices = data?.invoices || []
  const total = data?.total_outstanding_inr || 0

  const handleDownloadPdf = async (inv) => {
    setDownloadingId(inv.invoice_id)
    try {
      const res = await portalApi.downloadInvoicePdf(inv.invoice_id)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${inv.invoice_id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Download failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Outstanding Invoices</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>{invoices.length} unpaid invoice(s)</p>
        </div>
        {total > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 20px', textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#7f1d1d', fontWeight: 600 }}>TOTAL OUTSTANDING</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <CheckCircle size={40} style={{ color: '#10b981', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: '#14532d' }}>All caught up! No outstanding invoices.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {invoices.map(inv => {
            const { color, bg } = getDaysColor(inv.days_overdue || 0)
            return (
              <div key={inv.invoice_id} style={{
                background: 'var(--bg-800)', borderRadius: 12, padding: '16px 20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${inv.days_overdue > 0 ? '#fecaca' : '#f1f5f9'}`,
                borderLeft: `4px solid ${color}`,
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{inv.invoice_id}</span>
                    <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>
                      {inv.payment_status?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Due: {new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>

                <div style={{ textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {inv.days_overdue > 0 && <AlertCircle size={13} />}
                    {inv.days_overdue > 0 ? `${inv.days_overdue} days overdue` : 'Due soon'}
                  </div>
                </div>

                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                    ₹{Number(inv.balance_due_inr).toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Balance due</div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleDownloadPdf(inv)}
                    disabled={downloadingId === inv.invoice_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '8px 14px', borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-700)', color: 'var(--text-secondary)',
                      fontWeight: 600, fontSize: 12, cursor: downloadingId === inv.invoice_id ? 'not-allowed' : 'pointer',
                      opacity: downloadingId === inv.invoice_id ? 0.6 : 1,
                      transition: 'opacity .15s',
                    }}
                  >
                    <Download size={13} />
                    {downloadingId === inv.invoice_id ? 'Downloading…' : 'Invoice PDF'}
                  </button>

                  <button
                    onClick={() => payMutation.mutate(inv)}
                    disabled={payMutation.isPending && payMutation.variables?.invoice_id === inv.invoice_id}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                      color: 'white', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      opacity: (payMutation.isPending && payMutation.variables?.invoice_id === inv.invoice_id) ? 0.7 : 1
                    }}
                  >
                    {payMutation.isPending && payMutation.variables?.invoice_id === inv.invoice_id ? 'Processing via Agent...' : 'Pay Now →'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
