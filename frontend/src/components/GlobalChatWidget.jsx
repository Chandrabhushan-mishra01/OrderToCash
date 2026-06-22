import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, X, Send } from 'lucide-react'
import { chatApi } from '../lib/api'
import { useAuthStore } from '../store'

const ROLE_BADGE_COLOR = {
  admin:               { bg: 'rgba(59,130,246,0.15)',  color: 'var(--accent-blue)' },
  dispute_manager:     { bg: 'rgba(245,158,11,0.15)',  color: 'var(--accent-amber)' },
  collections_analyst: { bg: 'rgba(34,197,94,0.15)',   color: 'var(--accent-green)' },
  controller:          { bg: 'rgba(139,92,246,0.15)',  color: 'var(--accent-violet)' },
  inventory_manager:   { bg: 'rgba(236,72,153,0.15)',  color: 'var(--accent-pink)' },
}

export default function GlobalChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const scrollRef = useRef(null)
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const { data: chatData, isLoading } = useQuery({
    queryKey: ['internal-chat'],
    queryFn: () => chatApi.list({ limit: 50 }).then(r => r.data),
    refetchInterval: 5000,
    enabled: isOpen, // Only poll when chat is open
  })

  const messages = chatData?.messages || []

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isOpen])

  const sendMutation = useMutation({
    mutationFn: (msg) => chatApi.create({ message: msg }),
    onSuccess: () => {
      setMessage('')
      queryClient.invalidateQueries({ queryKey: ['internal-chat'] })
    }
  })

  const handleSend = (e) => {
    e.preventDefault()
    if (!message.trim()) return
    sendMutation.mutate(message.trim())
  }

  return (
    <>
      {/* Floating Button */}
      <button 
        className="btn btn-primary"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(139,92,246,0.4)',
          zIndex: 9999
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: 96,
          right: 24,
          width: 380,
          height: 500,
          background: 'var(--bg-800)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9998,
          overflow: 'hidden'
        }} className="animate-fade">
          
          <div style={{
            padding: '16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-900)',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <MessageCircle size={20} style={{ color: 'var(--accent-violet)' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Team Chat</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Global cross-agent communication</div>
            </div>
          </div>

          <div 
            ref={scrollRef}
            style={{
              flex: 1,
              padding: 16,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            {isLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 20, fontSize: 13 }}>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 20, fontSize: 13 }}>No messages yet. Start the conversation!</div>
            ) : (
              messages.map(m => {
                const isMe = m.username === user?.username
                const badgeStyle = ROLE_BADGE_COLOR[m.role] || { bg: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }
                
                return (
                  <div key={m.id} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                    gap: 4
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{m.username}</span>
                      <span style={{
                        fontSize: 9, 
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: badgeStyle.bg,
                        color: badgeStyle.color,
                        textTransform: 'uppercase'
                      }}>
                        {m.role?.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{
                      background: isMe ? 'var(--accent-violet)' : 'var(--bg-700)',
                      color: isMe ? '#fff' : 'var(--text-primary)',
                      padding: '10px 14px',
                      borderRadius: isMe ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                      fontSize: 13,
                      lineHeight: 1.5,
                      maxWidth: '85%',
                      wordBreak: 'break-word'
                    }}>
                      {m.message}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <form 
            onSubmit={handleSend}
            style={{
              padding: 12,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 8,
              background: 'var(--bg-900)'
            }}
          >
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="form-input"
              style={{ flex: 1, fontSize: 13 }}
            />
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={!message.trim() || sendMutation.isPending}
              style={{ padding: '0 16px' }}
            >
              <Send size={16} />
            </button>
          </form>

        </div>
      )}
    </>
  )
}
