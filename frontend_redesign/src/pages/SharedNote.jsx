// frontend/src/pages/SharedNote.jsx
// Public page — no auth required. Rendered at /shared/:token
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function stripMd(text = '') {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g,    '$1')
    .replace(/^[\s]*[-*+]\s+/gm, '• ')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .trim();
}

function NotesParagraph({ text }) {
  if (!text) return null;
  const lines = text.split('\n').filter(l => l.trim());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {lines.map((line, i) => {
        const clean    = stripMd(line);
        const isBullet = clean.startsWith('•');
        const isNum    = /^\d+[.)]\s/.test(clean);
        return (
          <p key={i} style={{
            margin: 0, paddingLeft: isBullet || isNum ? '1.25rem' : 0,
            fontSize: '0.9375rem', lineHeight: 1.8, color: '#374151',
            textIndent: isBullet || isNum ? '-1.1rem' : 0,
          }}>
            {clean}
          </p>
        );
      })}
    </div>
  );
}

export default function SharedNote() {
  const { token }             = useParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/shared/${token}`)
      .then(r => {
        if (r.status === 410) throw new Error('This share link has expired.');
        if (r.status === 404) throw new Error('Share link not found or has been revoked.');
        if (!r.ok) throw new Error('Failed to load shared note.');
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2.5px solid #E5E7EB', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
        <p style={{ color: '#6B7280' }}>Loading shared note…</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 460, textAlign: 'center', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 20, padding: '2.5rem', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ marginBottom: '0.625rem', color: '#111827' }}>Link Unavailable</h2>
        <p style={{ color: '#6B7280', marginBottom: '1.5rem' }}>{error}</p>
        <a href="/" style={{ padding: '0.6rem 1.5rem', background: '#2563EB', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none' }}>
          Go to AudioNotes AI →
        </a>
      </div>
    </div>
  );

  const notes = data.notes || {};

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      {/* Public top bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '0 1.5rem', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem' }}>🎵</div>
          AudioNotes AI
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', color: '#6B7280' }}>
          <span>👁 {data.view_count} view{data.view_count !== 1 ? 's' : ''}</span>
          <a href="/register" style={{ padding: '0.4rem 1rem', background: '#2563EB', color: '#fff', borderRadius: 8, fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}>
            Sign up free →
          </a>
        </div>
      </div>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Shared-by badge */}
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '0.625rem 1rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#1E40AF', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          🔗 Shared by <strong>{data.shared_by}</strong> via AudioNotes AI
        </div>

        {/* Notes card */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '2.5rem 3rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB' }}>
          {/* ── Header ──────────────────────────────────────── */}
          <div style={{ marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '2px solid #EFF6FF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#2563EB' }}>Shared Lecture Notes</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE' }}>LED summariser</span>
                <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{new Date(data.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
              </div>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.25, marginBottom: '0.4rem', color: '#111827' }}>
              {notes.title || data.filename?.replace(/\.[^.]+$/, '') || 'Lecture Notes'}
            </h1>
            <div style={{ fontSize: '0.8125rem', color: '#6B7280', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>📁 {data.filename}</span>
              {data.word_count > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>📝 {data.word_count?.toLocaleString()} words</span>}
              {notes.sections?.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>📑 {notes.sections.length} sections</span>}
            </div>
          </div>

          {/* ── OVERVIEW — full LED summary paragraph ──────── */}
          {notes.summary && (
            <div style={{ margin: '1.75rem 0 0', padding: '1.5rem 1.75rem', background: 'linear-gradient(135deg,#EFF6FF 0%,#F0F9FF 100%)', borderRadius: 12, border: '1px solid #BFDBFE', borderLeft: '4px solid #2563EB' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', color: '#2563EB', textTransform: 'uppercase', marginBottom: '0.75rem' }}>📋 Overview</div>
              <p style={{ fontSize: '1rem', lineHeight: 1.9, color: '#1E3A8A', margin: 0, fontWeight: 450 }}>{notes.summary}</p>
            </div>
          )}

          {/* ── SECTIONS — one card per sentence-group ──────── */}
          {notes.sections?.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', color: '#6B7280', textTransform: 'uppercase', marginBottom: '1.25rem' }}>📝 Detailed Notes</div>
              {notes.sections.map((sec, idx) => (
                <div key={idx} style={{ borderTop: idx === 0 ? 'none' : '1px solid #F3F4F6', paddingTop: idx === 0 ? 0 : '1.75rem', marginTop: idx === 0 ? 0 : '1.75rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '1.05rem', fontWeight: 800, color: '#111827', marginBottom: '0.875rem' }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: '#EFF6FF', border: '1.5px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 900, color: '#2563EB', flexShrink: 0 }}>{idx + 1}</span>
                    {sec.heading}
                  </h3>
                  {/* Definition paragraph */}
                  <p style={{ fontSize: '0.9375rem', lineHeight: 1.88, color: '#374151', margin: '0 0 1rem 0' }}>
                    {sec.definition || sec.content}
                  </p>
                  {/* Bullet key points */}
                  {sec.key_points?.length > 0 && (
                    <div style={{ background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0', padding: '0.875rem 1.125rem' }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Key Points</div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {sec.key_points.map((pt, pi) => (
                          <li key={pi} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563EB', flexShrink: 0, marginTop: '0.55rem' }} />
                            <span style={{ fontSize: '0.875rem', lineHeight: 1.75, color: '#374151' }}>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── KEY CONCEPTS overview list ───────────────────── */}
          {notes.key_points?.length > 0 && (
            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.75rem', marginTop: '1.75rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', color: '#2563EB', textTransform: 'uppercase', marginBottom: '0.875rem' }}>💡 Key Concepts</div>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {notes.key_points.map((pt, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                    <span style={{ fontSize: '0.9rem', lineHeight: 1.75, color: '#374151' }}>{pt}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ── Polished Transcript (collapsible) ─────────────────── */}
          {notes.polished_transcript && (
            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
              <details open>
                <summary style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#10B981', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '0.75rem' }}>✨ Polished Transcript</summary>
                <p style={{ fontSize: '0.875rem', lineHeight: 1.85, color: '#374151', whiteSpace: 'pre-wrap', margin: 0 }}>{notes.polished_transcript}</p>
              </details>
            </div>
          )}

          {/* ── Full Transcript (collapsible) ─────────────────── */}
          {notes.full_transcript && (
            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
              <details>
                <summary style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#9CA3AF', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '0.75rem' }}>Raw Transcript</summary>
                <p style={{ fontSize: '0.875rem', lineHeight: 1.85, color: '#6B7280', whiteSpace: 'pre-wrap', margin: 0 }}>{notes.full_transcript}</p>
              </details>
            </div>
          )}

          {/* Fallback: plain text */}
          {!notes.sections?.length && data.notes_text && (
            <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#374151' }}>
              {data.notes_text}
            </pre>
          )}
        </div>

        {/* CTA footer */}
        <div style={{ marginTop: '2rem', background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)', borderRadius: 16, padding: '2rem', color: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎵</div>
          <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Generate your own lecture notes</h3>
          <p style={{ color: '#BFDBFE', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
            Upload any audio from your class. AudioNotes AI transcribes, translates, and structures your notes automatically.
          </p>
          <a href="/register" style={{ display: 'inline-block', padding: '0.7rem 1.75rem', background: '#fff', color: '#1E40AF', borderRadius: 8, fontWeight: 700, textDecoration: 'none', fontSize: '0.9375rem' }}>
            Get Started — It's Free →
          </a>
        </div>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
