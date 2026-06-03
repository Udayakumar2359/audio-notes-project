// frontend/src/components/AgentChatPanel.jsx
// ─────────────────────────────────────────────────────────────
// - Same width as page content (max 820px, centered)
// - Collapsed state shows the input bar directly (no full-page black bar)
// - Auto-inits agent context when notes load (no LLM, just context prep)
// - Auto-scrolls into view when user opens chat
// - "Notes" download always generates FRESH LLM notes from transcript
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

function getBotVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  const preferred = ['Microsoft David Desktop','Microsoft Zira Desktop','Google UK English Male','Google UK English Female','Google US English'];
  for (const n of preferred) { const v = voices.find(v => v.name === n); if (v) return v; }
  return voices.find(v => v.lang?.startsWith('en')) || null;
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display:'flex', justifyContent:isUser?'flex-end':'flex-start', marginBottom:'0.75rem', gap:'0.5rem', alignItems:'flex-end' }}>
      {!isUser && (
        <div style={{ width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#667eea,#764ba2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',flexShrink:0 }}>✦</div>
      )}
      <div style={{ maxWidth:'75%',padding:'0.625rem 0.875rem',background:isUser?'linear-gradient(135deg,#667eea,#764ba2)':'#f8f9fa',color:isUser?'#fff':'#1a1a2e',borderRadius:isUser?'18px 18px 4px 18px':'4px 18px 18px 18px',fontSize:'0.875rem',lineHeight:1.65,boxShadow:isUser?'none':'0 1px 3px rgba(0,0,0,0.06)',border:isUser?'none':'1px solid #ebebeb' }}>
        {msg.streaming && <span style={{ display:'inline-block',width:5,height:5,borderRadius:'50%',background:'#667eea',marginRight:4,animation:'blink 0.7s infinite' }} />}
        <span style={{ whiteSpace:'pre-wrap' }}>{msg.content}</span>
      </div>
    </div>
  );
}

