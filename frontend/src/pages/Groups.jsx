// frontend/src/pages/Groups.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../api';

export default function Groups() {
  const [groups,      setGroups]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [showJoin,    setShowJoin]    = useState(false);
  const [createName,  setCreateName]  = useState('');
  const [createDesc,  setCreateDesc]  = useState('');
  const [inviteCode,  setInviteCode]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState('');
  const navigate = useNavigate();

  const load = async () => {
    try { const r = await api.get('/groups'); setGroups(r.data); }
    catch (_) {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setSaving(true); setMsg('');
    try {
      const r = await api.post('/groups', { name: createName.trim(), description: createDesc.trim() || null });
      setMsg(`Group "${createName}" created!`);
      setCreateName(''); setCreateDesc(''); setShowCreate(false);
      navigate(`/groups/${r.data.id}`);
    } catch (err) {
      setMsg('Error: ' + (err.response?.data?.detail || 'Failed to create group.'));
    } finally { setSaving(false); }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setSaving(true); setMsg('');
    try {
      const r = await api.post('/groups/join', { invite_code: inviteCode.trim().toUpperCase() });
      setMsg(`${r.data.message}`);
      setInviteCode(''); setShowJoin(false);
      load();
    } catch (err) {
      setMsg('Error: ' + (err.response?.data?.detail || 'Invalid invite code.'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Navbar />
      <main className="container page-enter" style={{ padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ marginBottom: '0.25rem' }}>Study Groups</h1>
            <p>Collaborate with classmates — share notes, study together.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              id="join-group-btn"
              onClick={() => { setShowJoin(true); setShowCreate(false); setMsg(''); }}
              style={{
                padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600,
                border: '1.5px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
                background: 'transparent', color: 'var(--text-primary)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-muted)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              Join Group
            </button>
            <button id="create-group-btn" className="btn btn-primary" onClick={() => { setShowCreate(true); setShowJoin(false); setMsg(''); }}>
              + Create Group
            </button>
          </div>
        </div>

        {/* Alert */}
        {msg && (
          <div className={`alert ${msg.startsWith('Group') || msg.startsWith('Joined') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1.25rem' }}>
            {msg}
          </div>
        )}

        {/* Create Group Modal */}
        {showCreate && (
          <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'var(--brand-border)', background: 'var(--brand-bg)' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--brand-dark)' }}>Create a New Group</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Group Name *</label>
                <input className="form-input" placeholder="e.g. Physics 3rd Year" value={createName}
                  onChange={e => setCreateName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <input className="form-input" placeholder="What is this group for?" value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Group'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Join Group Modal */}
        {showJoin && (
          <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'var(--success-border)', background: 'var(--success-bg)' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--success)' }}>Join a Group</h3>
            <form onSubmit={handleJoin}>
              <div className="form-group">
                <label className="form-label">Invite Code</label>
                <input className="form-input" placeholder="Enter 8-character code (e.g. AB12CD34)"
                  value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={8} style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }} required />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-success" disabled={saving}>
                  {saving ? 'Joining…' : 'Join Group'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowJoin(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Groups list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            <p>Loading your groups…</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="empty-state card">
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No groups yet</h3>
            <p style={{ maxWidth: 360, margin: '0 auto 1.5rem' }}>
              Create your own study group or join one with an invite code.
            </p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Your First Group</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {groups.map(g => (
              <div key={g.id} className="card" style={{ cursor: 'pointer', transition: 'all var(--ease)' }}
                onClick={() => navigate(`/groups/${g.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', color: 'var(--brand)' }}>
                    {g.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`badge ${g.role === 'owner' ? 'badge-done' : 'badge-transcribing'}`}>
                    {g.role === 'owner' ? 'Owner' : 'Member'}
                  </span>
                </div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.3rem' }}>{g.name}</h3>
                {g.description && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{g.description}</p>}
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  <span>{g.member_count} member{g.member_count !== 1 ? 's' : ''}</span>
                  <span>{g.note_count} note{g.note_count !== 1 ? 's' : ''}</span>
                </div>
                {g.role === 'owner' && (
                  <div style={{ marginTop: '0.75rem', padding: '0.4rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 6, fontSize: '0.78rem', fontFamily: 'monospace', letterSpacing: '0.1em', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Code: <strong>{g.invite_code}</strong></span>
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(g.invite_code); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--brand)', fontWeight: 600 }} title="Copy code">
                      Copy
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
