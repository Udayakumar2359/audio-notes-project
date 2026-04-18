// frontend/src/pages/NotesViewer.jsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const LANG_LABELS = { en: 'English', kn: 'Kannada', hi: 'Hindi', unknown: 'Unknown', other: 'Other' };

// ── Rich structured notes renderer ─────────────────────────────
function StructuredNotesView({ notes }) {
  if (!notes || !notes.key_points) {
    return <pre className="notes-full-pre">{typeof notes === 'string' ? notes : 'No structured data.'}</pre>;
  }

  return (
    <div>
      {/* Summary */}
      {notes.summary && (
        <div
          style={{
            background: 'var(--brand-bg)',
            border: '1px solid var(--brand-border)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            fontSize: '0.9375rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
          }}
        >
          <span
            style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                     letterSpacing: '0.06em', color: 'var(--brand)', display: 'block', marginBottom: '0.375rem' }}
          >
            Summary
          </span>
          {notes.summary}
        </div>
      )}

      {/* Key Points */}
      {notes.key_points?.length > 0 && (
        <div className="notes-section">
          <div className="notes-section-title">Key Points</div>
          <ul className="key-points-list" role="list">
            {notes.key_points.map((pt, idx) => (
              <li key={idx} className="key-point-item">
                <span className="key-point-num">{idx + 1}.</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sections */}
      {notes.sections?.length > 0 && (
        <div className="notes-section">
          <div className="notes-section-title">Detailed Notes</div>
          {notes.sections.map((sec, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: idx < notes.sections.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <h4 style={{ marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                {sec.heading}
              </h4>
              <p style={{ fontSize: '0.9125rem', lineHeight: 1.7 }}>{sec.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Full transcript */}
      {notes.full_transcript && (
        <div className="notes-section">
          <div className="notes-section-title">Full Transcript (English)</div>
          <p
            style={{
              fontSize: '0.875rem',
              lineHeight: 1.8,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {notes.full_transcript}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────
export default function NotesViewer() {
  const { jobId } = useParams();
  const [data,      setData]      = useState(null);
  const [activeTab, setActiveTab] = useState('notes');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [copied,    setCopied]    = useState(false);

  useEffect(() => {
    api.get(`/audio/${jobId}/notes`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load notes.');
        setLoading(false);
      });
  }, [jobId]);

  // ── Download handlers ─────────────────────────────────────
  const downloadFormat = (fmt) => {
    const token = localStorage.getItem('token');
    const url   = `${API_BASE}/audio/${jobId}/download?format=${fmt}`;
    const a     = document.createElement('a');
    a.href      = url;
    // We need to fetch with auth header, then create blob URL
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        a.download = `lecture_notes_${jobId}.${fmt}`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => alert('Download failed. Please try again.'));
  };

  const copyNotes = () => {
    const txt = data?.notes_text || '';
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Language stats ────────────────────────────────────────
  const langStats = () => {
    if (!data?.transcriptions?.length) return {};
    const counts = {};
    data.transcriptions.forEach(t => {
      const l = t.detected_language || 'unknown';
      counts[l] = (counts[l] || 0) + 1;
    });
    return counts;
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div className="spinner" style={{ margin:'0 auto 1rem' }} />
        <p>Loading your notes…</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem' }}>
      <div className="card" style={{ maxWidth:460, textAlign:'center', width:'100%' }}>
        <div style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>⚠️</div>
        <h2 style={{ marginBottom:'0.625rem' }}>Could not load notes</h2>
        <p style={{ marginBottom:'1.5rem' }}>{error}</p>
        <Link to="/dashboard" className="btn btn-primary">← Back to Dashboard</Link>
      </div>
    </div>
  );

  const stats = langStats();
  const notes = data?.notes || {};

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      {/* Navbar */}
      <nav className="navbar">
        <Link to="/dashboard" className="navbar-brand">
          <span className="logo-icon">🎙️</span>
          AudioNotes AI
        </Link>
        <div className="navbar-nav">
          <button id="copy-btn"     className="btn btn-ghost btn-sm"   onClick={copyNotes}>
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
          <button id="download-txt"  className="btn btn-secondary btn-sm" onClick={() => downloadFormat('txt')}>
            ⬇ TXT
          </button>
          <button id="download-docx" className="btn btn-secondary btn-sm" onClick={() => downloadFormat('docx')}>
            ⬇ DOCX
          </button>
          <button id="download-pdf"  className="btn btn-primary btn-sm"   onClick={() => downloadFormat('pdf')}>
            ⬇ PDF
          </button>
          <Link to="/dashboard" className="btn btn-ghost btn-sm">← Dashboard</Link>
        </div>
      </nav>

      <main
        className="container container-md page-enter"
        style={{ padding: '2rem 1.5rem' }}
      >
        {/* Page header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.625rem', marginBottom: '0.3rem' }}>
            {notes.title || 'Structured Notes'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-subtle)' }}>
            📁 {data.filename}
            {data.word_count ? ` · ${data.word_count.toLocaleString()} words` : ''}
          </p>
        </div>

        {/* Language stats */}
        {Object.keys(stats).length > 0 && (
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1.25rem', alignItems:'center' }}>
            <span style={{ fontSize:'0.8125rem', color:'var(--text-subtle)' }}>Languages detected:</span>
            {Object.entries(stats).map(([lang, count]) => (
              <span key={lang} className={`lang-tag lang-${lang}`}>
                {LANG_LABELS[lang] || lang} ({count})
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="tabs" role="tablist">
          {[
            { key: 'notes',      label: '📄 Structured Notes' },
            { key: 'transcript', label: '🗣️ Transcripts'      },
          ].map(tab => (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Structured notes tab ─────────────────────────── */}
        {activeTab === 'notes' && (
          <div>
            {/* Download bar */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.5rem', marginBottom:'0.875rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={copyNotes}>{copied ? '✓ Copied!' : '📋 Copy text'}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => downloadFormat('txt')}>⬇ Download TXT</button>
              <button className="btn btn-secondary btn-sm" onClick={() => downloadFormat('docx')}>⬇ Download DOCX</button>
              <button className="btn btn-primary btn-sm"   onClick={() => downloadFormat('pdf')}>⬇ Download PDF</button>
            </div>
            <StructuredNotesView notes={notes} />
          </div>
        )}

        {/* ── Transcript tab ───────────────────────────────── */}
        {activeTab === 'transcript' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
            {!data.transcriptions?.length ? (
              <div className="empty-state card">
                <span className="empty-icon">📭</span>
                <p>No chunk transcriptions found.</p>
              </div>
            ) : data.transcriptions.map((t, idx) => (
              <div
                key={idx}
                id={`chunk-${t.chunk_index}`}
                className="card"
                style={{ padding:'1.25rem' }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                  <span style={{ fontWeight:700, fontSize:'0.8125rem', color:'var(--text-muted)' }}>
                    Chunk #{t.chunk_index + 1}
                    {t.start != null && t.end != null
                      ? ` · ${t.start.toFixed(1)}s – ${t.end.toFixed(1)}s`
                      : ''}
                  </span>
                  <span className={`lang-tag lang-${t.detected_language || 'unknown'}`}>
                    {LANG_LABELS[t.detected_language] || t.detected_language || 'Unknown'}
                  </span>
                </div>

                {/* Original text (non-English) */}
                {t.raw_text && t.raw_text !== t.translated_text && (
                  <div style={{ marginBottom:'0.75rem' }}>
                    <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase',
                                  letterSpacing:'0.05em', color:'var(--text-subtle)', marginBottom:'0.3rem' }}>
                      Original ({LANG_LABELS[t.detected_language] || t.detected_language})
                    </div>
                    <p style={{
                      background:'var(--warning-bg)', border:'1px solid var(--brand-border)',
                      borderRadius:'var(--radius-sm)', padding:'0.75rem',
                      fontSize:'0.9rem', margin:0, lineHeight:1.7,
                    }}>
                      {t.raw_text}
                    </p>
                  </div>
                )}

                {/* English translation */}
                <div>
                  <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase',
                                letterSpacing:'0.05em', color:'var(--text-subtle)', marginBottom:'0.3rem' }}>
                    English {t.detected_language !== 'en' && t.raw_text !== t.translated_text ? '(Translated)' : ''}
                  </div>
                  <p style={{
                    background:'var(--success-bg)', border:'1px solid var(--success-border)',
                    borderRadius:'var(--radius-sm)', padding:'0.75rem',
                    fontSize:'0.9rem', margin:0, lineHeight:1.7, color:'var(--text-primary)',
                  }}>
                    {t.translated_text || t.raw_text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom action row */}
        <div
          style={{
            marginTop: '2rem',
            padding: '1.125rem 1.5rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontWeight:600, fontSize:'0.9375rem' }}>🎓 AudioNotes AI</div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-subtle)', marginTop:'0.1rem' }}>
              Multilingual lecture audio → structured notes
            </div>
          </div>
          <div style={{ display:'flex', gap:'0.625rem' }}>
            <Link to="/upload" className="btn btn-secondary btn-sm">+ New Upload</Link>
            <button className="btn btn-primary btn-sm" onClick={() => downloadFormat('pdf')}>
              ⬇ Download PDF
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
