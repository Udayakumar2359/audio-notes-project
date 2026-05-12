// frontend/src/pages/Upload.jsx
// Upload Workspace — clean workspace design with waveform animation
import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../api';

const PIPELINE_STAGES = [
  { key: 'uploaded',     label: 'File Received',        icon: '📥' },
  { key: 'converting',   label: 'Converting to WAV',    icon: '🔄' },
  { key: 'chunking',     label: 'Chunking & Denoising', icon: '✂️' },
  { key: 'transcribing', label: 'Transcribing',         icon: '🗣️' },
  { key: 'structuring',  label: 'Structuring Notes',    icon: '🧠' },
  { key: 'done',         label: 'Notes Ready!',         icon: '✅' },
];

const ALLOWED = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'aac'];

function formatBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// Cloud upload SVG icon
function CloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

// Animated waveform
function Waveform({ active }) {
  if (!active) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 36 }}>
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} style={{
            width: 4, borderRadius: 2, background: '#E5E7EB',
            height: `${[40, 70, 100, 55, 80, 45, 90, 60, 75, 40, 65, 85, 50, 100, 45, 70][i]}%`,
          }} />
        ))}
      </div>
    );
  }
  return (
    <div className="waveform-container">
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="waveform-bar" />
      ))}
    </div>
  );
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
  const isProcessing = !!jobId && status !== 'done';

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
        {file && !jobId && (
          <button
            id="upload-submit-btn"
            onClick={handleUpload}
            disabled={uploading}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: 8,
              background: '#2563EB', color: '#fff', fontWeight: 600,
              fontSize: '0.875rem', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            {uploading
              ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Uploading…</>
              : '⬆ Upload & Process'
            }
          </button>
        )}
      </div>

      {/* Body */}
      <div className="upload-workspace-body">

        {error && (
          <div className="alert alert-error">
            ⚠️ {error}
            {jobId && <Link to="/dashboard" style={{ marginLeft: '0.5rem', color: 'inherit', fontWeight: 600 }}>← Dashboard</Link>}
          </div>
        )}

        {/* ── Upload zone (before upload) ── */}
        {!jobId && (
          <div
            className={`upload-zone-v2 ${dragOver ? 'drag-over' : ''}`}
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

            <div className="upload-cloud-icon">
              <CloudIcon />
            </div>

            <h3>
              {file ? file.name : 'Upload Audio Files'}
            </h3>
            <p>
              {file
                ? `${formatBytes(file.size)} · ${file.type || 'audio'}`
                : 'Drag and drop your lecture recording here, or click to browse'
              }
            </p>
            {!file && (
              <div className="upload-choose-btn" style={{ pointerEvents: 'none' }}>
                Choose Files
              </div>
            )}
            {file && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#2563EB', fontWeight: 500 }}>
                ✓ File selected — click "Upload &amp; Process" above to begin
              </p>
            )}
          </div>
        )}

        {/* Supported formats info */}
        {!jobId && (
          <div style={{
            background: '#fff', border: '1px solid #E5E7EB',
            borderRadius: 12, padding: '1rem 1.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
          }}>
            <div style={{ fontSize: '0.8125rem', color: '#374151', fontWeight: 500 }}>
              Supported formats
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {ALLOWED.map(fmt => (
                <span key={fmt} style={{
                  padding: '0.2rem 0.625rem', borderRadius: 6,
                  background: '#F3F4F6', color: '#374151',
                  fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                }}>
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Processing card (after upload) ── */}
        {jobId && (
          <div className="processing-card">
            {/* Card header */}
            <div className="processing-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: '#EFF6FF', border: '1px solid #BFDBFE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
                }}>🎧</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
                    {file?.name || 'Audio File'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>
                    {status === 'done' ? '✅ Processing complete' : `⚙️ ${PIPELINE_STAGES[stageIndex]?.label || 'Processing'}…`}
                  </div>
                </div>
              </div>
              <span style={{
                padding: '0.25rem 0.75rem', borderRadius: 999,
                background: status === 'done' ? '#ECFDF5' : '#EFF6FF',
                color: status === 'done' ? '#059669' : '#2563EB',
                fontSize: '0.75rem', fontWeight: 700, border: `1px solid ${status === 'done' ? '#A7F3D0' : '#BFDBFE'}`,
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
            <div className="processing-stage-dots">
              {PIPELINE_STAGES.map((stage, i) => (
                <div
                  key={stage.key}
                  className={`stage-dot ${i < stageIndex ? 'done' : i === stageIndex ? 'active' : ''}`}
                  title={stage.label}
                />
              ))}
            </div>

            {/* Stage list */}
            <div className="steps-list" style={{ marginTop: '1.25rem' }} role="list">
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
