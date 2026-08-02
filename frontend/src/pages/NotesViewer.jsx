// frontend/src/pages/NotesViewer.jsx
// Unified Obsidian Wave design — one consistent theme across all panels
// Logic/API calls are completely unchanged
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import AgentChatPanel from '../components/AgentChatPanel';
import api from '../api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const LANG_LABELS = { en: 'English', kn: 'Kannada', hi: 'Hindi', unknown: 'Unknown', other: 'Other' };

// ── Strip markdown symbols ───────────────────────────────────
function stripMd(text = '') {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[\s]*[-*+]\s+/gm, '• ')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .trim();
}

// ── Smart summary / paragraph formatter ─────────────────────
function FormattedText({ text = '' }) {
  if (!text) return null;

  // Split into lines, group consecutive bullets together
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const blocks = [];
  let bulletGroup = [];

  const flushBullets = () => {
    if (bulletGroup.length) {
      blocks.push({ type: 'bullets', items: [...bulletGroup] });
      bulletGroup = [];
    }
  };

  for (const line of rawLines) {
    const isBullet = /^[•\-*]\s+/.test(line);
    if (isBullet) {
      bulletGroup.push(line.replace(/^[•\-*]\s+/, ''));
    } else {
      flushBullets();
      blocks.push({ type: 'para', text: line });
    }
  }
  flushBullets();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {blocks.map((block, i) => {
        if (block.type === 'bullets') {
          return (
            <ul key={i} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {block.items.map((item, j) => (
                <li key={j} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0, marginTop: '0.6rem' }} />
                  <span style={{ fontSize: '0.9375rem', lineHeight: 1.8, color: 'var(--text-secondary)' }}>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.85, color: 'var(--text-secondary)' }}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}


// ── Section label with accent bar ───────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: 'var(--brand)',
      marginBottom: '0.875rem', fontFamily: 'JetBrains Mono, monospace',
    }}>
      <span style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--gradient-primary)', display: 'inline-block', flexShrink: 0 }} />
      {children}
    </div>
  );
}

// ── Panel wrapper — unified glass card ───────────────────────
function Panel({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-glass)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '1.5rem',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      marginBottom: '1.25rem',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Collapsible section ──────────────────────────────────────
function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      borderTop: '1px solid var(--glass-border)',
      paddingTop: '1rem', marginTop: '1rem',
    }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '0.25rem 0', textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--text-muted)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>{title}</span>
        <span style={{
          fontSize: '0.75rem', color: 'var(--text-subtle)',
          display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }}>▾</span>
      </button>
      {open && <div style={{ marginTop: '0.875rem' }}>{children}</div>}
    </div>
  );
}

// ── Sidebar nav button ───────────────────────────────────────
function SideBtn({ label, active, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        width: '100%', padding: '0.5rem 0.75rem',
        borderRadius: 'var(--radius-sm)', border: 'none',
        background: active ? 'var(--brand-bg)' : 'transparent',
        color: active ? 'var(--brand)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 500,
        fontSize: '0.8125rem',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s',
        borderLeft: active ? '2px solid var(--brand)' : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {icon && <span style={{ fontSize: '0.875rem' }}>{icon}</span>}
      {label}
    </button>
  );
}

// ── Language badge ────────────────────────────────────────────
function LangBadge({ lang }) {
  const cls = {
    en: 'badge badge-done',
    kn: 'badge badge-chunking',
    hi: 'badge badge-transcribing',
    unknown: 'badge badge-uploaded',
  }[lang] || 'badge badge-uploaded';
  return <span className={cls}>{LANG_LABELS[lang] || lang}</span>;
}

// ── Main export ───────────────────────────────────────────────
const LANGUAGES = [
  { code: 'hi', name: '🇮🇳 Hindi' },
  { code: 'kn', name: '🇮🇳 Kannada' },
  { code: 'te', name: '🇮🇳 Telugu' },
  { code: 'ta', name: '🇮🇳 Tamil' },
];

