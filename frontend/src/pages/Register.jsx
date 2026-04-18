// frontend/src/pages/Register.jsx
// Registration: name + email + password → OTP verification → auto-login to dashboard
import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function Register() {
  const navigate = useNavigate()

  // Step 1
  const [name,      setName]      = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [step1Err,  setStep1Err]  = useState('')
  const [step1Loading, setStep1Loading] = useState(false)

  // Step 2
  const [step,     setStep]     = useState(1)
  const [otp,      setOtp]      = useState(['', '', '', '', '', ''])
  const [step2Err, setStep2Err] = useState('')
  const [step2Loading, setStep2Loading] = useState(false)
  const [resendMsg,    setResendMsg]    = useState('')
  const otpRefs = useRef([])

  const emailRef = useRef(email)
  emailRef.current = email

  // ── Step 1: Register ──────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault()
    if (!name.trim())    { setStep1Err('Full name is required.'); return }
    if (!email.trim())   { setStep1Err('Email is required.'); return }
    if (password.length < 8) { setStep1Err('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setStep1Err('Passwords do not match.'); return }
    setStep1Loading(true); setStep1Err('')

    try {
      await api.post('/auth/register', {
        name:     name.trim(),
        email:    email.trim().toLowerCase(),
        password: password,
      })
      setStep(2)
    } catch (err) {
      setStep1Err(err.response?.data?.detail || 'Registration failed. Please try again.')
    } finally { setStep1Loading(false) }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────
  const handleOtp = async (e) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setStep2Err('Please enter the 6-digit code.'); return }
    setStep2Loading(true); setStep2Err('')

    try {
      const res = await api.post('/auth/verify-otp', {
        email: email.trim().toLowerCase(),
        otp:   code,
      })
      // verify-otp returns a JWT immediately after verifying
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('user',  JSON.stringify(res.data.user))
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setStep2Err(err.response?.data?.detail || 'Invalid or expired code.')
    } finally { setStep2Loading(false) }
  }

  // ── OTP box handler ───────────────────────────────────────────
  const handleOtpChange = (idx, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[idx] = val
    setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0)
      otpRefs.current[idx - 1]?.focus()
  }

  // ── Resend ────────────────────────────────────────────────────
  const handleResend = async () => {
    setResendMsg(''); setStep2Err('')
    try {
      await api.post('/auth/send-otp', { email: email.trim().toLowerCase() })
      setResendMsg('New code sent! Check your inbox.')
      setOtp(['', '', '', '', '', ''])
      otpRefs.current[0]?.focus()
    } catch (err) {
      setStep2Err(err.response?.data?.detail || 'Could not resend. Try again.')
    }
  }

  // ── Step indicator ────────────────────────────────────────────
  const StepBadge = ({ n, label, active }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontWeight: 700,
        fontSize: '0.8125rem', flexShrink: 0,
        background: active ? 'var(--brand-amber)' : 'var(--border-subtle)',
        color: active ? '#fff' : 'var(--text-muted)',
        transition: 'all 0.2s',
      }}>{n}</div>
      <span style={{ fontSize: '0.8125rem', color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>{label}</span>
    </div>
  )

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
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Start turning lectures into notes</p>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <StepBadge n="1" label="Your details" active={step === 1} />
          <div style={{ width: 32, height: 1, background: 'var(--border-subtle)', alignSelf: 'center' }} />
          <StepBadge n="2" label="Verify email" active={step === 2} />
        </div>

        {/* ── Step 1: Registration form ──────────────────────── */}
        {step === 1 && (
          <form onSubmit={handleRegister} noValidate>
            {step1Err && <div className="alert alert-error">⚠️ {step1Err}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">Full Name</label>
              <input id="reg-name" type="text" className="form-input"
                placeholder="Udaya Kumar" value={name}
                onChange={e => setName(e.target.value)} autoFocus required />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">Email Address</label>
              <input id="reg-email" type="email" className="form-input"
                placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email" required />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input id="reg-password"
                  type={showPw ? 'text' : 'password'}
                  className="form-input"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  style={{ paddingRight: '3rem' }}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  aria-label={showPw ? 'Hide' : 'Show'}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%',
                    transform: 'translateY(-50%)', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem',
                    padding: '0.25rem',
                  }}>{showPw ? '🙈' : '👁️'}</button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-confirm">Confirm Password</label>
              <input id="reg-confirm" type="password" className="form-input"
                placeholder="Re-enter password" value={confirm}
                onChange={e => setConfirm(e.target.value)} required />
            </div>

            <button id="register-btn" type="submit" className="btn btn-primary btn-full btn-lg"
              disabled={step1Loading} style={{ marginTop: '0.5rem' }}>
              {step1Loading
                ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Creating account…</>
                : 'Create Account →'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ fontWeight: 600, color: 'var(--brand-amber)' }}>Sign in →</Link>
            </p>
          </form>
        )}

        {/* ── Step 2: OTP ────────────────────────────────────── */}
        {step === 2 && (
          <form onSubmit={handleOtp} noValidate>
            <div className="alert" style={{
              background: '#F0FDF4', border: '1px solid #BBF7D0',
              color: '#166534', borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem', marginBottom: '1.25rem',
              display: 'flex', gap: '0.5rem',
            }}>
              <span>📧</span>
              <div style={{ fontSize: '0.875rem' }}>
                <strong>Check your email</strong><br />
                A 6-digit code was sent to <strong>{email}</strong>.<br />
                <span style={{ color: '#15803D', fontSize: '0.8125rem' }}>
                  Not in inbox? Check Spam/Promotions folder.
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
                      fontSize: '1.5rem', fontWeight: 700,
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
                ← Change details
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
