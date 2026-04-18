// frontend/src/pages/Profile.jsx
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

export default function Profile() {
  const navigate = useNavigate()
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Password reset state
  const [showReset,   setShowReset]   = useState(false)
  const [currentPw,   setCurrentPw]   = useState('')
  const [newPw,       setNewPw]       = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [resetting,   setResetting]   = useState(false)
  const [resetMsg,    setResetMsg]    = useState('')
  const [resetErr,    setResetErr]    = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) setUser(JSON.parse(stored))
    // Refresh from backend
    api.get('/auth/me')
      .then(r => { setUser(r.data); localStorage.setItem('user', JSON.stringify(r.data)) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setResetErr(''); setResetMsg('')
    if (newPw !== confirmPw) { setResetErr('New passwords do not match.'); return }
    if (newPw.length < 8)   { setResetErr('New password must be at least 8 characters.'); return }

    setResetting(true)
    try {
      const res = await api.post('/auth/reset-password', {
        current_password: currentPw,
        new_password:     newPw,
      })
      setResetMsg(res.data.message)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => setShowReset(false), 2000)
    } catch (err) {
      setResetErr(err.response?.data?.detail || 'Password reset failed.')
    } finally { setResetting(false) }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const isGoogleUser = user && !user.hashed_password && user.clerk_id

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)',
        padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🎙️</span>
          <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-primary)' }}>AudioNotes AI</span>
        </div>
        <Link to="/dashboard" style={{ color: 'var(--brand-amber)', fontWeight: 600, fontSize: '0.875rem' }}>
          ← Dashboard
        </Link>
      </header>

      <div style={{ maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>

        {/* Profile card */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)', padding: '2rem', marginBottom: '1.5rem',
        }}>
          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, #D97706, #F59E0B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.75rem', fontWeight: 700, color: '#fff',
              flexShrink: 0,
            }}>
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                {loading ? 'Loading…' : user?.name || 'User'}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {user?.email}
              </p>
              {/* Badge */}
              <span style={{
                display: 'inline-block', marginTop: '0.375rem',
                background: isGoogleUser ? '#E8F5E9' : '#FFF8E7',
                color: isGoogleUser ? '#2E7D32' : '#92400E',
                border: `1px solid ${isGoogleUser ? '#A5D6A7' : '#FDE68A'}`,
                borderRadius: 20, padding: '0.125rem 0.625rem',
                fontSize: '0.75rem', fontWeight: 600,
              }}>
                {isGoogleUser ? '🔑 Google Account' : '✉️ Email Account'}
              </span>
            </div>
          </div>

          {/* Info rows */}
          {[
            { label: 'Full Name',  value: user?.name  || '—' },
            { label: 'Email',      value: user?.email || '—' },
            { label: 'Account ID', value: user?.id ? `#${user.id}` : '—' },
            { label: 'Verified',   value: user?.is_verified ? '✓ Yes' : '✗ No' },
          ].map(({ label, value }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{label}</span>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* ── Reset Password (only for email accounts) ───────── */}
        {!isGoogleUser && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-subtle)', padding: '1.5rem', marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  🔒 Change Password
                </h3>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  Update your account password
                </p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => { setShowReset(p => !p); setResetErr(''); setResetMsg('') }}>
                {showReset ? 'Cancel' : 'Change'}
              </button>
            </div>

            {showReset && (
              <form onSubmit={handleResetPassword} style={{ marginTop: '1.25rem' }} noValidate>
                {resetErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>⚠️ {resetErr}</div>}
                {resetMsg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>✓ {resetMsg}</div>}

                {/* Current password */}
                <div className="form-group">
                  <label className="form-label" htmlFor="cur-pw">Current Password</label>
                  <div style={{ position: 'relative' }}>
                    <input id="cur-pw" type={showCurrent ? 'text' : 'password'} className="form-input"
                      value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                      placeholder="Your current password" required style={{ paddingRight: '3rem' }} />
                    <button type="button" onClick={() => setShowCurrent(p => !p)}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                      {showCurrent ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div className="form-group">
                  <label className="form-label" htmlFor="new-pw">New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input id="new-pw" type={showNew ? 'text' : 'password'} className="form-input"
                      value={newPw} onChange={e => setNewPw(e.target.value)}
                      placeholder="At least 8 characters" required style={{ paddingRight: '3rem' }} />
                    <button type="button" onClick={() => setShowNew(p => !p)}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                      {showNew ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Confirm new password */}
                <div className="form-group">
                  <label className="form-label" htmlFor="conf-pw">Confirm New Password</label>
                  <input id="conf-pw" type="password" className="form-input"
                    value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Re-enter new password" required />
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={resetting}>
                  {resetting
                    ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Updating…</>
                    : '✓ Update Password'}
                </button>
              </form>
            )}

            {/* Google account note */}
            {isGoogleUser && (
              <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                Your account uses Google sign-in. To change your password, manage it in your Google account.
              </p>
            )}
          </div>
        )}

        {/* Sign Out */}
        <button onClick={handleLogout} className="btn btn-full"
          style={{
            background: 'transparent', border: '1.5px solid #FCA5A5', color: '#EF4444',
            padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#FEF2F2' }}
          onMouseOut ={e => { e.currentTarget.style.background = 'transparent' }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
