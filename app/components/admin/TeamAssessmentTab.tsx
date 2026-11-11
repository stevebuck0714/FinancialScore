'use client';

import React from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import TeamAssessmentResults from './TeamAssessmentResults';

export type TeamAssessmentMember = {
  userId: string;
  name: string;
  title: string | null;
  email: string;
  invitedAt: string;
  lastOpenedAt: string | null;
  status: 'completed' | 'in_progress' | 'not_started';
  completedAt: string | null;
};

export type TeamAssessmentGroup = { id: string; name: string; createdAt: string; members: TeamAssessmentMember[] };

type EligibleUser = { userId: string; name: string; title: string | null; email: string };

type RosterResponse = {
  canManage?: boolean;
  maxPerGroup?: number;
  groups?: TeamAssessmentGroup[];
  eligibleUsers?: EligibleUser[];
  error?: string;
};

type Message = { type: 'success' | 'error'; text: string } | null;

const STATUS_STYLE: Record<TeamAssessmentMember['status'], { label: string; color: string; background: string }> = {
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

const primaryButton = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  background: '#8b5cf6',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  whiteSpace: 'nowrap',
});

async function fetchRoster(companyId: string): Promise<{ data?: RosterResponse; error?: string }> {
  try {
    const response = await fetch(`/api/team-assessment?companyId=${encodeURIComponent(companyId)}`, {
      credentials: 'include',
    });
    const data: RosterResponse = await response.json().catch(() => ({ error: 'Invalid response' }));
    if (!response.ok) return { error: data.error || 'Failed to load Team Assessment groups.' };
    return { data };
  } catch {
    return { error: 'Network error loading Team Assessment groups.' };
  }
}

async function sendJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

