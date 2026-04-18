// frontend/src/pages/Upload.jsx
import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../api';

const PIPELINE_STAGES = [
  { key: 'uploaded',     label: 'File Received',         icon: '📥', desc: 'Audio saved to server'                       },
  { key: 'converting',   label: 'Converting to WAV',     icon: '🔄', desc: 'Converting to 16kHz mono WAV'                },
  { key: 'chunking',     label: 'Chunking & Denoising',  icon: '✂️', desc: 'Split into 25-sec segments, noise removed'   },
  { key: 'transcribing', label: 'Transcribing',          icon: '🗣️', desc: 'Whisper ASR + language detect + translate'   },
  { key: 'structuring',  label: 'Structuring Notes',     icon: '🧠', desc: 'T5 model generating academic notes'          },
  { key: 'done',         label: 'Notes Ready!',          icon: '✅', desc: 'Your structured notes are ready to view'     },
];

const ALLOWED = ['mp3','wav','m4a','ogg','flac','webm','aac'];

function formatBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function Upload() {
  const [file,      setFile]      = useState(null);
  const [jobId,     setJobId]     = useState(null);
  const [status,    setStatus]    = useState('');
  const [error,     setError]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const pollRef   = useRef(null);
  const navigate  = useNavigate();

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

  const handleUpload = async () => {
    if (!file) { setError('Please select an audio file first.'); return; }
    setError('');
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/audio/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
      setJobId(res.data.job_id);
      setStatus('uploaded');
      startPolling(res.data.job_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Is the backend running?');
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

  const stageIndex = PIPELINE_STAGES.findIndex(s => s.key === status?.split(':')[0]);
  const pct        = status === 'done' ? 100 : Math.max(5, (stageIndex / (PIPELINE_STAGES.length - 1)) * 100);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Navbar />

      <main
        className="container container-sm page-enter"
        style={{ padding: '2rem 1.5rem' }}
      >
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ marginBottom: '0.3rem' }}>Upload Lecture Audio</h1>
          <p>Supports Kannada · Hindi · English. Processing takes ~1 min per minute of audio.</p>
        </div>

        {!jobId ? (
          /* ── Upload form ─────────────────────────────────── */
          <div className="card">
            {/* Drop zone */}
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); selectFile(e.dataTransfer.files[0]); }}
              role="button"
              aria-label="Audio file upload area"
            >
              <input
                id="audio-file-input"
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,.aac"
                onChange={e => selectFile(e.target.files[0])}
                aria-label="Choose audio file"
              />
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎵</div>
              <h3 style={{ marginBottom: '0.375rem', fontSize: '1.0625rem' }}>
                {file ? file.name : 'Drop audio file here'}
              </h3>
              <p style={{ fontSize: '0.875rem', margin: 0 }}>
                {file
                  ? `${formatBytes(file.size)} · ${file.type || 'audio'}`
                  : 'or click to browse — MP3, WAV, M4A, OGG, FLAC, WebM, AAC'
                }
              </p>
            </div>

            {/* Selected file info */}
            {file && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.875rem 1rem',
                  background: 'var(--brand-bg)',
                  border: '1px solid var(--brand-border)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <span>🎧</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{file.name}</div>
                    <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>{formatBytes(file.size)}</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)} aria-label="Remove selected file">
                  ✕ Remove
                </button>
              </div>
            )}

            {error && (
              <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                ⚠️ {error}
              </div>
            )}

            <button
              id="upload-submit-btn"
              className="btn btn-primary btn-full btn-lg"
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{ marginTop: '1.25rem' }}
            >
              {uploading
                ? <><span className="spinner" style={{ width:18,height:18,borderWidth:2 }} /> Uploading…</>
                : '🚀  Upload & Process'
              }
            </button>

            {/* Pipeline info box */}
            <div
              style={{
                marginTop: '1.25rem',
                padding: '1rem',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                lineHeight: 1.8,
              }}
            >
              <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.375rem' }}>
                Pipeline steps:
              </strong>
              1. Convert any format → 16kHz mono WAV<br />
              2. Remove background noise (noisereduce)<br />
              3. Split into ~25s chunks, process in parallel<br />
              4. Whisper ASR: speech → text (Kannada / Hindi / English)<br />
              5. Detect language; translate non-English to English<br />
              6. T5 model: organize into structured academic notes
            </div>
          </div>
        ) : (
          /* ── Processing tracker ──────────────────────────── */
          <div className="card">
            <h2 style={{ marginBottom: '0.25rem', fontSize: '1.25rem' }}>
              {status === 'done' ? '🎉 Notes Ready!' : '⚙️ Processing Your Audio…'}
            </h2>
            <p style={{ marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              {status === 'done'
                ? 'Redirecting to your notes…'
                : 'Parallel processing is running. Stay on this page.'
              }
            </p>

            {/* Overall progress bar */}
            <div className="progress-bar">
              <div
                className={`progress-fill ${status === 'done' ? 'done' : ''}`}
                style={{ width: `${pct}%` }}
              />
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
                      : isActive ? <span className="pulse-dot" style={{ width:10,height:10 }} />
                      : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="step-label">{stage.icon} {stage.label}</div>
                      {isActive && <div className="step-desc">{stage.desc}</div>}
                    </div>
                    {isDone   && <span style={{ fontSize:'0.8rem', color:'var(--success)', fontWeight:600 }}>Done</span>}
                    {isActive && <span style={{ fontSize:'0.8rem', color:'var(--brand-dark)', fontWeight:600 }}>Running…</span>}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                ❌ {error}
                <br />
                <Link to="/dashboard" style={{ color: 'inherit', fontWeight: 600 }}>← Back to Dashboard</Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
