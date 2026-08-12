'use client';

import React, { useEffect, useState } from 'react';
import { companiesApi, ApiError } from '@/lib/api-client';
import {
  SUPPORTED_CURRENCIES,
  DEFAULT_BASE_CURRENCY,
  localeForCurrency,
  normalizeCurrencyCode,
} from '@/lib/constants/currencies';
import { invalidateCompanyMoneyFormatterCache } from '@/app/hooks/useCompanyMoneyFormatter';
import type { Company } from '@/app/types';

export type CurrencyDraft = {
  baseCurrency: string;
  reportingCurrency: string;
};

type Props = {
  company: Company | null;
  selectedCompanyId: string;
  onCompanyUpdated?: (company: Company) => void;
  /** Compact card for Import Financials; default is profile-form rows */
  variant?: 'profile' | 'card';
  /**
   * When false, currency is edited here but persisted by the parent form
   * (e.g. Profile "Save Profile"). Default: true for card, false for profile.
   */
  standaloneSave?: boolean;
  /** Controlled draft — when set, parent owns persistence */
  value?: CurrencyDraft;
  onChange?: (value: CurrencyDraft) => void;
};

/**
 * Company base + reporting currency settings.
 * Placed on Company Management → Profile and Import Financials (accounting data).
 */
export default function CompanyCurrencySettings({
  company,
  selectedCompanyId,
  onCompanyUpdated,
  variant = 'profile',
  standaloneSave,
  value,
  onChange,
}: Props) {
  const isControlled = value !== undefined;
  const shouldStandaloneSave = standaloneSave ?? variant === 'card';

  const [internalBase, setInternalBase] = useState(DEFAULT_BASE_CURRENCY);
  const [internalReporting, setInternalReporting] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fxCoverage, setFxCoverage] = useState<any>(null);
  const [fxCoverageLoading, setFxCoverageLoading] = useState(false);
  const [fxBackfilling, setFxBackfilling] = useState(false);

  const baseCurrency = isControlled ? value.baseCurrency : internalBase;
  const reportingCurrency = isControlled ? value.reportingCurrency : internalReporting;
  const savedReporting = company?.reportingCurrency
    ? normalizeCurrencyCode(company.reportingCurrency)
    : '';

  useEffect(() => {
    if (isControlled) return;
    setInternalBase(normalizeCurrencyCode(company?.baseCurrency));
    setInternalReporting(
      company?.reportingCurrency
        ? normalizeCurrencyCode(company.reportingCurrency)
        : ''
    );
    setMessage(null);
  }, [isControlled, company?.id, company?.baseCurrency, company?.reportingCurrency]);

  useEffect(() => {
    if (!selectedCompanyId || !savedReporting) {
      setFxCoverage(null);
      return;
    }
    const controller = new AbortController();
    setFxCoverageLoading(true);
    fetch(`/api/fx/coverage?companyId=${encodeURIComponent(selectedCompanyId)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.coverage) setFxCoverage(data.coverage);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') console.warn('FX coverage load failed', err);
      })
      .finally(() => setFxCoverageLoading(false));
    return () => controller.abort();
  }, [selectedCompanyId, savedReporting, company?.baseCurrency]);

  const setBaseCurrency = (next: string) => {
    if (isControlled) {
      onChange?.({ baseCurrency: next, reportingCurrency });
    } else {
      setInternalBase(next);
    }
  };

  const setReportingCurrency = (next: string) => {
    if (isControlled) {
      onChange?.({ baseCurrency, reportingCurrency: next });
    } else {
      setInternalReporting(next);
    }
  };

  const handleBackfillFx = async () => {
    if (!selectedCompanyId || !savedReporting) return;
    setFxBackfilling(true);
    try {
      const res = await fetch('/api/fx/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Backfill failed');
      if (data?.coverage) setFxCoverage(data.coverage);
      setMessage(
        `FX backfill complete: ${data?.backfill?.result?.stored ?? data?.coverage?.storedCount ?? 0} rates stored.`
      );
    } catch (error: any) {
      setMessage(error?.message || 'Failed to backfill FX rates');
    } finally {
      setFxBackfilling(false);
    }
  };

  const fxCoveragePanel =
    savedReporting ? (
      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          fontSize: 12,
          color: '#334155',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          FX coverage ({normalizeCurrencyCode(company?.baseCurrency)} → {savedReporting})
        </div>
        {fxCoverageLoading && <div>Loading coverage…</div>}
        {!fxCoverageLoading && fxCoverage && (
          <>
            <div>
              Stored rates: {fxCoverage.storedCount}
              {fxCoverage.coveragePct != null ? ` (~${fxCoverage.coveragePct}% of business days)` : ''}
            </div>
            <div>
              Range: {fxCoverage.earliestRateDate || '—'} → {fxCoverage.latestRateDate || '—'}
            </div>
            {(fxCoverage.gaps?.missingLatestEstDay || fxCoverage.gaps?.sparseHistory) && (
              <div style={{ color: '#b45309', marginTop: 4 }}>
                {fxCoverage.gaps.missingLatestEstDay ? 'Latest EST day missing. ' : ''}
                {fxCoverage.gaps.sparseHistory ? 'History looks sparse — consider backfill.' : ''}
              </div>
            )}
            <button
              type="button"
              onClick={handleBackfillFx}
              disabled={fxBackfilling}
              style={{
                marginTop: 8,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: fxBackfilling ? '#f1f5f9' : 'white',
                fontSize: 12,
                fontWeight: 600,
                cursor: fxBackfilling ? 'default' : 'pointer',
              }}
            >
              {fxBackfilling ? 'Backfilling…' : 'Refresh 3-year FX backfill'}
            </button>
          </>
        )}
      </div>
    ) : null;

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    const nextBase = normalizeCurrencyCode(baseCurrency);
    const nextReporting = reportingCurrency
      ? normalizeCurrencyCode(reportingCurrency)
      : null;

    if (nextReporting && nextReporting === nextBase) {
      setMessage('Reporting currency must differ from base currency, or leave blank.');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const result = await companiesApi.update(selectedCompanyId, {
        baseCurrency: nextBase,
        reportingCurrency: nextReporting,
        locale: localeForCurrency(nextBase),
      });
      if (result?.company) {
        invalidateCompanyMoneyFormatterCache(selectedCompanyId);
        onCompanyUpdated?.(result.company as Company);
      }
      const fxNote =
        nextReporting
          ? ' FX history backfill started for the reporting pair.'
          : '';
      setMessage(`Currency settings saved.${fxNote}`);
      if (nextReporting) {
        // Refresh coverage after save/backfill kickoff
        fetch(`/api/fx/coverage?companyId=${encodeURIComponent(selectedCompanyId)}`, {
          cache: 'no-store',
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.coverage) setFxCoverage(data.coverage);
          })
          .catch(() => {});
      } else {
        setFxCoverage(null);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Failed to save currency settings');
    } finally {
      setSaving(false);
    }
  };

  const baseSelect = (
    <select
      value={baseCurrency}
      onChange={(e) => setBaseCurrency(e.target.value)}
      style={{
        width: variant === 'card' ? undefined : '100%',
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid #cbd5e1',
        fontSize: variant === 'card' ? undefined : '13px',
        background: 'white',
        cursor: 'pointer',
      }}
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );

  const reportingSelect = (
    <select
      value={reportingCurrency}
      onChange={(e) => setReportingCurrency(e.target.value)}
      style={{
        width: variant === 'card' ? undefined : '100%',
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid #cbd5e1',
        fontSize: variant === 'card' ? undefined : '13px',
        background: 'white',
        cursor: 'pointer',
      }}
    >
      <option value="">Same as base (no FX conversion)</option>
      {SUPPORTED_CURRENCIES.filter((c) => c.value !== baseCurrency).map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );

  if (variant === 'card') {
    return (
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px 24px',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
        }}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
          Reporting currency
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b' }}>
          Base currency is the books currency from your accounting system. Optional reporting
          currency converts dashboards using daily EOD FX (Frankfurter / ECB), dated in Eastern Time.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Base (home) currency</span>
            {baseSelect}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Reporting currency</span>
            {reportingSelect}
          </label>
          {shouldStandaloneSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: saving ? '#f1f5f9' : '#eff6ff',
                color: '#1e40af',
                fontWeight: 600,
                fontSize: 13,
                cursor: saving ? 'default' : 'pointer',
                height: 38,
              }}
            >
              {saving ? 'Saving…' : 'Save currency settings'}
            </button>
          )}
        </div>
        {message && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#334155' }}>{message}</div>
        )}
        {fxCoveragePanel}
      </div>
    );
  }

  return (
    <>
      <div>
        <span style={{ fontWeight: 600 }}>
          Base Currency: <span style={{ color: '#ef4444' }}>*</span>
        </span>
      </div>
      <div>
        {baseSelect}
        <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
          Currency of the company&apos;s books / accounting system.
        </div>
      </div>
      <div>
        <span style={{ fontWeight: 600 }}>Reporting Currency:</span>
      </div>
      <div>
        {reportingSelect}
        <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
          Optional alternate currency for reports. Uses daily EOD FX (Eastern Time).
          {!shouldStandaloneSave && ' Saved with Save Profile.'}
        </div>
        {shouldStandaloneSave && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                marginTop: 10,
                padding: '8px 14px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: saving ? '#f1f5f9' : '#eff6ff',
                color: '#1e40af',
                fontWeight: 600,
                fontSize: 13,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save currency settings'}
            </button>
            {message && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#334155' }}>{message}</div>
            )}
          </>
        )}
        {fxCoveragePanel}
      </div>
    </>
  );
}