// ── Fresh-generate notes download (always LLM) ──────────────
function DownloadButton({ jobId }) {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [loadFmt,  setLoadFmt]  = useState('');

  const dl = async (fmt) => {
    setOpen(false);
    setLoading(true);
    setLoadFmt(fmt);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/agent/${jobId}/download-notes?format=${fmt}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Server error');
      const blob = await res.blob();
      // Read filename from Content-Disposition header (e.g. "lecture_ai_notes.pdf")
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `notes.${fmt}`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert('Download failed. Make sure the AI model is running (Ollama) or Cloud AI is configured.');
    } finally {
      setLoading(false); setLoadFmt('');
    }
  };

  return (
    <div style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(v => !v)} disabled={loading}
        title="Generate & download AI study notes"
        style={{ background:loading?'#e8e8f5':'#f0f0f0', border:'1px solid #ddd', borderRadius:8, padding:'0.35rem 0.625rem', fontSize:'0.72rem', cursor:loading?'not-allowed':'pointer', color:'#555', fontWeight:600, whiteSpace:'nowrap' }}>
        {loading ? `⏳ Generating ${loadFmt.toUpperCase()}…` : '↓ Notes'}
      </button>
      {open && !loading && (
        <div style={{ position:'absolute',bottom:'110%',right:0,background:'#fff',border:'1px solid #e8e8e8',borderRadius:10,overflow:'hidden',minWidth:160,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:200 }}>
          <div style={{ padding:'0.4rem 0.875rem',fontSize:'0.68rem',color:'#aaa',borderBottom:'1px solid #f5f5f5',fontWeight:600 }}>AI-generated fresh notes</div>
          {['docx','pdf'].map(fmt => (
            <button key={fmt} onClick={() => dl(fmt)}
              style={{ display:'block',width:'100%',textAlign:'left',padding:'0.6rem 0.875rem',background:'none',border:'none',color:'#333',fontSize:'0.8rem',cursor:'pointer' }}
              onMouseEnter={e => e.target.style.background='#f8f8f8'} onMouseLeave={e => e.target.style.background='none'}
            >{fmt==='docx'?'📄 Word (.docx)':'📑 PDF (.pdf)'}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────
export default function AgentChatPanel({ jobId }) {
  const [expanded,    setExpanded]    = useState(false);
  const [voiceMode,   setVoiceMode]   = useState(false);
  const [listening,   setListening]   = useState(false);
  const [speaking,    setSpeaking]    = useState(false);
  const [streaming,   setStreaming]   = useState(false);
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [showModel,   setShowModel]   = useState(false);
  const [modelPref,   setModelPref]   = useState('auto');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [hasSpeech,   setHasSpeech]   = useState(false);
  const [initDone,    setInitDone]    = useState(false);

  const bottomRef  = useRef(null);
  const recogRef   = useRef(null);
  const panelRef   = useRef(null);
  const inputRef   = useRef(null);
  const msgId      = useRef(0);
  const voiceLoop  = useRef(false);
  const uid = () => ++msgId.current;

  // ── Pre-load voices ──────────────────────────────────────
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setHasSpeech(!!SR && !!window.speechSynthesis);
    if (window.speechSynthesis) { window.speechSynthesis.getVoices(); window.speechSynthesis.addEventListener('voiceschanged', () => {}); }
  }, []);

  // ── Auto-init agent context as soon as notes load ────────
  // This pre-warms the backend agent (loads transcript into memory).
  // The /init endpoint returns plain JSON; we just drain the body
  // and set initDone so the status indicator turns green.
  useEffect(() => {
    if (initDone) return;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/agent/${jobId}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }).then(async res => {
      if (res.body) {
        const reader = res.body.getReader();
        while (true) { const { done } = await reader.read(); if (done) break; }
      }
    }).catch(() => {}).finally(() => setInitDone(true));
  }, [jobId]);

  // ── Auto-scroll messages ─────────────────────────────────
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  // ── Scroll panel into view when expanded ─────────────────
  useEffect(() => {
  // Panel is fixed — no scroll needed
  }, [expanded]);

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
    if (!expanded) setExpanded(true);
    const userId = uid(), agentId = uid();
    setMessages(prev => [...prev, { id:userId,role:'user',content:msg,streaming:false }, { id:agentId,role:'assistant',content:'',streaming:true }]);
    setStreaming(true);
    let acc = '';
    streamSSE(`${API_BASE}/agent/${jobId}/chat`, 'POST', { message: msg },
      tok => { acc += tok; setMessages(prev => prev.map(m => m.id===agentId ? {...m,content:acc} : m)); },
      ()  => { setMessages(prev => prev.map(m => m.id===agentId ? {...m,streaming:false} : m)); setStreaming(false); },
      err => { setMessages(prev => prev.map(m => m.id===agentId ? {...m,content:`⚠️ ${err}`,streaming:false} : m)); setStreaming(false); }
    );
  }, [streaming, jobId, expanded]);

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
      () => { setVoiceStatus('speaking'); speak(acc, () => { setVoiceStatus(''); if (voiceLoop.current) listenOnce(); }); },
      () => { speak('Sorry, I could not get an answer.', () => { if (voiceLoop.current) listenOnce(); }); }
    );
  }, [jobId, speak]);

  const startVoiceMode = useCallback(() => {
    setVoiceMode(true); voiceLoop.current = true; setVoiceStatus('greeting');
    speak('How can I help you with the lecture?', () => { if (voiceLoop.current) listenOnce(); });
  }, [speak]);

  const exitVoiceMode = useCallback(() => { stopAll(); setVoiceMode(false); }, [stopAll]);

  const switchModel = (pref) => {
    setModelPref(pref); setShowModel(false);
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/agent/${jobId}/model`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ preference: pref }) });
  };

  const QUICK = [
    { label:'✦ Summarise',    msg:'Give me a concise summary of this lecture.' },
    { label:'◈ Key Concepts', msg:'List the key concepts from this lecture.' },
    { label:'◎ Examples',     msg:'Give practical examples for the main topics.' },
    { label:'◉ Quiz Me',      msg:'Create 5 quiz questions from this lecture.' },
  ];

  const openPanel = () => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 100); };

  // ─────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────
  //  FIXED BOTTOM WRAPPER — always visible
  // ─────────────────────────────────────────────────────────
  return (
    <div ref={panelRef} style={{
      position: 'fixed', bottom: 0,
      left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 820,
      zIndex: 999,
      background: '#fff',
      borderTop: '2px solid #e0e0f0',
      borderLeft: '1px solid #e0e0f0',
      borderRight: '1px solid #e0e0f0',
      borderRadius: '12px 12px 0 0',
      boxShadow: '0 -4px 24px rgba(102,126,234,0.13)',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      padding: expanded ? '0' : '0.625rem 1rem 0.5rem',
    }}>

      {/* ── COLLAPSED STATE — input bar style ─────────────────
          User sees an input box they can click/type directly into  */}
      {!expanded && (
        <div style={{ padding: '0.625rem 0' }}>
          {/* Branding row */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.625rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <div style={{ width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#667eea,#764ba2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.8rem',flexShrink:0 }}>✦</div>
              <div>
                <div style={{ fontWeight:700,fontSize:'0.85rem',color:'#1a1a2e' }}>AI Study Assistant</div>
                <div style={{ fontSize:'0.7rem',color:'#aaa' }}>
                  {initDone ? 'Ready — click below to ask anything' : 'Preparing your assistant…'}
                </div>
              </div>
            </div>
            <div style={{ width:8,height:8,borderRadius:'50%',background:initDone?'#22c55e':'#f59e0b',flexShrink:0 }} title={initDone?'Ready':'Initialising'} />
          </div>

          {/* Input bar — directly clickable */}
          <div onClick={openPanel}
            style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'#f8f8ff', border:'1.5px solid #e0e0f5', borderRadius:24, padding:'0.45rem 0.875rem', cursor:'text' }}>
            <span style={{ flex:1, fontSize:'0.875rem', color:'#bbb', userSelect:'none' }}>
              Ask anything about the lecture…
            </span>
            {hasSpeech && (
              <span style={{ fontSize:'1rem', color:'#667eea', cursor:'pointer' }} onClick={(e) => { e.stopPropagation(); openPanel(); startVoiceMode(); }}>🎙️</span>
            )}
            <div style={{ width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#667eea,#764ba2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 2px 8px rgba(102,126,234,0.3)' }}>
              <span style={{ color:'#fff',fontSize:'0.8rem' }}>➤</span>
            </div>
          </div>

          {/* Quick chips */}
          <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap', marginTop:'0.5rem' }}>
            {QUICK.map(q => (
              <button key={q.label} onClick={() => { openPanel(); setTimeout(() => sendText(q.msg), 150); }}
                style={{ background:'#f8f8ff',border:'1px solid #e8e8f5',borderRadius:20,padding:'0.18rem 0.6rem',color:'#667eea',fontSize:'0.7rem',fontWeight:600,cursor:'pointer' }}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── EXPANDED PANEL ─────────────────────────────────────── */}
      {expanded && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e0e0f0', boxShadow:'0 4px 32px rgba(102,126,234,0.12)', overflow:'hidden' }}>

          {/* Header */}
          <div style={{ padding:'0.75rem 1.1rem', borderBottom:'1px solid #f0f0f8', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fafbff' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
              <div style={{ width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#667eea,#764ba2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.875rem' }}>✦</div>
              <div>
                <div style={{ fontWeight:700,fontSize:'0.875rem',color:'#1a1a2e' }}>{voiceMode?'🎙️ Voice Conversation':'AI Study Assistant'}</div>
                <div style={{ fontSize:'0.68rem',color:'#aaa' }}>{streaming?'⋯ Thinking':speaking?'🔊 Speaking':initDone?'Ready':'Initialising…'}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
              {/* Model switch */}
              <div style={{ position:'relative' }}>
                <button onClick={() => setShowModel(v => !v)} style={{ background:'#f0f0f8',border:'1px solid #e0e0f0',borderRadius:8,padding:'0.22rem 0.5rem',fontSize:'0.7rem',cursor:'pointer',color:'#666',fontWeight:600 }}>
                  ⚙ {modelPref==='auto'?'Auto':modelPref==='local'?'Local':'Cloud'}
                </button>
                {showModel && (
                  <div style={{ position:'absolute',top:'110%',right:0,background:'#fff',border:'1px solid #e8e8e8',borderRadius:10,overflow:'hidden',minWidth:162,boxShadow:'0 8px 24px rgba(0,0,0,0.1)',zIndex:200 }}>
                    {[{key:'auto',label:'⚡ Auto'},{key:'local',label:'🖥️ Local AI'},{key:'cloud',label:'☁️ Cloud AI'}].map(opt => (
                      <button key={opt.key} onClick={() => switchModel(opt.key)}
                        style={{ display:'block',width:'100%',textAlign:'left',padding:'0.55rem 0.875rem',background:modelPref===opt.key?'#f5f5ff':'none',border:'none',color:modelPref===opt.key?'#667eea':'#333',fontSize:'0.8rem',cursor:'pointer',fontWeight:modelPref===opt.key?700:400 }}>
                        {opt.label}</button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => { stopAll(); setExpanded(false); setVoiceMode(false); }}
                style={{ background:'#f0f0f8',border:'1px solid #e0e0f0',borderRadius:8,padding:'0.22rem 0.5rem',fontSize:'0.7rem',cursor:'pointer',color:'#666' }}>✕ Close</button>
            </div>
          </div>

          {/* ── VOICE MODE ─────────────────────────────────────── */}
          {voiceMode ? (
            <div style={{ height:200,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'1rem',background:'#fafbff' }}>
              <div style={{ width:72,height:72,borderRadius:'50%',background:listening?'linear-gradient(135deg,#667eea,#764ba2)':'#f0f0f8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.75rem',boxShadow:listening?'0 0 0 12px rgba(102,126,234,0.15)':'none',transition:'all 0.3s',animation:listening?'pulse 1.2s infinite':'none' }}>
                {speaking?'🔊':listening?'🎙️':'✦'}
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:700,fontSize:'0.9rem',color:'#1a1a2e' }}>
                  {voiceStatus==='greeting'&&'Greeting you…'}{voiceStatus==='listening'&&'Listening — speak now'}{voiceStatus==='thinking'&&'Thinking…'}{voiceStatus==='speaking'&&'Speaking the answer…'}{!voiceStatus&&'Voice conversation active'}
                </div>
                <div style={{ fontSize:'0.73rem',color:'#bbb',marginTop:'0.2rem' }}>Supports any language</div>
              </div>
              <button onClick={exitVoiceMode} style={{ background:'#f0f0f8',border:'1px solid #e0e0f0',borderRadius:8,padding:'0.4rem 1rem',cursor:'pointer',fontSize:'0.8rem',color:'#555',fontWeight:600 }}>✕ Exit Voice Mode</button>
            </div>
          ) : (
            <>
              {/* ── MESSAGES ─────────────────────────────────── */}
              <div style={{ height:280,overflowY:'auto',padding:'1.1rem 1.1rem 0.5rem',scrollbarWidth:'thin',scrollbarColor:'#ddd transparent' }}>
                {messages.length===0 ? (
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',textAlign:'center',padding:'1rem' }}>
                    <div style={{ fontSize:'1.5rem',marginBottom:'0.5rem',opacity:0.3 }}>✦</div>
                    <h3 style={{ fontSize:'1.1rem',fontWeight:700,color:'#1a1a2e',marginBottom:'0.3rem' }}>What can I help with?</h3>
                    <p style={{ fontSize:'0.8rem',color:'#bbb',maxWidth:280 }}>Ask a question, get a summary, or use the quick actions below</p>
                  </div>
                ) : messages.map(m => <Bubble key={m.id} msg={m} />)}
                <div ref={bottomRef} />
              </div>

              {/* ── INPUT BAR — in between messages and quick actions */}
              <div style={{ padding:'0.6rem 1.1rem', borderTop:'1px solid #f5f5f5', display:'flex', gap:'0.4rem', alignItems:'center', background:'#fff' }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendText(input); } }}
                  placeholder={streaming?'Responding…':'Ask anything about the lecture…'}
                  disabled={streaming}
                  style={{ flex:1,border:'1.5px solid #e0e0f0',borderRadius:24,padding:'0.45rem 1rem',fontSize:'0.875rem',outline:'none',color:'#1a1a2e',background:'#fafbff',transition:'border-color 0.15s,box-shadow 0.15s' }}
                  onFocus={e => { e.target.style.borderColor='#667eea'; e.target.style.boxShadow='0 0 0 3px rgba(102,126,234,0.1)'; }}
                  onBlur={e  => { e.target.style.borderColor='#e0e0f0'; e.target.style.boxShadow='none'; }}
                />
                <DownloadButton jobId={jobId} />
                {hasSpeech && (
                  <button onClick={startVoiceMode} disabled={streaming} title="Start voice conversation"
                    style={{ width:36,height:36,borderRadius:'50%',flexShrink:0,background:'#f8f8ff',border:'1.5px solid #e8e8f5',color:'#667eea',fontSize:'1rem',cursor:streaming?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:streaming?0.4:1 }}>
                    🎙️</button>
                )}
                <button onClick={() => sendText(input)} disabled={streaming||!input.trim()}
                  style={{ width:36,height:36,borderRadius:'50%',flexShrink:0,background:(!streaming&&input.trim())?'linear-gradient(135deg,#667eea,#764ba2)':'#e0e0f0',border:'none',color:'#fff',fontSize:'0.9rem',cursor:(!streaming&&input.trim())?'pointer':'not-allowed',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:(!streaming&&input.trim())?'0 2px 8px rgba(102,126,234,0.4)':'none',transition:'all 0.15s' }}>➤</button>
              </div>

              {/* ── QUICK ACTIONS — below input bar ───────────── */}
              <div style={{ padding:'0.4rem 1.1rem 0.75rem', display:'flex', gap:'0.35rem', flexWrap:'wrap' }}>
                {QUICK.map(q => (
                  <button key={q.label} onClick={() => sendText(q.msg)} disabled={streaming}
                    style={{ background:'#f8f8ff',border:'1px solid #e8e8f5',borderRadius:20,padding:'0.22rem 0.65rem',color:'#667eea',fontSize:'0.72rem',fontWeight:600,cursor:streaming?'not-allowed':'pointer',opacity:streaming?0.5:1,whiteSpace:'nowrap' }}>
                    {q.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(102,126,234,0.4)} 60%{box-shadow:0 0 0 14px rgba(102,126,234,0)} }
      `}</style>
    </div>
  );
}
