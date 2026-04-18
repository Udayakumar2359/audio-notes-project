// frontend/src/pages/Landing.jsx
// Public landing page — no login required
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: '🎙️',
    title: 'Any Audio Format',
    desc: 'Upload MP3, WAV, M4A, OGG, FLAC, or WebM. We handle the format conversion automatically.',
  },
  {
    icon: '🌐',
    title: 'Multilingual Support',
    desc: 'Native support for Kannada, Hindi, and English — including code-switched mixed-language lectures.',
  },
  {
    icon: '⚡',
    title: 'Parallel Processing',
    desc: 'Audio is split into chunks and transcribed in parallel, delivering results in minutes, not hours.',
  },
  {
    icon: '🧹',
    title: 'Smart Cleaning',
    desc: 'Automatically removes filler words, duplicate sentences, background noise, and transcription artifacts.',
  },
  {
    icon: '📝',
    title: 'Structured Notes',
    desc: 'T5 AI model organizes your transcript into key points, sections, definitions, and a full summary.',
  },
  {
    icon: '📥',
    title: 'Download Anywhere',
    desc: 'Export your notes as TXT, DOCX (Word), or PDF. Take them into any study app or print them.',
  },
];

const HOW_IT_WORKS = [
  { num: '01', title: 'Upload Audio',       desc: 'Drag & drop your lecture recording. Any format works.' },
  { num: '02', title: 'Convert & Denoise',  desc: 'Audio is converted to 16 kHz WAV and background noise is removed.' },
  { num: '03', title: 'Transcribe',         desc: 'Whisper ASR model converts speech to text, chunk by chunk in parallel.' },
  { num: '04', title: 'Detect & Translate', desc: 'Language is detected per segment. Non-English text is translated.' },
  { num: '05', title: 'Clean',              desc: 'Fillers, duplicates, and hallucinations are removed from the text.' },
  { num: '06', title: 'Structure Notes',    desc: 'T5 model creates key points, sections, and a clean academic summary.' },
];

const BENEFITS = [
  { icon: '🕐', title: 'Save 2+ Hours Per Lecture', desc: 'Manual note-taking takes hours. AudioNotes AI does it in minutes.' },
  { icon: '📚', title: 'Never Miss a Detail',        desc: "Even if you couldn't attend, your notes are always complete." },
  { icon: '🔁', title: 'Review Anywhere',            desc: 'Clean, organized notes on any device. Download once, read forever.' },
  { icon: '🌍', title: 'Language Barrier? Gone.',    desc: 'Kannada or Hindi lecture? Get English notes automatically.' },
];

export default function Landing() {
  const isLoggedIn = !!localStorage.getItem('token');

  return (
    <div>
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="navbar">
        <Link to="/" className="navbar-brand">
          <span className="logo-icon">🎙️</span>
          AudioNotes AI
        </Link>
        <div className="navbar-nav">
          {isLoggedIn ? (
            <Link to="/dashboard" className="btn btn-primary btn-sm">
              Go to Dashboard →
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Get Started Free</Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="container">
          <div
            className="section-tag"
            style={{ marginBottom: '1.25rem' }}
          >
            AI-Powered • Multilingual • Free to Use
          </div>
          <h1>
            Turn Classroom Audio into{' '}
            <span className="hero-accent">Structured Notes</span>
          </h1>
          <p>
            Upload any lecture recording in Kannada, Hindi, or English.
            Get AI-generated academic notes with key points, summaries,
            and full transcripts — ready to download in seconds.
          </p>
          <div className="hero-cta-group">
            <Link
              to={isLoggedIn ? '/upload' : '/register'}
              className="btn btn-primary btn-xl"
            >
              🚀 Start Converting — It's Free
            </Link>
            <Link to={isLoggedIn ? '/dashboard' : '/login'} className="btn btn-secondary btn-xl">
              {isLoggedIn ? 'View Dashboard' : 'Sign In'}
            </Link>
          </div>

          {/* Quick trust signals */}
          <div
            style={{
              display: 'flex',
              gap: '2rem',
              justifyContent: 'center',
              marginTop: '2.5rem',
              flexWrap: 'wrap',
            }}
          >
            {[
              ['🇮🇳', 'Kannada · Hindi · English'],
              ['⚡', 'Results in minutes'],
              ['📄', 'TXT · DOCX · PDF Export'],
            ].map(([icon, label]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                }}
              >
                <span>{icon}</span> {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="landing-divider" />

      {/* ── How It Works ───────────────────────────────────── */}
      <section className="section-pad">
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

      <hr className="landing-divider" />

      {/* ── Features ──────────────────────────────────────── */}
      <section className="section-pad" style={{ background: 'var(--bg-surface)' }}>
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

      <hr className="landing-divider" />

      {/* ── Benefits ──────────────────────────────────────── */}
      <section className="section-pad">
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Why Students Love It</div>
            <h2>Built for how you actually study</h2>
          </div>
          <div className="features-grid">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  padding: '1.25rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <span
                  style={{
                    fontSize: '1.5rem',
                    minWidth: 36,
                    textAlign: 'center',
                    marginTop: '2px',
                  }}
                >
                  {b.icon}
                </span>
                <div>
                  <h4 style={{ marginBottom: '0.25rem' }}>{b.title}</h4>
                  <p style={{ fontSize: '0.875rem' }}>{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--brand)',
          padding: '3.5rem 0',
          textAlign: 'center',
        }}
      >
        <div className="container">
          <h2 style={{ color: 'white', marginBottom: '0.75rem' }}>
            Ready to stop missing lecture details?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '1.75rem', maxWidth: 480, margin: '0 auto 1.75rem' }}>
            Create a free account and upload your first lecture in under 2 minutes.
          </p>
          <Link
            to={isLoggedIn ? '/upload' : '/register'}
            style={{
              display: 'inline-block',
              padding: '0.875rem 2.25rem',
              background: 'white',
              color: 'var(--brand-dark)',
              fontWeight: 700,
              fontSize: '1rem',
              borderRadius: 'var(--radius-sm)',
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              transition: 'box-shadow 0.18s ease',
            }}
          >
            {isLoggedIn ? 'Upload a Lecture →' : 'Create Free Account →'}
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="container">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🎙️</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                AudioNotes AI
              </span>
            </div>
            <div
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-subtle)',
                textAlign: 'center',
              }}
            >
              Built by Udaya Kumar · Models: Whisper + T5 on HuggingFace
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/login"    style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Sign In</Link>
              <Link to="/register" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Register</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