export default function NotesViewer() {
  const { jobId } = useParams();
  const [data, setData] = useState(null);
  const [transcriptions, setTranscriptions] = useState(null);
  const [loadingTr, setLoadingTr] = useState(false);
  const [polishedTranscript, setPolishedTranscript] = useState('');
  const [rawTranscript, setRawTranscript] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState('notes');
  const [targetLang, setTargetLang] = useState('hi');
  const [translating, setTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const translateAbortRef = useRef(null);
  const translateEndRef = useRef(null);
  const [shareData, setShareData] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareExpiry, setShareExpiry] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [sumLevel, setSumLevel] = useState('standard');
  const [sumLoading, setSumLoading] = useState(false);
  const [sumText, setSumText] = useState('');

  // ── All original logic untouched ─────────────────────────
  useEffect(() => {
    api.get(`/audio/${jobId}/notes`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(e => { setError(e.response?.data?.detail || 'Failed to load notes.'); setLoading(false); });
  }, [jobId]);

  useEffect(() => {
    if (activeView === 'translate' && translating) {
      translateEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [translatedText, activeView, translating]);

  const handleTranscriptView = useCallback(() => {
    setActiveView('transcript');
    if (transcriptions !== null) return;
    setLoadingTr(true);
    api.get(`/audio/${jobId}/polished-transcript`)
      .then(r => {
        setPolishedTranscript(r.data.polished_transcript || '');
        setRawTranscript(r.data.raw_transcript || '');
      })
      .catch(() => { setPolishedTranscript(''); setRawTranscript(''); });
    api.get(`/audio/${jobId}/transcripts`)
      .then(r => { setTranscriptions(r.data.transcriptions || []); setLoadingTr(false); })
      .catch(() => { setTranscriptions([]); setLoadingTr(false); });
  }, [jobId, transcriptions]);

  const downloadFormat = (fmt) => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/audio/${jobId}/download?format=${fmt}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `lecture_notes_${jobId}.${fmt}`; a.click();
        URL.revokeObjectURL(a.href);
      }).catch(() => alert('Download failed.'));
  };

  const copyNotes = () => {
    navigator.clipboard.writeText(data?.notes_text || '').then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const langStats = () => {
    if (!transcriptions?.length) return {};
    const c = {};
    transcriptions.forEach(t => { const l = t.detected_language || 'unknown'; c[l] = (c[l] || 0) + 1; });
    return c;
  };

  const handleTranslate = async () => {
    setTranslating(true); setTranslatedText('');
    const controller = new AbortController();
    translateAbortRef.current = controller;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/notes/${jobId}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target_lang: targetLang }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const detail = errData.detail || `Error ${res.status}`;
        if (detail.includes('Ollama') || detail.includes('unavailable')) {
          setTranslatedText('⚠️ Translation service unavailable.\n\nThe translator uses Ollama (local AI).\nFix: Run  ollama serve  in a terminal, then try again.');
        } else {
          setTranslatedText('⚠️ ' + detail);
        }
        return;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try { const d = JSON.parse(line.slice(6)); if (d.chunk) setTranslatedText(p => p + d.chunk); } catch (_) { }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      setTranslatedText('⚠️ Translation failed: ' + e.message);
    } finally {
      setTranslating(false);
      translateAbortRef.current = null;
    }
  };

  const handleStopTranslation = () => {
    if (translateAbortRef.current) translateAbortRef.current.abort();
  };

  const handleShare = async () => {
    setSharing(true);
    try { const r = await api.post(`/notes/${jobId}/share`, { expires_hours: shareExpiry ? parseInt(shareExpiry) : null }); setShareData(r.data); }
    catch (e) { alert(e.response?.data?.detail || 'Failed to create share link.'); }
    finally { setSharing(false); }
  };

  const copyShareUrl = () => {
    if (shareData?.share_url) { navigator.clipboard.writeText(shareData.share_url); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }
  };

  const openEditor = () => { setEditText(data?.notes_text || ''); setEditSaved(false); };

  const saveEdit = async () => {
    setSavingEdit(true);
    try { await api.patch(`/notes/${jobId}/edit`, { edited_text: editText }); setEditSaved(true); setTimeout(() => setEditSaved(false), 2000); }
    catch (_) { alert('Save failed.'); }
    finally { setSavingEdit(false); }
  };

  const handleSummarize = async () => {
    setSumLoading(true); setSumText('');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/agent/${jobId}/summarize?level=${sumLevel}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try { const d = JSON.parse(line.slice(6)); if (d.chunk) setSumText(p => p + d.chunk); } catch (_) { }
        }
      }
    } catch (e) { setSumText('Error: ' + e.message); }
    finally { setSumLoading(false); }
  };

  const handleSideClick = (key) => {
    if (key === 'transcript') { handleTranscriptView(); return; }
    if (key === 'pdf') { downloadFormat('pdf'); return; }
    if (key === 'edit' && editText === '') openEditor();
    setActiveView(key);
  };

  // ── Loading / error states ─────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <p style={{ color: 'var(--text-muted)' }}>Loading your notes…</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: 460, textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ marginBottom: '0.625rem' }}>Could not load notes</h2>
        <p style={{ marginBottom: '1.5rem' }}>{error}</p>
        <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
      </div>
    </div>
  );

  const stats = langStats();
  const notes = data?.notes || {};
  const fullTranscript = notes.full_transcript || null;
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const sideItems = [
    { key: 'notes', label: 'Notes' },
    { key: 'transcript', label: 'Transcript' },
    { key: 'translate', label: 'Translate' },
    { key: 'edit', label: 'Edit' },
    { key: 'share', label: 'Share' },
    { key: 'ai', label: 'AI Chat' },
    { key: 'summary', label: 'AI Summary' },
    { key: 'pdf', label: 'Export PDF' },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-page)' }}>
      <style>{`
        @keyframes nvFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .nv-panel { animation: nvFadeIn 0.22s ease forwards; }
        @keyframes nvPulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      `}</style>

      {/* Shared Navbar — has theme toggle built-in */}
      <Navbar />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── SIDEBAR ───────────────────────────────────────── */}
        <aside style={{
          width: 168, flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--glass-border)',
          display: 'flex', flexDirection: 'column',
          padding: '0.75rem 0.625rem',
          gap: '0.125rem',
          overflowY: 'auto',
        }}>
          {/* Back link */}
          <Link to="/dashboard" style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)',
            textDecoration: 'none', color: 'var(--text-muted)',
            fontSize: '0.8125rem', fontWeight: 500,
            marginBottom: '0.5rem',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--brand)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            ← Dashboard
          </Link>

          <div style={{ height: 1, background: 'var(--glass-border)', margin: '0 0.25rem 0.5rem' }} />

          {/* File name */}
          <div style={{
            padding: '0.375rem 0.75rem',
            fontSize: '0.7rem', color: 'var(--text-subtle)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'JetBrains Mono, monospace',
          }} title={data?.filename}>
            {data?.filename || 'Notes'}
          </div>

          <div style={{ height: 1, background: 'var(--glass-border)', margin: '0.25rem 0.25rem 0.5rem' }} />

          {sideItems.map(item => (
            <SideBtn
              key={item.key}
              label={item.label}
              icon={item.icon}
              active={activeView === item.key}
              onClick={() => handleSideClick(item.key)}
            />
          ))}

          <div style={{ flex: 1 }} />

          {/* Word count */}
          {data?.word_count > 0 && (
            <div style={{
              padding: '0.5rem 0.75rem', borderTop: '1px solid var(--glass-border)',
              fontSize: '0.7rem', color: 'var(--text-subtle)',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {data.word_count.toLocaleString()} words
            </div>
          )}
        </aside>

        {/* ── CONTENT AREA ─────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          <div style={{
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex', alignItems: 'center',
            padding: '0 1.25rem', gap: '0.75rem',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {sideItems.find(s => s.key === activeView)?.icon} {sideItems.find(s => s.key === activeView)?.label}
            </span>
            <div style={{ flex: 1 }} />
            {activeView === 'notes' && (
              <>
                <button onClick={copyNotes} className="btn btn-ghost btn-sm">
                  {copied ? '✓ Copied' : 'Copy Notes'}
                </button>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  {['txt', 'docx', 'pdf'].map(fmt => (
                    <button key={fmt} onClick={() => downloadFormat(fmt)} className="btn btn-ghost btn-sm"
                      style={{ textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.04em', padding: '0.3rem 0.625rem' }}>
                      {fmt}
                    </button>
                  ))}
                </div>
              </>
            )}
            <Link to="/upload" className="btn btn-primary btn-sm">+ New Upload</Link>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
            <div style={{ maxWidth: 800, margin: '0 auto' }}>

              {/* ══ NOTES VIEW ══════════════════════════════════ */}
              {activeView === 'notes' && (
                <div className="nv-panel">
                  {/* Page header */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem',
                    }}>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em',
                        color: 'var(--brand)', textTransform: 'uppercase',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}>Lecture Notes</span>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span className="badge badge-structuring">AI Structured</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{today}</span>
                      </div>
                    </div>
                    <h1 style={{
                      fontFamily: 'Geist, sans-serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                      fontWeight: 800, letterSpacing: '-0.025em',
                      color: 'var(--text-primary)', margin: '0 0 0.75rem',
                    }}>
                      {notes.title || 'Lecture Notes'}
                    </h1>
                    <div style={{
                      display: 'flex', gap: '1rem', fontSize: '0.8125rem',
                      color: 'var(--text-muted)', paddingBottom: '1.25rem',
                      borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap',
                    }}>
                      <span>{data.filename}</span>
                      {data.word_count > 0 && <span>{data.word_count.toLocaleString()} words</span>}
                      {notes.sections?.length > 0 && <span>{notes.sections.length} sections</span>}
                    </div>
                  </div>

                  {/* Overview / Summary */}
                  {notes.summary && (
                    <Panel style={{ borderLeft: '3px solid var(--brand)', marginBottom: '1.5rem' }}>
                      <SectionLabel>Overview</SectionLabel>
                      <FormattedText text={notes.summary} />
                    </Panel>
                  )}


                  {/* Key Concepts */}
                  {notes.key_points?.length > 0 && (
                    <Panel>
                      <Collapsible title={`Key Takeaways (${notes.key_points.length})`} defaultOpen>
                        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {notes.key_points.map((pt, i) => (
                            <li key={i} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                              <span style={{
                                flexShrink: 0, width: 22, height: 22,
                                background: 'var(--gradient-primary)', color: '#fff',
                                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.65rem', fontWeight: 700, marginTop: '0.1rem',
                                fontFamily: 'JetBrains Mono, monospace',
                              }}>{i + 1}</span>
                              <span style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                                {stripMd(pt)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </Collapsible>
                    </Panel>
                  )}

                </div>
              )}

              {/* ══ TRANSCRIPT VIEW ═════════════════════════════ */}
              {activeView === 'transcript' && (
                <div className="nv-panel">
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Transcript</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>Polished + raw transcripts and chunk-by-chunk analysis</p>
                  </div>

                  {polishedTranscript && (
                    <Panel style={{ borderLeft: '3px solid var(--success)' }}>
                      <SectionLabel>✓ Original Text (Polished)</SectionLabel>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.875rem', lineHeight: 1.5 }}>
                        Grammar fixed · Repeated words removed · Full content preserved
                      </p>
                      <p style={{ fontSize: '0.9375rem', lineHeight: 1.85, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                        {polishedTranscript}
                      </p>
                    </Panel>
                  )}

                  {rawTranscript && (
                    <Panel>
                      <Collapsible title="Raw Transcript">
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
                          Original unpolished transcription from audio
                        </p>
                        <p style={{ fontSize: '0.875rem', lineHeight: 1.75, color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-wrap', maxHeight: 250, overflowY: 'auto' }}>
                          {rawTranscript}
                        </p>
                      </Collapsible>
                    </Panel>
                  )}

                  <Panel>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <SectionLabel>Chunk-by-Chunk Analysis</SectionLabel>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Per-segment transcription output</p>
                      </div>
                      {Object.keys(stats).length > 0 && (
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                          {Object.entries(stats).map(([lang, count]) => (
                            <span key={lang} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <LangBadge lang={lang} />
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>×{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {loadingTr ? (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                        <p>Loading transcriptions…</p>
                      </div>
                    ) : !transcriptions?.length ? (
                      <div className="empty-state">
                        <p>No transcriptions found.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {transcriptions.map((t, idx) => (
                          <div key={idx} style={{
                            background: 'var(--bg-surface-2)',
                            borderRadius: 'var(--radius-md)',
                            padding: '1rem 1.25rem',
                            border: '1px solid var(--border-subtle)',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-subtle)', fontFamily: 'JetBrains Mono, monospace' }}>
                                CHUNK #{t.chunk_index + 1}
                              </span>
                              <LangBadge lang={t.detected_language} />
                            </div>
                            {t.raw_text && t.raw_text !== t.translated_text && (
                              <div style={{ marginBottom: '0.625rem' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 4, letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>Original</div>
                                <p style={{ fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--text-muted)', margin: 0 }}>{t.raw_text}</p>
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 4, letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>English</div>
                              <p style={{ fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>{t.translated_text || t.raw_text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </div>
              )}

              {/* ══ TRANSLATE VIEW ══════════════════════════════ */}
              {activeView === 'translate' && (
                <div className="nv-panel">
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Translate Transcript</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
                      Translate your AI summary into Hindi, Kannada, Telugu or Tamil using Google Translate.
                    </p>
                  </div>

                  <Panel>
                    <SectionLabel>Target Language</SectionLabel>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={targetLang}
                        onChange={e => setTargetLang(e.target.value)}
                        disabled={translating}
                        className="form-input"
                        style={{ flex: 1, minWidth: 180, maxWidth: 240 }}
                      >
                        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                      </select>
                      {!translating ? (
                        <button id="translate-now-btn" onClick={handleTranslate} className="btn btn-primary">
                          Translate Now
                        </button>
                      ) : (
                        <button id="stop-translate-btn" onClick={handleStopTranslation} className="btn btn-danger"
                          style={{ animation: 'nvPulse 1.5s ease-in-out infinite' }}>
                          ■ Stop Translation
                        </button>
                      )}
                      {translatedText && !translating && (
                        <button onClick={() => setTranslatedText('')} className="btn btn-ghost btn-sm">Clear</button>
                      )}
                    </div>
                  </Panel>

                  {translating && (
                    <Panel>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--brand)' }}>
                        <div className="spinner" style={{ flexShrink: 0 }} />
                        <div>
                          <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Translating your transcript…</p>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Token by token — click Stop to abort at any point</p>
                        </div>
                      </div>
                    </Panel>
                  )}

                  {translatedText && (
                    <Panel>
                      <SectionLabel>Translated Output</SectionLabel>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.85, color: 'var(--text-secondary)' }}>
                        {translatedText}
                      </div>
                      <div ref={translateEndRef} />
                    </Panel>
                  )}

                  {!translatedText && !translating && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <p>Select a language and click Translate Now to convert your transcript</p>
                    </div>
                  )}
                </div>
              )}

              {/* ══ EDIT VIEW ═══════════════════════════════════ */}
              {activeView === 'edit' && (
                <div className="nv-panel" style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <h2 style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Edit Notes</h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>Make changes to your lecture notes. Changes are saved to your account.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <button onClick={() => setEditText(data?.notes_text || '')} className="btn btn-ghost btn-sm">Reset</button>
                      <button onClick={saveEdit} disabled={savingEdit} className="btn btn-primary btn-sm">
                        {editSaved ? '✓ Saved!' : savingEdit ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="form-input"
                    style={{
                      flex: 1, resize: 'none',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.875rem', lineHeight: 1.8,
                      minHeight: 400,
                    }}
                    placeholder="Your notes will appear here for editing…"
                  />
                </div>
              )}

              {/* ══ SHARE VIEW ══════════════════════════════════ */}
              {activeView === 'share' && (
                <div className="nv-panel" style={{ maxWidth: 560, margin: '0 auto' }}>
                  <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: 'var(--radius-md)',
                      background: 'var(--brand-bg)', border: '1px solid var(--brand-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 0.875rem',
                      fontFamily: 'Geist, sans-serif', fontWeight: 700, fontSize: '0.9rem',
                      color: 'var(--brand)', letterSpacing: '-0.02em',
                    }}>Link</div>
                    <h2 style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Share Notes</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Generate a public link to share these lecture notes</p>
                  </div>

                  <Panel>
                    {!shareData ? (
                      <>
                        <div className="form-group">
                          <label className="form-label">Link Expiry</label>
                          <select
                            value={shareExpiry}
                            onChange={e => setShareExpiry(e.target.value)}
                            className="form-input"
                          >
                            <option value="">Never expires</option>
                            <option value="24">Expires in 24 hours</option>
                            <option value="72">Expires in 3 days</option>
                            <option value="168">Expires in 1 week</option>
                          </select>
                        </div>
                        <button onClick={handleShare} disabled={sharing} className="btn btn-primary btn-full btn-lg">
                          {sharing ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Generating…</> : 'Generate Share Link'}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>✓ Share link created!</div>
                        <div className="form-group">
                          <label className="form-label">Your Share Link</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input readOnly value={shareData.share_url} className="form-input" style={{ flex: 1 }} />
                            <button onClick={copyShareUrl} className="btn btn-primary" style={{ flexShrink: 0 }}>
                              {shareCopied ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                        <button onClick={() => setShareData(null)} className="btn btn-ghost btn-sm">Generate new link</button>
                      </>
                    )}
                  </Panel>
                </div>
              )}

              {/* ══ AI CHAT VIEW ════════════════════════════════ */}
              {activeView === 'ai' && (
                <div className="nv-panel" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                  <AgentChatPanel jobId={jobId} />
                </div>
              )}

              {/* ══ AI SUMMARY VIEW ═════════════════════════════ */}
              {activeView === 'summary' && (
                <div className="nv-panel">
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>AI Summary</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>Generate intelligent summaries at different detail levels</p>
                  </div>

                  <Panel>
                    <SectionLabel>Summary Level</SectionLabel>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                      {['brief', 'standard', 'detailed'].map(lvl => (
                        <button key={lvl} onClick={() => setSumLevel(lvl)}
                          className={`btn btn-sm ${sumLevel === lvl ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ textTransform: 'capitalize' }}>
                          {lvl}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <button onClick={handleSummarize} disabled={sumLoading} className="btn btn-primary">
                        {sumLoading ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Generating…</> : 'Generate Summary'}
                      </button>
                      {sumText && <button onClick={() => setSumText('')} className="btn btn-ghost btn-sm">Clear</button>}
                    </div>
                  </Panel>

                  {sumLoading && (
                    <Panel>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--brand)' }}>
                        <div className="spinner" style={{ flexShrink: 0 }} />
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Generating summary…</p>
                      </div>
                    </Panel>
                  )}

                  {sumText && (
                    <Panel>
                      <SectionLabel>Generated Summary</SectionLabel>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.85, color: 'var(--text-secondary)' }}>
                        {sumText}
                      </div>
                    </Panel>
                  )}

                  {!sumText && !sumLoading && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <p>Choose a summary level and click Generate to create an AI-powered summary</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}