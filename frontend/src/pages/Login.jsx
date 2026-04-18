// frontend/src/pages/Login.jsx
// 2-step login: email + password → OTP from email → dashboard
import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const navigate = useNavigate()

  // Step 1: email + password
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [step1Err, setStep1Err] = useState('')
  const [step1Loading, setStep1Loading] = useState(false)

  // Step 2: OTP
  const [step,     setStep]     = useState(1)   // 1 = credentials, 2 = OTP
  const [otp,      setOtp]      = useState(['', '', '', '', '', ''])
  const [step2Err, setStep2Err] = useState('')
  const [step2Loading, setStep2Loading] = useState(false)
  const [resendMsg,    setResendMsg]    = useState('')
  const otpRefs = useRef([])

  // ── Step 1: Submit email + password ──────────────────────────
  const handleCredentials = async (e) => {
    e.preventDefault()
    if (!email || !password) { setStep1Err('Please enter email and password.'); return }
    setStep1Loading(true); setStep1Err('')

    try {
      const form = new FormData()
      form.append('username', email.trim().toLowerCase())
      form.append('password', password)
      await api.post('/auth/login', form)
      // Success → backend sent OTP to email
      setStep(2)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Invalid email or password.'
      setStep1Err(msg)
    } finally { setStep1Loading(false) }
  }

  // ── Step 2: Verify login OTP ──────────────────────────────────
  const handleOtp = async (e) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setStep2Err('Please enter the 6-digit code.'); return }
    setStep2Loading(true); setStep2Err('')

    try {
      const res = await api.post('/auth/verify-login-otp', {
        email: email.trim().toLowerCase(),
        otp:   code,
      })
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('user',  JSON.stringify(res.data.user))
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setStep2Err(err.response?.data?.detail || 'Invalid or expired code.')
    } finally { setStep2Loading(false) }
  }

  // ── OTP input box handler ─────────────────────────────────────
  const handleOtpChange = (idx, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[idx] = val
    setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus()
    }
  }

  // ── Resend OTP ────────────────────────────────────────────────
  const handleResend = async () => {
    setResendMsg(''); setStep2Err('')
    try {
      const form = new FormData()
      form.append('username', email.trim().toLowerCase())
      form.append('password', password)
      await api.post('/auth/login', form)
      setResendMsg('New code sent! Check your inbox.')
      setOtp(['', '', '', '', '', ''])
      otpRefs.current[0]?.focus()
    } catch (err) {
      setStep2Err('Could not resend. Please go back and try again.')
    }
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
          }}>🎙️</div>
          <h1 className="auth-title">AudioNotes AI</h1>
          <p className="auth-subtitle">
            {step === 1 ? 'Sign in to access your lecture notes' : `Verify your identity`}
          </p>
        </div>

        {/* ── Step 1: Credentials ─────────────────────────────── */}
        {step === 1 && (
          <form onSubmit={handleCredentials} noValidate>
            {step1Err && <div className="alert alert-error">⚠️ {step1Err}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email Address</label>
              <input id="login-email" type="email" className="form-input"
                placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email" required autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input id="login-password"
                  type={showPw ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: '3rem' }}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%',
                    transform: 'translateY(-50%)', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem',
                    padding: '0.25rem', lineHeight: 1,
                  }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button id="login-btn" type="submit" className="btn btn-primary btn-full btn-lg"
              disabled={step1Loading} style={{ marginTop: '0.5rem' }}>
              {step1Loading
                ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Checking…</>
                : 'Continue →'}
            </button>

            {/* Forgot password */}
            <p style={{ textAlign: 'center', fontSize: '0.8125rem', marginTop: '0.875rem' }}>
              <Link to="/forgot-password" style={{ color: '#D97706', fontWeight: 600 }}>
                Forgot password?
              </Link>
            </p>
          </form>
        )}

        {/* ── Step 2: OTP ─────────────────────────────────────── */}
        {step === 2 && (
          <form onSubmit={handleOtp} noValidate>
            {/* Info box */}
            <div className="alert" style={{
              background: '#F0FDF4', border: '1px solid #BBF7D0',
              color: '#166534', borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem', marginBottom: '1.25rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            }}>
              <span>📧</span>
              <div style={{ fontSize: '0.875rem' }}>
                <strong>Check your email</strong><br />
                We sent a 6-digit code to <strong>{email}</strong>.<br />
                <span style={{ color: '#15803D', fontSize: '0.8125rem' }}>
                  Not in inbox? Check Spam/Promotions.
                </span>
              </div>
            </div>

            {step2Err && <div className="alert alert-error">⚠️ {step2Err}</div>}
            {resendMsg && <div className="alert alert-success">✓ {resendMsg}</div>}

            <div className="form-group">
              <label className="form-label">6-Digit Code</label>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                {otp.map((digit, i) => (
                  <input key={i}
                    ref={el => otpRefs.current[i] = el}
                    type="text" inputMode="numeric" maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKey(i, e)}
                    autoFocus={i === 0}
                    style={{
                      width: '3rem', height: '3.25rem', textAlign: 'center',
                      fontSize: '1.5rem', fontWeight: 700, letterSpacing: 0,
                      border: '2.5px solid #D1D5DB',
                      borderRadius: '10px',
                      background: '#fff', color: '#1F2937',
                      outline: 'none', transition: 'border-color 0.15s',
                      caretColor: 'transparent', boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#D97706'}
                    onBlur={e  => e.target.style.borderColor = '#D1D5DB'}
                  />
                ))}
              </div>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                Expires in 10 minutes
              </p>
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={step2Loading}>
              {step2Loading
                ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Verifying…</>
                : '✓ Verify & Sign In'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
              <button type="button" onClick={handleResend}
                style={{ background: 'none', border: 'none', color: 'var(--brand-amber)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                Resend code
              </button>
              <button type="button" onClick={() => { setStep(1); setStep2Err(''); setResendMsg(''); setOtp(['','','','','','']) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}>
                ← Change email
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        {step === 1 && (
          <>
            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ fontWeight: 600, color: 'var(--brand-amber)' }}>Create one free →</Link>
            </p>
            <p style={{ textAlign: 'center', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
              <Link to="/" style={{ color: 'var(--text-subtle)' }}>← Back to home</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
