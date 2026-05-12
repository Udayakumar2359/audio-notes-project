// frontend/src/pages/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../api';

const STATUS_ORDER = ['uploaded','converting','chunking','transcribing','structuring','done'];

function StatusBadge({ status }) {
  const base = status?.split(':')[0] || 'uploaded';
  const isBusy = ['converting','chunking','transcribing','structuring'].includes(base);
  const key    = base.startsWith('fail') ? 'failed' : base;
  return (
    <span className={`badge badge-${key}`} aria-live="polite">
      {isBusy && <span className="pulse-dot" aria-hidden="true" />}
      {base.startsWith('fail') ? 'Failed' : base.charAt(0).toUpperCase() + base.slice(1)}
    </span>
  );
}

function ProgressBar({ status }) {
  const base   = status?.split(':')[0];
  const idx    = STATUS_ORDER.indexOf(base);
  const pct    = idx < 0 ? 0 : Math.max(5, (idx / (STATUS_ORDER.length - 1)) * 100);
  const isDone = base === 'done';
  if (!STATUS_ORDER.includes(base)) return null;
  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill ${isDone ? 'done' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const [uploads,    setUploads]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [user,       setUser]       = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal,  setRenameVal]  = useState('');
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      const [uploadsRes, meRes] = await Promise.all([
        api.get('/user/uploads'),
        api.get('/auth/me'),
      ]);
      setUploads(uploadsRes.data);
      setUser(meRes.data);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh while any job is processing
  useEffect(() => {
    const hasActive = uploads.some(u =>
      ['uploaded','converting','chunking','transcribing','structuring'].includes(u.status?.split(':')[0])
    );
    if (!hasActive) return;
    const id = setInterval(loadData, 5000);
    return () => clearInterval(id);
  }, [uploads, loadData]);

  // ── Rename inline ─────────────────────────────────────────
  const startRename = (upload, e) => {
    e.stopPropagation();
    setRenamingId(upload.id);
    setRenameVal(upload.filename);
  };
  const saveRename = async (id, e) => {
    e && e.stopPropagation();
    if (!renameVal.trim()) return;
    try {
      await api.patch(`/audio/${id}/rename`, { new_name: renameVal.trim() });
      setUploads(prev => prev.map(u => u.id === id ? { ...u, filename: renameVal.trim() } : u));
    } catch (_) {}
    setRenamingId(null);
  };
  const cancelRename = (e) => { e && e.stopPropagation(); setRenamingId(null); };

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this recording and its notes?')) return;
    try {
      await api.delete(`/audio/${id}`);
      setUploads(prev => prev.filter(u => u.id !== id));
    } catch (_) {}
  };

  const doneCount = uploads.filter(u => u.status === 'done').length;
  const busyCount = uploads.filter(u =>
    ['uploaded','converting','chunking','transcribing','structuring'].includes(u.status?.split(':')[0])
  ).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Navbar />

      <main className="container page-enter" style={{ padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ marginBottom: '0.3rem' }}>
            Good to see you, {user?.name?.split(' ')[0] || 'Student'} 👋
          </h1>
          <p>Your multilingual lecture recordings and AI-generated notes.</p>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{uploads.length}</div>
            <div className="stat-label">Total Uploads</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{doneCount}</div>
            <div className="stat-label">Notes Ready</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{busyCount}</div>
            <div className="stat-label">Processing</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: '1rem', paddingTop: '0.2rem' }}>KN·HI·EN</div>
            <div className="stat-label">Languages</div>
          </div>
        </div>

        {/* Recordings header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.125rem' }}>My Recordings</h2>
          <Link to="/upload" id="new-upload-btn" className="btn btn-primary btn-sm">
            + New Upload
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            <p>Loading your recordings…</p>
          </div>
        ) : uploads.length === 0 ? (
          <div className="empty-state card">
            <span className="empty-icon">🎵</span>
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.625rem' }}>No recordings yet</h3>
            <p style={{ maxWidth: 380, margin: '0 auto 1.5rem' }}>
              Upload a classroom audio file in Kannada, Hindi, or English
              to get AI-structured lecture notes instantly.
            </p>
            <Link to="/upload" className="btn btn-primary">
              Upload your first recording →
            </Link>
          </div>
        ) : (
          <div className="uploads-grid">
            {uploads.map(upload => {
              const isDone = upload.status === 'done';
              return (
                <div
                  key={upload.id}
                  id={`upload-card-${upload.id}`}
                  className={`upload-card ${isDone ? 'clickable' : ''}`}
                  onClick={() => isDone && navigate(`/notes/${upload.id}`)}
                  role={isDone ? 'button' : undefined}
                  tabIndex={isDone ? 0 : undefined}
                  onKeyDown={e => isDone && e.key === 'Enter' && navigate(`/notes/${upload.id}`)}
                >
                  <div className="upload-card-header">
                    <div className="file-icon">
                      {isDone ? '📝' : upload.status?.startsWith('fail') ? '❌' : '⏳'}
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={e => startRename(upload, e)}
                        title="Rename recording"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      >✏️</button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={e => handleDelete(upload.id, e)}
                        title="Delete recording"
                        aria-label={`Delete ${upload.filename}`}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      >🗑️</button>
                    </div>
                  </div>

                  <div>
                    {renamingId === upload.id ? (
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveRename(upload.id, e);
                            if (e.key === 'Escape') cancelRename(e);
                          }}
                          style={{ flex: 1, padding: '0.3rem 0.5rem', border: '1.5px solid var(--brand)', borderRadius: 6, fontSize: '0.85rem', outline: 'none' }}
                        />
                        <button
                          onClick={e => saveRename(upload.id, e)}
                          style={{ padding: '0.3rem 0.625rem', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                        >✓</button>
                        <button
                          onClick={cancelRename}
                          style={{ padding: '0.3rem 0.5rem', background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer' }}
                        >✕</button>
                      </div>
                    ) : (
                      <div className="upload-filename" title={upload.filename}>{upload.filename}</div>
                    )}
                    <div className="upload-date">
                      {new Date(upload.created_at).toLocaleString('en-IN', {
                        dateStyle: 'medium', timeStyle: 'short',
                      })}
                    </div>
                    <StatusBadge status={upload.status} />
                    <ProgressBar status={upload.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
