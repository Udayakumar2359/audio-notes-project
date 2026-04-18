// frontend/src/components/Navbar.jsx
// Shared top navbar with: logo | nav links | profile avatar (opens modal)
import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../api'

// ── OTP input sub-component ───────────────────────────────────
function OtpBoxes({ otp, onChange, onKeyDown, refs }) {
  const boxStyle = {
    width: '2.75rem', height: '3rem', textAlign: 'center',
    fontSize: '1.375rem', fontWeight: 700, letterSpacing: 0,
    border: '2.5px solid #D1D5DB', borderRadius: '10px',
    background: '#fff', color: '#1F2937',
    outline: 'none', transition: 'border-color 0.15s',
    caretColor: 'transparent', boxSizing: 'border-box',
  }
  return (
    <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center', margin: '0.75rem 0' }}>
      {otp.map((d, i) => (
        <input key={i} ref={el => refs.current[i] = el}
          type="text" inputMode="numeric" maxLength={1}
          value={d} autoFocus={i === 0}
          onChange={e => onChange(i, e.target.value)}
          onKeyDown={e => onKeyDown(i, e)}
          style={boxStyle}
          onFocus={e  => e.target.style.borderColor = '#D97706'}
          onBlur={e   => e.target.style.borderColor = '#D1D5DB'}
        />
      ))}
    </div>
  )
}

// ── Profile Modal ─────────────────────────────────────────────
function ProfileModal({ user, onClose, onLogout }) {
  const navigate = useNavigate()

  // Change-password flow: idle → sending → otp-entry → done
  const [pwFlow,   setPwFlow]   = useState('idle')  // idle | sending | otp | done
  const [otp,      setOtp]      = useState(['','','','','',''])
  const [newPw,    setNewPw]    = useState('')
  const [confirmPw,setConfirmPw]= useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [err,      setErr]      = useState('')
  const [msg,      setMsg]      = useState('')
  const [busy,     setBusy]     = useState(false)
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
      const res = await api.post('/auth/verify-password-change', {
        otp: code, new_password: newPw,
      })
      setMsg(res.data.message)
      setPwFlow('done')
      setTimeout(resetPwState, 2000)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Verification failed.')
    } finally { setBusy(false) }
  }

  // Avatar initials
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        zIndex: 999, backdropFilter: 'blur(2px)',
      }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 360, background: '#fff', zIndex: 1000,
        boxShadow: '-8px 0 48px rgba(0,0,0,0.18)',
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
          padding: '1.25rem 1.5rem', borderBottom: '1px solid #F3F4F6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>My Profile</span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8,
            width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: '1.1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Avatar + info */}
        <div style={{ padding: '1.75rem 1.5rem 1.25rem', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg, #D97706, #F59E0B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.375rem', fontWeight: 800, color: '#fff', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(217,119,6,0.3)',
            }}>{initials}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: '#1F2937' }}>{user?.name}</div>
              <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 2 }}>{user?.email}</div>
              <span style={{
                display: 'inline-block', marginTop: '0.375rem', fontSize: '0.71875rem',
                fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                background: '#FFF8E7', color: '#92400E', border: '1px solid #FDE68A',
              }}>✉️ Email Account</span>
            </div>
          </div>

          {/* Info rows */}
          <div style={{ marginTop: '1.25rem' }}>
            {[
              { label: 'Full Name',  value: user?.name  || '—' },
              { label: 'Email',      value: user?.email || '—' },
              { label: 'Member',     value: user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN') : '—' },
              { label: 'Verified',   value: user?.is_verified ? '✓ Yes' : '✗ No' },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '0.5rem 0', borderBottom: '1px solid #F9FAFB',
              }}>
                <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>{label}</span>
                <span style={{ fontSize: '0.8125rem', color: '#1F2937', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Change Password ─────────────────────────────── */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1F2937' }}>🔒 Change Password</div>
              <div style={{ fontSize: '0.78125rem', color: '#6B7280', marginTop: 2 }}>Verify via email OTP</div>
            </div>
            {pwFlow === 'idle' && (
              <button onClick={handleSendOtp} disabled={busy}
                style={{
                  background: '#D97706', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '0.4rem 0.875rem', fontSize: '0.8125rem',
                  fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                }}>
                {busy ? '…' : 'Start'}
              </button>
            )}
            {pwFlow !== 'idle' && (
              <button onClick={resetPwState}
                style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '0.8125rem' }}>
                Cancel
              </button>
            )}
          </div>

          {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>⚠️ {err}</div>}
          {msg && pwFlow !== 'otp' && <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>✓ {msg}</div>}

          {/* OTP + new password form */}
          {pwFlow === 'otp' && (
            <form onSubmit={handleVerify} noValidate>
              <p style={{ fontSize: '0.8125rem', color: '#374151', marginBottom: '0.25rem' }}>
                📧 Enter the code sent to <strong>{user?.email}</strong>
              </p>
              <OtpBoxes otp={otp} onChange={handleOtpChange} onKeyDown={handleOtpKey} refs={otpRefs} />

              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ fontSize: '0.8125rem', color: '#374151', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPw ? 'text' : 'password'} value={newPw}
                    onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters"
                    style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 0.75rem', border: '1.5px solid #D1D5DB', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none' }} />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div style={{ marginTop: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', color: '#374151', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Confirm New Password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Re-enter new password"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #D1D5DB', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none' }} />
              </div>

              <button type="submit" disabled={busy}
                style={{
                  width: '100%', marginTop: '0.875rem', padding: '0.65rem',
                  background: '#D97706', color: '#fff', border: 'none',
                  borderRadius: 8, fontSize: '0.875rem', fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer',
                }}>
                {busy ? 'Verifying…' : '✓ Verify & Update Password'}
              </button>
            </form>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Sign Out */}
        <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onLogout} style={{
            width: '100%', padding: '0.7rem',
            background: 'transparent', border: '1.5px solid #FCA5A5', color: '#EF4444',
            borderRadius: 10, fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => e.currentTarget.style.background = '#FEF2F2'}
          onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
            Sign Out
          </button>
        </div>
      </div>
    </>
  )
}

