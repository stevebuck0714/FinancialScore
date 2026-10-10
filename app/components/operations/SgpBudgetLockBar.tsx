'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FORECAST_MONTHS, FORECAST_MONTH_LABELS, type ForecastMonth } from '@/lib/operations/product-revenue-forecast';
import { formatEstDate, formatEstDateLabel, formatEstDateTime } from '@/lib/time/eastern';

type SgpBudgetSummary = {
  lineCount: number;
  monthlyUnits: Record<string, number>;
  annualUnits: number;
  annualBaseQty: number;
  sgpDollars: number;
};

type SgpBudgetLock = {
  id: string;
  year: number;
  lockedAt: string;
  lockedByName: string;
  note: string;
  summary: SgpBudgetSummary | null;
};

type LockStatus = {
  lock: SgpBudgetLock | null;
  canManage: boolean;
};

type SgpBudgetLockBarProps = {
  companyId: string;
  year: number;
  onLockChange: (locked: boolean) => void;
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '6px 12px',
  background: '#ffffff',
  color: '#334155',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 12,
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  border: '1px solid #4338ca',
  background: '#4f46e5',
  color: '#ffffff',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
  fontFamily: 'inherit',
  minHeight: 60,
};

function fmtUnits(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function fmtDollars(value: number): string {
  return Math.round(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ background: '#ffffff', borderRadius: 12, padding: 20, width: 'min(640px, 92vw)', boxShadow: '0 20px 40px rgba(15,23,42,0.25)' }}
      >
        <h4 style={{ margin: '0 0 12px', fontSize: 16, color: '#1e293b' }}>{title}</h4>
        {children}
      </div>
    </div>
  );
}

export default function SgpBudgetLockBar({ companyId, year, onLockChange }: SgpBudgetLockBarProps) {
  const [status, setStatus] = useState<LockStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<SgpBudgetSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [note, setNote] = useState('');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    setError(null);
    try {
      const params = new URLSearchParams({ companyId, year: String(year) });
      const response = await fetch(`/api/operational-data/product-forecast/sgp-lock?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load SGP budget status');
      setStatus({ lock: payload.lock || null, canManage: Boolean(payload.canManage) });
      onLockChange(Boolean(payload.lock));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load SGP budget status');
    }
  }, [companyId, onLockChange, year]);

  useEffect(() => {
    setStatus(null);
    onLockChange(false);
    void load();
  }, [load, onLockChange]);

  const openConfirm = async () => {
    setConfirmOpen(true);
    setSummary(null);
    setNote('');
    setLoadingSummary(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyId, year: String(year), preview: '1' });
      const response = await fetch(`/api/operational-data/product-forecast/sgp-lock?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load SGP budget totals');
      setSummary(payload.summary || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load SGP budget totals');
      setConfirmOpen(false);
    } finally {
      setLoadingSummary(false);
    }
  };

  const submit = async (method: 'POST' | 'DELETE', body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/operational-data/product-forecast/sgp-lock', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, year, ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Request failed');
      setStatus({ lock: payload.lock || null, canManage: Boolean(payload.canManage) });
      onLockChange(Boolean(payload.lock));
      setConfirmOpen(false);
      setUnlockOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return error ? <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div> : null;
  }

  const lock = status.lock;
  const showReminder = !lock && formatEstDate() >= `${year - 1}-12-01`;

  return (
    <>
      {lock ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            border: '1px solid #a5b4fc',
            background: '#eef2ff',
            color: '#312e81',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          <span>
            <span aria-hidden="true">🔒 </span>
            <strong>SGP budget for {year} signed off</strong> by {lock.lockedByName} on{' '}
            <span title={formatEstDateTime(lock.lockedAt)}>{formatEstDateLabel(lock.lockedAt)}</span>
            {lock.note ? <span style={{ color: '#475569' }}> — {lock.note}</span> : null}
          </span>
          {status.canManage ? (
            <button type="button" style={buttonStyle} onClick={() => { setReason(''); setUnlockOpen(true); }}>
              Unlock
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          {showReminder ? (
            <span
              style={{
                border: '1px solid #fcd34d',
                background: '#fffbeb',
                color: '#92400e',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
              }}
            >
              SGP budget for {year} has not been signed off yet.
            </span>
          ) : null}
          {status.canManage ? (
            <button type="button" style={primaryButtonStyle} onClick={() => void openConfirm()}>
              Lock SGP budget for {year}
            </button>
          ) : null}
        </div>
      )}
      {error ? <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div> : null}

      {confirmOpen ? (
        <Modal title={`Sign off SGP budget for ${year}`} onClose={() => !busy && setConfirmOpen(false)}>
          {loadingSummary || !summary ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>Calculating SGP totals…</div>
          ) : (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                Locking freezes SGP volume, SGP price, and annual base qty for {year}. Forecast and Forecast - ADJ stay
                editable. Workbook imports for {year} are blocked until it is unlocked.
              </p>
              <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                  <thead>
                    <tr>
                      {FORECAST_MONTHS.map((month) => (
                        <th key={month} style={{ padding: '4px 6px', textAlign: 'right', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                          {FORECAST_MONTH_LABELS[month as ForecastMonth]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {FORECAST_MONTHS.map((month) => (
                        <td key={month} style={{ padding: '4px 6px', textAlign: 'right' }}>
                          {fmtUnits(summary.monthlyUnits[String(month)] || 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, color: '#0f172a', marginBottom: 12 }}>
                <span><strong>SGP units:</strong> {fmtUnits(summary.annualUnits)}</span>
                <span><strong>SGP $:</strong> {fmtDollars(summary.sgpDollars)}</span>
                <span><strong>Annual base qty:</strong> {fmtUnits(summary.annualBaseQty)}</span>
                <span><strong>Lines:</strong> {summary.lineCount.toLocaleString('en-US')}</span>
              </div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 12 }}>
                Note (optional)
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. Approved at Dec 12 budget review"
                  maxLength={500}
                  style={{ ...textareaStyle, marginTop: 4 }}
                />
              </label>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" style={buttonStyle} disabled={busy} onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ ...primaryButtonStyle, opacity: busy || !summary ? 0.6 : 1 }}
              disabled={busy || !summary}
              onClick={() => void submit('POST', { note })}
            >
              {busy ? 'Locking…' : 'Sign off and lock'}
            </button>
          </div>
        </Modal>
      ) : null}

      {unlockOpen ? (
        <Modal title={`Unlock SGP budget for ${year}`} onClose={() => !busy && setUnlockOpen(false)}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
            Unlocking lets SGP volume, SGP price, and annual base qty change again. The original sign-off stays on
            record. Re-lock once management approves the changes.
          </p>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 12 }}>
            Reason (required)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              style={{ ...textareaStyle, marginTop: 4 }}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" style={buttonStyle} disabled={busy} onClick={() => setUnlockOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ ...primaryButtonStyle, background: '#b91c1c', borderColor: '#991b1b', opacity: busy || !reason.trim() ? 0.6 : 1 }}
              disabled={busy || !reason.trim()}
              onClick={() => void submit('DELETE', { reason })}
            >
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
