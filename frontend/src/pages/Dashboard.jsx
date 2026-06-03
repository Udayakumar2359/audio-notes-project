import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../api';

const STATUS_ORDER = ['uploaded', 'converting', 'chunking', 'transcribing', 'structuring', 'done'];

function StatusBadge({ status }) {
  const base = status?.split(':')[0] || 'uploaded';
  const isBusy = ['converting', 'chunking', 'transcribing', 'structuring'].includes(base);
  const label = base.startsWith('fail') ? 'Failed' : base.charAt(0).toUpperCase() + base.slice(1);
  const cls = base.startsWith('fail') ? 'badge badge-failed' : `badge badge-${base}`;
  return (
    <span className={cls}>
      {isBusy && <span className="pulse-dot" style={{ width: 7, height: 7 }} />}
      {label}
    </span>
  );
}

function ProgressBar({ status }) {
  const base = status?.split(':')[0];
  const idx = STATUS_ORDER.indexOf(base);
  const pct = idx < 0 ? 0 : Math.max(5, (idx / (STATUS_ORDER.length - 1)) * 100);
  const isDone = base === 'done';
  if (!STATUS_ORDER.includes(base)) return null;
  return (
    <div className="progress-bar" style={{ marginTop: '0.75rem' }}>
      <div className={`progress-fill ${isDone ? 'done' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      const [uploadsRes, meRes] = await Promise.all([
        api.get('/user/uploads'),
        api.get('/auth/me'),
      ]);
      setUploads(uploadsRes.data);
      setUser(meRes.data);
    } catch (_) { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const hasActive = uploads.some(u =>
      ['uploaded', 'converting', 'chunking', 'transcribing', 'structuring'].includes(u.status?.split(':')[0])
    );
    if (!hasActive) return;
    const id = setInterval(loadData, 5000);
    return () => clearInterval(id);
  }, [uploads, loadData]);

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
    } catch (_) { }
    setRenamingId(null);
  };

  const cancelRename = (e) => { e && e.stopPropagation(); setRenamingId(null); };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await api.get(`/audio/${id}/group-references`);
      const data = res.data;
      setDeleteModal({
        id,
        filename: data.filename,
        groups: data.affected_groups || [],
        sharedLinks: data.shared_links || [],
        hasRefs: data.has_references,
      });
    } catch (_) {
      const upload = uploads.find(u => u.id === id);
      setDeleteModal({ id, filename: upload?.filename || 'this recording', groups: [], sharedLinks: [], hasRefs: false });
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/audio/${deleteModal.id}`);
      setUploads(prev => prev.filter(u => u.id !== deleteModal.id));
      setDeleteModal(null);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Delete failed. Please try again.';
      alert(`Error: ${msg}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const cancelDelete = () => setDeleteModal(null);

  const doneCount = uploads.filter(u => u.status === 'done').length;
  const busyCount = uploads.filter(u =>
    ['uploaded', 'converting', 'chunking', 'transcribing', 'structuring'].includes(u.status?.split(':')[0])
  ).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', paddingBottom: '5rem' }}>
      <Navbar />

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
          onClick={cancelDelete}
        >
          <div
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)',
              padding: '2rem', maxWidth: 440, width: '100%',
              boxShadow: 'var(--shadow-lg)', position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Delete Recording?
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>"{deleteModal.filename?.replace(/\.yt$/, '')}"</strong>{' '}
              and all its notes, transcripts, and AI data will be{' '}
              <span style={{ color: 'var(--error)', fontWeight: 600 }}>permanently removed</span>.
            </p>

            {deleteModal.hasRefs && (
              <div style={{
                background: 'var(--error-bg)', border: '1px solid var(--error-border)',
                borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', marginBottom: '1rem',
              }}>
                <p style={{ color: 'var(--error)', fontWeight: 700, fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                  This will also remove:
                </p>
                {deleteModal.groups.length > 0 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--error)' }}>
                      Note shared in {deleteModal.groups.length} study group{deleteModal.groups.length > 1 ? 's' : ''}:
                    </span>
                    <ul style={{ fontSize: '0.78rem', color: 'var(--error)', marginLeft: '1rem', marginTop: '0.25rem', listStyle: 'disc' }}>
                      {deleteModal.groups.map(g => <li key={g.id}>{g.name}</li>)}
                    </ul>
                  </div>
                )}
                {deleteModal.sharedLinks.length > 0 && (
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--error)' }}>
                    {deleteModal.sharedLinks.length} public share link{deleteModal.sharedLinks.length > 1 ? 's' : ''}{' '}
                    (total views: {deleteModal.sharedLinks.reduce((a, l) => a + (l.view_count || 0), 0)})
                  </span>
                )}
              </div>
            )}
            <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginBottom: '1.25rem' }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={cancelDelete} disabled={deleteLoading}>
                Cancel
              </button>
              <button className="btn btn-danger btn-sm" onClick={confirmDelete} disabled={deleteLoading}>
                {deleteLoading ? 'Deleting...' : deleteModal.hasRefs ? 'Yes, Delete Everything' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="container" style={{ paddingTop: '2.5rem' }}>
        {/* Page header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ marginBottom: '0.375rem' }}>
            Good to see you, {user?.name?.split(' ')[0] || 'Student'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
            Your multilingual lecture recordings and AI-generated notes.
          </p>
        </div>

        {/* Stats row */}
        <div className="stats-row" style={{ marginBottom: '2rem' }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--text-primary)' }}>{uploads.length}</div>
            <div className="stat-label">Total Uploads</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{doneCount}</div>
            <div className="stat-label">Notes Ready</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--warning)' }}>{busyCount}</div>
            <div className="stat-label">Processing</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: '1.25rem', paddingTop: '0.25rem' }}>KN·HI·EN</div>
            <div className="stat-label">Languages</div>
          </div>
        </div>

        {/* Section header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem' }}>My Recordings</h2>
          <Link to="/upload" className="btn btn-primary btn-sm">+ New Upload</Link>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: '5rem 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            Loading your recordings…
          </div>
        ) : uploads.length === 0 ? (
          <div className="empty-state card-flat" style={{ borderStyle: 'dashed', borderWidth: 2 }}>
            <h3 style={{ marginBottom: '0.5rem' }}>No recordings yet</h3>
            <p style={{ maxWidth: 340, margin: '0 auto 1.5rem' }}>
              Upload a classroom audio file in Kannada, Hindi, or English to get AI-structured lecture notes instantly.
            </p>
            <Link to="/upload" className="btn btn-primary">Upload your first recording</Link>
          </div>
        ) : (
          <div className="uploads-grid">
            {uploads.map(upload => {
              const isDone = upload.status === 'done';
              const isFailed = upload.status?.startsWith('fail');
              const isYt = upload.filename?.endsWith('.yt');
              return (
                <div
                  key={upload.id}
                  className={`upload-card ${isDone ? 'clickable' : ''}`}
                  style={{ opacity: isFailed ? 0.75 : 1 }}
                  onClick={() => isDone && navigate(`/notes/${upload.id}`)}
                >
                  <div className="upload-card-header">
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button
                        onClick={e => startRename(upload, e)}
                        style={{
                          padding: '0.2rem 0.625rem', fontSize: '0.72rem', fontWeight: 600,
                          border: '1px solid var(--border-strong)', borderRadius: 6,
                          background: 'transparent', color: 'var(--text-secondary)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        Rename
                      </button>
                      <button
                        onClick={e => handleDelete(upload.id, e)}
                        style={{
                          padding: '0.2rem 0.625rem', fontSize: '0.72rem', fontWeight: 600,
                          border: '1px solid var(--error-border)', borderRadius: 6,
                          background: 'transparent', color: 'var(--error)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'var(--error-bg)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div>
                    {renamingId === upload.id ? (
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveRename(upload.id, e);
                            if (e.key === 'Escape') cancelRename(e);
                          }}
                          className="form-input"
                          style={{ padding: '0.35rem 0.625rem', fontSize: '0.875rem' }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={e => saveRename(upload.id, e)}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={cancelRename}>✕</button>
                      </div>
                    ) : (
                      <div className="upload-filename" style={{ marginBottom: '0.25rem' }} title={upload.filename}>
                        {upload.filename?.replace(/\.yt$/, '')}
                      </div>
                    )}
                    <div className="upload-date">
                      {new Date(upload.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                    <div style={{ marginTop: '0.625rem' }}>
                      <StatusBadge status={upload.status} />
                    </div>
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
