// frontend/src/pages/Upload.jsx
// Upload Workspace — Audio file upload + YouTube URL input
import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../api';

const PIPELINE_STAGES = [
  { key: 'uploaded',     label: 'File Received',       icon: '📥' },
  { key: 'converting',   label: 'Converting to WAV',   icon: '🔄' },
  { key: 'chunking',     label: 'Chunking & Denoising', icon: '✂️' },
  { key: 'transcribing', label: 'Transcribing',        icon: '🗣️' },
  { key: 'structuring',  label: 'Structuring Notes',   icon: '🧠' },
  { key: 'done',         label: 'Notes Ready!',        icon: '✅' },
];

const ALLOWED = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'aac'];

const YOUTUBE_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/).+/i;

function formatBytes(b) {
  if (b < 1024)      return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

function CloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="3" fill="#FF0000" />
      <polygon points="10,9 16,12 10,15" fill="white" />
    </svg>
  );
}

function Waveform({ active }) {
  if (!active) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 36 }}>
        {[40, 70, 100, 55, 80, 45, 90, 60, 75, 40, 65, 85, 50, 100, 45, 70].map((h, i) => (
          <div key={i} style={{ width: 4, borderRadius: 2, background: '#E5E7EB', height: `${h}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="waveform-container">
      {Array.from({ length: 16 }, (_, i) => <div key={i} className="waveform-bar" />)}
    </div>
  );
}

export default function Upload() {
  const [tab,       setTab]       = useState('file');  // 'file' | 'youtube'
  const [file,      setFile]      = useState(null);
  const [ytUrl,     setYtUrl]     = useState('');
  const [ytTitle,   setYtTitle]   = useState('');
  const [jobId,     setJobId]     = useState(null);
  const [jobName,   setJobName]   = useState('');
  const [status,    setStatus]    = useState('');
  const [error,     setError]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const pollRef  = useRef(null);
  const navigate = useNavigate();

  // ── File selection ─────────────────────────────────────────────
  const selectFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setError(`Unsupported format ".${ext}". Allowed: ${ALLOWED.join(', ')}`);
      return;
    }
    setFile(f);
    setError('');
  };

  // ── File upload ────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) { setError('Please select an audio file first.'); return; }
    setError(''); setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/audio/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
      setJobId(res.data.job_id);
      setJobName(file.name);
      setStatus('uploaded');
      startPolling(res.data.job_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Is the backend running?');
      setUploading(false);
    }
  };

  // ── YouTube submit ─────────────────────────────────────────────
  const handleYouTube = async () => {
    const url = ytUrl.trim();
    if (!url) { setError('Please paste a YouTube URL.'); return; }
    setError(''); setUploading(true);
    try {
      const res = await api.post('/audio/upload-youtube', { url }, { timeout: 150_000 });
      setJobId(res.data.job_id);
      setJobName(res.data.title || 'YouTube Audio');
      setYtTitle(res.data.title || '');
      setStatus('uploaded');
      startPolling(res.data.job_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not download YouTube video. Check the URL and try again.');
      setUploading(false);
    }
  };

  // ── Polling ────────────────────────────────────────────────────
  const startPolling = (id) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/audio/${id}/status`);
        const s = res.data.status;
        setStatus(s);
        if (s === 'done') {
          clearInterval(pollRef.current);
          setTimeout(() => navigate(`/notes/${id}`), 800);
        } else if (s?.startsWith('failed')) {
          clearInterval(pollRef.current);
          setError(`Processing failed: ${s.replace('failed: ', '')}`);
          setUploading(false);
        }
      } catch {
        clearInterval(pollRef.current);
        setError('Lost connection. Make sure the backend is running.');
        setUploading(false);
      }
    }, 3000);
  };

  const stageIndex  = PIPELINE_STAGES.findIndex(s => s.key === status?.split(':')[0]);
  const pct         = status === 'done' ? 100 : Math.max(5, (stageIndex / (PIPELINE_STAGES.length - 1)) * 100);
  const isProcessing = !!jobId && status !== 'done';

  const isYt = YOUTUBE_RE.test(ytUrl.trim());

  return (
    <div className="upload-workspace-page">
      <Navbar />

      {/* Sub-header */}
      <div className="upload-workspace-header">
        <div className="upload-workspace-title">
          <Link to="/dashboard" style={{ color: '#6B7280', textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 500 }}>
            ← Back to Dashboard
          </Link>
          <span style={{ color: '#D1D5DB' }}>/</span>
          <span>Upload Workspace</span>
        </div>
      </div>

      <div className="upload-workspace-body">

        {error && (
          <div className="alert alert-error">
            ⚠️ {error}
            {jobId && <Link to="/dashboard" style={{ marginLeft: '0.5rem', color: 'inherit', fontWeight: 600 }}>← Dashboard</Link>}
          </div>
        )}

        {/* ── Tab bar (only before upload) ── */}
        {!jobId && (
          <div style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', background: '#F3F4F6', borderRadius: 12, padding: 4 }}>
            {[
              { key: 'file',    icon: '🎵', label: 'Audio File' },
              { key: 'youtube', icon: '▶️', label: 'YouTube URL' },
            ].map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setError(''); }}
                style={{
                  flex: 1, padding: '0.6rem 1rem', border: 'none', borderRadius: 9, cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.18s',
                  background: tab === t.key ? '#fff' : 'transparent',
                  color: tab === t.key ? '#111827' : '#6B7280',
                  boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── File upload tab ── */}
        {!jobId && tab === 'file' && (
          <>
            <div
              className={`upload-zone-v2 ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); selectFile(e.dataTransfer.files[0]); }}
              role="button" aria-label="Audio file upload area"
            >
              <input id="audio-file-input" type="file"
                accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,.aac"
                onChange={e => selectFile(e.target.files[0])}
                aria-label="Choose audio file" />

              <div className="upload-cloud-icon" style={{ color: '#2563EB' }}><CloudIcon /></div>
              <h3>{file ? file.name : 'Upload Audio Files'}</h3>
              <p>
                {file
                  ? `${formatBytes(file.size)} · ${file.type || 'audio'}`
                  : 'Drag and drop your lecture recording here, or click to browse'}
              </p>
              {!file && <div className="upload-choose-btn" style={{ pointerEvents: 'none' }}>Choose Files</div>}
              {file && <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#2563EB', fontWeight: 500 }}>
                ✓ File selected — click "Upload & Process" below to begin
              </p>}
            </div>

            {file && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                <button id="upload-submit-btn-main" onClick={handleUpload} disabled={uploading}
                  style={{ padding: '0.75rem 2.5rem', borderRadius: 10, background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: '1rem', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}>
                  {uploading ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Uploading…</> : '⬆ Upload & Process'}
                </button>
              </div>
            )}

            {/* Supported formats */}
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '0.8125rem', color: '#374151', fontWeight: 500 }}>Supported formats</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {ALLOWED.map(fmt => (
                  <span key={fmt} style={{ padding: '0.2rem 0.625rem', borderRadius: 6, background: '#F3F4F6', color: '#374151', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{fmt}</span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── YouTube tab ── */}
        {!jobId && tab === 'youtube' && (
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <YoutubeIcon />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>YouTube Video → Notes</div>
                <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 2 }}>
                  Paste any YouTube link — we'll extract the audio and generate notes
                </div>
              </div>
            </div>

            {/* URL input */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8125rem', color: '#374151', marginBottom: '0.5rem' }}>
                YouTube URL
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem' }}>
                  {isYt ? '✅' : '🔗'}
                </span>
                <input
                  id="youtube-url-input"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={ytUrl}
                  onChange={e => { setYtUrl(e.target.value); setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter' && isYt && !uploading) handleYouTube(); }}
                  autoFocus
                  style={{
                    width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem',
                    border: `1.5px solid ${isYt ? '#22C55E' : ytUrl ? '#F59E0B' : '#E5E7EB'}`,
                    borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                    color: '#111827', background: '#FAFAFA', transition: 'border-color 0.15s',
                  }}
                />
              </div>
              {ytUrl && !isYt && (
                <p style={{ fontSize: '0.8rem', color: '#D97706', marginTop: '0.375rem', marginLeft: '0.125rem' }}>
                  ⚠️ Doesn't look like a YouTube URL. Supported: youtube.com/watch, youtu.be, youtube.com/shorts
                </p>
              )}
              {isYt && (
                <p style={{ fontSize: '0.8rem', color: '#16A34A', marginTop: '0.375rem', marginLeft: '0.125rem' }}>
                  ✓ Valid YouTube URL detected
                </p>
              )}
            </div>

           

            {/* Submit */}
            <button id="youtube-submit-btn" onClick={handleYouTube}
              disabled={!isYt || uploading}
              style={{
                padding: '0.8rem 2rem', borderRadius: 10, border: 'none', cursor: (!isYt || uploading) ? 'not-allowed' : 'pointer',
                background: isYt && !uploading ? '#FF0000' : '#E5E7EB',
                color: isYt && !uploading ? '#fff' : '#9CA3AF',
                fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 0.2s', boxShadow: isYt && !uploading ? '0 4px 14px rgba(255,0,0,0.25)' : 'none',
              }}>
              {uploading
                ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: '#fff' }} /> Downloading audio…</>
                : '▶ Extract Audio & Generate Notes'}
            </button>
          </div>
        )}

        {/* ── Processing card (after upload/submit) ── */}
        {jobId && (
          <div className="processing-card">
            <div className="processing-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: tab === 'youtube' ? '#FEF2F2' : '#EFF6FF', border: `1px solid ${tab === 'youtube' ? '#FECACA' : '#BFDBFE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  {tab === 'youtube' ? '▶️' : '🎧'}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{jobName}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>
                    {status === 'done' ? '✅ Processing complete' : `⚙️ ${PIPELINE_STAGES[stageIndex]?.label || 'Processing'}…`}
                  </div>
                </div>
              </div>
              <span style={{ padding: '0.25rem 0.75rem', borderRadius: 999, background: status === 'done' ? '#ECFDF5' : '#EFF6FF', color: status === 'done' ? '#059669' : '#2563EB', fontSize: '0.75rem', fontWeight: 700, border: `1px solid ${status === 'done' ? '#A7F3D0' : '#BFDBFE'}` }}>
                {status === 'done' ? 'Done' : `${Math.round(pct)}%`}
              </span>
            </div>

            <div style={{ marginBottom: '1rem' }}><Waveform active={isProcessing} /></div>

            <div className="progress-bar" style={{ marginBottom: '0.875rem' }}>
              <div className={`progress-fill ${status === 'done' ? 'done' : ''}`} style={{ width: `${pct}%` }} />
            </div>

            <div className="processing-stage-dots">
              {PIPELINE_STAGES.map((stage, i) => (
                <div key={stage.key} className={`stage-dot ${i < stageIndex ? 'done' : i === stageIndex ? 'active' : ''}`} title={stage.label} />
              ))}
            </div>

            <div className="steps-list" style={{ marginTop: '1.25rem' }} role="list">
              {PIPELINE_STAGES.map((stage, i) => {
                const isDone   = i < stageIndex;
                const isActive = i === stageIndex;
                return (
                  <div key={stage.key} className={`step-row ${isDone ? 'done' : isActive ? 'active' : ''}`}
                    role="listitem" aria-current={isActive ? 'step' : undefined}>
                    <div className="step-num">
                      {isDone ? '✓' : isActive ? <span className="pulse-dot" style={{ width: 10, height: 10 }} /> : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="step-label">{stage.icon} {stage.label}</div>
                    </div>
                    {isDone   && <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>Done</span>}
                    {isActive && <span style={{ fontSize: '0.8rem', color: '#2563EB', fontWeight: 600 }}>Running…</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
