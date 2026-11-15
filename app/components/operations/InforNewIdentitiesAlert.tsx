'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import {
  INFOR_REVIEW_WARNINGS_STALE_EVENT,
  type InforReviewedRow,
  type InforReviewRow,
  type InforReviewSection,
  type InforReviewWarnings,
} from '@/lib/operations/infor-new-identities-types';

type Props = {
  companyId: string;
  section: InforReviewSection;
  onOpenRow?: (row: InforReviewRow) => void;
};

const SECTION_COPY: Record<InforReviewSection, string> = {
  volumeForecast:
    'New Infor items and customers below are missing forecast data. Each row shows the customer it applies to and why it was flagged.',
  dutiesTariffs:
    'New Infor items below are missing duty and tariff data. Fill the fields listed for each item, then Save.',
  freight:
    'New Infor items below cannot calculate freight per piece yet. Fill the fields listed for each item, then Save.',
  vendorForecast:
    'New Infor vendors below have forecast lines without a production type. Set Planned or MTO, then Save.',
};

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderTop: '1px solid #fde68a',
  verticalAlign: 'top',
  textAlign: 'left',
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  borderTop: 'none',
  fontWeight: 800,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: '#92400e',
  position: 'sticky',
  top: 0,
  background: '#fef3c7',
};

const buttonStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 8,
  border: '1px solid #fcd34d',
  background: '#fff',
  color: '#92400e',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const linkButtonStyle: React.CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: '#92400e',
  fontWeight: 700,
  fontSize: 11,
  textDecoration: 'underline',
  cursor: 'pointer',
};

function Issues({ issues }: { issues: string[] }) {
  if (issues.length === 1) return <>{issues[0]}</>;
  return (
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  );
}

function CustomerList({ row }: { row: InforReviewRow }) {
  if (!row.customers.length) return <span style={{ color: '#a16207' }}>No customer found in Infor</span>;
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {row.customers.map((customer) => (
        <span key={customer.customerId}>
          {customer.customerName || '—'} ({customer.customerId})
        </span>
      ))}
    </div>
  );
}

function withReviewChange(
  payload: InforReviewWarnings,
  row: InforReviewRow,
  reviewed: boolean
): InforReviewWarnings {
  const rows = payload.rows.filter((candidate) => candidate.key !== row.key);
  const reviewedRows = payload.reviewedRows.filter((candidate) => candidate.key !== row.key);
  if (reviewed) {
    reviewedRows.push({ ...row, reviewedAt: new Date().toISOString(), reviewedByName: null });
  } else {
    rows.push(row);
  }
  return { ...payload, rows, reviewedRows };
}

