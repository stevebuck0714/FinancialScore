'use client';

import { useEffect, useState } from 'react';

const formatTokens = (value: unknown) => Math.round(Number(value) || 0).toLocaleString('en-US');
const formatMonth = (month: string) => {
  const [year, number] = String(month || '').split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[Number(number) - 1] ? `${names[Number(number) - 1]} ${year}` : month;
};

export default function TokenUsageTab({ selectedCompanyId }: { selectedCompanyId: string }) {
  const [usage, setUsage] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUsage(null);
    setError(null);
    fetch(`/api/company/token-usage?companyId=${encodeURIComponent(selectedCompanyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to load token usage');
        if (!cancelled) setUsage(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load token usage');
      });
    return () => { cancelled = true; };
  }, [selectedCompanyId]);

  const current = usage?.current;
  const pricing = usage?.pricing;
  const allowance = Number(pricing?.monthlyTokenAllowance || 0);
  const usedPct = allowance > 0 ? (Number(current?.billableTokens || 0) / allowance) * 100 : null;
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Token Usage</h2>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>Ask Corelytics usage only. Scheduled and other non-billable AI functions are excluded.</p>
      {error && <div style={{ color: '#b91c1c', fontSize: '13px' }}>{error}</div>}
      {!usage && !error && <div style={{ color: '#64748b', fontSize: '13px' }}>Loading usage…</div>}
      {usage && (
        <>
          <div style={{ padding: '12px', background: '#fdf4ff', border: '1px solid #f5d0fe', borderRadius: '8px', color: '#475569', fontSize: '13px', marginBottom: '16px' }}>
            <strong>{formatMonth(current?.month || '')} (EST):</strong> {formatTokens(current?.billableTokens)}{allowance > 0 ? ` of ${formatTokens(allowance)} tokens (${Math.round(usedPct || 0)}%)` : ' tokens'}
            <div style={{ marginTop: '4px', fontSize: '11px' }}>
              <strong>Allowance:</strong> {allowance > 0 ? `${formatTokens(allowance)} tokens/month` : 'Not set'} | <strong>Overage Price:</strong> ${Number(pricing?.overagePricePer1MTokens || 0).toFixed(2)} per 1M tokens | <strong>Billable Cost:</strong> ${Number(current?.costUsd || 0).toFixed(2)}
            </div>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Monthly History (EST)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><tr style={{ background: '#f1f5f9' }}><th style={{ textAlign: 'left', padding: '7px' }}>Month</th><th style={{ textAlign: 'right', padding: '7px' }}>Interactions</th><th style={{ textAlign: 'right', padding: '7px' }}>Tokens</th><th style={{ textAlign: 'right', padding: '7px' }}>Cost</th></tr></thead>
            <tbody>{(usage.months || []).map((row: any) => <tr key={row.month} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: '7px' }}>{formatMonth(row.month)}</td><td style={{ textAlign: 'right', padding: '7px' }}>{formatTokens(row.interactions)}</td><td style={{ textAlign: 'right', padding: '7px' }}>{formatTokens(row.totalTokens)}</td><td style={{ textAlign: 'right', padding: '7px' }}>${Number(row.costUsd || 0).toFixed(2)}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
