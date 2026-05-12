// frontend/src/pages/Landing.jsx
// Public landing page — two-column hero design
import { Link } from 'react-router-dom';

const FEATURES = [
  { icon: '🎙️', title: 'Any Audio Format',      desc: 'Upload MP3, WAV, M4A, OGG, FLAC, or WebM. Format conversion is automatic.' },
  { icon: '🌐', title: 'Multilingual Support',   desc: 'Native support for Kannada, Hindi, and English — including code-switched lectures.' },
  { icon: '⚡', title: 'Parallel Processing',    desc: 'Audio is split into chunks and transcribed in parallel — results in minutes.' },
  { icon: '🧹', title: 'Smart Cleaning',         desc: 'Removes filler words, duplicates, background noise, and transcription artifacts.' },
  { icon: '📝', title: 'Structured Notes',       desc: 'T5 AI model organizes your transcript into key points, sections, and a summary.' },
  { icon: '📥', title: 'Export Anywhere',        desc: 'Download your notes as TXT, DOCX (Word), or PDF.' },
];

const HOW_IT_WORKS = [
  { num: '01', title: 'Upload Audio',       desc: 'Drag & drop your lecture recording in any format.' },
  { num: '02', title: 'Denoise & Convert',  desc: 'Audio is converted to 16 kHz WAV and background noise is removed.' },
  { num: '03', title: 'Transcribe',         desc: 'Whisper ASR converts speech to text in parallel chunks.' },
  { num: '04', title: 'Detect & Translate', desc: 'Language is detected per segment. Non-English is translated to English.' },
  { num: '05', title: 'Clean',              desc: 'Fillers, duplicates, and hallucinations are removed from the text.' },
  { num: '06', title: 'Structure Notes',    desc: 'T5 creates key points, sections, and a clean academic summary.' },
];

const STATS = [
  { val: '90 min',   label: 'Max audio length' },
  { val: '3',        label: 'Languages supported' },
  { val: '12×',      label: 'Parallel processing' },
  { val: '3 formats',label: 'Export options' },
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
            📋 Executive Summary
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
        <span style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>✅ Notes ready</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {['TXT', 'DOCX', 'PDF'].map(f => (
            <div key={f} style={{ background: f === 'PDF' ? '#2563EB' : '#F3F4F6', color: f === 'PDF' ? '#fff' : '#374151', padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.6rem', fontWeight: 700 }}>{f}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const isLoggedIn = !!localStorage.getItem('token');

  return (
    <div className="landing-v2">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="lv2-nav">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🎙️</div>
          <span style={{ fontWeight: 800, fontSize: '1.0625rem', color: '#111827', letterSpacing: '-0.02em' }}>AudioNotes AI</span>
        </Link>

        <div className="lv2-nav-links">
          <a href="#features" className="lv2-nav-link">Features</a>
          <a href="#how-it-works" className="lv2-nav-link">How it works</a>
          <a href="#" className="lv2-nav-link">Help</a>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isLoggedIn ? (
            <Link to="/dashboard" className="lv2-btn-primary">Go to Dashboard →</Link>
          ) : (
            <>
              <Link to="/login" className="lv2-btn-ghost" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}>Sign In</Link>
              <Link to="/register" className="lv2-btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}>Get Started</Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="lv2-hero">
        <div className="lv2-hero-left">
          <div className="lv2-tag">
            <span>✨</span> AI-Powered · Multilingual · Free to Use
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
            <Link
              to={isLoggedIn ? '/upload' : '/register'}
              className="lv2-btn-primary"
            >
              ⬆ Drop Lecture Audio Now
            </Link>
            <Link to={isLoggedIn ? '/dashboard' : '/login'} className="lv2-btn-ghost">
              {isLoggedIn ? 'View Dashboard' : 'Learn More →'}
            </Link>
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
                <div className="feature-icon">{f.icon}</div>
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
            {isLoggedIn ? 'Upload a Lecture →' : 'Create Free Account →'}
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ background: '#fff', borderTop: '1px solid #E5E7EB', padding: '2rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem' }}>🎙️</div>
              <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.9375rem' }}>AudioNotes AI</span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#9CA3AF', textAlign: 'center' }}>
              Built by Udaya Kumar · Models: Whisper + T5 on HuggingFace
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/login"    style={{ fontSize: '0.8125rem', color: '#6B7280' }}>Sign In</Link>
              <Link to="/register" style={{ fontSize: '0.8125rem', color: '#6B7280' }}>Register</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
