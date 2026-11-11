'use client';

import React from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';

type Invitee = {
  userId: string;
  name: string;
  title: string | null;
  email: string;
  invitedAt: string;
  lastOpenedAt: string | null;
  status: 'completed' | 'in_progress' | 'not_started';
  completedAt: string | null;
};

type EligibleUser = { userId: string; name: string; title: string | null; email: string };

type RosterResponse = {
  canManage?: boolean;
  maxInvitees?: number;
  invitees?: Invitee[];
  eligibleUsers?: EligibleUser[];
  error?: string;
};

const STATUS_STYLE: Record<Invitee['status'], { label: string; color: string; background: string }> = {
  completed: { label: '✓ Completed', color: '#065f46', background: '#d1fae5' },
  in_progress: { label: 'In Progress', color: '#92400e', background: '#fef3c7' },
  not_started: { label: 'Not Started', color: '#991b1b', background: '#fee2e2' },
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '6px 8px',
  borderBottom: '1px solid #e2e8f0',
};

const tdStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#1e293b',
  padding: '8px',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle',
};

const smallButton = (background: string, color = 'white', border = 'none'): React.CSSProperties => ({
  padding: '4px 8px',
  background,
  color,
  border,
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

async function fetchRoster(companyId: string): Promise<{ data?: RosterResponse; error?: string }> {
  try {
    const response = await fetch(`/api/team-assessment?companyId=${encodeURIComponent(companyId)}`, {
      credentials: 'include',
    });
    const data: RosterResponse = await response.json().catch(() => ({ error: 'Invalid response' }));
    if (!response.ok) return { error: data.error || 'Failed to load Team Assessment users.' };
    return { data };
  } catch {
    return { error: 'Network error loading Team Assessment users.' };
  }
}

export default function TeamAssessmentInvitesPanel({ companyId }: { companyId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);
  const [roster, setRoster] = React.useState<RosterResponse>({});
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const applyRoster = React.useCallback((result: { data?: RosterResponse; error?: string }) => {
    if (result.data) setRoster(result.data);
    if (result.error) setMessage({ type: 'error', text: result.error });
    setLoading(false);
  }, []);

  const loadRoster = React.useCallback(
    async () => applyRoster(await fetchRoster(companyId)),
    [applyRoster, companyId]
  );

  React.useEffect(() => {
    let cancelled = false;
    fetchRoster(companyId).then((result) => {
      if (!cancelled) applyRoster(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyRoster, companyId]);

  const invite = async (userId: string) => {
    setBusyUserId(userId);
    setMessage(null);
    try {
      const response = await fetch('/api/team-assessment', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, userId }),
      });
      const data = await response.json().catch(() => ({ error: 'Invalid response' }));
      if (!response.ok) {
        setMessage({ type: 'error', text: data.error || 'Invitation failed.' });
        return;
      }
      const person = [...(roster.invitees || []), ...(roster.eligibleUsers || [])].find((u) => u.userId === userId);
      const who = person?.email || 'the user';
      setMessage(
        data.emailSent
          ? { type: 'success', text: `${data.resent ? 'Invitation re-sent' : 'Invitation sent'} to ${who}.` }
          : {
              type: 'error',
              text: `${who} now has Team Assessment access, but the invitation email could not be sent: ${data.emailError || 'unknown error'}`,
            }
      );
      setSelectedUserId('');
      await loadRoster();
    } catch {
      setMessage({ type: 'error', text: 'Network error sending invitation.' });
    } finally {
      setBusyUserId(null);
    }
  };

  const remove = async (invitee: Invitee) => {
    if (!window.confirm(`Remove ${invitee.name || invitee.email} from the Team Assessment?`)) return;
    setBusyUserId(invitee.userId);
    setMessage(null);
    try {
      const params = new URLSearchParams({ companyId, userId: invitee.userId });
      const response = await fetch(`/api/team-assessment?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ type: 'error', text: data.error || 'Remove failed.' });
        return;
      }
      await loadRoster();
    } catch {
      setMessage({ type: 'error', text: 'Network error removing invitation.' });
    } finally {
      setBusyUserId(null);
    }
  };

  const invitees = roster.invitees || [];
  const eligibleUsers = roster.eligibleUsers || [];
  const maxInvitees = roster.maxInvitees || 5;
  const atLimit = invitees.length >= maxInvitees;

  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', border: '2px solid #8b5cf6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#475569', margin: '0 0 6px 0' }}>Team Assessment Users</h4>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#8b5cf6' }}>
          {invitees.length} / {maxInvitees}
        </div>
      </div>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 12px 0' }}>
        Invite up to {maxInvitees} people from Manage Users. They sign in with their existing Corelytics login; no new password is created.
      </p>

      {message && (
        <div
          style={{
            marginBottom: '12px',
            padding: '8px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: '12px', color: '#64748b' }}>Loading…</div>
      ) : roster.canManage === undefined ? null : roster.canManage === false ? (
        <div style={{ fontSize: '12px', color: '#64748b' }}>Only Company Admins can manage Team Assessment users.</div>
      ) : (
        <>
          {invitees.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', padding: '12px', background: '#faf5ff', borderRadius: '6px' }}>
              No one has been invited yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Invited</th>
                    <th style={thStyle}>Last Opened Team Assessment</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {invitees.map((invitee) => {
                    const status = STATUS_STYLE[invitee.status];
                    const busy = busyUserId === invitee.userId;
                    return (
                      <tr key={invitee.userId}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>
                            {invitee.name}
                            {invitee.title && (
                              <span style={{ fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>({invitee.title})</span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{invitee.email}</div>
                        </td>
                        <td style={tdStyle}>{formatEstDateTime(invitee.invitedAt)}</td>
                        <td style={tdStyle}>
                          {invitee.lastOpenedAt ? (
                            formatEstDateTime(invitee.lastOpenedAt)
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Not yet</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              color: status.color,
                              background: status.background,
                              padding: '3px 8px',
                              borderRadius: '4px',
                              whiteSpace: 'nowrap',
                            }}
                            title={invitee.completedAt ? `Completed ${formatEstDateTime(invitee.completedAt)}` : undefined}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => void invite(invitee.userId)}
                              disabled={busyUserId !== null}
                              style={{ ...smallButton('white', '#6d28d9', '1px solid #c4b5fd'), opacity: busyUserId !== null ? 0.6 : 1 }}
                            >
                              {busy ? 'Sending…' : 'Resend'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(invitee)}
                              disabled={busyUserId !== null}
                              style={{ ...smallButton('#ef4444'), opacity: busyUserId !== null ? 0.6 : 1 }}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ borderTop: '1px solid #ede9fe', paddingTop: '12px', marginTop: '12px' }}>
            <h5 style={{ fontSize: '13px', fontWeight: 600, color: '#475569', margin: '0 0 8px 0' }}>Invite From Manage Users</h5>
            {atLimit ? (
              <div style={{ padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px', fontSize: '11px', color: '#92400e' }}>
                ⚠ Maximum {maxInvitees} Team Assessment users reached
              </div>
            ) : eligibleUsers.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Everyone in Manage Users has been invited. Add people in Manage Users first to invite them here.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white' }}
                >
                  <option value="">Select a user…</option>
                  {eligibleUsers.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.name ? `${user.name} (${user.email})` : user.email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => selectedUserId && void invite(selectedUserId)}
                  disabled={!selectedUserId || busyUserId !== null}
                  style={{
                    padding: '8px 14px',
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: !selectedUserId || busyUserId !== null ? 'not-allowed' : 'pointer',
                    opacity: !selectedUserId || busyUserId !== null ? 0.6 : 1,
                  }}
                >
                  {busyUserId === selectedUserId && selectedUserId ? 'Sending…' : 'Send Invitation'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
