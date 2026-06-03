// frontend/src/pages/NotesViewer.jsx
// Old layout restored — blue theme applied
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import AgentChatPanel from '../components/AgentChatPanel';
import api from '../api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const LANG_LABELS = { en: 'English', kn: 'Kannada', hi: 'Hindi', unknown: 'Unknown', other: 'Other' };

// ── Strip markdown symbols from AI-generated text ────────────
function stripMd(text = '') {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[\s]*[-*+]\s+/gm, '• ')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .trim();
}

// ── Render a block of text with indentation for sub-bullets ─
function NotesParagraph({ text }) {
  if (!text) return null;
  const lines = text.split('\n').filter(l => l.trim());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {lines.map((line, i) => {
        const clean = stripMd(line);
        const isBullet = clean.startsWith('•');
        const isNum = /^\d+[.)]\s/.test(clean);
        const isSubBullet = /^\s{2,}/.test(line) || /^[a-z]\.\s/.test(clean);
        return (
          <p key={i} style={{
            margin: 0,
            paddingLeft: isBullet || isNum ? '1.25rem' : isSubBullet ? '2rem' : 0,
            fontSize: isBullet || isNum || isSubBullet ? '0.9rem' : '0.9375rem',
            lineHeight: 1.75,
            color: '#374151',
            textIndent: isBullet ? '-1.1rem' : isNum ? '-1.1rem' : 0,
          }}>
            {clean}
          </p>
        );
      })}
    </div>
  );
}

// ── Collapsible section ──────────────────────────────────────
function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderTop: '1px solid #E5E7EB', paddingTop: '1rem', marginTop: '1rem' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '0.25rem 0', textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: '0.6875rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9CA3AF',
        }}>{title}</span>
        <span style={{
          fontSize: '0.75rem', color: '#9CA3AF',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }}>▾</span>
      </button>
      {open && <div style={{ marginTop: '0.75rem' }}>{children}</div>}
    </section>
  );
}

