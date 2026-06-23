// frontend/src/components/AgentChatPanel.jsx
// ─────────────────────────────────────────────────────────────
// ChatGPT-style chat UI — fits inside the NotesViewer "AI Chat" panel.
// Matches the project's Obsidian Wave design system (var(--*) tokens).
// All logic (SSE streaming, voice, model switch, download) is preserved.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── SSE helper ───────────────────────────────────────────────
async function streamSSE(url, method, body, onToken, onDone, onError) {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ detail: 'Request failed' }));
      onError(e.detail || 'Request failed'); return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const p of parts) {
        if (!p.startsWith('data: ')) continue;
        try { const d = JSON.parse(p.slice(6)); if (d.chunk) onToken(d.chunk); if (d.done) onDone(); } catch (_) {}
      }
    }
    onDone();
  } catch (err) { onError(err.message || 'Network error'); }
}

// ── Voice helpers ────────────────────────────────────────────
function getBotVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  const preferred = ['Microsoft David Desktop','Microsoft Zira Desktop','Google UK English Male','Google UK English Female','Google US English'];
  for (const n of preferred) { const v = voices.find(v => v.name === n); if (v) return v; }
  return voices.find(v => v.lang?.startsWith('en')) || null;
}

// ── Markdown-lite renderer for AI responses ──────────────────
function MessageContent({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#{1,3})/)[1].length;
      const content = line.replace(/^#{1,3}\s/, '');
      elements.push(
        <div key={i} style={{
          fontWeight: 700,
          fontSize: level === 1 ? '1rem' : level === 2 ? '0.925rem' : '0.875rem',
          color: 'var(--text-primary)',
          marginTop: elements.length > 0 ? '0.75rem' : 0,
          marginBottom: '0.25rem',
        }}>{content}</div>
      );
    } else if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={{ margin: '0.25rem 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {items.map((item, j) => (
            <li key={j} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0, marginTop: '0.55rem' }} />
              <span style={{ fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}
                dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} style={{ margin: '0.25rem 0', padding: '0 0 0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}
              dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ol>
      );
      continue;
    } else if (line.trim() === '') {
      if (elements.length > 0) {
        elements.push(<div key={`sp-${i}`} style={{ height: '0.4rem' }} />);
      }
    } else {
      elements.push(
        <p key={i} style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.75, color: 'var(--text-secondary)' }}
          dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
      );
    }
    i++;
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>{elements}</div>;
}

function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, `<code style="background:var(--bg-subtle);padding:0.1rem 0.35rem;border-radius:4px;font-size:0.8rem;font-family:JetBrains Mono,monospace;color:var(--brand)">$1</code>`);
}

