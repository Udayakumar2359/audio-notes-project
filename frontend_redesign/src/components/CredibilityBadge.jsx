// frontend/src/components/CredibilityBadge.jsx
// ─────────────────────────────────────────────────────────────
// Reusable trust badge displayed in the Notes header.
// Shows grade colour + tooltip with full metric breakdown.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';

const GRADE_CONFIG = {
  High:             { color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC', emoji: '🟢' },
  Medium:           { color: '#D97706', bg: '#FEF3C7', border: '#FCD34D', emoji: '🟡' },
  Low:              { color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5', emoji: '🔴' },
  Grounded:         { color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC', emoji: '🟢' },
  Partial:          { color: '#D97706', bg: '#FEF3C7', border: '#FCD34D', emoji: '🟡' },
  'Off-Topic':      { color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5', emoji: '🔴' },
  'Not checked yet':{ color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB', emoji: '⚪' },
};

function fmt(val, pct = false) {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return pct ? `${(n * 100).toFixed(1)}%` : n.toFixed(3);
}

// ── Single metric row inside tooltip ─────────────────────────
function MetricRow({ label, value, pct = false, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', fontSize: '0.75rem' }}>
      <span style={{ color: '#9CA3AF' }}>{label}</span>
      <span style={{ color: '#F1F5F9', fontWeight: 700 }}>
        {fmt(value, pct)}{sub ? <span style={{ color: '#6B7280', fontWeight: 400 }}> {sub}</span> : null}
      </span>
    </div>
  );
}

// ── T5 Faithfulness badge ─────────────────────────────────────
export function T5Badge({ t5 }) {
  const [show, setShow] = useState(false);
  if (!t5 || !t5.grade) return null;

  const cfg = GRADE_CONFIG[t5.grade] || GRADE_CONFIG.Low;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          color: cfg.color, fontSize: '0.72rem', fontWeight: 700,
          cursor: 'default', whiteSpace: 'nowrap',
        }}
        title="T5 Note Faithfulness"
      >
        {cfg.emoji} Notes: {t5.grade}
      </button>

      {show && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 100,
          background: '#1E293B', borderRadius: 10, padding: '12px 14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          border: '1px solid #334155', minWidth: 220,
          display: 'flex', flexDirection: 'column', gap: '0.45rem',
        }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            T5 Faithfulness
          </div>
          <MetricRow label="ROUGE-L"   value={t5.rouge_l}   pct />
          <MetricRow label="ROUGE-1"   value={t5.rouge_1}   pct />
          <MetricRow label="ROUGE-2"   value={t5.rouge_2}   pct />
          <MetricRow label="Coverage"  value={t5.coverage}  pct sub="of transcript" />
          <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 6, fontSize: '0.72rem' }}>
            <span style={{ color: t5.hallucination_flag ? '#F87171' : '#4ADE80', fontWeight: 700 }}>
              {t5.hallucination_flag ? '⚠ Possible hallucination' : '✓ No hallucination detected'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Groundedness badge ──────────────────────────────────
export function AgentBadge({ agent }) {
  const [show, setShow] = useState(false);
  if (!agent) return null;

  const grade = agent.grade || 'Not checked yet';
  const cfg   = GRADE_CONFIG[grade] || GRADE_CONFIG['Not checked yet'];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          color: cfg.color, fontSize: '0.72rem', fontWeight: 700,
          cursor: 'default', whiteSpace: 'nowrap',
        }}
        title="AI Agent Groundedness"
      >
        {cfg.emoji} Agent: {grade}
      </button>

      {show && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 100,
          background: '#1E293B', borderRadius: 10, padding: '12px 14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          border: '1px solid #334155', minWidth: 220,
          display: 'flex', flexDirection: 'column', gap: '0.45rem',
        }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Agent Groundedness
          </div>
          <MetricRow label="Exchanges checked" value={agent.exchanges_checked || 0} />
          <MetricRow label="Avg overlap"       value={agent.avg_overlap}    pct />
          {agent.exchanges_checked === 0 && (
            <div style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: 4 }}>
              Start chatting to see live scores
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Combined default export ───────────────────────────────────
export default function CredibilityBadges({ credibility }) {
  if (!credibility) return null;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <T5Badge   t5={credibility.t5} />
      <AgentBadge agent={credibility.agent} />
    </div>
  );
}
