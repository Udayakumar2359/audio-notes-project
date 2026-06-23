// frontend/src/pages/Landing.jsx
// Public landing page — Obsidian Wave dark/light design
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import api, { saveSession } from '../api';

const FEATURES = [
  { title: 'Any Audio Format', desc: 'Upload MP3, WAV, M4A, OGG, FLAC, or WebM. Automatic format conversion with no setup required.' },
  { title: 'Multilingual Support', desc: 'Native support for Kannada, Hindi, and English — including code-switched and mixed-language lectures.' },
  { title: 'Parallel Transcription', desc: 'Audio is split into chunks and transcribed in parallel using Whisper — faster results on long recordings.' },
  { title: 'Smart Cleaning', desc: 'Removes filler words, repeated phrases, background noise artifacts, and hallucinations automatically.' },
  { title: 'AI-Structured Notes', desc: 'Qwen LLM organizes your transcript into titled sections, key points, and a clean academic summary.' },
  { title: 'AI Study Assistant', desc: 'Chat with your lecture using the built-in AI agent — ask questions, get summaries, or quiz yourself.' },
  { title: 'Share & Collaborate', desc: 'Generate a shareable public link for any lecture note — no login required for the recipient.' },
  { title: 'Export Anywhere', desc: 'Download your notes as TXT, DOCX (Word), or PDF with a single click.' },
];

const HOW_IT_WORKS = [
  { num: '01', title: 'Upload Audio', desc: 'Drag & drop your lecture recording in any format — MP3, WAV, M4A, FLAC, OGG, or WebM.' },
  { num: '02', title: 'Denoise & Convert', desc: 'Audio is converted to 16 kHz mono WAV and background noise is suppressed for cleaner transcription.' },
  { num: '03', title: 'Parallel Transcription', desc: 'Whisper ASR processes audio in parallel chunks for fast, accurate multilingual transcription.' },
  { num: '04', title: 'Language Detection', desc: 'Each segment is language-detected. Non-English segments are translated to English automatically.' },
  { num: '05', title: 'Text Cleaning', desc: 'Filler words, repeated phrases, and ASR hallucinations are removed to produce clean readable text.' },
  { num: '06', title: 'AI Note Generation', desc: 'Qwen LLM structures the transcript into sections, key points, and a concise academic summary.' },
];

const STATS = [
  { val: '90 min', label: 'Max audio length' },
  { val: '3', label: 'Languages supported' },
  { val: '6', label: 'Pipeline steps' },
  { val: '3', label: 'Export formats' },
];

