import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../store'
import { usePipelineWS } from '../hooks/usePipelineWS'
import { SidebarProvider, useSidebar } from '../context/SidebarContext'
import { useTheme } from '../context/ThemeContext'
import { Sun, Moon } from 'lucide-react'
import GlobalChatWidget from './GlobalChatWidget'

function TopBar() {
  const { isDark, toggle } = useTheme()
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
      padding: '8px 24px',
      background: 'var(--bg-900)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 90,
    }}>
      <button
        onClick={toggle}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 7,
          border: '1px solid var(--border)',
          background: 'var(--bg-800)',
          color: 'var(--text-secondary)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          transition: 'all .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--accent-blue)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        {isDark
          ? <Sun size={12} style={{ color: 'var(--accent-amber)' }} />
          : <Moon size={12} style={{ color: 'var(--accent-blue)' }} />
        }
        {isDark ? 'Light Mode' : 'Dark Mode'}
      </button>
    </div>
  )
}

function Inner() {
  const { user } = useAuthStore()
  const { collapsed } = useSidebar()
  usePipelineWS()

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="app-layout">
      <Sidebar />
      <div className={`main-content${collapsed ? ' sidebar-collapsed' : ''}`}>
        <TopBar />
        <Outlet />
      </div>
      <GlobalChatWidget />
    </div>
  )
}

export default function Layout() {
  return (
    <SidebarProvider>
      <Inner />
    </SidebarProvider>
  )
}
