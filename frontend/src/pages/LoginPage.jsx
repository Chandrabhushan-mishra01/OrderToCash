import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { authApi } from '../lib/api'
import { ROLE_HOME } from '../components/RoleGuard'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const QUICK_LOGINS = [
  { label: 'Admin',        username: 'admin',               password: 'admin123',  color: 'var(--accent-blue)',   role: 'admin' },
  { label: 'Controller',   username: 'controller',           password: 'ctrl123',   color: 'var(--accent-violet)', role: 'controller' },
  { label: 'Inventory Manager', username: 'inventory_manager', password: 'inv123', color: 'var(--accent-cyan)', role: 'inventory_manager' },
  { label: 'Disputes Mgr', username: 'dispute_manager',      password: 'dm123',     color: 'var(--accent-amber)',  role: 'dispute_manager' },
  { label: 'Collections',  username: 'collections_analyst',  password: 'ca123',     color: 'var(--accent-green)',  role: 'collections_analyst' },
]

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const { isDark, toggle } = useTheme()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(form)
      const { user, access_token } = res.data
      setAuth(user, access_token)
      // Route to the role's home page, not always '/'
      navigate(ROLE_HOME[user.role] || '/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (ql) => {
    setForm({ username: ql.username, password: ql.password })
    setError('')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.06) 0%, transparent 50%), var(--bg-900)'
    }}>
      {/* Theme toggle — top right */}
      <button
        onClick={toggle}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        style={{
          position: 'fixed', top: 16, right: 20,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 14px', borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-800)',
          color: 'var(--text-secondary)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          transition: 'all .15s', zIndex: 10,
        }}
      >
        {isDark ? <Sun size={13} style={{ color: 'var(--accent-amber)' }} /> : <Moon size={13} style={{ color: 'var(--accent-blue)' }} />}
        {isDark ? 'Light Mode' : 'Dark Mode'}
      </button>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 60, height: 60, background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
            borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: 'white', margin: '0 auto 16px'
          }}>O2C</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>O2C Agent v2.0</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Order-to-Cash Agentic AI · MAQ Software</p>
        </div>

        {/* Quick-login chips — one per role */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', marginBottom: 10 }}>
            Quick Demo Login
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {QUICK_LOGINS.map(ql => (
              <button
                key={ql.role}
                type="button"
                onClick={() => quickLogin(ql)}
                style={{
                  background: `${ql.color}18`,
                  color: ql.color,
                  border: `1px solid ${ql.color}44`,
                  borderRadius: 8, padding: '5px 12px',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {ql.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: 28 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                placeholder="Enter username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                autoComplete="username"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="Enter password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                autoComplete="current-password"
              />
            </div>
            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Demo credentials:</strong><br />
            admin / admin123 · controller / ctrl123 · inventory_manager / inv123<br />
            dispute_manager / dm123 · collections_analyst / ca123
          </div>
        </div>
      </div>
    </div>
  )
}
