'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import {
  INFOR_REVIEW_WARNINGS_STALE_EVENT,
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

export default function InforNewIdentitiesAlert({ companyId, section, onOpenRow }: Props) {
  const [payload, setPayload] = useState<InforReviewWarnings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const rows = payload?.companyId === companyId ? payload.rows.filter((row) => row.section === section) : [];
  if (!companyId || !rows.length) return null;

  const itemCount = new Set(rows.filter((row) => row.itemId).map((row) => row.itemId)).size;
  const isVendorSection = section === 'vendorForecast';
  const isVolumeForecast = section === 'volumeForecast';

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
        {SECTION_COPY[section]} A row clears on its own once its data is saved; this warning stays until every row is done.
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#a16207' }}>
        {payload?.builtAt ? `Checked ${formatEstDateTime(payload.builtAt)}` : null}
        {payload?.lastInforSyncAt ? ` · Latest Infor data: ${formatEstDateTime(payload.lastInforSyncAt)}` : null}
        {refreshing ? ' · Rechecking…' : null}
      </div>
      <div style={{ marginTop: 10, maxHeight: 360, overflow: 'auto', border: '1px solid #fde68a', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
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
              {isVolumeForecast && onOpenRow ? <th style={headerCellStyle} /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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
                {isVolumeForecast && onOpenRow ? (
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    {row.customerId ? (
                      <button type="button" onClick={() => onOpenRow(row)} style={buttonStyle}>
                        Open in Volume Forecast
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{error}</div> : null}
    </div>
  );
}
