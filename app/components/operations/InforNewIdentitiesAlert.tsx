'use client';

import React, { useEffect, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import type { InforNewIdentitiesResult, InforNewIdentity } from '@/lib/operations/infor-new-identities-types';

type Surface = 'products' | 'vendors';

type Props = {
  companyId: string;
  surface: Surface;
  onOpenDuties?: () => void;
  onOpenFreight?: () => void;
  onOpenForecast?: () => void;
};

function countLabel(count: number, singular: string, plural: string): string | null {
  if (count <= 0) return null;
  return `${count} new ${count === 1 ? singular : plural}`;
}

function previewLabels(rows: InforNewIdentity[], limit = 4): string {
  if (!rows.length) return '';
  const names = rows.slice(0, limit).map((row) => row.label || row.key);
  return rows.length > limit ? `${names.join(', ')}, +${rows.length - limit} more` : names.join(', ');
}

export default function InforNewIdentitiesAlert({
  companyId,
  surface,
  onOpenDuties,
  onOpenFreight,
  onOpenForecast,
}: Props) {
  const [payload, setPayload] = useState<InforNewIdentitiesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/operational-data/infor-new-identities?companyId=${encodeURIComponent(companyId)}`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to check for new Infor data');
      }
      setPayload(data as InforNewIdentitiesResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check for new Infor data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ companyId?: string }>).detail || {};
      if (detail.companyId && detail.companyId !== companyId) return;
      void load();
    };
    window.addEventListener('operational-data-updated', onUpdated);
    return () => window.removeEventListener('operational-data-updated', onUpdated);
  }, [companyId]);

  const acknowledge = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/operational-data/infor-new-identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to mark new Infor data as reviewed');
      }
      setPayload(data as InforNewIdentitiesResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to mark new Infor data as reviewed');
    } finally {
      setSaving(false);
    }
  };

  if (!companyId || loading || !payload || payload.counts.total <= 0) return null;

  const summary = [
    countLabel(payload.counts.items, 'item', 'items'),
    countLabel(payload.counts.customers, 'customer', 'customers'),
    countLabel(payload.counts.vendors, 'vendor', 'vendors'),
  ].filter(Boolean);
  const missingCount =
    payload.items.filter((row) => row.missing.length).length +
    payload.customers.filter((row) => row.missing.length).length +
    payload.vendors.filter((row) => row.missing.length).length;
  const buttonStyle: React.CSSProperties = {
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid #fcd34d',
    background: '#fff',
    color: '#92400e',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  };

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
        New Infor data needs review
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        {summary.join(', ')} came in from the latest Infor sync.
        {surface === 'products'
          ? ' Add new customers and items on Monthly Forecast. If an item is missing HTS, origin, duty, or freight, fill those on Duties & Tariffs and Freight.'
          : ' Fill HTS and origin on Duties & Tariffs, freight on Freight, and vendor quantities on Monthly Forecast.'}
        {missingCount > 0 ? ` ${missingCount} still have blank fields to complete.` : ''}
      </div>
      {payload.lastInforSyncAt ? (
        <div style={{ marginTop: 4, fontSize: 11, color: '#a16207' }}>
          Latest Infor data: {formatEstDateTime(payload.lastInforSyncAt)}
        </div>
      ) : null}
      {payload.items.length ? (
        <div style={{ marginTop: 6, fontSize: 12 }}>Items: {previewLabels(payload.items)}</div>
      ) : null}
      {payload.customers.length ? (
        <div style={{ marginTop: 4, fontSize: 12 }}>Customers: {previewLabels(payload.customers)}</div>
      ) : null}
      {payload.vendors.length ? (
        <div style={{ marginTop: 4, fontSize: 12 }}>Vendors: {previewLabels(payload.vendors)}</div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{error}</div>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {surface === 'vendors' && onOpenDuties ? (
          <button type="button" onClick={onOpenDuties} style={buttonStyle}>
            Duties & Tariffs
          </button>
        ) : null}
        {surface === 'vendors' && onOpenFreight ? (
          <button type="button" onClick={onOpenFreight} style={buttonStyle}>
            Freight
          </button>
        ) : null}
        {onOpenForecast ? (
          <button type="button" onClick={onOpenForecast} style={buttonStyle}>
            Monthly Forecast
          </button>
        ) : null}
        <button type="button" onClick={() => void acknowledge()} disabled={saving} style={buttonStyle}>
          {saving ? 'Saving…' : 'Mark as reviewed'}
        </button>
      </div>
    </div>
  );
}
