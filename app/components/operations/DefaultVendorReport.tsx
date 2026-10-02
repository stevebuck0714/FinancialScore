'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format/currency';

type DefaultVendorReportProps = {
  companyId: string;
  reportKey: string;
  reportLabel: string;
  currency: string;
  locale: string;
};

type VendorReportPayload = {
  asOf: string | null;
  hasData: boolean;
  catalog: Array<{
    vendorId: string; vendorName: string; termsCode: string; status: string; lastPurchaseDate: string | null;
    purchaseYtd: number; purchaseLastYear: number; payYtd: number; payLastYear: number;
  }>;
  itemVolumePricing: Array<{
    vendorName: string; itemSku: string; actual6mo: number; forecast6mo: number; contractPrice: number; sgpPrice: number;
  }>;
  paymentHistory: Array<{ vendorName: string; totalPaid: number; months: Array<{ month: string; amount: number }> }>;
  concentration: Array<{ vendorName: string; spend: number; sharePct: number }>;
  priceChanges: Array<{
    vendorName: string; itemSku: string; contractPrice: number; sgpPrice: number; variance: number; variancePct: number;
  }>;
  spendByItemCategory: Array<{ category: string; spend: number }>;
};

const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, minWidth: 720 };
const headerStyle = { padding: '9px 10px', textAlign: 'left' as const, background: '#f8fafc', color: '#475569', fontSize: 11, textTransform: 'uppercase' as const };
const cellStyle = { padding: '9px 10px', borderTop: '1px solid #e2e8f0', color: '#1e293b', fontSize: 13 };
const rightCellStyle = { ...cellStyle, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };

export default function DefaultVendorReport({
  companyId,
  reportKey,
  reportLabel,
  currency,
  locale,
}: DefaultVendorReportProps) {
  const [payload, setPayload] = useState<VendorReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const money = (value: number) => formatMoney(Number(value || 0), { currency, locale, decimals: 0 });

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/operational-data/vendor-reports?companyId=${encodeURIComponent(companyId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Failed to load vendor report');
        return body as VendorReportPayload;
      })
      .then((body) => {
        if (!cancelled) setPayload(body);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Failed to load vendor report');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (loading) return <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>Loading {reportLabel.toLowerCase()}…</div>;
  if (error) return <div style={{ padding: 24, color: '#b91c1c', fontSize: 13 }}>{error}</div>;
  if (!payload?.hasData) {
    return (
      <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>
        No vendor snapshots, payment facts, or forecast fixtures are available for this company yet.
      </div>
    );
  }

  const reportHeading = (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: '0 0 5px' }}>{reportLabel}</h2>
      <div style={{ color: '#64748b', fontSize: 12 }}>
        {payload.asOf ? `Latest vendor snapshot: ${payload.asOf.slice(0, 10)}` : 'Current forecast and payment data'}
      </div>
    </div>
  );
  const noRows = <div style={{ padding: 20, color: '#64748b', fontSize: 13 }}>No rows are available for this report.</div>;

  if (reportKey === 'vendorsCatalogPurchaseHistory') {
    return <>{reportHeading}<div style={{ overflowX: 'auto' }}><table style={tableStyle}><thead><tr>
      <th style={headerStyle}>Vendor</th><th style={headerStyle}>Terms</th><th style={headerStyle}>Last purchase</th>
      <th style={{ ...headerStyle, textAlign: 'right' }}>Purchase YTD</th><th style={{ ...headerStyle, textAlign: 'right' }}>Prior year</th>
      <th style={{ ...headerStyle, textAlign: 'right' }}>Payments YTD</th>
    </tr></thead><tbody>{payload.catalog.slice(0, 30).map((row) => <tr key={row.vendorId}>
      <td style={cellStyle}><strong>{row.vendorName}</strong><div style={{ color: '#64748b', fontSize: 11 }}>{row.status}</div></td>
      <td style={cellStyle}>{row.termsCode}</td><td style={cellStyle}>{row.lastPurchaseDate || '—'}</td>
      <td style={rightCellStyle}>{money(row.purchaseYtd)}</td><td style={rightCellStyle}>{money(row.purchaseLastYear)}</td><td style={rightCellStyle}>{money(row.payYtd)}</td>
    </tr>)}</tbody></table>{payload.catalog.length === 0 ? noRows : null}</div></>;
  }

  if (reportKey === 'vendorsItemVolumePricing6mo') {
    return <>{reportHeading}<div style={{ overflowX: 'auto' }}><table style={tableStyle}><thead><tr>
      <th style={headerStyle}>Vendor</th><th style={headerStyle}>Item</th><th style={{ ...headerStyle, textAlign: 'right' }}>Actual volume</th>
      <th style={{ ...headerStyle, textAlign: 'right' }}>Forecast volume</th><th style={{ ...headerStyle, textAlign: 'right' }}>Contract price</th><th style={{ ...headerStyle, textAlign: 'right' }}>SGP price</th>
    </tr></thead><tbody>{payload.itemVolumePricing.slice(0, 40).map((row, index) => <tr key={`${row.vendorName}-${row.itemSku}-${index}`}>
      <td style={cellStyle}>{row.vendorName}</td><td style={cellStyle}><strong>{row.itemSku}</strong></td><td style={rightCellStyle}>{row.actual6mo.toLocaleString()}</td>
      <td style={rightCellStyle}>{row.forecast6mo.toLocaleString()}</td><td style={rightCellStyle}>{money(row.contractPrice)}</td><td style={rightCellStyle}>{money(row.sgpPrice)}</td>
    </tr>)}</tbody></table>{payload.itemVolumePricing.length === 0 ? noRows : null}</div></>;
  }

  if (reportKey === 'vendorsPaymentHistoryByMonth') {
    const monthHeaders = payload.paymentHistory[0]?.months || [];
    return <>{reportHeading}<div style={{ overflowX: 'auto' }}><table style={tableStyle}><thead><tr>
      <th style={headerStyle}>Vendor</th>{monthHeaders.map((month) => <th key={month.month} style={{ ...headerStyle, textAlign: 'right' }}>{month.month}</th>)}<th style={{ ...headerStyle, textAlign: 'right' }}>Six months</th>
    </tr></thead><tbody>{payload.paymentHistory.slice(0, 30).map((row) => <tr key={row.vendorName}>
      <td style={cellStyle}><strong>{row.vendorName}</strong></td>{row.months.map((month) => <td key={month.month} style={rightCellStyle}>{money(month.amount)}</td>)}<td style={{ ...rightCellStyle, fontWeight: 700 }}>{money(row.totalPaid)}</td>
    </tr>)}</tbody></table>{payload.paymentHistory.length === 0 ? noRows : null}</div></>;
  }

  if (reportKey === 'vendorsConcentration') {
    return <>{reportHeading}<div style={{ overflowX: 'auto' }}><table style={tableStyle}><thead><tr><th style={headerStyle}>Vendor</th><th style={{ ...headerStyle, textAlign: 'right' }}>Six-month payments</th><th style={{ ...headerStyle, textAlign: 'right' }}>Share</th></tr></thead>
      <tbody>{payload.concentration.map((row) => <tr key={row.vendorName}><td style={cellStyle}><strong>{row.vendorName}</strong></td><td style={rightCellStyle}>{money(row.spend)}</td><td style={rightCellStyle}>{row.sharePct.toFixed(1)}%</td></tr>)}</tbody>
    </table>{payload.concentration.length === 0 ? noRows : null}</div></>;
  }

  if (reportKey === 'vendorsPriceChangeTracker') {
    return <>{reportHeading}<div style={{ overflowX: 'auto' }}><table style={tableStyle}><thead><tr><th style={headerStyle}>Vendor</th><th style={headerStyle}>Item</th><th style={{ ...headerStyle, textAlign: 'right' }}>Contract</th><th style={{ ...headerStyle, textAlign: 'right' }}>SGP</th><th style={{ ...headerStyle, textAlign: 'right' }}>Variance</th><th style={{ ...headerStyle, textAlign: 'right' }}>Variance %</th></tr></thead>
      <tbody>{payload.priceChanges.slice(0, 40).map((row, index) => <tr key={`${row.vendorName}-${row.itemSku}-${index}`}><td style={cellStyle}>{row.vendorName}</td><td style={cellStyle}><strong>{row.itemSku}</strong></td><td style={rightCellStyle}>{money(row.contractPrice)}</td><td style={rightCellStyle}>{money(row.sgpPrice)}</td><td style={{ ...rightCellStyle, color: row.variance > 0 ? '#b91c1c' : '#15803d' }}>{row.variance >= 0 ? '+' : ''}{money(row.variance)}</td><td style={rightCellStyle}>{row.variancePct >= 0 ? '+' : ''}{row.variancePct.toFixed(1)}%</td></tr>)}</tbody>
    </table>{payload.priceChanges.length === 0 ? noRows : null}</div></>;
  }

  return <>{reportHeading}<div style={{ overflowX: 'auto' }}><table style={tableStyle}><thead><tr><th style={headerStyle}>Item category</th><th style={{ ...headerStyle, textAlign: 'right' }}>Six-month forecast-backed spend</th></tr></thead>
    <tbody>{payload.spendByItemCategory.map((row) => <tr key={row.category}><td style={cellStyle}><strong>{row.category}</strong></td><td style={rightCellStyle}>{money(row.spend)}</td></tr>)}</tbody>
  </table>{payload.spendByItemCategory.length === 0 ? noRows : null}</div></>;
}