// ── Message bubble ────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem', gap: '0.75rem', alignItems: 'flex-end' }}>
        <div style={{
          maxWidth: '72%',
          padding: '0.75rem 1rem',
          background: 'var(--brand)',
          color: '#fff',
          borderRadius: '18px 18px 4px 18px',
          fontSize: '0.875rem',
          lineHeight: 1.65,
          boxShadow: 'var(--glow-sm)',
        }}>
          {msg.content}
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
          flexShrink: 0,
        }}>You</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1.25rem', gap: '0.75rem', alignItems: 'flex-start' }}>
      {/* AI avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--gradient-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.8rem', flexShrink: 0, boxShadow: 'var(--glow-sm)',
        color: '#fff', fontWeight: 800, fontFamily: 'Geist, sans-serif',
      }}>AI</div>

      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <div style={{
          padding: '0.875rem 1rem',
          background: 'var(--bg-glass)',
          border: '1px solid var(--glass-border)',
          borderRadius: '4px 18px 18px 18px',
          backdropFilter: 'var(--glass-blur)',
        }}>
          {msg.streaming && !msg.content && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '1.2rem' }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--brand)',
                  animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  display: 'inline-block',
                }} />
              ))}
            </div>
          )}
          {msg.content && <MessageContent text={msg.content} />}
        </div>

        {/* Copy button — only when done streaming */}
        {!msg.streaming && msg.content && (
          <button onClick={copy} style={{
            alignSelf: 'flex-start',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.7rem', color: 'var(--text-subtle)',
            padding: '0.1rem 0.25rem', borderRadius: 4,
            transition: 'color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-muted)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-subtle)'}
          >
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Download notes button ─────────────────────────────────────
function DownloadButton({ jobId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFmt, setLoadFmt] = useState('');

  const dl = async (fmt) => {
    setOpen(false); setLoading(true); setLoadFmt(fmt);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/agent/${jobId}/download-notes?format=${fmt}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Server error');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `notes.${fmt}`;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    } catch { alert('Download failed. Make sure Ollama is running.'); }
    finally { setLoading(false); setLoadFmt(''); }
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(v => !v)} disabled={loading}
        className="btn btn-ghost btn-sm"
        style={{ fontSize: '0.7rem', padding: '0.3rem 0.625rem' }}
        title="Download AI notes">
        {loading ? `⏳ ${loadFmt.toUpperCase()}…` : '↓ Notes'}
      </button>
      {open && !loading && (
        <div style={{
          position: 'absolute', bottom: '110%', right: 0,
          background: 'var(--bg-surface)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden', minWidth: 170,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 200,
        }}>
          <div style={{ padding: '0.4rem 0.875rem', fontSize: '0.65rem', color: 'var(--text-subtle)', borderBottom: '1px solid var(--glass-border)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI-generated</div>
          {['docx', 'pdf'].map(fmt => (
            <button key={fmt} onClick={() => dl(fmt)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.875rem', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{fmt === 'docx' ? '📄 Word (.docx)' : '📑 PDF (.pdf)'}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick action chips ────────────────────────────────────────
const QUICK = [
  { label: 'Summarise',    msg: 'Give me a concise summary of this lecture.' },
  { label: 'Key Concepts', msg: 'List the key concepts from this lecture.' },
  { label: 'Examples',     msg: 'Give practical examples for the main topics.' },
  { label: 'Quiz Me',      msg: 'Create 5 quiz questions from this lecture.' },
];

// ── Main component ────────────────────────────────────────────
export default function AgentChatPanel({ jobId }) {
  const [voiceMode,   setVoiceMode]   = useState(false);
  const [listening,   setListening]   = useState(false);
  const [speaking,    setSpeaking]    = useState(false);
  const [streaming,   setStreaming]   = useState(false);
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [hasSpeech,   setHasSpeech]   = useState(false);
  const [initDone,    setInitDone]    = useState(false);

  const bottomRef = useRef(null);
  const recogRef  = useRef(null);
  const inputRef  = useRef(null);
  const msgId     = useRef(0);
  const voiceLoop = useRef(false);
  const uid = () => ++msgId.current;

  // Pre-load voices
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setHasSpeech(!!SR && !!window.speechSynthesis);
    if (window.speechSynthesis) { window.speechSynthesis.getVoices(); window.speechSynthesis.addEventListener('voiceschanged', () => {}); }
  }, []);

  // Auto-init agent context
  useEffect(() => {
    if (initDone) return;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/agent/${jobId}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }).then(async res => {
      if (res.body) { const r = res.body.getReader(); while (true) { const { done } = await r.read(); if (done) break; } }
    }).catch(() => {}).finally(() => setInitDone(true));
  }, [jobId]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const speak = useCallback((text, onEnd) => {
    if (!window.speechSynthesis) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.voice = getBotVoice(); utt.rate = 0.93;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => { setSpeaking(false); onEnd?.(); };
    utt.onerror = () => { setSpeaking(false); onEnd?.(); };
    window.speechSynthesis.speak(utt);
  }, []);

  const stopAll = useCallback(() => {
    window.speechSynthesis?.cancel(); recogRef.current?.stop();
    setSpeaking(false); setListening(false); setVoiceStatus(''); voiceLoop.current = false;
  }, []);

  const sendText = useCallback((text) => {
    const msg = text.trim(); if (!msg || streaming) return;
    setInput('');
    const userId = uid(), agentId = uid();
    setMessages(prev => [...prev,
      { id: userId,  role: 'user',      content: msg, streaming: false },
      { id: agentId, role: 'assistant', content: '',  streaming: true  },
    ]);
    setStreaming(true);
    let acc = '';
    streamSSE(`${API_BASE}/agent/${jobId}/chat`, 'POST', { message: msg },
      tok => { acc += tok; setMessages(prev => prev.map(m => m.id === agentId ? { ...m, content: acc } : m)); },
      ()  => { setMessages(prev => prev.map(m => m.id === agentId ? { ...m, streaming: false } : m)); setStreaming(false); },
      err => { setMessages(prev => prev.map(m => m.id === agentId ? { ...m, content: `⚠️ ${err}`, streaming: false } : m)); setStreaming(false); }
    );
  }, [streaming, jobId]);

  const listenOnce = useCallback(() => {
    if (!voiceLoop.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    const rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.continuous = false; rec.interimResults = false;
    recogRef.current = rec; setVoiceStatus('listening'); setListening(true);
    rec.onresult = (e) => { const q = e.results[0]?.[0]?.transcript?.trim(); setListening(false); if (!q) { if (voiceLoop.current) listenOnce(); return; } setVoiceStatus('thinking'); fetchVoiceReply(q); };
    rec.onerror = () => { setListening(false); setVoiceStatus(''); };
    rec.onend   = () => setListening(false);
    rec.start();
  }, []);

  const fetchVoiceReply = useCallback((query) => {
    let acc = '';
    streamSSE(`${API_BASE}/agent/${jobId}/chat`, 'POST', { message: query },
      tok => { acc += tok; },
      ()  => { setVoiceStatus('speaking'); speak(acc, () => { setVoiceStatus(''); if (voiceLoop.current) listenOnce(); }); },
      ()  => { speak('Sorry, I could not get an answer.', () => { if (voiceLoop.current) listenOnce(); }); }
    );
  }, [jobId, speak]);

  const startVoiceMode = useCallback(() => {
    setVoiceMode(true); voiceLoop.current = true; setVoiceStatus('greeting');
    speak('How can I help you with the lecture?', () => { if (voiceLoop.current) listenOnce(); });
  }, [speak]);

  const exitVoiceMode = useCallback(() => { stopAll(); setVoiceMode(false); }, [stopAll]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(input); }
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
      background: 'var(--bg-page)',
      fontFamily: "'Inter','Segoe UI',sans-serif",
    }}>
      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes voicePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(var(--brand-rgb,102,126,234), 0.4); }
          60%     { box-shadow: 0 0 0 18px rgba(var(--brand-rgb,102,126,234), 0); }
        }
        .chat-input:focus { outline: none; border-color: var(--brand) !important; box-shadow: 0 0 0 3px var(--brand-bg) !important; }
        .quick-chip:hover  { background: var(--brand-bg) !important; color: var(--brand) !important; border-color: var(--brand-border) !important; }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.25rem 0.5rem',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', fontWeight: 900, color: '#fff',
            boxShadow: 'var(--glow-sm)', fontFamily: 'Geist, sans-serif',
            letterSpacing: '-0.02em',
          }}>AI</div>
          <div>
            <div style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              {voiceMode ? '🎙️ Voice Conversation' : 'AI Study Assistant'}
            </div>
            <div style={{ fontSize: '0.68rem', color: streaming ? 'var(--brand)' : speaking ? '#22c55e' : initDone ? 'var(--text-subtle)' : '#f59e0b', marginTop: 1 }}>
              {streaming ? '⋯ Thinking…' : speaking ? '🔊 Speaking' : initDone ? 'Ready' : 'Initialising…'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Ready dot */}
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: initDone ? '#22c55e' : '#f59e0b', flexShrink: 0 }} title={initDone ? 'Ready' : 'Initialising'} />

          {hasSpeech && !voiceMode && (
            <button onClick={startVoiceMode} className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} title="Start voice conversation">
              🎙️
            </button>
          )}
          {voiceMode && (
            <button onClick={exitVoiceMode} className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem', color: 'var(--error, #ef4444)' }}>
              ✕ Exit Voice
            </button>
          )}
        </div>
      </div>

      {/* ── VOICE MODE ─────────────────────────────────────── */}
      {voiceMode ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: listening ? 'var(--brand)' : 'var(--bg-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem',
            border: '2px solid var(--glass-border)',
            animation: listening ? 'voicePulse 1.2s infinite' : 'none',
            transition: 'all 0.3s',
          }}>
            {speaking ? '🔊' : listening ? '🎙️' : '✦'}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              {voiceStatus === 'greeting'  && 'Greeting you…'}
              {voiceStatus === 'listening' && 'Listening — speak now'}
              {voiceStatus === 'thinking'  && 'Thinking…'}
              {voiceStatus === 'speaking'  && 'Speaking the answer…'}
              {!voiceStatus               && 'Voice conversation active'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Supports any language</div>
          </div>
        </div>
      ) : (
        <>
          {/* ── MESSAGES AREA ─────────────────────────────── */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '1.5rem 1.5rem 0.5rem',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--glass-border) transparent',
          }}>
            {messages.length === 0 ? (
              /* Empty state — ChatGPT style */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: '1rem', paddingBottom: '2rem' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--gradient-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.25rem', color: '#fff', boxShadow: 'var(--glow-sm)',
                  fontWeight: 800, fontFamily: 'Geist, sans-serif',
                }}>AI</div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.375rem' }}>
                    What can I help with?
                  </h3>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0, maxWidth: 300 }}>
                    Ask me anything about this lecture — summaries, explanations, quiz questions, and more.
                  </p>
                </div>
                {/* Quick action chips in empty state */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 400 }}>
                  {QUICK.map(q => (
                    <button key={q.label} onClick={() => sendText(q.msg)}
                      className="quick-chip"
                      style={{
                        background: 'var(--bg-glass)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 20, padding: '0.4rem 0.875rem',
                        color: 'var(--text-secondary)', fontSize: '0.8rem',
                        fontWeight: 500, cursor: 'pointer',
                        transition: 'all 0.15s',
                        backdropFilter: 'var(--glass-blur)',
                      }}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(m => <Bubble key={m.id} msg={m} />)
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── INPUT AREA ────────────────────────────────── */}
          <div style={{
            flexShrink: 0,
            padding: '0.75rem 1.25rem 1rem',
          }}>
            {/* Quick chips — visible when chat has messages */}
            {messages.length > 0 && (
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.625rem' }}>
                {QUICK.map(q => (
                  <button key={q.label} onClick={() => sendText(q.msg)} disabled={streaming}
                    className="quick-chip"
                    style={{
                      background: 'var(--bg-glass)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 20, padding: '0.22rem 0.625rem',
                      color: 'var(--text-muted)', fontSize: '0.7rem',
                      fontWeight: 500, cursor: streaming ? 'not-allowed' : 'pointer',
                      opacity: streaming ? 0.4 : 1, transition: 'all 0.15s',
                    }}>
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--bg-glass)',
              border: '1.5px solid var(--glass-border)',
              borderRadius: 28,
              padding: '0.5rem 0.5rem 0.5rem 1rem',
              backdropFilter: 'var(--glass-blur)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
              onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--brand-bg)'; }}
              onBlurCapture={e  => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                onKeyDown={handleKeyDown}
                placeholder={streaming ? 'Responding…' : 'Ask anything about the lecture…'}
                disabled={streaming}
                rows={1}
                style={{
                  flex: 1, border: 'none', background: 'none', outline: 'none', resize: 'none',
                  fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-primary)',
                  fontFamily: 'inherit', overflowY: 'hidden',
                  maxHeight: 120, minHeight: '1.4rem',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                <DownloadButton jobId={jobId} />

                {hasSpeech && (
                  <button onClick={startVoiceMode} disabled={streaming} title="Voice mode"
                    style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--bg-subtle)', border: '1px solid var(--glass-border)',
                      color: 'var(--text-muted)', fontSize: '0.9rem', cursor: streaming ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: streaming ? 0.4 : 1, transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!streaming) { e.currentTarget.style.background = 'var(--brand-bg)'; e.currentTarget.style.borderColor = 'var(--brand)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
                  >🎙️</button>
                )}

                {/* Send button */}
                <button
                  onClick={() => sendText(input)}
                  disabled={streaming || !input.trim()}
                  style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: (!streaming && input.trim()) ? 'var(--brand)' : 'var(--bg-subtle)',
                    border: 'none', color: '#fff', fontSize: '0.9rem',
                    cursor: (!streaming && input.trim()) ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: (!streaming && input.trim()) ? 'var(--glow-sm)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-subtle)', margin: '0.5rem 0 0' }}>
              AI Study Assistant can make mistakes. Verify important information.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
