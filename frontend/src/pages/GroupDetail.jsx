// frontend/src/pages/GroupDetail.jsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../api';

export default function GroupDetail() {
  const { groupId } = useParams();
  const navigate     = useNavigate();
  const [group,      setGroup]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [myNotes,    setMyNotes]    = useState([]);
  const [showShare,  setShowShare]  = useState(false);
  const [shareNoteId, setShareNoteId] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState('');
  const [copied,     setCopied]     = useState(false);

  const load = useCallback(async () => {
    try {
      const [gRes, nRes] = await Promise.all([
        api.get(`/groups/${groupId}`),
        api.get('/user/uploads'),
      ]);
      setGroup(gRes.data);
      setMyNotes(nRes.data.filter(u => u.status === 'done'));
    } catch (err) {
      if (err.response?.status === 403) navigate('/groups');
    } finally { setLoading(false); }
  }, [groupId, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!shareNoteId) return;
    setSaving(true); setMsg('');
    try {
      await api.post(`/groups/${groupId}/notes`, { audio_file_id: parseInt(shareNoteId) });
      setMsg('✅ Note shared with group!');
      setShowShare(false); setShareNoteId('');
      load();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.detail || 'Failed to share note.'));
    } finally { setSaving(false); }
  };

  const handleRemoveNote = async (gnId) => {
    if (!window.confirm('Remove this note from the group?')) return;
    try {
      await api.delete(`/groups/${groupId}/notes/${gnId}`);
      load();
    } catch (_) {}
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this group?')) return;
    try { await api.delete(`/groups/${groupId}/leave`); navigate('/groups'); }
    catch (err) { setMsg('❌ ' + (err.response?.data?.detail || 'Failed to leave.')); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this group permanently? This cannot be undone.')) return;
    try { await api.delete(`/groups/${groupId}`); navigate('/groups'); }
    catch (err) { setMsg('❌ ' + (err.response?.data?.detail || 'Failed to delete.')); }
  };

  const copyCode = () => {
    if (group?.invite_code) {
      navigator.clipboard.writeText(group.invite_code);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '5rem' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <p>Loading group…</p>
      </div>
    </div>
  );

  if (!group) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Navbar />
      <main className="container page-enter" style={{ padding: '2rem 1.5rem' }}>

        {/* Back link */}
        <Link to="/groups" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1.25rem' }}>
          ← Back to Groups
        </Link>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ marginBottom: '0.25rem' }}>👥 {group.name}</h1>
            {group.description && <p style={{ color: 'var(--text-muted)' }}>{group.description}</p>}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
              Owned by {group.owner} · {group.members.length} member{group.members.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {group.my_role !== 'owner' && (
              <button className="btn btn-danger btn-sm" onClick={handleLeave}>Leave Group</button>
            )}
            {group.my_role === 'owner' && (
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>🗑 Delete Group</button>
            )}
          </div>
        </div>

        {/* Alert */}
        {msg && (
          <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1.25rem' }}>
            {msg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>

          {/* Notes in group */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem' }}>📝 Shared Notes ({group.notes.length})</h2>
              <button id="share-note-btn" className="btn btn-primary btn-sm" onClick={() => { setShowShare(s => !s); setMsg(''); }}>
                + Share a Note
              </button>
            </div>

            {showShare && (
              <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--brand-border)', background: 'var(--brand-bg)' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Share one of your notes</h4>
                <form onSubmit={handleAddNote}>
                  <div className="form-group">
                    <select className="form-input" value={shareNoteId} onChange={e => setShareNoteId(e.target.value)} required>
                      <option value="">Select a note…</option>
                      {myNotes.map(n => (
                        <option key={n.id} value={n.id}>{n.filename}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                      {saving ? 'Sharing…' : 'Share Note'}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowShare(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {group.notes.length === 0 ? (
              <div className="empty-state card">
                <span className="empty-icon">📭</span>
                <p>No notes shared yet. Be the first to share one!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {group.notes.map(note => (
                  <div key={note.group_note_id} className="card" style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>📝</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{note.filename}</div>
                          <div style={{ fontSize: '0.775rem', color: 'var(--text-subtle)' }}>
                            Added by {note.added_by} · {note.word_count?.toLocaleString()} words
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link to={`/notes/${note.audio_file_id}`} className="btn btn-success btn-sm">View →</Link>
                        <button className="btn btn-danger btn-sm" onClick={() => handleRemoveNote(note.group_note_id)}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar: members + invite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Invite code (owner only) */}
            {group.my_role === 'owner' && group.invite_code && (
              <div className="card" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-bg)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brand)', marginBottom: '0.5rem' }}>
                  🔑 Invite Code
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.2em', color: 'var(--text-primary)', marginBottom: '0.625rem' }}>
                  {group.invite_code}
                </div>
                <button className="btn btn-secondary btn-sm btn-full" onClick={copyCode}>
                  {copied ? '✓ Copied!' : '📋 Copy Code'}
                </button>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.5rem' }}>
                  Share this code with classmates to invite them.
                </p>
              </div>
            )}

            {/* Members */}
            <div className="card">
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-subtle)', marginBottom: '0.75rem' }}>
                Members ({group.members.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {group.members.map(m => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', color: 'var(--brand)', flexShrink: 0 }}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        {m.name} {m.role === 'owner' && <span style={{ fontSize: '0.7rem' }}>👑</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{m.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
