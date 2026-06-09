// frontend/src/components/Navbar.jsx
// Shared top navbar — glassmorphism, dark/light toggle, profile panel
import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../api'
import { useTheme } from '../context/ThemeContext'

// ── OTP input sub-component ───────────────────────────────────
function OtpBoxes({ otp, onChange, onKeyDown, refs }) {
  return (
    <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center', margin: '0.75rem 0' }}>
      {otp.map((d, i) => (
        <input key={i} ref={el => refs.current[i] = el}
          type="text" inputMode="numeric" maxLength={1}
          value={d} autoFocus={i === 0}
          onChange={e => onChange(i, e.target.value)}
          onKeyDown={e => onKeyDown(i, e)}
          className="form-input"
          style={{
            width: '2.75rem', height: '2.9rem', textAlign: 'center',
            fontSize: '1.375rem', fontWeight: 700, padding: 0,
            fontFamily: 'JetBrains Mono, monospace',
          }}
          onFocus={e  => e.target.style.borderColor = 'var(--brand)'}
          onBlur={e   => e.target.style.borderColor = 'var(--border)'}
        />
      ))}
    </div>
  )
}

// ── Profile Modal (slide-in drawer) ──────────────────────────
function ProfileModal({ user, onClose, onLogout }) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  const [pwFlow,    setPwFlow]    = useState('idle')
  const [otp,       setOtp]       = useState(['','','','','',''])
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [err,       setErr]       = useState('')
  const [msg,       setMsg]       = useState('')
  const [busy,      setBusy]      = useState(false)
  const otpRefs = useRef([])

  const resetPwState = () => {
    setPwFlow('idle'); setOtp(['','','','','',''])
    setNewPw(''); setConfirmPw(''); setErr(''); setMsg('')
  }

  const handleSendOtp = async () => {
    setBusy(true); setErr('')
    try {
      const res = await api.post('/auth/send-password-change-otp')
      setMsg(res.data.message)
      setPwFlow('otp')
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to send code.')
    } finally { setBusy(false) }
  }

  const handleOtpChange = (idx, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]; next[idx] = val; setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0)
      otpRefs.current[idx - 1]?.focus()
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setErr('Enter the 6-digit code.'); return }
    if (newPw.length < 8) { setErr('New password must be ≥ 8 characters.'); return }
    if (newPw !== confirmPw) { setErr('Passwords do not match.'); return }
    setBusy(true); setErr('')
    try {
      const res = await api.post('/auth/verify-password-change', { otp: code, new_password: newPw })
      setMsg(res.data.message)
      setPwFlow('done')
      setTimeout(resetPwState, 2000)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Verification failed.')
    } finally { setBusy(false) }
  }

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 999, backdropFilter: 'blur(4px)',
      }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 360,
        background: 'var(--bg-surface)',
        border: '1px solid var(--glass-border)',
        borderRight: 'none',
        zIndex: 1000,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        animation: 'slideInRight 0.22s ease-out',
      }}>
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--gradient-primary)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', fontFamily: 'Geist, sans-serif' }}>My Profile</span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            color: '#fff', fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Avatar + info */}
        <div style={{ padding: '1.75rem 1.5rem 1.25rem', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'var(--gradient-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.375rem', fontWeight: 800, color: '#fff', flexShrink: 0,
              boxShadow: 'var(--glow-primary)', fontFamily: 'Geist, sans-serif',
            }}>{initials}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-primary)', fontFamily: 'Geist, sans-serif' }}>{user?.name}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>{user?.email}</div>
              <span style={{
                display: 'inline-block', marginTop: '0.375rem', fontSize: '0.71875rem',
                fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                background: 'var(--brand-bg)', color: 'var(--brand)',
                border: '1px solid var(--brand-border)',
              }}>Email Account</span>
            </div>
          </div>

          {/* Info rows */}
          <div style={{ marginTop: '1.25rem' }}>
            {[
              { label: 'Full Name', value: user?.name || '—' },
              { label: 'Email',     value: user?.email || '—' },
              { label: 'Member',   value: user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN') : '—' },
              { label: 'Verified', value: user?.is_verified ? '✓ Yes' : 'No' },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Theme toggle */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Appearance</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{theme === 'dark' ? 'Dark mode active' : 'Light mode active'}</div>
          </div>
          <button onClick={toggleTheme} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.4rem 0.875rem', borderRadius: 8,
            background: 'var(--brand-bg)', border: '1px solid var(--brand-border)',
            color: 'var(--brand)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
          }}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Change Password */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Change Password</div>
              <div style={{ fontSize: '0.78125rem', color: 'var(--text-muted)', marginTop: 2 }}>Verify via email OTP</div>
            </div>
            {pwFlow === 'idle' && (
              <button onClick={handleSendOtp} disabled={busy}
                className="btn btn-primary btn-sm">
                {busy ? '…' : 'Start'}
              </button>
            )}
            {pwFlow !== 'idle' && (
              <button onClick={resetPwState}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8125rem' }}>
                Cancel
              </button>
            )}
          </div>

          {err && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}
          {msg && pwFlow !== 'otp' && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

          {pwFlow === 'otp' && (
            <form onSubmit={handleVerify} noValidate>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Enter the code sent to <strong>{user?.email}</strong>
              </p>
              <OtpBoxes otp={otp} onChange={handleOtpChange} onKeyDown={handleOtpKey} refs={otpRefs} />

              <div style={{ marginTop: '0.75rem' }}>
                <label className="form-label">New Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPw ? 'text' : 'password'} value={newPw}
                    onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters"
                    className="form-input" style={{ paddingRight: '2.5rem' }} />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div style={{ marginTop: '0.625rem' }}>
                <label className="form-label">Confirm New Password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Re-enter new password" className="form-input" />
              </div>

              <button type="submit" disabled={busy} className="btn btn-primary btn-full" style={{ marginTop: '0.875rem' }}>
                {busy ? 'Verifying…' : 'Verify & Update Password'}
              </button>
            </form>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Sign Out */}
        <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={onLogout} className="btn btn-danger btn-full"
            style={{ fontSize: '0.9375rem' }}>
            Sign Out
          </button>
        </div>
      </div>
    </>
  )
}

