'use client';

/**
 * Self-contained shell that renders the integration container, programs
 * container, shared sync schedule, and Save action for any registry-native
 * accounting system. Drop into SiteAdminDashboard with:
 *
 *   <AccountingSystemPanel companyId={c.id} system={c.accountingSystem} />
 *
 * The panel:
 *   - looks up the plugin in the registry
 *   - fetches existing settings/programs/schedule from the generic API
 *   - hands the plugin's IntegrationContainer + ProgramsContainer the
 *     current values + onChange callbacks
 *   - persists the whole bundle in one POST when the user clicks Save
 */

import React from 'react';
import { getAccountingSystemModule } from '@/lib/accounting-systems/registry';
import {
  DEFAULT_SHARED_SYNC_SCHEDULE,
  type SharedSyncSchedule,
} from '@/lib/accounting-systems/types';

type Props = {
  companyId: string;
  system: string;
};

type LoadResponse = {
  ok: boolean;
  status?: string;
  lastSyncAt?: string | null;
  errorMessage?: string | null;
  settings?: unknown;
  programs?: unknown;
  schedule?: SharedSyncSchedule;
  lastSyncedByObject?: Record<string, string>;
  error?: string;
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '16px',
  marginBottom: '16px',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#0f172a',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '10px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#475569',
  marginBottom: '4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  background: '#fff',
  color: '#0f172a',
};

/**
 * Tiny "?" badge that toggles a popover next to a button. Click-to-open
 * (mobile-friendly) with a click-outside dismiss handled by the parent
 * setting `helpOpen` to null on any other interaction.
 */
function HelpBadge({
  open,
  onToggle,
  title,
  body,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={`Help: ${title}`}
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: '1px solid #cbd5e1',
          background: open ? '#0f172a' : '#fff',
          color: open ? '#fff' : '#475569',
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '320px',
            maxWidth: '90vw',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
            padding: '12px 14px',
            fontSize: '12px',
            color: '#1e293b',
            lineHeight: 1.45,
            zIndex: 50,
          }}
        >
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>{title}</div>
          {body}
        </div>
      )}
    </>
  );
}

function statusColor(status: string): { bg: string; fg: string; label: string } {
  switch ((status || '').toUpperCase()) {
    case 'CONNECTED':
    case 'ACTIVE':
      return { bg: '#dcfce7', fg: '#166534', label: 'Connected' };
    case 'ERROR':
      return { bg: '#fee2e2', fg: '#991b1b', label: 'Error' };
    case 'INACTIVE':
      return { bg: '#fef9c3', fg: '#854d0e', label: 'Inactive' };
    default:
      return { bg: '#e2e8f0', fg: '#475569', label: 'Not Connected' };
  }
}

