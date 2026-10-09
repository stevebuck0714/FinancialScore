'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';

type MyThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
  sharedWith: Array<{ userId: string; name: string; viewed: boolean }>;
};

type SharedThreadSummary = {
  shareId: string;
  threadId: string;
  title: string;
  sharedAt: string;
  viewedAt: string | null;
  turnCount: number;
  message: string | null;
  sharedBy: { name: string; email: string };
};

type ShareCandidate = { id: string; name: string; email: string };

type ExistingShare = {
  userId: string;
  name: string;
  email: string;
  sharedAt: string;
  viewedAt: string | null;
  sharedTurnCount: number;
};

const cardStyle: CSSProperties = {
  background: 'white',
  borderRadius: '12px',
  padding: '16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
};

const headingStyle: CSSProperties = { fontSize: '14px', fontWeight: 800, color: '#0f172a' };

const listStyle: CSSProperties = { display: 'grid', gap: '6px', maxHeight: '260px', overflowY: 'auto' };

const removeButtonStyle: CSSProperties = {
  padding: '0 10px',
  borderRadius: '10px',
  border: '1px solid #fecaca',
  background: '#fff',
  color: '#b91c1c',
  fontWeight: 800,
  cursor: 'pointer',
};

function questionCount(count: number): string {
  return `${count} question${count === 1 ? '' : 's'}`;
}

function threadButtonStyle(active: boolean): CSSProperties {
  return {
    textAlign: 'left',
    padding: '8px 10px',
    background: active ? '#eff6ff' : '#f8fafc',
    border: active ? '1px solid #93c5fd' : '1px solid #e2e8f0',
    borderRadius: '10px',
    cursor: 'pointer',
    color: '#0f172a',
    flex: 1,
    minWidth: 0,
  };
}

const MAX_NAMES_SHOWN = 3;

function SharedWithLine(props: { recipients: MyThreadSummary['sharedWith'] }) {
  const shown = props.recipients.slice(0, MAX_NAMES_SHOWN);
  const hidden = props.recipients.slice(MAX_NAMES_SHOWN);
  return (
    <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '3px', lineHeight: '1.4' }}>
      Shared with{' '}
      {shown.map((recipient, idx) => (
        <span key={recipient.userId} title={recipient.viewed ? 'Viewed' : 'Not viewed yet'}>
          {idx > 0 ? ', ' : ''}
          {recipient.name}
          <span style={{ color: recipient.viewed ? '#15803d' : '#94a3b8' }}>{recipient.viewed ? ' (viewed)' : ' (not viewed)'}</span>
        </span>
      ))}
      {hidden.length > 0 && (
        <span title={hidden.map((r) => `${r.name} (${r.viewed ? 'viewed' : 'not viewed'})`).join('\n')}>
          {` +${hidden.length} more`}
        </span>
      )}
    </div>
  );
}