// ── Navbar ────────────────────────────────────────────────────
export default function Navbar() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [user,        setUser]        = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) setUser(JSON.parse(stored))
    api.get('/auth/me')
      .then(r => { setUser(r.data); localStorage.setItem('user', JSON.stringify(r.data)) })
      .catch(() => {})
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/upload',    label: 'Upload'    },
    { to: '/groups',    label: 'Groups'    },
  ]

  const active = (to) => location.pathname === to || location.pathname.startsWith(to + '/')

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <>
      <nav className="navbar">
        {/* Brand */}
        <Link to="/dashboard" className="navbar-brand">
          <div className="logo-icon" style={{ fontSize: '0.8rem', fontWeight: 900, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>AN</div>
          <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, letterSpacing: '-0.02em' }}>
            AudioNotes <span style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>AI</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="navbar-nav">
          {navLinks.map(({ to, label }) => (
            <Link key={to} to={to} style={{
              padding: '0.4rem 0.875rem', borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem', fontWeight: 600,
              textDecoration: 'none', transition: 'all var(--ease)',
              color: active(to) ? 'var(--brand)' : 'var(--text-muted)',
              background: active(to) ? 'var(--brand-bg)' : 'transparent',
              border: active(to) ? '1px solid var(--brand-border)' : '1px solid transparent',
              boxShadow: active(to) ? 'var(--glow-sm)' : 'none',
            }}>
              {label}
            </Link>
          ))}
        </div>

        {/* Right side actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Theme toggle */}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>

          {/* Profile button */}
          <button onClick={() => setProfileOpen(true)}
            title="My Profile"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--bg-glass)', border: '1px solid var(--glass-border)',
              borderRadius: 24, padding: '0.2rem 0.75rem 0.2rem 0.2rem',
              cursor: 'pointer', transition: 'all var(--ease)',
              backdropFilter: 'var(--glass-blur-sm)',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--border-brand)'; e.currentTarget.style.boxShadow = 'var(--glow-sm)'; }}
            onMouseOut={e  => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--gradient-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 700, color: '#fff',
              flexShrink: 0, fontFamily: 'Geist, sans-serif',
            }}>{initials}</div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Profile</span>
          </button>
        </div>
      </nav>

      {profileOpen && (
        <ProfileModal
          user={user}
          onClose={() => setProfileOpen(false)}
          onLogout={handleLogout}
        />
      )}
    </>
  )
}
