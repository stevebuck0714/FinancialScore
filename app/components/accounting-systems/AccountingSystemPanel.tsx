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

  const scheduleCard = (
    <div style={cardStyle} key="schedule-card">
      <div style={sectionTitle}>Sync Schedule</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Frequency</label>
          <select
            value={schedule.syncFrequency}
            onChange={(e) => setSchedField('syncFrequency', e.target.value as SharedSyncSchedule['syncFrequency'])}
            style={inputStyle}
            disabled={loading || saving}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="">— Off —</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Time of Day (24h)</label>
          <input
            type="time"
            value={schedule.syncTime}
            onChange={(e) => setSchedField('syncTime', e.target.value)}
            style={inputStyle}
            disabled={loading || saving}
          />
        </div>
        <div>
          <label style={labelStyle}>Initial Sync Start Date</label>
          <input
            type="date"
            value={schedule.initialSyncStartDate}
            onChange={(e) => setSchedField('initialSyncStartDate', e.target.value)}
            style={inputStyle}
            disabled={loading || saving}
          />
        </div>
        <div>
          <label style={labelStyle}>Incremental Sync</label>
          <select
            value={schedule.incrementalSync}
            onChange={(e) => setSchedField('incrementalSync', e.target.value as SharedSyncSchedule['incrementalSync'])}
            style={inputStyle}
            disabled={loading || saving}
          >
            <option value="YES">Yes</option>
            <option value="NO">No (full reload)</option>
          </select>
        </div>
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
      ) : (
        <>
          {integrationCard}
          {scheduleCard}
          {programsCard}
        </>
      )}
    </div>
  );
}
