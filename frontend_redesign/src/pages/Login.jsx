// frontend/src/pages/Login.jsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api, { saveSession } from '../api'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export default function Login() {
  const navigate = useNavigate()
  const googleBtnRef = useRef(null)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [step1Err, setStep1Err] = useState('')
  const [step1Loading, setStep1Loading] = useState(false)

  const [step,     setStep]     = useState(1)
  const [otp,      setOtp]      = useState(['', '', '', '', '', ''])
  const [step2Err, setStep2Err] = useState('')
  const [step2Loading, setStep2Loading] = useState(false)
  const [resendMsg,    setResendMsg]    = useState('')
  const otpRefs = useRef([])

  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleErr,     setGoogleErr]     = useState('')

  // ── Render Google button into the ref div ─────────────────────
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') return
    if (step !== 1) return

    const init = () => {
      if (!googleBtnRef.current || !window.google?.accounts?.id) return

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (!response?.credential) {
            setGoogleErr('No credential received from Google.')
            return
          }
          setGoogleLoading(true)
          setGoogleErr('')
          try {
            const res = await api.post('/auth/google', { credential: response.credential })
            saveSession({ access_token: res.data.access_token, user: res.data.user })
            navigate('/dashboard', { replace: true })
          } catch (err) {
            setGoogleErr(err.response?.data?.detail || 'Sign-in failed. Please try again.')
          } finally {
            setGoogleLoading(false)
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type:           'standard',
        theme:          'outline',
        size:           'large',
        text:           'continue_with',
        shape:          'rectangular',
        logo_alignment: 'left',
        width:          googleBtnRef.current.offsetWidth || 360,
      })
    }

    // Load GIS script if not already loaded
    if (window.google?.accounts?.id) {
      init()
    } else {
      const existing = document.getElementById('gis-script')
      if (!existing) {
        const script = document.createElement('script')
        script.id    = 'gis-script'
        script.src   = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.onload = init
        document.head.appendChild(script)
      } else {
        existing.addEventListener('load', init)
      }
    }
  }, [step])

  // ── Step 1: credentials ───────────────────────────────────────
  const handleCredentials = async (e) => {
    e.preventDefault()
    if (!email || !password) { setStep1Err('Please enter email and password.'); return }
    setStep1Loading(true); setStep1Err('')
    try {
      const form = new FormData()
      form.append('username', email.trim().toLowerCase())
      form.append('password', password)
      await api.post('/auth/login', form)
      setStep(2)
    } catch (err) {
      setStep1Err(err.response?.data?.detail || 'Invalid email or password.')
    } finally { setStep1Loading(false) }
  }

  // ── Step 2: OTP ───────────────────────────────────────────────
  const handleOtp = async (e) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setStep2Err('Please enter the 6-digit code.'); return }
    setStep2Loading(true); setStep2Err('')
    try {
      const res = await api.post('/auth/verify-login-otp', { email: email.trim().toLowerCase(), otp: code })
      saveSession({ access_token: res.data.access_token, user: res.data.user })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setStep2Err(err.response?.data?.detail || 'Invalid or expired code.')
    } finally { setStep2Loading(false) }
  }

  const handleOtpChange = (idx, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]; next[idx] = val; setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }

  const handleResend = async () => {
    setResendMsg(''); setStep2Err('')
    try {
      const form = new FormData()
      form.append('username', email.trim().toLowerCase())
      form.append('password', password)
      await api.post('/auth/login', form)
      setResendMsg('New code sent!')
      setOtp(['','','','','',''])
      otpRefs.current[0]?.focus()
    } catch { setStep2Err('Could not resend. Please go back.') }
  }

  return (
    <div className="auth-page page-enter">
      <div className="auth-card">

        <div className="auth-logo">
          <div style={{ width:56, height:56, borderRadius:16, background:'linear-gradient(135deg,#D97706,#F59E0B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.75rem', marginBottom:'0.75rem', boxShadow:'0 4px 16px rgba(217,119,6,0.35)' }}>🎙️</div>
          <h1 className="auth-title">AudioNotes AI</h1>
          <p className="auth-subtitle">{step === 1 ? 'Sign in to access your lecture notes' : 'Verify your identity'}</p>
        </div>

        {step === 1 && (
          <>
            {/* ── Google Button (rendered by GIS) ── */}
            {GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID' && (
              <div style={{ marginBottom: '1.25rem' }}>
                {googleErr && <div className="alert alert-error" style={{ marginBottom:'0.75rem', fontSize:'0.875rem' }}>⚠️ {googleErr}</div>}
                {googleLoading && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem', padding:'0.75rem', color:'var(--text-muted)', fontSize:'0.9rem' }}>
                    <span className="spinner" style={{ width:18, height:18, borderWidth:2 }} /> Signing in with Google…
                  </div>
                )}
                {/* GIS renders its iframe button here */}
                <div ref={googleBtnRef} style={{ width:'100%', minHeight: 44, display: googleLoading ? 'none' : 'block' }} />

                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'1.25rem', marginBottom:'0.25rem' }}>
                  <div style={{ flex:1, height:1, background:'var(--border-subtle)' }} />
                  <span style={{ color:'var(--text-muted)', fontSize:'0.8125rem', fontWeight:500 }}>or sign in with email</span>
                  <div style={{ flex:1, height:1, background:'var(--border-subtle)' }} />
                </div>
              </div>
            )}

            {/* ── Email + password form ── */}
            <form onSubmit={handleCredentials} noValidate>
              {step1Err && <div className="alert alert-error">⚠️ {step1Err}</div>}

              <div className="form-group">
                <label className="form-label" htmlFor="login-email">Email Address</label>
                <input id="login-email" type="email" className="form-input" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required autoFocus />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="login-password">Password</label>
                <div style={{ position:'relative' }}>
                  <input id="login-password" type={showPw ? 'text' : 'password'} className="form-input"
                    placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" required style={{ paddingRight:'3rem' }} />
                  <button type="button" onClick={() => setShowPw(p => !p)} aria-label="Toggle password"
                    style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'1.1rem', padding:'0.25rem' }}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button id="login-btn" type="submit" className="btn btn-primary btn-full btn-lg" disabled={step1Loading} style={{ marginTop:'0.5rem' }}>
                {step1Loading ? <><span className="spinner" style={{ width:18, height:18, borderWidth:2 }} /> Checking…</> : 'Continue →'}
              </button>

              <p style={{ textAlign:'center', fontSize:'0.8125rem', marginTop:'0.875rem' }}>
                <Link to="/forgot-password" style={{ color:'#D97706', fontWeight:600 }}>Forgot password?</Link>
              </p>
            </form>

            <p style={{ textAlign:'center', fontSize:'0.875rem', color:'var(--text-muted)', marginTop:'1.25rem' }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ fontWeight:600, color:'var(--brand-amber)' }}>Create one free →</Link>
            </p>
            <p style={{ textAlign:'center', fontSize:'0.8125rem', marginTop:'0.5rem' }}>
              <Link to="/" style={{ color:'var(--text-subtle)' }}>← Back to home</Link>
            </p>
          </>
        )}

        {step === 2 && (
          <form onSubmit={handleOtp} noValidate>
            <div className="alert" style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', color:'#166534', borderRadius:'var(--radius-md)', padding:'0.75rem 1rem', marginBottom:'1.25rem', display:'flex', gap:'0.5rem' }}>
              <span>📧</span>
              <div style={{ fontSize:'0.875rem' }}>
                <strong>Check your email</strong><br />
                We sent a 6-digit code to <strong>{email}</strong>.<br />
                <span style={{ color:'#15803D', fontSize:'0.8125rem' }}>Not in inbox? Check Spam/Promotions.</span>
              </div>
            </div>

            {step2Err  && <div className="alert alert-error">⚠️ {step2Err}</div>}
            {resendMsg && <div className="alert alert-success">✓ {resendMsg}</div>}

            <div className="form-group">
              <label className="form-label">6-Digit Code</label>
              <div style={{ display:'flex', gap:'0.5rem', justifyContent:'center' }}>
                {otp.map((digit, i) => (
                  <input key={i} ref={el => otpRefs.current[i] = el}
                    type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKey(i, e)} autoFocus={i === 0}
                    style={{ width:'3rem', height:'3.25rem', textAlign:'center', fontSize:'1.5rem', fontWeight:700, border:'2.5px solid #D1D5DB', borderRadius:'10px', background:'#fff', color:'#1F2937', outline:'none', transition:'border-color 0.15s', caretColor:'transparent', boxSizing:'border-box' }}
                    onFocus={e => e.target.style.borderColor = '#D97706'}
                    onBlur={e  => e.target.style.borderColor = '#D1D5DB'}
                  />
                ))}
              </div>
              <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:'0.8125rem', marginTop:'0.5rem' }}>Expires in 10 minutes</p>
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={step2Loading}>
              {step2Loading ? <><span className="spinner" style={{ width:18, height:18, borderWidth:2 }} /> Verifying…</> : '✓ Verify & Sign In'}
            </button>

            <div style={{ display:'flex', justifyContent:'space-between', marginTop:'1rem' }}>
              <button type="button" onClick={handleResend} style={{ background:'none', border:'none', color:'var(--brand-amber)', cursor:'pointer', fontSize:'0.875rem', fontWeight:600 }}>Resend code</button>
              <button type="button" onClick={() => { setStep(1); setStep2Err(''); setResendMsg(''); setOtp(['','','','','','']) }}
                style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.875rem' }}>← Change email</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