export default function AccountingSystemPanel({ companyId, system }: Props) {
  const plugin = getAccountingSystemModule(system);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string>('NOT_CONNECTED');
  const [lastSyncAt, setLastSyncAt] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<unknown>(plugin?.defaultSettings ?? null);
  const [programs, setPrograms] = React.useState<unknown[]>(plugin?.defaultPrograms ?? []);
  const [schedule, setSchedule] = React.useState<SharedSyncSchedule>(DEFAULT_SHARED_SYNC_SCHEDULE);
  const [actionBusy, setActionBusy] = React.useState<null | 'connect' | 'disconnect' | 'sync' | 'backfill'>(null);
  const [showBackfill, setShowBackfill] = React.useState(false);
  const [backfillStart, setBackfillStart] = React.useState<string>('');
  const [backfillEnd, setBackfillEnd] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [helpOpen, setHelpOpen] = React.useState<null | 'sync' | 'backfill'>(null);
  const [lastSyncedByObject, setLastSyncedByObject] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!helpOpen) return;
    const dismiss = () => setHelpOpen(null);
    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(null);
    });
    return () => {
      window.removeEventListener('click', dismiss);
    };
  }, [helpOpen]);

  React.useEffect(() => {
    if (!plugin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const resp = await fetch(
          `/api/accounting-systems/${plugin.key.toLowerCase()}/settings?companyId=${encodeURIComponent(companyId)}`,
          { credentials: 'include' }
        );
        const data: LoadResponse = await resp.json().catch(() => ({ ok: false, error: 'Invalid response' }));
        if (cancelled) return;
        if (!resp.ok || !data.ok) {
          setErrorMsg(data.error || `Failed to load ${plugin.label} settings (HTTP ${resp.status})`);
        } else {
          setStatus(data.status || 'NOT_CONNECTED');
          setLastSyncAt(data.lastSyncAt || null);
          setSettings(plugin.sanitizeSettings(data.settings ?? plugin.defaultSettings));
          setPrograms(plugin.sanitizePrograms(data.programs ?? plugin.defaultPrograms));
          setSchedule({ ...DEFAULT_SHARED_SYNC_SCHEDULE, ...(data.schedule || {}) });
          setLastSyncedByObject(data.lastSyncedByObject || {});
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const e = err as { message?: string };
          setErrorMsg(e?.message || 'Network error loading settings');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, plugin]);

  if (!plugin) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: '13px', color: '#92400e', background: '#fef3c7', padding: '12px', borderRadius: '6px' }}>
          <strong>{system}</strong> is not yet implemented as a plugin. Use the legacy integration controls below.
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const resp = await fetch(`/api/accounting-systems/${plugin.key.toLowerCase()}/settings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, settings, programs, schedule }),
      });
      const data = await resp.json().catch(() => ({ ok: false, error: 'Invalid response' }));
      if (!resp.ok || !data.ok) {
        setErrorMsg(data.error || `Save failed (HTTP ${resp.status})`);
      } else {
        setSuccessMsg(data.message || 'Saved.');
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || 'Network error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const setSchedField = <K extends keyof SharedSyncSchedule>(key: K, value: SharedSyncSchedule[K]) => {
    setSchedule((prev) => ({ ...prev, [key]: value }));
  };

  const callAction = async (
    action: 'connect' | 'disconnect' | 'sync' | 'backfill',
    extraBody: Record<string, unknown> = {}
  ) => {
    if (!plugin) return;
    setActionBusy(action);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const path =
        action === 'connect'
          ? 'connect'
          : action === 'disconnect'
          ? 'disconnect'
          : 'sync';
      const resp = await fetch(`/api/accounting-systems/${plugin.key.toLowerCase()}/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...extraBody }),
      });
      const data = await resp.json().catch(() => ({ ok: false, error: 'Invalid response' }));
      if (!resp.ok || !data.ok) {
        setErrorMsg(data.error || `${action} failed (HTTP ${resp.status})`);
        if (data.status && typeof data.status === 'string') {
          setStatus(data.status);
        } else if (action === 'connect') {
          setStatus('ERROR');
        }
        return;
      }
      if (typeof data.status === 'string') setStatus(data.status);
      if (action === 'connect') setStatus('ACTIVE');
      if (action === 'disconnect') setStatus('INACTIVE');
      if (data.lastSyncAt) setLastSyncAt(data.lastSyncAt);
      if (action === 'sync' || action === 'backfill') {
        setLastSyncAt(new Date().toISOString());
        setStatus(data.programsFailed && data.programsFailed > 0 ? 'ERROR' : 'ACTIVE');
        if (Array.isArray(data.outcomes)) {
          const updates: Record<string, string> = {};
          for (const o of data.outcomes as Array<{ objectName?: string; ok?: boolean; syncedAt?: string }>) {
            if (o.ok && o.objectName && o.syncedAt) updates[o.objectName] = o.syncedAt;
          }
          if (Object.keys(updates).length > 0) {
            setLastSyncedByObject((prev) => ({ ...prev, ...updates }));
          }
        }
      }
      setSuccessMsg(data.message || `${action} succeeded.`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || `Network error during ${action}`);
    } finally {
      setActionBusy(null);
    }
  };

  const handleConnect = () => callAction('connect');
  const handleDisconnect = () => callAction('disconnect');
  const handleSyncNow = () => callAction('sync', { mode: 'incremental' });
  const handleBackfillSubmit = () => {
    if (!backfillStart || !backfillEnd) {
      setErrorMsg('Pick both a start and end date for the backfill window.');
      return;
    }
    if (backfillStart > backfillEnd) {
      setErrorMsg('Start date must be on or before end date.');
      return;
    }
    setShowBackfill(false);
    void callAction('backfill', { mode: 'backfill', startDate: backfillStart, endDate: backfillEnd });
  };

  const sc = statusColor(status);
  const Integration = plugin.IntegrationContainer;
  const Programs = plugin.ProgramsContainer;

  const integrationCard = (
    <div style={cardStyle} key="integration-card">
      <div style={sectionTitle}>Integration / Credentials</div>
      {loading ? (
        <div style={{ fontSize: '13px', color: '#64748b' }}>Loading…</div>
      ) : (
        <Integration
          companyId={companyId}
          settings={settings as never}
          onChange={(next) => setSettings(next)}
          disabled={saving}
        />
      )}
    </div>
  );

  const caps = plugin.capabilities || {};
  const isConnected = (status || '').toUpperCase() === 'CONNECTED' || (status || '').toUpperCase() === 'ACTIVE';
  const anyActions = !!(caps.connect || caps.disconnect || caps.syncNow || caps.backfill);

  const actionButtonStyle = (
    variant: 'primary' | 'secondary' | 'danger' | 'accent',
    disabled: boolean
  ): React.CSSProperties => {
    const palette: Record<string, { bg: string; fg: string; border: string }> = {
      primary: { bg: '#1d4ed8', fg: '#ffffff', border: 'transparent' },
      secondary: { bg: '#ffffff', fg: '#1e293b', border: '#cbd5e1' },
      danger: { bg: '#ffffff', fg: '#ef4444', border: '#ef4444' },
      accent: { bg: '#0f766e', fg: '#ffffff', border: 'transparent' },
    };
    const p = palette[variant];
    return {
      padding: '8px 12px',
      background: p.bg,
      color: p.fg,
      border: `1px solid ${p.border}`,
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      whiteSpace: 'nowrap',
    };
  };

  const compactInputStyle: React.CSSProperties = {
    padding: '6px 8px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '12px',
    background: '#fff',
    color: '#0f172a',
    boxSizing: 'border-box',
  };

  const fieldGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  };

  const compactLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  const scheduleCard = (
    <div style={cardStyle} key="schedule-card">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: '12px',
        }}
      >
        <div style={{ ...sectionTitle, marginBottom: 0, alignSelf: 'center', marginRight: '4px' }}>
          Sync Schedule
        </div>

        <div style={fieldGroupStyle}>
          <label style={compactLabelStyle}>Frequency</label>
          <select
            value={schedule.syncFrequency}
            onChange={(e) => setSchedField('syncFrequency', e.target.value as SharedSyncSchedule['syncFrequency'])}
            style={{ ...compactInputStyle, width: '110px' }}
            disabled={loading || saving}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="">— Off —</option>
          </select>
        </div>

        <div style={fieldGroupStyle}>
          <label style={compactLabelStyle}>Time (24h)</label>
          <input
            type="time"
            value={schedule.syncTime}
            onChange={(e) => setSchedField('syncTime', e.target.value)}
            style={{ ...compactInputStyle, width: '110px' }}
            disabled={loading || saving}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={compactLabelStyle}>Start Date</label>
          <input
            type="date"
            value={schedule.initialSyncStartDate}
            onChange={(e) => setSchedField('initialSyncStartDate', e.target.value)}
            style={{ ...compactInputStyle, width: '140px' }}
            disabled={loading || saving}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={compactLabelStyle}>Incremental</label>
          <select
            value={schedule.incrementalSync}
            onChange={(e) => setSchedField('incrementalSync', e.target.value as SharedSyncSchedule['incrementalSync'])}
            style={{ ...compactInputStyle, width: '130px' }}
            disabled={loading || saving}
          >
            <option value="YES">Yes</option>
            <option value="NO">No (full reload)</option>
          </select>
        </div>

        {anyActions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {caps.connect && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={loading || saving || actionBusy !== null}
                style={actionButtonStyle('primary', loading || saving || actionBusy !== null)}
                title={isConnected ? 'Re-validate session' : 'Validate credentials and start session'}
              >
                {actionBusy === 'connect'
                  ? 'Connecting…'
                  : isConnected
                  ? 'Reconnect'
                  : 'Connect'}
              </button>
            )}
            {caps.disconnect && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading || saving || actionBusy !== null || !isConnected}
                style={actionButtonStyle('danger', loading || saving || actionBusy !== null || !isConnected)}
                title="End session and mark connection inactive"
              >
                {actionBusy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
              </button>
            )}
            {caps.syncNow && (
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={loading || saving || actionBusy !== null}
                  style={actionButtonStyle('accent', loading || saving || actionBusy !== null)}
                  title="Pull records modified since the last sync"
                >
                  {actionBusy === 'sync' ? 'Syncing…' : 'Sync Now'}
                </button>
                <HelpBadge
                  open={helpOpen === 'sync'}
                  onToggle={() => setHelpOpen((cur) => (cur === 'sync' ? null : 'sync'))}
                  title="Sync Now"
                  body={
                    <>
                      <p style={{ margin: '0 0 6px 0' }}>
                        Pulls every saved program for records modified <strong>since the last
                        successful sync</strong> (per program). If no prior sync exists, it
                        falls back to the “Initial Sync Start Date” in this card, or to the
                        last 7 days.
                      </p>
                      <p style={{ margin: '0 0 6px 0' }}>
                        <strong>Use it for</strong> day-to-day catch-up — closing the books,
                        refreshing AR/AP, picking up new vendors. Fast and idempotent.
                      </p>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: '11px' }}>
                        Internally: Intacct <code>readByQuery</code> with
                        <code> WHENMODIFIED &gt; lastSyncedAt</code>.
                      </p>
                    </>
                  }
                />
              </div>
            )}
            {caps.backfill && (
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setShowBackfill(true)}
                  disabled={loading || saving || actionBusy !== null}
                  style={actionButtonStyle('secondary', loading || saving || actionBusy !== null)}
                  title="Pull historical records for a date range"
                >
                  {actionBusy === 'backfill' ? 'Backfilling…' : 'Backfill…'}
                </button>
                <HelpBadge
                  open={helpOpen === 'backfill'}
                  onToggle={() => setHelpOpen((cur) => (cur === 'backfill' ? null : 'backfill'))}
                  title="Backfill"
                  body={
                    <>
                      <p style={{ margin: '0 0 6px 0' }}>
                        Pulls every saved program for a <strong>specific historical date
                        range</strong> you choose. Ignores the per-program last-sync
                        timestamp and re-fetches everything inside the window.
                      </p>
                      <p style={{ margin: '0 0 6px 0' }}>
                        <strong>Use it for</strong> initial loads, recovering from a missed
                        sync window, or re-pulling a month after a correction in Intacct.
                      </p>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: '11px' }}>
                        Internally: Intacct <code>readByQuery</code> with
                        <code> WHENMODIFIED BETWEEN start AND end</code>.
                      </p>
                    </>
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const programsCard = (
    <div style={cardStyle} key="programs-card">
      <div style={sectionTitle}>Accounting Programs / Resources</div>
      {loading ? (
        <div style={{ fontSize: '13px', color: '#64748b' }}>Loading…</div>
      ) : (
        <Programs
          companyId={companyId}
          programs={programs as never[]}
          onChange={(next) => setPrograms(next)}
          disabled={saving}
          lastSyncedByObject={lastSyncedByObject}
        />
      )}
    </div>
  );

  return (
    <div>
      {/* Header card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {plugin.badge && (
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: plugin.badge.bg,
                  color: plugin.badge.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                  letterSpacing: '0.04em',
                }}
              >
                {plugin.badge.initials}
              </div>
            )}
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{plugin.label}</div>
              {plugin.tagline && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{plugin.tagline}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                padding: '4px 10px',
                background: sc.bg,
                color: sc.fg,
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {sc.label}
            </span>
            {lastSyncAt && (
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Last sync: {new Date(lastSyncAt).toLocaleString()}
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving}
              style={{
                padding: '8px 14px',
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loading || saving ? 'not-allowed' : 'pointer',
                opacity: loading || saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div style={{ marginTop: '12px', padding: '10px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '12px' }}>
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ marginTop: '12px', padding: '10px 12px', background: '#dcfce7', color: '#166534', borderRadius: '6px', fontSize: '12px' }}>
            {successMsg}
          </div>
        )}
      </div>

      {/* Body — either stacked (default) or side-by-side per plugin.layout */}
      {plugin.layout?.variant === 'side-by-side' ? (
        plugin.layout.scheduleAbove ? (
          <>
            {scheduleCard}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${plugin.layout.credentialsWidth || '40%'} ${plugin.layout.programsWidth || '60%'}`,
                gap: '16px',
                alignItems: 'start',
              }}
            >
              <div>{integrationCard}</div>
              <div>{programsCard}</div>
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${plugin.layout.credentialsWidth || '40%'} ${plugin.layout.programsWidth || '60%'}`,
              gap: '16px',
              alignItems: 'start',
            }}
          >
            <div>
              {integrationCard}
              {scheduleCard}
            </div>
            <div>{programsCard}</div>
          </div>
        )
      ) : (
        <>
          {integrationCard}
          {scheduleCard}
          {programsCard}
        </>
      )}

      {showBackfill && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowBackfill(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '10px',
              padding: '20px',
              width: '420px',
              maxWidth: '92vw',
              boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
              Backfill {plugin.label}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
              Pull records for every saved program where <code>WHENMODIFIED</code> falls inside the
              window below. Use this for one-off historical loads — incremental syncs handle
              day-to-day data.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Start date</label>
                <input
                  type="date"
                  value={backfillStart}
                  onChange={(e) => setBackfillStart(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>End date</label>
                <input
                  type="date"
                  value={backfillEnd}
                  onChange={(e) => setBackfillEnd(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setShowBackfill(false)}
                style={{
                  padding: '8px 12px',
                  background: '#fff',
                  color: '#1e293b',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBackfillSubmit}
                disabled={!backfillStart || !backfillEnd}
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: !backfillStart || !backfillEnd ? 'not-allowed' : 'pointer',
                  opacity: !backfillStart || !backfillEnd ? 0.6 : 1,
                }}
              >
                Run backfill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
