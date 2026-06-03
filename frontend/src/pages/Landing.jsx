// frontend/src/pages/Landing.jsx
// Public landing page — two-column hero design
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { saveSession } from '../api';

const FEATURES = [
  { title: 'Any Audio Format', desc: 'Upload MP3, WAV, M4A, OGG, FLAC, or WebM. Format conversion is automatic.' },
  { title: 'Multilingual Support', desc: 'Native support for Kannada, Hindi, and English — including code-switched lectures.' },
  { title: 'Parallel Processing', desc: 'Audio is split into chunks and transcribed in parallel — results in minutes.' },
  { title: 'Smart Cleaning', desc: 'Removes filler words, duplicates, background noise, and transcription artifacts.' },
  { title: 'Structured Notes', desc: 'T5 AI model organizes your transcript into key points, sections, and a summary.' },
  { title: 'Export Anywhere', desc: 'Download your notes as TXT, DOCX (Word), or PDF.' },
];

const HOW_IT_WORKS = [
  { num: '01', title: 'Upload Audio', desc: 'Drag & drop your lecture recording in any format.' },
  { num: '02', title: 'Denoise & Convert', desc: 'Audio is converted to 16 kHz WAV and background noise is removed.' },
  { num: '03', title: 'Transcribe', desc: 'Whisper ASR converts speech to text in parallel chunks.' },
  { num: '04', title: 'Detect & Translate', desc: 'Language is detected per segment. Non-English is translated to English.' },
  { num: '05', title: 'Clean', desc: 'Fillers, duplicates, and hallucinations are removed from the text.' },
  { num: '06', title: 'Structure Notes', desc: 'T5 creates key points, sections, and a clean academic summary.' },
];

const STATS = [
  { val: '90 min', label: 'Max audio length' },
  { val: '3', label: 'Languages supported' },
  { val: '12×', label: 'Parallel processing' },
  { val: '3 formats', label: 'Export options' },
];

