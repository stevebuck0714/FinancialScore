'use client';

import { useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import type { ConsolidationNote } from '@/lib/real-estate/consolidated-financials';

type StatementNote = { id: string; period: string | null; body: string; createdBy: string | null; updatedBy: string | null; createdAt: string; updatedAt: string };
type Props = {
  companyId: string;
  notes: ConsolidationNote[];
  statementNotes: StatementNote[];
  /** Months (YYYY-MM) on screen; a note tied to a year or month shows only when that period is on screen. */
  visibleMonths: string[];
  fmt: (value: unknown) => string;
  onChanged: () => void;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '7px 10px', textAlign: 'right', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const input: React.CSSProperties = { padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13 };
const saveButton = (busy: boolean): React.CSSProperties => ({ padding: '6px 12px', background: busy ? '#9ca3af' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)' });
const secondaryButton: React.CSSProperties = { padding: '6px 12px', background: '#eff6ff', color: '#1e3a8a', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const linkButton: React.CSSProperties = { border: 0, padding: 0, background: 'transparent', color: '#1d4ed8', fontSize: 12, fontWeight: 700, cursor: 'pointer' };

const periodLabel = (period: string | null) => {
  if (!period) return 'All periods';
  if (period.length === 4) return period;
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
};

/** Notes to the combined BGAH + SLN book-basis statements: one per GAAP adjustment, then the user's own notes. */
export default function CombinedStatementNotes({ companyId, notes, statementNotes, visibleMonths, fmt, onChanged }: Props) {
  const [draft, setDraft] = useState<{ id: string | null; body: string; period: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const visibleNotes = statementNotes.filter((note) => !note.period || visibleMonths.some((month) => month.startsWith(note.period!)));

  const send = async (payload: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/operations/real-estate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to save the note.');
      setDraft(null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const editor = (
    <div style={{ display: 'grid', gap: 8 }}>
      <textarea value={draft?.body || ''} onChange={(event) => setDraft((current) => current && { ...current, body: event.target.value })} rows={3} placeholder="Note" style={{ ...input, width: '100%', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Period (optional)
          <input value={draft?.period || ''} onChange={(event) => setDraft((current) => current && { ...current, period: event.target.value })} placeholder="YYYY or YYYY-MM" style={{ ...input, width: 150 }} />
        </label>
        <button type="button" disabled={saving || !draft?.body.trim()} onClick={() => draft && send({ kind: 'statement-note', id: draft.id, body: draft.body, period: draft.period })} style={saveButton(saving || !draft?.body.trim())}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" disabled={saving} onClick={() => { setDraft(null); setError(''); }} style={secondaryButton}>Cancel</button>
      </div>
    </div>
  );

  return <div style={card}>
    <h3 style={{ margin: 0 }}>Notes to the Financial Statements</h3>
    <p style={{ color: '#475569', margin: '6px 0 0', fontSize: 13 }}>Combined BGAH + SLN, book basis (GAAP). Each GAAP adjustment line on the statements is explained here; the notes update whenever the statements are rebuilt.</p>
    <ol style={{ margin: '14px 0 0', paddingLeft: 20, display: 'grid', gap: 14 }}>
      {notes.map((note) => {
        const years = [...new Set((note.byYear || []).flatMap((row) => Object.keys(row.values)))].sort();
        return <li key={note.key} style={{ fontSize: 13, color: '#0f172a' }}>
          <strong>{note.title}</strong>
          {note.paragraphs.map((paragraph, index) => <p key={index} style={{ margin: '6px 0 0', color: '#334155', lineHeight: 1.5 }}>{paragraph}</p>)}
          {note.items && <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#334155', lineHeight: 1.5 }}>{note.items.map((item) => <li key={item}>{item}</li>)}</ul>}
          {(note.tables || []).map((table) => <div key={table.title} style={{ overflowX: 'auto', marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{table.title}</div>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }} />{table.columns.map((column) => <th key={column} style={th}>{column}</th>)}</tr></thead>
              <tbody>{table.rows.map((row) => <tr key={row.label} style={row.total ? { background: '#f8fafc' } : undefined}>
                <td style={{ ...td, textAlign: 'left', fontWeight: row.total ? 800 : 400, whiteSpace: 'normal', minWidth: 220 }}>{row.label}</td>
                {row.values.map((value, index) => <td key={index} style={{ ...td, fontWeight: row.total ? 800 : 400 }}>{value === null ? '—' : fmt(value)}</td>)}
              </tr>)}</tbody>
            </table>
          </div>)}
          {years.length > 0 && <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Year</th>{years.map((year) => <th key={year} style={th}>{year}</th>)}</tr></thead>
              <tbody>{note.byYear!.map((row) => <tr key={row.label}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{row.label}</td>
                {years.map((year) => <td key={year} style={td}>{row.values[year] === undefined ? '—' : fmt(row.values[year])}</td>)}
              </tr>)}</tbody>
            </table>
          </div>}
        </li>;
      })}
    </ol>
    <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: 13 }}>Additional notes</h4>
        {!draft && <button type="button" onClick={() => setDraft({ id: null, body: '', period: '' })} style={secondaryButton}>Add Note</button>}
      </div>
      {draft && !draft.id && editor}
      {!visibleNotes.length && !draft && <div style={{ color: '#64748b', fontSize: 12 }}>No additional notes for the periods shown.</div>}
      {visibleNotes.map((note) => draft?.id === note.id
        ? <div key={note.id}>{editor}</div>
        : <div key={note.id} style={{ fontSize: 13, color: '#334155' }}>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note.body}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, fontSize: 11, color: '#64748b', flexWrap: 'wrap' }}>
            <span>{periodLabel(note.period)} · {note.updatedBy || note.createdBy || 'Unknown'} · {formatEstDateTime(note.updatedAt)}</span>
            <button type="button" onClick={() => setDraft({ id: note.id, body: note.body, period: note.period || '' })} style={linkButton}>Edit</button>
            <button type="button" disabled={saving} onClick={() => { if (window.confirm('Delete this note?')) void send({ kind: 'statement-note-delete', id: note.id }); }} style={{ ...linkButton, color: '#b91c1c' }}>Delete</button>
          </div>
        </div>)}
      {error && <div style={{ color: '#b91c1c', fontSize: 12 }}>{error}</div>}
    </div>
  </div>;
}
