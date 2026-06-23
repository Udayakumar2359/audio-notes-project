import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../api';

const PIPELINE_STAGES = [
  { key: 'uploaded',     label: 'File Received' },
  { key: 'converting',   label: 'Converting to WAV' },
  { key: 'chunking',     label: 'Chunking & Denoising' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'structuring',  label: 'Structuring Notes' },
  { key: 'done',         label: 'Notes Ready!' },
];

const ALLOWED = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'aac'];

const YOUTUBE_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/).+/i;

function formatBytes(b) {
  if (b < 1024)      return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

function Waveform({ active }) {
  if (!active) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 36 }}>
        {[40, 70, 100, 55, 80, 45, 90, 60, 75, 40, 65, 85, 50, 100, 45, 70].map((h, i) => (
          <div
            key={i}
            style={{
              width: 4, borderRadius: 3, height: `${h}%`,
              background: 'var(--border-strong)', transition: 'height 0.3s ease',
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 36 }}>
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 4, borderRadius: 3,
            height: `${Math.random() * 60 + 40}%`,
            background: 'var(--brand)',
            animation: `pulse 1.${i % 4}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function Upload() {
  const [tab, setTab]           = useState('file');
  const [file, setFile]         = useState(null);
  const [ytUrl, setYtUrl]       = useState('');
  const [jobId, setJobId]       = useState(null);
  const [jobName, setJobName]   = useState('');
  const [status, setStatus]     = useState('');
  const [error, setError]       = useState('');
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const pollRef  = useRef(null);
  const navigate = useNavigate();

  const selectFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED.includes(ext)) {
      setError(`Unsupported format ".${ext}". Allowed: ${ALLOWED.join(', ')}`);
      return;
    }
    setFile(f);
    setError('');
  };

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

  const handleYouTube = async () => {
    const url = ytUrl.trim();
    if (!url) { setError('Please paste a YouTube URL.'); return; }
    setError(''); setUploading(true);
    try {
      const res = await api.post('/audio/upload-youtube', { url }, { timeout: 150_000 });
      setJobId(res.data.job_id);
      setJobName(res.data.title || 'YouTube Audio');
      setStatus('uploaded');
      startPolling(res.data.job_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not download YouTube video. Check the URL and try again.');
      setUploading(false);
    }
  };

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

  const handleCancel = async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    clearInterval(pollRef.current);
    try {
      await api.delete(`/audio/${jobId}/cancel`);
    } catch (err) {
      // If 404 (already gone) that's fine — still reset UI
      console.warn('Cancel request:', err?.response?.data?.detail || err.message);
    }
    // Reset UI back to the upload form
    setJobId(null);
    setJobName('');
    setStatus('');
    setFile(null);
    setUploading(false);
    setCancelling(false);
    setError('');
  };

  const stageIndex  = PIPELINE_STAGES.findIndex(s => s.key === status?.split(':')[0]);
  const pct         = status === 'done' ? 100 : Math.max(5, (stageIndex / (PIPELINE_STAGES.length - 1)) * 100);
  const isProcessing = !!jobId && status !== 'done';
  const isYt = YOUTUBE_RE.test(ytUrl.trim());

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', paddingBottom: '5rem' }}>
      <Navbar />

      <div className="container container-md" style={{ paddingTop: '2rem' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <Link
            to="/dashboard"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.35rem 0.875rem', fontSize: '0.8125rem', fontWeight: 600,
              border: '1.5px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--text-secondary)',
              textDecoration: 'none', transition: 'all 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-muted)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            Back to Dashboard
          </Link>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-subtle)' }}>/ Upload Workspace</span>
        </div>

        {/* Error banner */}
        {error && (
          <div className="alert alert-error" style={{ justifyContent: 'space-between' }}>
            <span>{error}</span>
            {jobId && <Link to="/dashboard" style={{ fontWeight: 700, textDecoration: 'underline', color: 'inherit' }}>Dashboard</Link>}
          </div>
        )}

        {/* Tab switcher */}
        {!jobId && (
          <div className="tabs" style={{ width: '100%', marginBottom: '1.5rem' }}>
            <button
              className={`tab-btn${tab === 'file' ? ' active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => { setTab('file'); setError(''); }}
            >
              Audio File
            </button>
            <button
              className={`tab-btn${tab === 'youtube' ? ' active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => { setTab('youtube'); setError(''); }}
            >
              YouTube URL
            </button>
          </div>
        )}

        {/* ── File upload tab ── */}
        {!jobId && tab === 'file' && (
          <>
            <div
              className={`drop-zone${dragOver ? ' drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); selectFile(e.dataTransfer.files[0]); }}
              onClick={() => document.getElementById('audio-file-input')?.click()}
            >
              <input
                id="audio-file-input"
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,.aac"
                onChange={e => selectFile(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
              <h3 style={{ marginBottom: '0.5rem' }}>
                {file ? file.name : 'Upload Audio Files'}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {file
                  ? `${formatBytes(file.size)} · ${file.type || 'audio'}`
                  : 'Drag and drop your lecture recording here, or click to browse'}
              </p>
              {file && (
                <p style={{ marginTop: '0.875rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand)' }}>
                  File selected — click "Upload & Process" below to begin
                </p>
              )}
            </div>

            {file && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                <button className="btn btn-primary btn-lg" onClick={handleUpload} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Upload & Process'}
                </button>
              </div>
            )}

            {/* Supported formats */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: '0.875rem 1.25rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem',
            }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Supported formats
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {ALLOWED.map(fmt => (
                  <span key={fmt} style={{
                    padding: '0.2rem 0.625rem', borderRadius: 6,
                    background: 'var(--bg-muted)', color: 'var(--text-secondary)',
                    fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                    border: '1px solid var(--border)',
                  }}>
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── YouTube tab ── */}
        {!jobId && tab === 'youtube' && (
          <div className="card">
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>YouTube Video to Notes</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Paste any YouTube link — we'll extract the audio and generate notes
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">YouTube URL</label>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={ytUrl}
                onChange={e => { setYtUrl(e.target.value); setError(''); }}
                onKeyDown={e => { if (e.key === 'Enter' && isYt && !uploading) handleYouTube(); }}
                className="form-input"
                style={{
                  borderColor: isYt ? 'var(--success)' : ytUrl ? 'var(--warning)' : undefined,
                }}
              />
              {ytUrl && !isYt && (
                <span className="form-hint" style={{ color: 'var(--warning)' }}>
                  Doesn't look like a valid YouTube URL.
                </span>
              )}
              {isYt && (
                <span className="form-hint" style={{ color: 'var(--success)' }}>
                  ✓ Valid YouTube URL detected
                </span>
              )}
            </div>

            <button
              className="btn btn-primary btn-lg btn-full"
              onClick={handleYouTube}
              disabled={!isYt || uploading}
            >
              {uploading ? 'Downloading audio…' : 'Extract Audio & Generate Notes'}
            </button>
          </div>
        )}

        {/* ── Processing card (after upload) ── */}
        {jobId && (
          <div className="card">
            {/* Card header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: 'var(--brand-bg)', border: '1px solid var(--brand-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}></div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {jobName}
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {status === 'done'
                      ? 'Processing complete'
                      : `${PIPELINE_STAGES[stageIndex]?.label || 'Processing'}…`}
                  </div>
                </div>
              </div>
              <span style={{
                padding: '0.25rem 0.75rem', borderRadius: 999,
                background: status === 'done' ? 'var(--success-bg)' : 'var(--brand-bg)',
                color: status === 'done' ? 'var(--success)' : 'var(--brand)',
                fontSize: '0.75rem', fontWeight: 700,
                border: `1px solid ${status === 'done' ? 'var(--success-border)' : 'var(--brand-border)'}`,
              }}>
                {status === 'done' ? 'Done' : `${Math.round(pct)}%`}
              </span>
            </div>

            {/* Waveform */}
            <div style={{ marginBottom: '1rem' }}>
              <Waveform active={isProcessing} />
            </div>

            {/* Progress bar */}
            <div className="progress-bar" style={{ marginBottom: '0.875rem' }}>
              <div
                className={`progress-fill ${status === 'done' ? 'done' : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Stage dots */}
            <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center', marginBottom: '1rem' }}>
              {PIPELINE_STAGES.map((stage, i) => (
                <div
                  key={stage.key}
                  title={stage.label}
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: i < stageIndex
                      ? 'var(--success)'
                      : i === stageIndex
                        ? 'var(--brand)'
                        : 'var(--border-strong)',
                    transition: 'background 0.4s ease',
                  }}
                />
              ))}
            </div>

            {/* Stage list */}
            <div className="steps-list" role="list">
              {PIPELINE_STAGES.map((stage, i) => {
                const isDone   = i < stageIndex;
                const isActive = i === stageIndex;
                return (
                  <div
                    key={stage.key}
                    className={`step-row ${isDone ? 'done' : isActive ? 'active' : ''}`}
                    role="listitem"
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <div className="step-num">
                      {isDone   ? '✓'
                      : isActive ? <span className="pulse-dot" style={{ width: 10, height: 10 }} />
                      : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="step-label">{stage.label}</div>
                    </div>
                    {isDone   && <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>Done</span>}
                    {isActive && <span style={{ fontSize: '0.8rem', color: 'var(--brand)', fontWeight: 600 }}>Running…</span>}
                  </div>
                );
              })}
            </div>

            {/* Cancel button — only shown while processing */}
            {isProcessing && (
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                <button
                  id="cancel-processing-btn"
                  onClick={handleCancel}
                  disabled={cancelling}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.55rem 1.4rem', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.875rem', fontWeight: 700, cursor: cancelling ? 'not-allowed' : 'pointer',
                    border: '1.5px solid var(--error, #ef4444)',
                    background: cancelling ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.1)',
                    color: 'var(--error, #ef4444)',
                    transition: 'all 0.18s ease',
                    opacity: cancelling ? 0.7 : 1,
                  }}
                  onMouseOver={e => { if (!cancelling) e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
                  onMouseOut={e => { if (!cancelling) e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                >
                  {cancelling ? (
                    <>
                      <span style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: '2px solid var(--error, #ef4444)',
                        borderTopColor: 'transparent',
                        display: 'inline-block',
                        animation: 'spin 0.7s linear infinite',
                      }} />
                      Cancelling…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                        <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor"/>
                      </svg>
                      Stop Processing
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