// ── Navbar ────────────────────────────────────────────────────
export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [user,         setUser]         = useState(null)
  const [profileOpen,  setProfileOpen]  = useState(false)

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
    { to: '/dashboard', label: '🏠 Dashboard' },
    { to: '/upload',    label: '⬆️ Upload'    },
  ]

  const active = (to) => location.pathname === to || location.pathname.startsWith(to + '/')

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.5rem', height: 60,
      }}>
        {/* Brand */}
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <span style={{ fontSize: '1.5rem' }}>🎙️</span>
          <span style={{ fontWeight: 800, fontSize: '1.0625rem', color: '#1F2937', letterSpacing: '-0.02em' }}>
            AudioNotes AI
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {navLinks.map(({ to, label }) => (
            <Link key={to} to={to} style={{
              padding: '0.4rem 0.875rem', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600,
              textDecoration: 'none', transition: 'all 0.15s',
              color: active(to) ? '#D97706' : '#4B5563',
              background: active(to) ? '#FFF8E7' : 'transparent',
              border: active(to) ? '1px solid #FDE68A' : '1px solid transparent',
            }}>
              {label}
            </Link>
          ))}
        </div>

        {/* Profile avatar button */}
        <button onClick={() => setProfileOpen(true)}
          title="My Profile"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'none', border: '1.5px solid #E5E7EB', borderRadius: 24,
            padding: '0.2rem 0.625rem 0.2rem 0.2rem', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = '#D97706'}
          onMouseOut={e  => e.currentTarget.style.borderColor = '#E5E7EB'}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #D97706, #F59E0B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.875rem', fontWeight: 700, color: '#fff',
          }}>{initials}</div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>Profile</span>
        </button>
      </nav>

      {/* Profile slide-in panel */}
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
