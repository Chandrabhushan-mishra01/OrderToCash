import React from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { ShoppingCart, CreditCard, AlertCircle, LogOut, LayoutDashboard, MessageSquare, Sun, Moon } from 'lucide-react'
import { usePortalStore } from '../store'
import { useTheme } from '../context/ThemeContext'

export default function PortalLayout() {
  const { customer, logout } = usePortalStore()
  const navigate = useNavigate()
  const { isDark, toggle } = useTheme()

  const handleLogout = () => {
    logout()
    navigate('/portal/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-900)', fontFamily: 'Inter, system-ui, sans-serif', transition: 'background-color 0.25s' }}>
      {/* Top Nav */}
      <nav style={{
        background: 'var(--bg-800)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 32px',
        height: 60, gap: 32, position: 'sticky', top: 0, zIndex: 100,
        boxShadow: 'var(--shadow-card)', transition: 'background-color 0.25s',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '-0.5px'
          }}>O2C</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>Customer Portal</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2 }}>MAQ Manufacturing</div>
          </div>
        </div>

        {/* Nav Links */}
        {[
          { to: '/portal/dashboard', label: 'Place Order',   icon: LayoutDashboard },
          { to: '/portal/orders',    label: 'My Orders',     icon: ShoppingCart },
          { to: '/portal/payments',  label: 'Payments',      icon: CreditCard },
          { to: '/portal/outstanding', label: 'Outstanding', icon: AlertCircle },
          { to: '/portal/disputes', label: 'Disputes', icon: MessageSquare },
        ].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 500, padding: '4px 0',
              color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
              textDecoration: 'none', transition: 'all 0.15s',
            })}
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}

        {/* Right side user info */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {customer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: 'white'
              }}>
                {customer.company_name?.charAt(0) || 'C'}
              </div>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{customer.company_name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Tier {customer.credit_tier || 'B'}</div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer'
            }}
          >
            <LogOut size={12} /> Logout
          </button>
          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {isDark ? <Sun size={12} style={{ color: 'var(--accent-amber)' }} /> : <Moon size={12} style={{ color: 'var(--accent-blue)' }} />}
            {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </nav>

      {/* Page content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <Outlet />
      </main>
    </div>
  )
}