export function AskThreadsSidebar(props: {
  companyId: string;
  refreshKey: number;
  activeThreadId: string | null;
  onOpenThread: (threadId: string) => void;
  onThreadRemoved: (threadId: string) => void;
}) {
  const { companyId, refreshKey, activeThreadId, onOpenThread, onThreadRemoved } = props;
  const [myThreads, setMyThreads] = useState<MyThreadSummary[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedThreadSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ask-threads?companyId=${encodeURIComponent(companyId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || 'Failed to load threads.');
          return;
        }
        setError(null);
        setMyThreads(Array.isArray(data?.myThreads) ? data.myThreads : []);
        setSharedWithMe(Array.isArray(data?.sharedWithMe) ? data.sharedWithMe : []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load threads.');
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, refreshKey, reloadKey]);

  async function removeThread(threadId: string, confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    const res = await fetch(`/api/ask-threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || 'Failed to delete.');
      return;
    }
    onThreadRemoved(threadId);
    setReloadKey((k) => k + 1);
  }

  const unreadCount = sharedWithMe.filter((s) => !s.viewedAt).length;

  return (
    <>
      <div style={cardStyle}>
        <div style={{ ...headingStyle, marginBottom: '10px' }}>My Threads</div>
        {error && <div style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '8px' }}>{error}</div>}
        {myThreads.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>Your questions are saved here automatically.</div>
        ) : (
          <div style={listStyle}>
            {myThreads.map((thread) => (
              <div key={thread.id} style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                <button onClick={() => onOpenThread(thread.id)} style={threadButtonStyle(thread.id === activeThreadId)}>
                  <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: '1.35', overflowWrap: 'anywhere' }}>{thread.title}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    {questionCount(thread.turnCount)} · {formatEstDateTime(thread.updatedAt)}
                  </div>
                  {thread.sharedWith.length > 0 && <SharedWithLine recipients={thread.sharedWith} />}
                </button>
                <button
                  title="Delete thread"
                  style={removeButtonStyle}
                  onClick={() =>
                    removeThread(
                      thread.id,
                      thread.sharedWith.length > 0
                        ? `Delete "${thread.title}"? ${thread.sharedWith.map((r) => r.name).join(', ')} will lose access.`
                        : `Delete "${thread.title}"?`,
                    )
                  }
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={headingStyle}>Shared with me</div>
          {unreadCount > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', background: '#2563eb', borderRadius: '999px', padding: '2px 8px' }}>
              {unreadCount} new
            </span>
          )}
        </div>
        {sharedWithMe.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>Threads other people share with you appear here.</div>
        ) : (
          <div style={listStyle}>
            {sharedWithMe.map((share) => (
              <div key={share.shareId} style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                <button onClick={() => onOpenThread(share.threadId)} style={threadButtonStyle(share.threadId === activeThreadId)}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                    {!share.viewedAt && (
                      <span style={{ fontSize: '10px', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase' }}>New</span>
                    )}
                    <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: '1.35', overflowWrap: 'anywhere' }}>{share.title}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    From {share.sharedBy.name || share.sharedBy.email} · {questionCount(share.turnCount)} · {formatEstDateTime(share.sharedAt)}
                  </div>
                  {share.message && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#334155',
                        fontStyle: 'italic',
                        marginTop: '4px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      &ldquo;{share.message}&rdquo;
                    </div>
                  )}
                </button>
                <button
                  title="Remove from my list"
                  style={removeButtonStyle}
                  onClick={() => removeThread(share.threadId, `Remove "${share.title}" from your Shared with me list?`)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function ShareThreadDialog(props: { threadId: string; onClose: () => void; onShared: () => void }) {
  const { threadId, onClose, onShared } = props;
  const [candidates, setCandidates] = useState<ShareCandidate[]>([]);
  const [shares, setShares] = useState<ExistingShare[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ask-threads/${encodeURIComponent(threadId)}/shares`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || 'Failed to load people.');
        } else {
          setCandidates(Array.isArray(data?.candidates) ? data.candidates : []);
          setShares(Array.isArray(data?.shares) ? data.shares : []);
          setTurnCount(Number(data?.turnCount || 0));
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load people.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const sharesByUser = useMemo(() => new Map(shares.map((s) => [s.userId, s])), [shares]);
  const visibleCandidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [candidates, filter]);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAllVisible() {
    const allSelected = visibleCandidates.length > 0 && visibleCandidates.every((c) => selected.has(c.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visibleCandidates) {
        if (allSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  async function share() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/ask-threads/${encodeURIComponent(threadId)}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selected), message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to share.');
      setShares(Array.isArray(data?.shares) ? data.shares : []);
      setNotice(`Shared with ${selected.size} ${selected.size === 1 ? 'person' : 'people'}.`);
      setSelected(new Set());
      setMessage('');
      onShared();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to share.');
    } finally {
      setSaving(false);
    }
  }

  async function unshare(userId: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/ask-threads/${encodeURIComponent(threadId)}/shares?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || 'Failed to remove access.');
      return;
    }
    setShares(Array.isArray(data?.shares) ? data.shares : []);
    onShared();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share thread"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, width: '100%', maxWidth: '540px', maxHeight: '85vh', display: 'grid', gridTemplateRows: 'auto auto 1fr auto auto', gap: '12px' }}
      >
        <div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>Share thread</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: '1.45' }}>
            People get a read-only copy of the {questionCount(turnCount)} in this thread as of now, in their Shared with me list. They can
            continue it in their own thread. Questions you add later are only included if you share again.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search people…"
            style={{ flex: 1, padding: '8px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
          <button
            onClick={toggleAllVisible}
            disabled={visibleCandidates.length === 0}
            style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
          >
            Select all
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'grid', gap: '6px', alignContent: 'start', minHeight: '120px' }}>
          {loading && <div style={{ fontSize: '13px', color: '#64748b' }}>Loading people…</div>}
          {!loading && candidates.length === 0 && (
            <div style={{ fontSize: '13px', color: '#64748b' }}>No other users in this company have Ask Corelytics access.</div>
          )}
          {visibleCandidates.map((candidate) => {
            const existing = sharesByUser.get(candidate.id);
            return (
              <div
                key={candidate.id}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '10px', background: selected.has(candidate.id) ? '#eff6ff' : '#fff' }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer', minWidth: 0 }}>
                  <input type="checkbox" checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{candidate.name || candidate.email}</span>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748b', overflowWrap: 'anywhere' }}>{candidate.email}</span>
                    {existing && (
                      <span style={{ display: 'block', fontSize: '11px', color: '#0369a1', marginTop: '2px' }}>
                        Shared {formatEstDateTime(existing.sharedAt)} ({questionCount(existing.sharedTurnCount)}) ·{' '}
                        {existing.viewedAt ? 'Viewed' : 'Not viewed yet'}
                        {existing.sharedTurnCount < turnCount ? ' · Select to send the latest version' : ''}
                      </span>
                    )}
                  </span>
                </label>
                {existing && (
                  <button onClick={() => unshare(candidate.id)} style={{ ...removeButtonStyle, padding: '6px 10px', fontSize: '12px' }}>
                    Remove access
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <label style={{ display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>Message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder='e.g. "Take a look at the AR trend in follow-up 2."'
            style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <span style={{ fontSize: '11px', color: '#64748b' }}>Shown to the people you select. It is not sent to the AI.</span>
        </label>

        <div style={{ display: 'grid', gap: '8px' }}>
          {error && <div style={{ fontSize: '12px', color: '#b91c1c' }}>{error}</div>}
          {notice && <div style={{ fontSize: '12px', color: '#15803d' }}>{notice}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 800, cursor: 'pointer' }}
            >
              Close
            </button>
            <button
              onClick={share}
              disabled={saving || selected.size === 0}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: saving || selected.size === 0 ? '#94a3b8' : '#2563eb',
                color: '#fff',
                fontWeight: 800,
                cursor: saving || selected.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Sharing…' : selected.size > 0 ? `Share with ${selected.size}` : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