// ── Main notes renderer ──────────────────────────────────────
function StructuredNotesView({ notes, filename, wordCount, fullTranscript }) {
  if (!notes || !notes.key_points) {
    return (
      <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#374151' }}>
        {typeof notes === 'string' ? notes : 'No structured data.'}
      </pre>
    );
  }

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", color: '#1F2937', lineHeight: 1.75 }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '2px solid #1F2937' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9CA3AF' }}>
            Lecture Notes
          </span>
          <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{today}</span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.25, marginBottom: '0.4rem', color: '#111827' }}>
          {notes.title || 'Lecture Notes'}
        </h1>
        <div style={{ fontSize: '0.8125rem', color: '#6B7280', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          <span>📁 {filename}</span>
          {wordCount > 0 && <span>📝 {wordCount.toLocaleString()} words</span>}
        </div>
      </div>

      {/* ── Overview — ALWAYS FULLY VISIBLE ─────────────── */}
      {notes.summary && (
        <section style={{ marginBottom: '1.75rem' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9CA3AF' }}>
            Overview
          </span>
          <p style={{ fontSize: '1rem', lineHeight: 1.85, color: '#374151', marginTop: '0.5rem' }}>
            {notes.summary}
          </p>
        </section>
      )}

      {/* ── Sections ─────────────────────────────────────── */}
      {notes.sections?.map((sec, idx) => (
        <section key={idx} style={{ marginBottom: '1.75rem', borderTop: '1px solid #E5E7EB', paddingTop: '1rem' }}>
          <h3 style={{
            fontSize: '1rem', fontWeight: 700, color: '#111827',
            marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: 6,
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: 800, color: '#2563EB', flexShrink: 0,
            }}>
              {idx + 1}
            </span>
            {sec.heading}
          </h3>
          <NotesParagraph text={sec.content} />
        </section>
      ))}

      {/* ── Key Concepts — COLLAPSIBLE ────────────────────── */}
      {notes.key_points?.length > 0 && (
        <Collapsible title={`Key Concepts (${notes.key_points.length})`}>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {notes.key_points.map((pt, idx) => (
              <li key={idx} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, minWidth: 22, height: 22,
                  background: '#2563EB', color: '#fff',
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 700, marginTop: '0.15rem',
                }}>{idx + 1}</span>
                <span style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#374151' }}>
                  {stripMd(pt)}
                </span>
              </li>
            ))}
          </ol>
        </Collapsible>
      )}

      {/* ── Full Transcript — COLLAPSIBLE ─────────────────── */}
      {fullTranscript && (
        <Collapsible title="Full Transcript (English)">
          <p style={{ fontSize: '0.875rem', lineHeight: 1.85, color: '#6B7280', whiteSpace: 'pre-wrap', margin: 0 }}>
            {fullTranscript}
          </p>
        </Collapsible>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
const LANGUAGES = [
  { code: 'hi', name: '🇮🇳 Hindi' },
  { code: 'kn', name: '🇮🇳 Kannada' },
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
    
    // Fetch polished and raw transcripts
    api.get(`/audio/${jobId}/polished-transcript`)
      .then(r => {
        setPolishedTranscript(r.data.polished_transcript || '');
        setRawTranscript(r.data.raw_transcript || '');
      })
      .catch(() => {
        setPolishedTranscript('');
        setRawTranscript('');
      });
    
    // Fetch per-chunk transcriptions
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
          setTranslatedText(
            '\u26a0\ufe0f Translation service unavailable.\n\n' +
            'The translator uses Ollama (local AI).\n' +
            'Fix: Run  ollama serve  in a terminal, then try again.'
          );
        } else {
          setTranslatedText('\u26a0\ufe0f ' + detail);
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
          try {
            const d = JSON.parse(line.slice(6));
            if (d.chunk) setTranslatedText(p => p + d.chunk);
          } catch (_) { }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        // User stopped — keep whatever was streamed, just stop
        return;
      }
      setTranslatedText('\u26a0\ufe0f Translation failed: ' + e.message);
    } finally {
      setTranslating(false);
      translateAbortRef.current = null;
    }
  };

  const handleStopTranslation = () => {
    if (translateAbortRef.current) {
      translateAbortRef.current.abort();
    }
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
  if (loading) return (<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto 1rem' }} /><p>Loading your notes...</p></div></div>);
  if (error) return (<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}><div className="card" style={{ maxWidth: 460, textAlign: 'center', width: '100%' }}><div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>!</div><h2 style={{ marginBottom: '0.625rem' }}>Could not load notes</h2><p style={{ marginBottom: '1.5rem' }}>{error}</p><Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link></div></div>);

  const stats = langStats();
  const notes = data?.notes || {};
  const fullTranscript = notes.full_transcript || null;
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // SVG icons
  const Ic = ({ d, w = 16 }) => <svg width={w} height={w} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d={d} /></svg>;
  const SvgWave = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5"><path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 7v10M22 12h-2" /></svg>;
  const SvgDoc = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>;

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

  const handleSideClick = (key) => {
    if (key === 'transcript') { handleTranscriptView(); return; }
    if (key === 'pdf') { downloadFormat('pdf'); return; }
    if (key === 'edit' && editText === '') openEditor();
    setActiveView(key);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .si{display:flex;align-items:center;gap:10px;width:100%;padding:9px 14px;border-radius:8px;border:none;background:transparent;cursor:pointer;font-size:0.875rem;font-weight:500;color:#4B5563;transition:all 0.13s;text-align:left;box-sizing:border-box;}
        .si:hover{background:#F3F4F6;color:#111827;}
        .si.act{background:#EFF6FF;color:#2563EB;font-weight:700;}
      `}</style>

      {/* TOP BAR */}
      <header style={{ height: 52, background: '#fff', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', padding: '0 1.25rem', gap: '1rem', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '1rem', color: '#111827' }}><SvgWave />AudioNotes AI</div>
        <div style={{ width: 1, height: 20, background: '#E5E7EB' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 10px', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
          <SvgDoc />{data?.filename || 'Notes'}
        </div>
        {data?.word_count > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#6B7280' }}><SvgDoc />{data.word_count.toLocaleString()} words</span>}
        <div style={{ flex: 1 }} />
        <button onClick={copyNotes} style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #E5E7EB', background: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>{copied ? 'Copied!' : 'Copy Notes'}</button>
        <Link to="/upload" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2563EB', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}>New Upload</Link>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* SIDEBAR */}
        <aside style={{ width: 140, flexShrink: 0, background: '#fff', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', padding: '12px 8px', gap: 2, overflowY: 'auto' }}>
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, textDecoration: 'none', color: '#6B7280', fontSize: '0.875rem', fontWeight: 500, marginBottom: 8, boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Back
          </Link>
          <div style={{ height: 1, background: '#E5E7EB', margin: '0 4px 8px' }} />
          {sideItems.map(item => (
            <button key={item.key} className={`si${activeView === item.key ? ' act' : ''}`} onClick={() => handleSideClick(item.key)}>
              {item.label}
            </button>
          ))}
        </aside>

        {/* CONTENT AREA — each view is a distinct full frame */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {/* ── NOTES VIEW ─── white document card */}
          {activeView === 'notes' && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '28px 32px', background: '#F4F5F7', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ maxWidth: 780, margin: '0 auto', background: '#fff', borderRadius: 14, padding: '44px 52px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #E5E7EB' }}>

                {/* ── Header ──────────────────────────────────────── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', color: '#2563EB', textTransform: 'uppercase' }}>Lecture Notes</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE' }}>LED summariser</span>
                    <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{today}</span>
                  </div>
                </div>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', lineHeight: 1.25, margin: '0 0 0.875rem' }}>{notes.title || 'Lecture Notes'}</h1>
                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8125rem', color: '#6B7280', paddingBottom: '1.25rem', borderBottom: '2px solid #EFF6FF', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><SvgDoc />{data.filename}</span>
                  {data.word_count > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><SvgDoc />{data.word_count.toLocaleString()} words</span>}
                  {notes.sections?.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>📑 {notes.sections.length} sections</span>}
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
                {fullTranscript && (
                  <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
                    <details>
                      <summary style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#9CA3AF', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '0.75rem' }}>Raw Transcript</summary>
                      <p style={{ fontSize: '0.875rem', lineHeight: 1.85, color: '#6B7280', whiteSpace: 'pre-wrap', margin: 0 }}>{fullTranscript}</p>
                    </details>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TRANSCRIPT VIEW ─── dark slate cards */}
          {activeView === 'transcript' && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '24px 28px', background: '#1E293B', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ maxWidth: 760, margin: '0 auto' }}>
                
                {/* ── POLISHED TRANSCRIPT (ORIGINAL TEXT) ──────────── */}
                {polishedTranscript && (
                  <div style={{ marginBottom: '2rem' }}>
                    <div style={{ background: '#0F4C3A', borderRadius: 12, padding: '1.5rem', border: '2px solid #10B981', boxShadow: '0 4px 16px rgba(16,185,129,0.15)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>✓</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#D1FAE5' }}>Original Text (Polished)</div>
                          <p style={{ color: '#86EFAC', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Grammar fixed • Repeated words removed • Full content preserved</p>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.9375rem', lineHeight: 1.85, color: '#D1FAE5', margin: 0, whiteSpace: 'pre-wrap' }}>
                        {polishedTranscript}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── RAW TRANSCRIPT ────────────────────────────────── */}
                {rawTranscript && (
                  <div style={{ marginBottom: '2rem' }}>
                    <div style={{ background: '#0F2239', borderRadius: 12, padding: '1.5rem', border: '1px solid #334155' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '1rem' }}>📝</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#CBD5E1' }}>Raw Transcript</div>
                          <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>Original unpolished transcription from audio</p>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.875rem', lineHeight: 1.75, color: '#94A3B8', margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                        {rawTranscript}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── PER-CHUNK TRANSCRIPTIONS ──────────────────────── */}
                <div style={{ marginTop: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div><h2 style={{ color: '#F1F5F9', fontWeight: 800, fontSize: '1.1rem', margin: '0 0 4px' }}>Detailed Chunk Analysis</h2><p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: 0 }}>Chunk-by-chunk transcription output</p></div>
                    {Object.keys(stats).length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{Object.entries(stats).map(([lang, count]) => (<span key={lang} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#334155', color: '#94A3B8' }}>{LANG_LABELS[lang] || lang} {count}</span>))}</div>}
                  </div>
                  {loadingTr ? (<div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}><div className="spinner" style={{ margin: '0 auto 1rem' }} /><p>Loading transcriptions...</p></div>)
                    : !transcriptions?.length ? (<div style={{ textAlign: 'center', padding: '4rem', color: '#64748B', fontSize: '1rem' }}>No transcriptions found.</div>)
                      : (transcriptions.map((t, idx) => (
                        <div key={idx} style={{ background: '#263245', borderRadius: 10, padding: '1.25rem 1.5rem', marginBottom: '0.875rem', border: '1px solid #334155' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#64748B' }}>CHUNK #{t.chunk_index + 1}</span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#1E3A5F', color: '#60A5FA', border: '1px solid #1D4ED8' }}>{LANG_LABELS[t.detected_language] || t.detected_language || 'Unknown'}</span>
                          </div>
                          {t.raw_text && t.raw_text !== t.translated_text && (<div style={{ marginBottom: '0.75rem' }}><div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569', marginBottom: 4, letterSpacing: '0.08em' }}>Original</div><p style={{ fontSize: '0.875rem', lineHeight: 1.7, color: '#94A3B8', margin: 0 }}>{t.raw_text}</p></div>)}
                          <div><div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569', marginBottom: 4, letterSpacing: '0.08em' }}>English</div><p style={{ fontSize: '0.875rem', lineHeight: 1.7, color: '#CBD5E1', margin: 0 }}>{t.translated_text || t.raw_text}</p></div>
                        </div>
                      )))}
                </div>
              </div>
            </div>
          )}

          {/* ── TRANSLATE VIEW ─── blue gradient full frame */}
          {activeView === 'translate' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#EFF6FF 0%,#F0F9FF 100%)', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ padding: '28px 36px', borderBottom: '1px solid #BFDBFE', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1E3A8A', margin: '0 0 6px' }}>Translate Transcript</h2>
                <p style={{ color: '#3B82F6', fontSize: '0.875rem', margin: 0 }}>
                  Translates your full English transcript to Hindi or Kannada using local Ollama AI.
                  Requires Ollama running locally.
                </p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                  <div style={{ background: '#fff', borderRadius: 14, padding: '28px', border: '1.5px solid #BFDBFE', boxShadow: '0 2px 12px rgba(37,99,235,0.08)', marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Target Language</label>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={targetLang} onChange={e => setTargetLang(e.target.value)} disabled={translating} style={{ flex: 1, minWidth: 180, padding: '10px 14px', border: '1.5px solid #BFDBFE', borderRadius: 10, fontSize: '0.9rem', background: '#F8FAFF', outline: 'none', color: '#1E3A8A', fontWeight: 600, opacity: translating ? 0.6 : 1 }}>
                        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                      </select>
                      {!translating ? (
                        <button id="translate-now-btn" onClick={handleTranslate}
                          style={{ padding: '10px 28px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                          Translate Now
                        </button>
                      ) : (
                        <button id="stop-translate-btn" onClick={handleStopTranslation}
                          style={{
                            padding: '10px 24px', background: '#EF4444', color: '#fff', border: 'none',
                            borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(239,68,68,0.35)',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            animation: 'pulse 1.5s infinite',
                          }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                          Stop
                        </button>
                      )}
                      {translatedText && !translating && (
                        <button onClick={() => setTranslatedText('')} style={{ padding: '10px 16px', background: 'transparent', border: '1.5px solid #BFDBFE', borderRadius: 10, cursor: 'pointer', color: '#6B7280', fontWeight: 600 }}>Clear</button>
                      )}
                    </div>
                  </div>
                  {translatedText && (
                    <div style={{ background: '#fff', borderRadius: 14, padding: '28px', border: '1.5px solid #BFDBFE', boxShadow: '0 2px 12px rgba(37,99,235,0.08)' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.875rem' }}>Translated Output</div>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.85, color: '#1F2937' }}>{translatedText}</div>
                      <div ref={translateEndRef} />
                    </div>
                  )}
                  {!translatedText && !translating && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#93C5FD' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌐</div>
                      <p style={{ fontSize: '0.9rem' }}>Select a language and click Translate Now to convert your transcript</p>
                    </div>
                  )}
                  {translating && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '2.5rem', color: '#3B82F6' }}>
                      <div className="spinner" />
                      <div>
                        <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>Translating your transcript…</p>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#93C5FD' }}>Token by token — click Stop to abort at any point</p>
                      </div>
                      <button onClick={handleStopTranslation}
                        style={{ padding: '8px 20px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>
                        ■ Stop
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── EDIT VIEW ─── warm amber editor */}
          {activeView === 'edit' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FFFBF0', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ padding: '24px 36px', borderBottom: '1px solid #FDE68A', background: '#FEF3C7', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#78350F', margin: '0 0 4px' }}>Edit Notes</h2>
                <p style={{ color: '#B45309', fontSize: '0.8rem', margin: 0 }}>Make changes to your lecture notes. Changes are saved to your account.</p>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 36px', gap: '1rem', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
                  <button onClick={saveEdit} disabled={savingEdit} style={{ padding: '8px 24px', background: '#D97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem', cursor: savingEdit ? 'wait' : 'pointer', boxShadow: '0 2px 8px rgba(180,83,9,0.3)' }}>
                    {editSaved ? 'Saved!' : savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => setEditText(data?.notes_text || '')} style={{ padding: '8px 18px', background: 'transparent', border: '1.5px solid #FCD34D', borderRadius: 8, fontWeight: 600, cursor: 'pointer', color: '#92400E' }}>Reset</button>
                </div>
                <textarea value={editText} onChange={e => setEditText(e.target.value)}
                  style={{ flex: 1, padding: '1.25rem', border: '1.5px solid #FDE68A', borderRadius: 12, fontSize: '0.9rem', lineHeight: 1.8, fontFamily: "'Inter','Segoe UI',sans-serif", resize: 'none', outline: 'none', background: '#fff', color: '#1F2937', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.04)' }}
                  placeholder="Your notes will appear here for editing..." />
              </div>
            </div>
          )}

          {/* ── SHARE VIEW ─── green themed link generator */}
          {activeView === 'share' && (
            <div style={{ height: '100%', overflowY: 'auto', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ width: '100%', maxWidth: 560 }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2rem' }}>🔗</div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#064E3B', marginBottom: '0.375rem' }}>Share Notes</h2>
                  <p style={{ color: '#059669', fontSize: '0.875rem' }}>Generate a public link to share these lecture notes</p>
                </div>
                <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', border: '1.5px solid #A7F3D0', boxShadow: '0 2px 12px rgba(5,150,105,0.08)' }}>
                  {!shareData ? (
                    <>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#065F46', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Link Expiry</label>
                      <select value={shareExpiry} onChange={e => setShareExpiry(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #A7F3D0', borderRadius: 10, fontSize: '0.9rem', background: '#F0FDF4', marginBottom: '1rem', outline: 'none' }}>
                        <option value="">Never expires</option>
                        <option value="24">Expires in 24 hours</option>
                        <option value="72">Expires in 3 days</option>
                        <option value="168">Expires in 1 week</option>
                      </select>
                      <button onClick={handleShare} disabled={sharing} style={{ width: '100%', padding: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: sharing ? 'wait' : 'pointer', boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}>
                        {sharing ? 'Generating link...' : 'Generate Share Link'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#065F46', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.06em' }}>Your Share Link</div>
                      <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem' }}>
                        <input readOnly value={shareData.share_url} style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #A7F3D0', borderRadius: 10, fontSize: '0.85rem', background: '#F0FDF4', outline: 'none' }} />
                        <button onClick={copyShareUrl} style={{ padding: '10px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {shareCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <button onClick={() => setShareData(null)} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'underline' }}>Generate new link</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── AI CHAT VIEW ─── full dark chat interface */}
          {activeView === 'ai' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0F172A', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #1E293B', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2563EB,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🤖</div>
                <div><div style={{ color: '#F1F5F9', fontWeight: 800, fontSize: '0.95rem' }}>AI Study Agent</div><div style={{ color: '#64748B', fontSize: '0.72rem' }}>Ask anything about this lecture</div></div>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <AgentChatPanel jobId={jobId} embedded />
              </div>
            </div>
          )}

          {/* ── AI SUMMARY VIEW ─── purple themed */}
          {activeView === 'summary' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#FAF5FF 0%,#F5F3FF 100%)', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ padding: '24px 36px', borderBottom: '1px solid #E9D5FF', background: 'rgba(139,92,246,0.06)', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4C1D95', margin: '0 0 4px' }}>AI Summary</h2>
                <p style={{ color: '#7C3AED', fontSize: '0.8rem', margin: 0 }}>Generate intelligent summaries at different detail levels</p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                  <div style={{ background: '#fff', borderRadius: 14, padding: '24px', border: '1.5px solid #E9D5FF', boxShadow: '0 2px 12px rgba(124,58,237,0.07)', marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#6D28D9', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Summary Level</label>
                    <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                      {['brief', 'standard', 'detailed'].map(lvl => (
                        <button key={lvl} onClick={() => setSumLevel(lvl)} style={{ padding: '8px 20px', borderRadius: 24, fontSize: '0.875rem', fontWeight: 600, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s', background: sumLevel === lvl ? '#7C3AED' : 'transparent', color: sumLevel === lvl ? '#fff' : '#6B7280', borderColor: sumLevel === lvl ? '#7C3AED' : '#E5E7EB' }}>
                          {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <button onClick={handleSummarize} disabled={sumLoading} style={{ padding: '10px 28px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.875rem', cursor: sumLoading ? 'wait' : 'pointer', boxShadow: '0 2px 8px rgba(124,58,237,0.3)' }}>
                        {sumLoading ? 'Generating...' : 'Generate Summary'}
                      </button>
                      {sumText && <button onClick={() => setSumText('')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '0.875rem' }}>Clear</button>}
                    </div>
                  </div>
                  {sumText && (
                    <div style={{ background: '#fff', borderRadius: 14, padding: '28px', border: '1.5px solid #E9D5FF', boxShadow: '0 2px 12px rgba(124,58,237,0.07)' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.875rem' }}>Generated Summary</div>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.85, color: '#1F2937' }}>{sumText}</div>
                    </div>
                  )}
                  {!sumText && !sumLoading && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#C4B5FD' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
                      <p style={{ fontSize: '0.9rem' }}>Choose a summary level and click Generate to create an AI-powered summary</p>
                    </div>
                  )}
                  {sumLoading && <div style={{ textAlign: 'center', padding: '3rem', color: '#7C3AED' }}><div className="spinner" style={{ margin: '0 auto 1rem' }} /><p>Generating summary...</p></div>}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}