function GroupCard({
  group,
  maxPerGroup,
  eligibleUsers,
  busy,
  onInvite,
  onRemove,
  onRename,
  onDelete,
}: {
  group: TeamAssessmentGroup;
  maxPerGroup: number;
  eligibleUsers: EligibleUser[];
  busy: boolean;
  onInvite: (groupId: string, userId: string) => void;
  onRemove: (member: TeamAssessmentMember) => void;
  onRename: (groupId: string, name: string) => void;
  onDelete: (group: TeamAssessmentGroup) => void;
}) {
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [editingName, setEditingName] = React.useState<string | null>(null);
  const atLimit = group.members.length >= maxPerGroup;
  const submitted = group.members.filter((m) => m.status === 'completed').length;

  return (
    <div style={{ border: '1px solid #ede9fe', borderRadius: '8px', padding: '12px', background: '#fdfcff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        {editingName === null ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <h5 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{group.name}</h5>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {submitted} of {group.members.length} submitted
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
            <input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              maxLength={80}
              style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
            />
            <button
              type="button"
              disabled={!editingName.trim() || busy}
              onClick={() => {
                onRename(group.id, editingName.trim());
                setEditingName(null);
              }}
              style={smallButton('#8b5cf6')}
            >
              Save
            </button>
            <button type="button" onClick={() => setEditingName(null)} style={smallButton('white', '#475569', '1px solid #cbd5e1')}>
              Cancel
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#8b5cf6' }}>
            {group.members.length} / {maxPerGroup}
          </span>
          {editingName === null && (
            <button type="button" onClick={() => setEditingName(group.name)} style={smallButton('white', '#6d28d9', '1px solid #c4b5fd')}>
              Rename
            </button>
          )}
          {group.members.length === 0 && (
            <button type="button" disabled={busy} onClick={() => onDelete(group)} style={smallButton('#ef4444')}>
              Delete
            </button>
          )}
        </div>
      </div>

      {group.members.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#94a3b8', padding: '10px', background: '#faf5ff', borderRadius: '6px' }}>
          No one in this group yet.
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
              {group.members.map((member) => {
                const status = STATUS_STYLE[member.status];
                return (
                  <tr key={member.userId}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>
                        {member.name}
                        {member.title && <span style={{ fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>({member.title})</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{member.email}</div>
                    </td>
                    <td style={tdStyle}>{formatEstDateTime(member.invitedAt)}</td>
                    <td style={tdStyle}>
                      {member.lastOpenedAt ? formatEstDateTime(member.lastOpenedAt) : <span style={{ color: '#94a3b8' }}>Not yet</span>}
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
                        title={member.completedAt ? `Completed ${formatEstDateTime(member.completedAt)}` : undefined}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onInvite(group.id, member.userId)}
                          style={{ ...smallButton('white', '#6d28d9', '1px solid #c4b5fd'), opacity: busy ? 0.6 : 1 }}
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onRemove(member)}
                          style={{ ...smallButton('#ef4444'), opacity: busy ? 0.6 : 1 }}
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

      <div style={{ marginTop: '10px' }}>
        {atLimit ? (
          <div style={{ padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px', fontSize: '11px', color: '#92400e' }}>
            ⚠ This group is full ({maxPerGroup} people). Create another group for more participants.
          </div>
        ) : eligibleUsers.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Everyone in Manage Users is already in a group. Add people in Manage Users first to invite them here.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white' }}
            >
              <option value="">Invite from Manage Users…</option>
              {eligibleUsers.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.name ? `${user.name} (${user.email})` : user.email}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedUserId || busy}
              onClick={() => {
                onInvite(group.id, selectedUserId);
                setSelectedUserId('');
              }}
              style={primaryButton(!selectedUserId || busy)}
            >
              Send Invitation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeamAssessmentTab({
  companyId,
  currentUser,
  assessmentRecords,
}: {
  companyId: string;
  currentUser: any;
  assessmentRecords: any[];
}) {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [roster, setRoster] = React.useState<RosterResponse>({});
  const [message, setMessage] = React.useState<Message>(null);

  const applyRoster = React.useCallback((result: { data?: RosterResponse; error?: string }) => {
    if (result.data) setRoster(result.data);
    if (result.error) setMessage({ type: 'error', text: result.error });
    setLoading(false);
  }, []);

  const loadRoster = React.useCallback(async () => applyRoster(await fetchRoster(companyId)), [applyRoster, companyId]);

  React.useEffect(() => {
    let cancelled = false;
    fetchRoster(companyId).then((result) => {
      if (!cancelled) applyRoster(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyRoster, companyId]);

  const groups = roster.groups || [];
  const eligibleUsers = roster.eligibleUsers || [];
  const maxPerGroup = roster.maxPerGroup || 5;

  const run = async (action: () => Promise<Message>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action());
      await loadRoster();
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const createGroup = () =>
    run(async () => {
      const { ok, data } = await sendJson('/api/team-assessment/groups', 'POST', { companyId });
      return ok ? null : { type: 'error', text: data.error || 'Could not create group.' };
    });

  const renameGroup = (groupId: string, name: string) =>
    run(async () => {
      const { ok, data } = await sendJson('/api/team-assessment/groups', 'PATCH', { companyId, groupId, name });
      return ok ? null : { type: 'error', text: data.error || 'Could not rename group.' };
    });

  const deleteGroup = (group: TeamAssessmentGroup) => {
    if (!window.confirm(`Delete ${group.name}?`)) return;
    run(async () => {
      const params = new URLSearchParams({ companyId, groupId: group.id });
      const { ok, data } = await sendJson(`/api/team-assessment/groups?${params.toString()}`, 'DELETE');
      return ok ? null : { type: 'error', text: data.error || 'Could not delete group.' };
    });
  };

  const invite = (groupId: string, userId: string) =>
    run(async () => {
      const { ok, data } = await sendJson('/api/team-assessment', 'POST', { companyId, userId, groupId });
      if (!ok) return { type: 'error', text: data.error || 'Invitation failed.' };
      const person = [...groups.flatMap((g) => g.members), ...eligibleUsers].find((u) => u.userId === userId);
      const who = person?.email || 'the user';
      return data.emailSent
        ? { type: 'success', text: `${data.resent ? 'Invitation re-sent' : 'Invitation sent'} to ${who}.` }
        : {
            type: 'error',
            text: `${who} now has Team Assessment access, but the invitation email could not be sent: ${data.emailError || 'unknown error'}`,
          };
    });

  const remove = (member: TeamAssessmentMember) => {
    if (!window.confirm(`Remove ${member.name || member.email} from the Team Assessment?`)) return;
    run(async () => {
      const params = new URLSearchParams({ companyId, userId: member.userId });
      const { ok, data } = await sendJson(`/api/team-assessment?${params.toString()}`, 'DELETE');
      return ok ? null : { type: 'error', text: data.error || 'Remove failed.' };
    });
  };

  return (
    <div>
      <div style={{ background: 'white', borderRadius: '8px', padding: '16px', border: '2px solid #8b5cf6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#475569', margin: '0 0 6px 0' }}>Team Assessment Groups</h4>
          {roster.canManage && (
            <button type="button" disabled={busy} onClick={createGroup} style={primaryButton(busy)}>
              + New Group
            </button>
          )}
        </div>
        <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 12px 0' }}>
          Each group holds up to {maxPerGroup} people from Manage Users and gets its own results. They sign in with their existing
          Corelytics login; no new password is created.
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
        ) : groups.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#94a3b8', padding: '12px', background: '#faf5ff', borderRadius: '6px' }}>
            No groups yet. Click &quot;+ New Group&quot; to start inviting people.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                maxPerGroup={maxPerGroup}
                eligibleUsers={eligibleUsers}
                busy={busy}
                onInvite={invite}
                onRemove={remove}
                onRename={renameGroup}
                onDelete={deleteGroup}
              />
            ))}
          </div>
        )}
      </div>

      {roster.canManage && (
        <TeamAssessmentResults
          companyId={companyId}
          currentUser={currentUser}
          assessmentRecords={assessmentRecords}
          groups={groups}
        />
      )}
    </div>
  );
}