// App mockup preview
function AppMockup() {
  return (
    <div className="lv2-app-mockup">
      <div className="lv2-mockup-bar">
        <div className="lv2-mockup-dot" style={{ background: '#FC5F57' }} />
        <div className="lv2-mockup-dot" style={{ background: '#FDBC2C' }} />
        <div className="lv2-mockup-dot" style={{ background: '#29CC42' }} />
        <div style={{ marginLeft: 8, height: 18, flex: 1, background: 'var(--bg-surface-3)', borderRadius: 4, display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-subtle)', fontFamily: 'JetBrains Mono, monospace' }}>audionotes.ai/notes/42</span>
        </div>
      </div>
      <div style={{ display: 'flex', height: 300 }}>
        {/* Mini sidebar */}
        <div style={{ width: 110, borderRight: '1px solid var(--glass-border)', padding: '0.75rem 0', background: 'var(--bg-surface-2)' }}>
          {['Introduction', 'Key Concepts', 'Applications', 'Summary'].map((s, i) => (
            <div key={s} style={{
              padding: '0.45rem 0.75rem', fontSize: '0.63rem', fontWeight: i === 0 ? 700 : 500,
              color: i === 0 ? 'var(--brand)' : 'var(--text-muted)',
              background: i === 0 ? 'var(--brand-bg)' : 'transparent',
              borderLeft: i === 0 ? '2px solid var(--brand)' : '2px solid transparent',
              cursor: 'pointer',
            }}>{s}</div>
          ))}
        </div>
        {/* Mini content */}
        <div className="lv2-mockup-body" style={{ flex: 1, overflow: 'hidden', padding: '0.75rem 1rem' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-subtle)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>Lecture Notes</div>
          <div className="lv2-mockup-title" style={{ fontSize: '0.8rem', marginBottom: 8 }}>Foundations of Machine Learning</div>
          <div className="lv2-mockup-section" style={{ padding: '0.4rem 0.6rem', marginBottom: 8, fontSize: '0.62rem' }}>
            Overview
          </div>
          <div className="lv2-mockup-line" style={{ width: '100%' }} />
          <div className="lv2-mockup-line" style={{ width: '85%' }} />
          <div className="lv2-mockup-line" style={{ width: '92%' }} />
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <div style={{ background: 'var(--brand-bg)', borderRadius: 4, padding: '0.3rem 0.5rem', fontSize: '0.58rem', color: 'var(--brand)', fontWeight: 600, border: '1px solid var(--brand-border)' }}>Key Concepts</div>
            <div style={{ background: 'var(--success-bg)', borderRadius: 4, padding: '0.3rem 0.5rem', fontSize: '0.58rem', color: 'var(--success)', fontWeight: 600, border: '1px solid var(--success-border)' }}>Applications</div>
          </div>
          <div className="lv2-mockup-line" style={{ marginTop: 10, width: '78%' }} />
          <div className="lv2-mockup-line" style={{ width: '90%' }} />
        </div>
      </div>
      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--glass-border)', padding: '0.625rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-2)' }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-subtle)', fontFamily: 'JetBrains Mono, monospace' }}>Notes ready ✓</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {['TXT', 'DOCX', 'PDF'].map(f => (
            <div key={f} style={{
              background: f === 'PDF' ? 'var(--gradient-primary)' : 'var(--bg-muted)',
              color: f === 'PDF' ? '#fff' : 'var(--text-muted)',
              padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.6rem', fontWeight: 700,
              border: '1px solid var(--glass-border)',
            }}>{f}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Google OAuth helper (ID token flow via GIS)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function loadGIS() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) { resolve(); return; }
    const existing = document.getElementById('gis-script');
    if (existing) { existing.addEventListener('load', resolve); return; }
    const s = document.createElement('script');
    s.id = 'gis-script';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

function GoogleBtn({ label, onToken }) {
  const btnRef = React.useRef(null);
  React.useEffect(() => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') return;
    loadGIS().then(() => {
      if (!btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => { if (resp?.credential) onToken(resp.credential); },
        auto_select: false,
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        type: 'standard', theme: 'outline', size: 'large',
        text: label.toLowerCase().includes('sign up') ? 'signup_with' : 'continue_with',
        shape: 'rectangular', logo_alignment: 'left',
        width: btnRef.current.offsetWidth || 360,
      });
    });
  }, []);
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') return null;
  return <div ref={btnRef} style={{ width: '100%', minHeight: 44, marginBottom: '1rem' }} />;
}