// Mock notes app preview card
function AppMockup() {
  return (
    <div className="lv2-app-mockup">
      {/* Browser-style bar */}
      <div className="lv2-mockup-bar">
        <div className="lv2-mockup-dot" style={{ background: '#FC5F57' }} />
        <div className="lv2-mockup-dot" style={{ background: '#FDBC2C' }} />
        <div className="lv2-mockup-dot" style={{ background: '#29CC42' }} />
        <div style={{ marginLeft: 8, height: 20, flex: 1, background: '#fff', borderRadius: 4, border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
          <span style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>audionotes.ai/notes/42</span>
        </div>
      </div>
      {/* App content */}
      <div style={{ display: 'flex', height: 320 }}>
        {/* Mini sidebar */}
        <div style={{ width: 120, borderRight: '1px solid #F3F4F6', padding: '0.75rem 0', background: '#FAFAFA' }}>
          {['Introduction', 'Key Concepts', 'Applications', 'Summary'].map((s, i) => (
            <div key={s} style={{
              padding: '0.45rem 0.75rem', fontSize: '0.65rem', fontWeight: i === 0 ? 700 : 500,
              color: i === 0 ? '#2563EB' : '#6B7280',
              background: i === 0 ? '#EFF6FF' : 'transparent',
              borderLeft: i === 0 ? '2px solid #2563EB' : '2px solid transparent',
            }}>{s}</div>
          ))}
        </div>
        {/* Mini content */}
        <div className="lv2-mockup-body" style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: '0.6rem', color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lecture Notes</div>
          <div className="lv2-mockup-title" style={{ fontSize: '0.8rem', marginBottom: 8 }}>Foundations of Machine Learning</div>
          <div className="lv2-mockup-section" style={{ padding: '0.5rem 0.625rem', marginBottom: 8 }}>
            Executive Summary
          </div>
          <div className="lv2-mockup-line" style={{ width: '100%' }} />
          <div className="lv2-mockup-line" style={{ width: '85%' }} />
          <div className="lv2-mockup-line" style={{ width: '92%' }} />
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <div style={{ background: '#EFF6FF', borderRadius: 4, padding: '0.35rem 0.5rem', fontSize: '0.6rem', color: '#2563EB', fontWeight: 600 }}>Key Concepts</div>
            <div style={{ background: '#F0FDF4', borderRadius: 4, padding: '0.35rem 0.5rem', fontSize: '0.6rem', color: '#059669', fontWeight: 600 }}>Applications</div>
          </div>
          <div className="lv2-mockup-line" style={{ marginTop: 10, width: '78%' }} />
          <div className="lv2-mockup-line" style={{ width: '90%' }} />
        </div>
      </div>
      {/* Footer bar */}
      <div style={{ borderTop: '1px solid #F3F4F6', padding: '0.625rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA' }}>
        <span style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>Notes ready</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {['TXT', 'DOCX', 'PDF'].map(f => (
            <div key={f} style={{ background: f === 'PDF' ? '#2563EB' : '#F3F4F6', color: f === 'PDF' ? '#fff' : '#374151', padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.6rem', fontWeight: 700 }}>{f}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Google OAuth helper (ID token flow via GIS) ─────────────────
// Uses accounts.id (returns JWT ID token) – NOT oauth2 (access token).
// Backend verifies the ID token with google-auth library.
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
        callback: (resp) => {
          if (resp?.credential) onToken(resp.credential);
        },
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

// ── Inline Login Modal ────────────────────────────────────────
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
    } catch (err) {
      alert(err.response?.data?.detail || 'Google sign-in failed. Please try again.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '2.5rem 2rem', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#D97706,#F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}></div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Sign In</h2>
          <p style={{ margin: '0.25rem 0 0', color: '#6B7280', fontSize: '0.875rem' }}>{step === 1 ? 'Welcome back to AudioNotes AI' : 'Enter the code sent to your email'}</p>
        </div>
        {step === 1 && <GoogleBtn label="Continue with Google" onToken={handleGoogleToken} />}
        {step === 1 && <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}><div style={{ flex: 1, height: 1, background: '#E5E7EB' }} /><span style={{ fontSize: '0.75rem', color: '#9CA3AF', whiteSpace: 'nowrap' }}>or sign in with email</span><div style={{ flex: 1, height: 1, background: '#E5E7EB' }} /></div>}
        {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.875rem', marginBottom: '1rem' }}>{err}</div>}
        {step === 1 ? (
          <form onSubmit={handleCredentials}>
            <div style={{ marginBottom: '0.875rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.375rem', color: '#374151' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com"
                style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.375rem', color: '#374151' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.8rem', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              {loading ? 'Checking…' : 'Continue'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem', color: '#6B7280' }}>No account? <button type="button" onClick={onSwitchToRegister} style={{ background: 'none', border: 'none', color: '#D97706', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>Register free</button></p>
          </form>
        ) : (
          <form onSubmit={handleOtp}>
            <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '1rem' }}>We sent a 6-digit code to <strong>{email}</strong></p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.25rem' }}>
              {otp.map((d, i) => <input key={i} type="text" inputMode="numeric" maxLength={1} value={d}
                onChange={e => { const n = [...otp]; n[i] = e.target.value.replace(/\D/, ''); setOtp(n); if (e.target.value && i < 5) e.target.nextSibling?.focus(); }}
                style={{ width: '2.75rem', height: '3rem', textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, border: '2px solid #D1D5DB', borderRadius: 8, outline: 'none' }} />)}
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.8rem', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Inline Register Modal ─────────────────────────────────────
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
    } catch (err) {
      alert(err.response?.data?.detail || 'Google sign-up failed. Please try again.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '2.5rem 2rem', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#D97706,#F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}></div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{step === 1 ? 'Create Account' : 'Verify Email'}</h2>
          <p style={{ margin: '0.25rem 0 0', color: '#6B7280', fontSize: '0.875rem' }}>{step === 1 ? 'Start turning lectures into notes' : `Code sent to ${email}`}</p>
        </div>
        {step === 1 && <GoogleBtn label="Sign up with Google" onToken={handleGoogleToken} />}
        {step === 1 && <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}><div style={{ flex: 1, height: 1, background: '#E5E7EB' }} /><span style={{ fontSize: '0.75rem', color: '#9CA3AF', whiteSpace: 'nowrap' }}>or register with email</span><div style={{ flex: 1, height: 1, background: '#E5E7EB' }} /></div>}
        {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.875rem', marginBottom: '1rem' }}>{err}</div>}
        {step === 1 ? (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.375rem', color: '#374151' }}>Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus placeholder="Udaya Kumar"
                style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.375rem', color: '#374151' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"
                style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.375rem', color: '#374151' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="At least 8 characters"
                style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.8rem', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              {loading ? 'Creating…' : 'Create Account'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem', color: '#6B7280' }}>Have an account? <button type="button" onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: '#D97706', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>Sign in</button></p>
          </form>
        ) : (
          <form onSubmit={handleOtp}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.25rem' }}>
              {otp.map((d, i) => <input key={i} type="text" inputMode="numeric" maxLength={1} value={d}
                onChange={e => { const n = [...otp]; n[i] = e.target.value.replace(/\D/, ''); setOtp(n); if (e.target.value && i < 5) e.target.nextSibling?.focus(); }}
                style={{ width: '2.75rem', height: '3rem', textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, border: '2px solid #D1D5DB', borderRadius: 8, outline: 'none' }} />)}
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.8rem', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Landing() {
  const isLoggedIn = !!localStorage.getItem('token');
  const [modal, setModal] = useState(null); // null | 'login' | 'register'

  return (
    <div className="landing-v2">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="lv2-nav">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></div>
          <span style={{ fontWeight: 800, fontSize: '1.0625rem', color: '#111827', letterSpacing: '-0.02em' }}>AudioNotes AI</span>
        </Link>

        <div className="lv2-nav-links">
          <a href="#features" className="lv2-nav-link">Features</a>
          <a href="#how-it-works" className="lv2-nav-link">How it works</a>
          <a href="#" className="lv2-nav-link">Help</a>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isLoggedIn ? (
            <Link to="/dashboard" className="lv2-btn-primary">Go to Dashboard</Link>
          ) : (
            <>
              <button onClick={() => setModal('login')} className="lv2-btn-ghost" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>Sign In</button>
              <button onClick={() => setModal('register')} className="lv2-btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>Get Started</button>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
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
            Get AI-generated academic notes with key points, summaries,
            and full transcripts — ready to download in seconds.
          </p>

          <div className="lv2-cta-row">
            {isLoggedIn ? (
              <Link to="/upload" className="lv2-btn-primary">Upload Lecture Audio Now</Link>
            ) : (
              <button onClick={() => setModal('register')} className="lv2-btn-primary" style={{ cursor: 'pointer' }}>Upload Lecture Audio Now</button>
            )}
            {isLoggedIn ? (
              <Link to="/dashboard" className="lv2-btn-ghost">View Dashboard</Link>
            ) : (
              <button onClick={() => setModal('login')} className="lv2-btn-ghost" style={{ cursor: 'pointer' }}>Sign In</button>
            )}
          </div>

          {/* Trust row */}
          <div className="lv2-trust">
            <div className="lv2-avatars">
              {['U', 'A', 'R', 'K'].map((i, idx) => (
                <div key={idx} className="lv2-avatar"
                  style={{ background: ['linear-gradient(135deg,#2563EB,#60A5FA)', 'linear-gradient(135deg,#7C3AED,#A78BFA)', 'linear-gradient(135deg,#059669,#34D399)', 'linear-gradient(135deg,#D97706,#FBBF24)'][idx] }}>
                  {i}
                </div>
              ))}
            </div>
            <span><strong style={{ color: '#111827' }}>5,000+ students</strong> using AudioNotes AI</span>
          </div>
        </div>

        {/* Right: App mockup */}
        <AppMockup />
      </section>

      {/* ── Stats row ───────────────────────────────────────── */}
      <div className="lv2-stats">
        {STATS.map(s => (
          <div key={s.val} className="lv2-stat">
            <div className="lv2-stat-val">{s.val}</div>
            <div className="lv2-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section id="how-it-works" style={{ background: '#F8FAFC', padding: '4rem 0' }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">How It Works</div>
            <h2>Six steps from audio to organized notes</h2>
            <p style={{ maxWidth: 500, margin: '0 auto' }}>
              Our pipeline processes every second of your lecture through
              a state-of-the-art AI stack — automatically.
            </p>
          </div>
          <div className="how-it-works">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.num} className="step-card">
                <div className="step-card-num">STEP {step.num}</div>
                <h4>{step.title}</h4>
                <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" style={{ background: '#fff', padding: '4rem 0' }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Features</div>
            <h2>Everything you need for better study</h2>
          </div>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <h4 style={{ marginBottom: '0.375rem' }}>{f.title}</h4>
                <p style={{ fontSize: '0.875rem' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────── */}
      <section style={{ background: '#2563EB', padding: '3.5rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ color: 'white', marginBottom: '0.75rem' }}>
            Ready to stop missing lecture details?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '1.75rem', maxWidth: 460, margin: '0 auto 1.75rem' }}>
            Create a free account and upload your first lecture in under 2 minutes.
          </p>
          <Link
            to={isLoggedIn ? '/upload' : '/register'}
            style={{
              display: 'inline-block', padding: '0.875rem 2.25rem',
              background: 'white', color: '#1D4ED8', fontWeight: 700,
              fontSize: '1rem', borderRadius: 8, textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {isLoggedIn ? 'Upload a Lecture' : 'Create Free Account'}
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ background: '#fff', borderTop: '1px solid #E5E7EB', padding: '2rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></div>
              <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.9375rem' }}>AudioNotes AI</span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#9CA3AF', textAlign: 'center' }}>
              Built by Udaya Kumar · Models: Whisper + T5 on HuggingFace
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setModal('login')} style={{ fontSize: '0.8125rem', color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>Sign In</button>
              <button onClick={() => setModal('register')} style={{ fontSize: '0.8125rem', color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>Register</button>
            </div>
          </div>
        </div>
      </footer>

      {modal === 'login' && <LoginModal onClose={() => setModal(null)} onSwitchToRegister={() => setModal('register')} />}
      {modal === 'register' && <RegisterModal onClose={() => setModal(null)} onSwitchToLogin={() => setModal('login')} />}
    </div>
  );
}
