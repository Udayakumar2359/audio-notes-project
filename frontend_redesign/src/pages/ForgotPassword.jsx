// frontend/src/pages/ForgotPassword.jsx
// 3 steps: enter email → enter OTP + new password → success
import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

export default function ForgotPassword() {
  const navigate = useNavigate()

  const [step,    setStep]    = useState(1)   // 1 email | 2 otp+pw | 3 done
  const [email,   setEmail]   = useState('')
  const [otp,     setOtp]     = useState(['','','','','',''])
  const [newPw,   setNewPw]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [err,     setErr]     = useState('')
  const [msg,     setMsg]     = useState('')
  const [busy,    setBusy]    = useState(false)
  const otpRefs = useRef([])

  // Step 1: send OTP
  const handleSend = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setErr('Please enter your email.'); return }
    setBusy(true); setErr('')
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
      setMsg(res.data.message)
      setStep(2)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (err) {
      setErr(err.response?.data?.detail || 'Failed to send reset code.')
    } finally { setBusy(false) }
  }

  // OTP handlers
  const handleOtpChange = (idx, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]; next[idx] = val; setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0)
      otpRefs.current[idx - 1]?.focus()
  }

  // Step 2: verify OTP + set new password
  const handleReset = async (e) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setErr('Enter the 6-digit code.'); return }
    if (newPw.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (newPw !== confirm) { setErr('Passwords do not match.'); return }
    setBusy(true); setErr('')
    try {
      const res = await api.post('/auth/reset-forgotten-password', {
        email:        email.trim().toLowerCase(),
        otp:          code,
        new_password: newPw,
      })
      setMsg(res.data.message)
      setStep(3)
    } catch (err) {
      setErr(err.response?.data?.detail || 'Reset failed. Please try again.')
    } finally { setBusy(false) }
  }

  const inputStyle = {
    width: '100%', border: '1.5px solid #D1D5DB', borderRadius: 10,
    padding: '0.7rem 0.875rem', fontSize: '0.9375rem', outline: 'none',
    boxSizing: 'border-box', color: '#1F2937',
  }

  return (
    <div className="auth-page page-enter">
      <div className="auth-card">

        {/* Logo */}
        <div className="auth-logo">
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #D97706, #F59E0B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.75rem', marginBottom: '0.75rem',
            boxShadow: '0 4px 16px rgba(217,119,6,0.35)',
          }}>🔑</div>
          <h1 className="auth-title">Reset Password</h1>
          <p className="auth-subtitle">
            {step === 1 && 'Enter your email to receive a reset code'}
            {step === 2 && `Enter the code sent to ${email}`}
            {step === 3 && 'Password reset successfully!'}
          </p>
        </div>

        {/* Step 1: Email */}
        {step === 1 && (
          <form onSubmit={handleSend} noValidate>
            {err && <div className="alert alert-error">⚠️ {err}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="fp-email">Email Address</label>
              <input id="fp-email" type="email" className="form-input"
                placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus autoComplete="email" required />
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg"
              disabled={busy} style={{ marginTop: '0.5rem' }}>
              {busy
                ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Sending…</>
                : 'Send Reset Code →'}
            </button>
          </form>
        )}

        {/* Step 2: OTP + new password */}
        {step === 2 && (
          <form onSubmit={handleReset} noValidate>
            {/* Info */}
            <div style={{
              background: '#F0FDF4', border: '1px solid #BBF7D0',
              color: '#166534', borderRadius: 10, padding: '0.75rem 1rem',
              marginBottom: '1.25rem', fontSize: '0.875rem',
            }}>
              📧 Check your inbox (and Spam) for a 6-digit code sent to <strong>{email}</strong>.
            </div>

            {err && <div className="alert alert-error">⚠️ {err}</div>}

            <div className="form-group">
              <label className="form-label">6-Digit Reset Code</label>
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', margin: '0.25rem 0 0.75rem' }}>
                {otp.map((d, i) => (
                  <input key={i} ref={el => otpRefs.current[i] = el}
                    type="text" inputMode="numeric" maxLength={1}
                    value={d} autoFocus={i === 0}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKey(i, e)}
                    style={{
                      width: '3rem', height: '3.25rem', textAlign: 'center',
                      fontSize: '1.5rem', fontWeight: 700,
                      border: '2.5px solid #D1D5DB', borderRadius: '10px',
                      background: '#fff', color: '#1F2937', outline: 'none',
                      transition: 'border-color 0.15s', caretColor: 'transparent',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#D97706'}
                    onBlur={e  => e.target.style.borderColor = '#D1D5DB'}
                  />
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="fp-newpw">New Password</label>
              <div style={{ position: 'relative' }}>
                <input id="fp-newpw" type={showPw ? 'text' : 'password'} className="form-input"
                  placeholder="At least 8 characters" value={newPw}
                  onChange={e => setNewPw(e.target.value)} required
                  style={{ paddingRight: '3rem' }} />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="fp-confirm">Confirm New Password</label>
              <input id="fp-confirm" type="password" className="form-input"
                placeholder="Re-enter new password" value={confirm}
                onChange={e => setConfirm(e.target.value)} required />
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg"
              disabled={busy} style={{ marginTop: '0.25rem' }}>
              {busy
                ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Resetting…</>
                : '✓ Reset Password'}
            </button>

            <button type="button" onClick={() => { setStep(1); setErr(''); setOtp(['','','','','','']) }}
              style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: '0.75rem', background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '0.875rem' }}>
              ← Use different email
            </button>
          </form>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
            <p style={{ color: '#166534', fontWeight: 600, marginBottom: '1.5rem' }}>{msg}</p>
            <button onClick={() => navigate('/login', { replace: true })}
              className="btn btn-primary btn-full btn-lg">
              Sign In Now →
            </button>
          </div>
        )}

        {/* Footer */}
        {step !== 3 && (
          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6B7280', marginTop: '1.25rem' }}>
            Remember your password?{' '}
            <Link to="/login" style={{ fontWeight: 600, color: '#D97706' }}>Sign in →</Link>
          </p>
        )}
      </div>
    </div>
  )
}