// Inline Login Modal
function LoginModal({ onClose, onSwitchToRegister }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const form = new FormData();
      form.append('username', email.trim().toLowerCase());
      form.append('password', password);
      await api.post('/auth/login', form);
      setStep(2);
    } catch (err) { setErr(err.response?.data?.detail || 'Invalid credentials.'); }
    finally { setLoading(false); }
  };

  const handleOtp = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const res = await api.post('/auth/verify-login-otp', { email: email.trim().toLowerCase(), otp: otp.join('') });
      const { saveSession } = await import('../api');
      saveSession({ access_token: res.data.access_token, user: res.data.user });
      onClose(); navigate('/dashboard', { replace: true });
    } catch (err) { setErr(err.response?.data?.detail || 'Invalid code.'); }
    finally { setLoading(false); }
  };

  const handleGoogleToken = async (credential) => {
    try {
      const res = await api.post('/auth/google', { credential });
      saveSession({ access_token: res.data.access_token, user: res.data.user });
      onClose(); navigate('/dashboard', { replace: true });
    } catch (err) { alert(err.response?.data?.detail || 'Google sign-in failed.'); }
  };

  return (
    // Backdrop — only blur here, NOT on the card
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      {/* Card — solid bg, NO backdrop-filter so inputs are fully interactive */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: 'var(--bg-surface)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow: 'var(--shadow-lg)',
          padding: '2.5rem 2.25rem',
          position: 'relative',
          animation: 'modalSlideUp 0.22s ease-out',
        }}
      >
        <style>{`@keyframes modalSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'var(--bg-muted)', border: '1px solid var(--border)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '0.9rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 0.875rem',
            fontSize: '1rem', fontWeight: 900, color: '#fff',
            letterSpacing: '-0.03em', fontFamily: 'Geist, sans-serif',
            boxShadow: 'var(--glow-primary)',
          }}>AN</div>
          <h2 style={{
            fontSize: '1.5rem', fontWeight: 800,
            fontFamily: 'Geist, sans-serif', letterSpacing: '-0.025em',
            color: 'var(--text-primary)', margin: '0 0 0.25rem',
          }}>
            {step === 1 ? 'Sign In' : 'Verify Email'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            {step === 1 ? 'Welcome back to AudioNotes AI' : `Enter the 6-digit code sent to ${email}`}
          </p>
        </div>

        {/* Google button — step 1 only */}
        {step === 1 && <GoogleBtn label="Continue with Google" onToken={handleGoogleToken} />}
        {step === 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>or sign in with email</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        )}

        {/* Error */}
        {err && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{err}</div>}

        {/* Step 1 — credentials */}
        {step === 1 && (
          <form onSubmit={handleCredentials}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="you@example.com"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Password</label>
                <a
                  href="/forgot-password"
                  style={{
                    fontSize: '0.8rem', color: 'var(--brand)',
                    textDecoration: 'none', fontWeight: 600,
                  }}
                  onMouseOver={e => e.target.style.textDecoration = 'underline'}
                  onMouseOut={e => e.target.style.textDecoration = 'none'}
                >Forgot password?</a>
              </div>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="form-input"
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg" style={{ marginTop: '0.5rem' }}>
              {loading ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Checking…</> : 'Continue'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              No account?{' '}
              <button type="button" onClick={onSwitchToRegister} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>Register free</button>
            </p>
          </form>
        )}

        {/* Step 2 — OTP */}
        {step === 2 && (
          <form onSubmit={handleOtp}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center' }}>
              We sent a 6-digit code to <strong style={{ color: 'var(--brand)' }}>{email}</strong>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.25rem' }}>
              {otp.map((d, i) => (
                <input
                  key={i} type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => {
                    const n = [...otp]; n[i] = e.target.value.replace(/\D/, ''); setOtp(n);
                    if (e.target.value && i < 5) e.target.nextSibling?.focus();
                  }}
                  className="form-input"
                  style={{ width: '2.75rem', height: '3rem', textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, padding: 0, fontFamily: 'JetBrains Mono, monospace' }}
                />
              ))}
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg">
              {loading ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Verifying…</> : 'Verify & Sign In'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '0.875rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: '0.8rem' }}>Back to Sign In</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// Inline Register Modal
function RegisterModal({ onClose, onSwitchToLogin }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      await api.post('/auth/register', { name: name.trim(), email: email.trim().toLowerCase(), password });
      setStep(2);
    } catch (err) { setErr(err.response?.data?.detail || 'Registration failed.'); }
    finally { setLoading(false); }
  };

  const handleOtp = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email: email.trim().toLowerCase(), otp: otp.join('') });
      saveSession({ access_token: res.data.access_token, user: res.data.user });
      onClose(); navigate('/dashboard', { replace: true });
    } catch (err) { setErr(err.response?.data?.detail || 'Invalid code.'); }
    finally { setLoading(false); }
  };

  const handleGoogleToken = async (credential) => {
    try {
      const res = await api.post('/auth/google', { credential });
      saveSession({ access_token: res.data.access_token, user: res.data.user });
      onClose(); navigate('/dashboard', { replace: true });
    } catch (err) { alert(err.response?.data?.detail || 'Google sign-up failed.'); }
  };

  return (
    // Backdrop — only blur here, NOT on the card
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      {/* Card — solid bg, NO backdrop-filter so inputs are fully interactive */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440,
          background: 'var(--bg-surface)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow: 'var(--shadow-lg)',
          padding: '2.5rem 2.25rem',
          position: 'relative',
          animation: 'modalSlideUp 0.22s ease-out',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'var(--bg-muted)', border: '1px solid var(--border)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '0.9rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 0.875rem',
            fontSize: '1rem', fontWeight: 900, color: '#fff',
            letterSpacing: '-0.03em', fontFamily: 'Geist, sans-serif',
            boxShadow: 'var(--glow-primary)',
          }}>AN</div>
          <h2 style={{
            fontSize: '1.5rem', fontWeight: 800,
            fontFamily: 'Geist, sans-serif', letterSpacing: '-0.025em',
            color: 'var(--text-primary)', margin: '0 0 0.25rem',
          }}>
            {step === 1 ? 'Create Account' : 'Verify Email'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            {step === 1 ? 'Start turning lectures into structured notes' : `Check your inbox — code sent to ${email}`}
          </p>
        </div>

        {/* Google button — step 1 only */}
        {step === 1 && <GoogleBtn label="Sign up with Google" onToken={handleGoogleToken} />}
        {step === 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>or register with email</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        )}

        {/* Error */}
        {err && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{err}</div>}

        {/* Step 1 — registration form */}
        {step === 1 && (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text" value={name}
                onChange={e => setName(e.target.value)}
                required autoFocus placeholder="Udaya Kumar"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                required placeholder="you@example.com"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                required placeholder="At least 8 characters"
                className="form-input"
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg" style={{ marginTop: '0.5rem' }}>
              {loading ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Creating…</> : 'Create Account'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Have an account?{' '}
              <button type="button" onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>Sign in</button>
            </p>
          </form>
        )}

        {/* Step 2 — OTP */}
        {step === 2 && (
          <form onSubmit={handleOtp}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center' }}>
              We sent a 6-digit code to <strong style={{ color: 'var(--brand)' }}>{email}</strong>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.25rem' }}>
              {otp.map((d, i) => (
                <input
                  key={i} type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => {
                    const n = [...otp]; n[i] = e.target.value.replace(/\D/, ''); setOtp(n);
                    if (e.target.value && i < 5) e.target.nextSibling?.focus();
                  }}
                  className="form-input"
                  style={{ width: '2.75rem', height: '3rem', textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, padding: 0, fontFamily: 'JetBrains Mono, monospace' }}
                />
              ))}
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg">
              {loading ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Verifying…</> : 'Verify & Activate Account'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '0.875rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: '0.8rem' }}>Back to Register</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Landing() {
  const isLoggedIn = !!localStorage.getItem('token');
  const { theme, toggleTheme } = useTheme();
  const [modal, setModal] = useState(null); // null | 'login' | 'register'

  return (
    <div className="landing-v2">


      {/* ── Navbar ── */}
      <nav className="lv2-nav">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, color: '#fff', boxShadow: 'var(--glow-sm)', fontFamily: 'Geist, sans-serif', letterSpacing: '-0.02em' }}>AN</div>
          <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            AudioNotes <span style={{ color: 'var(--gradient-primary)' }}>AI</span>
          </span>
        </Link>

        <div className="lv2-nav-links">
          <a href="#features" className="lv2-nav-link">Features</a>
          <a href="#how-it-works" className="lv2-nav-link">How it works</a>
          <a href="#" className="lv2-nav-link">Help</a>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Theme toggle */}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>

          {isLoggedIn ? (
            <Link to="/dashboard" className="lv2-btn-primary">Go to Dashboard</Link>
          ) : (
            <>
              <button onClick={() => setModal('login')} className="lv2-btn-ghost">Sign In</button>
              <button onClick={() => setModal('register')} className="lv2-btn-primary">Get Started</button>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lv2-hero">
        <div className="lv2-hero-left">
          <div className="lv2-tag">
            AI-Powered · Multilingual · Free to Use
          </div>

          <h1 className="lv2-headline">
            Lecture Audio to{' '}
            <span>Perfect Notes.</span>
          </h1>

          <p className="lv2-desc">
            Upload any lecture recording in Kannada, Hindi, or English.
            AudioNotes AI transcribes, cleans, and structures your lecture
            into academic notes — with key points, sections, and summaries
            ready to download in minutes.
          </p>

          <div className="lv2-cta-row">
            {isLoggedIn ? (
              <Link to="/upload" className="lv2-btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 1.75rem' }}>Upload Lecture Audio Now</Link>
            ) : (
              <button onClick={() => setModal('register')} className="lv2-btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 1.75rem', cursor: 'pointer' }}>Get Started Free</button>
            )}
            {isLoggedIn ? (
              <Link to="/dashboard" className="lv2-btn-ghost">View Dashboard</Link>
            ) : (
              <button onClick={() => setModal('login')} className="lv2-btn-ghost" style={{ cursor: 'pointer' }}>Sign In</button>
            )}
          </div>

          {/* Social proof */}
          <div className="lv2-trust">
            <div className="lv2-avatars">
              {['U', 'A', 'R', 'K'].map((i, idx) => (
                <div key={idx} className="lv2-avatar"
                  style={{ background: ['#6366f1', '#a855f7', '#059669', '#d97706'][idx] }}>
                  {i}
                </div>
              ))}
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}><strong style={{ color: 'var(--text-primary)' }}>5,000+ students</strong> using AudioNotes AI</span>
          </div>
        </div>

        {/* Right: App mockup */}
        <AppMockup />
      </section>

      {/* ── Stats bar ── */}
      <div className="lv2-stats">
        {STATS.map(s => (
          <div key={s.val} className="lv2-stat">
            <div className="lv2-stat-val">{s.val}</div>
            <div className="lv2-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── How It Works ── */}
      <section id="how-it-works" style={{ padding: '5rem 0', position: 'relative', zIndex: 1 }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">How It Works</div>
            <h2>Six steps from audio to organized notes</h2>
            <p>Every lecture goes through a fully automated AI pipeline — upload once and get clean, structured notes in minutes.</p>
          </div>
          <div className="how-it-works">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.num} className="step-card">
                <div className="step-card-num">STEP {step.num}</div>
                <h4>{step.title}</h4>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ padding: '4rem 0', position: 'relative', zIndex: 1 }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Features</div>
            <h2>Everything you need, built in</h2>
          </div>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <h4>{f.title}</h4>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="lv2-cta-section">
        <div className="container">
          <h2>Turn your lectures into structured notes — instantly.</h2>
          <p>Create a free account, upload your lecture audio, and get AI-generated notes in minutes. No setup required.</p>
          {isLoggedIn ? (
            <Link to="/upload" className="lv2-cta-btn-white">Upload a Lecture</Link>
          ) : (
            <button onClick={() => setModal('register')} className="lv2-cta-btn-white" style={{ cursor: 'pointer' }}>
              Create Free Account
            </button>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lv2-footer">
        <div className="lv2-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: '#fff', fontFamily: 'Geist, sans-serif', letterSpacing: '-0.02em' }}>AN</div>
            <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>AudioNotes AI</span>
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Built by Udaya Kumar · Models: Whisper + Qwen via Ollama
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => setModal('login')} style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Sign In</button>
            <button onClick={() => setModal('register')} style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Register</button>
          </div>
        </div>
      </footer>

      {modal === 'login' && <LoginModal onClose={() => setModal(null)} onSwitchToRegister={() => setModal('register')} />}
      {modal === 'register' && <RegisterModal onClose={() => setModal(null)} onSwitchToLogin={() => setModal('login')} />}
    </div>
  );
}
