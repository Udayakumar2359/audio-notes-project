// frontend/src/components/SessionManager.jsx
// Monitors session expiry and shows a warning banner + auto-logout
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api, { isSessionValid, isExpiringSoon, msUntilExpiry, clearSession } from '../api'

// Pages that don't need session checks
const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password']

// Warn when < 30 minutes remain
const WARN_THRESHOLD_MS = 30 * 60 * 1000

export default function SessionManager() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [warn,    setWarn]    = useState(false)
  const [timeStr, setTimeStr] = useState('')

  const isPublic = PUBLIC_PATHS.includes(location.pathname)

  const formatTime = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const handleLogout = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const handleStay = useCallback(async () => {
    try {
      await api.get('/auth/me')
      // Extend expiry by 1 hour from now
      const extended = Date.now() + 60 * 60 * 1000
      localStorage.setItem('expires_at', String(extended))
      setWarn(false)
    } catch {
      handleLogout()
    }
  }, [handleLogout])

  useEffect(() => {
    if (isPublic) return

    const tick = () => {
      if (!isSessionValid()) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
      const ms = msUntilExpiry()
      if (isExpiringSoon(WARN_THRESHOLD_MS)) {
        setWarn(true)
        setTimeStr(formatTime(ms))
      } else {
        setWarn(false)
      }
    }

    tick()  // run immediately
    const id = setInterval(tick, 15_000)   // check every 15s
    return () => clearInterval(id)
  }, [location.pathname, isPublic, navigate])

  if (isPublic || !warn) return null

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, background: '#1F2937', color: '#fff',
      borderRadius: 14, padding: '0.875rem 1.25rem',
      display: 'flex', alignItems: 'center', gap: '1rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      maxWidth: 440, width: 'calc(100vw - 3rem)',
      animation: 'slideUpFade 0.3s ease-out',
    }}>
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      <span style={{ fontSize: '1.25rem' }}>⏰</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Session expiring soon</div>
        <div style={{ color: '#9CA3AF', fontSize: '0.8125rem' }}>
          You'll be signed out in <strong style={{ color: '#FCD34D' }}>{timeStr}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <button onClick={handleStay}
          style={{
            padding: '0.4rem 0.875rem', background: '#D97706', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
            fontSize: '0.8125rem',
          }}>
          Stay Signed In
        </button>
        <button onClick={handleLogout}
          style={{
            padding: '0.4rem 0.75rem', background: 'transparent',
            color: '#9CA3AF', border: '1px solid #374151', borderRadius: 8,
            cursor: 'pointer', fontSize: '0.8125rem',
          }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