export default function InforNewIdentitiesAlert({ companyId, section, onOpenRow }: Props) {
  const [payload, setPayload] = useState<InforReviewWarnings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(() => new Set());
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    if (!companyId) return;
    const seq = ++requestSeq.current;
    try {
      const response = await fetch(
        `/api/operational-data/infor-new-identities?companyId=${encodeURIComponent(companyId)}`,
        { cache: 'no-store' }
      );
      const data = await response.json().catch(() => ({}));
      if (seq !== requestSeq.current) return;
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Failed to check for new Infor data');
      setPayload(data as InforReviewWarnings);
      setError(null);
    } catch (err: unknown) {
      if (seq === requestSeq.current) {
        setError(err instanceof Error ? err.message : 'Failed to check for new Infor data');
      }
    } finally {
      if (seq === requestSeq.current) setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const onStale = (event: Event) => {
      const detail = (event as CustomEvent<{ companyId?: string }>).detail || {};
      if (detail.companyId && detail.companyId !== companyId) return;
      setRefreshing(true);
      void load();
    };
    window.addEventListener(INFOR_REVIEW_WARNINGS_STALE_EVENT, onStale);
    window.addEventListener('operational-data-updated', onStale);
    return () => {
      window.removeEventListener(INFOR_REVIEW_WARNINGS_STALE_EVENT, onStale);
      window.removeEventListener('operational-data-updated', onStale);
    };
  }, [companyId, load]);

  const setReviewed = useCallback(
    async (row: InforReviewRow, reviewed: boolean) => {
      // Any in-flight load would otherwise overwrite the change with the old rows.
      const seq = ++requestSeq.current;
      setPayload((current) => (current ? withReviewChange(current, row, reviewed) : current));
      setSavingKeys((current) => new Set(current).add(row.key));
      try {
        const response = await fetch('/api/operational-data/infor-new-identities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, rowKey: row.key, reviewed }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error || 'Failed to save the review');
        if (seq === requestSeq.current) setPayload(data as InforReviewWarnings);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to save the review');
        void load();
      } finally {
        setSavingKeys((current) => {
          const next = new Set(current);
          next.delete(row.key);
          return next;
        });
      }
    },
    [companyId, load]
  );

  const forCompany = payload?.companyId === companyId;
  const rows = forCompany ? payload.rows.filter((row) => row.section === section) : [];
  const reviewedRows = forCompany ? (payload.reviewedRows || []).filter((row) => row.section === section) : [];
  if (!companyId || (!rows.length && !(showReviewed && reviewedRows.length))) return null;

  const itemCount = new Set(rows.filter((row) => row.itemId).map((row) => row.itemId)).size;
  const isVendorSection = section === 'vendorForecast';
  const isVolumeForecast = section === 'volumeForecast';
  const showOpen = isVolumeForecast && Boolean(onOpenRow);

  const header = (reviewedTable: boolean) => (
    <tr>
      {isVendorSection ? (
        <>
          <th style={headerCellStyle}>Vendor ID</th>
          <th style={headerCellStyle}>Vendor</th>
        </>
      ) : (
        <>
          <th style={headerCellStyle}>Item ID</th>
          {isVolumeForecast ? (
            <>
              <th style={headerCellStyle}>Customer</th>
              <th style={headerCellStyle}>Customer ID</th>
              <th style={headerCellStyle}>Customer P/N</th>
            </>
          ) : (
            <th style={headerCellStyle}>Customers (ID)</th>
          )}
          <th style={headerCellStyle}>Description</th>
        </>
      )}
      <th style={headerCellStyle}>Why it was flagged</th>
      {reviewedTable ? <th style={headerCellStyle}>Reviewed by</th> : null}
      {showOpen && !reviewedTable ? <th style={headerCellStyle} /> : null}
      <th style={{ ...headerCellStyle, textAlign: 'center' }}>Reviewed</th>
    </tr>
  );

  const renderRow = (row: InforReviewRow | InforReviewedRow, reviewed: boolean) => (
    <tr key={row.key}>
      {isVendorSection ? (
        <>
          <td style={{ ...cellStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.vendorId}</td>
          <td style={cellStyle}>{row.vendorName || '—'}</td>
        </>
      ) : (
        <>
          <td style={{ ...cellStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.itemId || '—'}</td>
          {isVolumeForecast ? (
            <>
              <td style={cellStyle}>{row.customerName || '—'}</td>
              <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{row.customerId || '—'}</td>
              <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{row.customerPartNumber || '—'}</td>
            </>
          ) : (
            <td style={cellStyle}><CustomerList row={row} /></td>
          )}
          <td style={cellStyle}>{row.itemDescription || '—'}</td>
        </>
      )}
      <td style={cellStyle}><Issues issues={row.issues} /></td>
      {reviewed && 'reviewedAt' in row ? (
        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
          {row.reviewedByName || '—'}
          <div style={{ fontSize: 11, color: '#a16207' }}>{formatEstDateTime(row.reviewedAt)}</div>
        </td>
      ) : null}
      {showOpen && !reviewed ? (
        <td style={{ ...cellStyle, textAlign: 'right' }}>
          {row.customerId ? (
            <button type="button" onClick={() => onOpenRow?.(row)} style={buttonStyle}>
              Open in Volume Forecast
            </button>
          ) : null}
        </td>
      ) : null}
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={reviewed}
          disabled={savingKeys.has(row.key)}
          onChange={(event) => void setReviewed(row, event.target.checked)}
          title={reviewed ? 'Untick to show this row in the warning again' : 'Mark reviewed and hide this row'}
          aria-label={`Reviewed ${row.itemId || row.vendorId || row.customerId || ''}`}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#b45309' }}
        />
      </td>
    </tr>
  );

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 14,
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: 12,
        color: '#78350f',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
        New Infor data needs review ({rows.length} {rows.length === 1 ? 'row' : 'rows'}
        {itemCount ? `, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : ''})
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        {SECTION_COPY[section]} A row clears on its own once its data is saved, or tick Reviewed to hide it. A reviewed row
        comes back only if a different gap appears.
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#a16207' }}>
        {payload?.builtAt ? `Checked ${formatEstDateTime(payload.builtAt)}` : null}
        {payload?.lastInforSyncAt ? ` · Latest Infor data: ${formatEstDateTime(payload.lastInforSyncAt)}` : null}
        {refreshing ? ' · Rechecking…' : null}
        {reviewedRows.length ? (
          <>
            {' · '}
            <button type="button" onClick={() => setShowReviewed((value) => !value)} style={linkButtonStyle}>
              {showReviewed ? 'Hide reviewed' : `Show reviewed (${reviewedRows.length})`}
            </button>
          </>
        ) : null}
      </div>
      {rows.length ? (
        <div style={{ marginTop: 10, maxHeight: 360, overflow: 'auto', border: '1px solid #fde68a', borderRadius: 8, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>{header(false)}</thead>
            <tbody>{rows.map((row) => renderRow(row, false))}</tbody>
          </table>
        </div>
      ) : null}
      {showReviewed && reviewedRows.length ? (
        <>
          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800 }}>
            Reviewed ({reviewedRows.length}). Untick a row to show it in the warning again.
          </div>
          <div style={{ marginTop: 6, maxHeight: 280, overflow: 'auto', border: '1px solid #fde68a', borderRadius: 8, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>{header(true)}</thead>
              <tbody>{reviewedRows.map((row) => renderRow(row, true))}</tbody>
            </table>
          </div>
        </>
      ) : null}
      {error ? <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{error}</div> : null}
    </div>
  );
}
