'use client';

import { useEffect, useState } from 'react';

const formatTokens = (value: unknown) => Math.round(Number(value) || 0).toLocaleString('en-US');
const formatCost = (value: unknown) => `$${Number(value || 0).toFixed(4)}`;
const formatMonth = (month: string) => {
  const [year, number] = String(month || '').split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[Number(number) - 1] ? `${names[Number(number) - 1]} ${year}` : month;
};
const formatHistoryMonth = (month: string) => {
  const [year, number] = String(month || '').split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[Number(number) - 1] && year ? `${names[Number(number) - 1]}-${year.slice(-2)}` : month;
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
  const currentTotalTokens = Number(current?.totalTokens || 0);
  const currentWeightedCostPer1M = currentTotalTokens > 0 ? (Number(current?.costUsd || 0) / currentTotalTokens) * 1_000_000 : 0;
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
              <strong>Input:</strong> {formatTokens(current?.promptTokens)} ({formatCost(current?.inputCostUsd)}) | <strong>Output:</strong> {formatTokens(current?.completionTokens)} ({formatCost(current?.outputCostUsd)}) | <strong>Weighted Provider Cost:</strong> ${currentWeightedCostPer1M.toFixed(2)} per 1M |{' '}
              <strong>Allowance:</strong> {allowance > 0 ? `${formatTokens(allowance)} tokens/month` : 'Not set'} | <strong>Overage Price:</strong> ${Number(pricing?.overagePricePer1MTokens || 0).toFixed(2)} per 1M tokens | <strong>Cost:</strong> ${Number(current?.overageChargeUsd || 0).toFixed(2)}
            </div>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Monthly History (EST)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '1400px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead><tr style={{ background: '#f1f5f9' }}><th style={{ textAlign: 'left', padding: '7px' }}>Month</th><th style={{ textAlign: 'right', padding: '7px' }}>Interactions</th><th style={{ textAlign: 'right', padding: '7px' }}>Input Tokens</th><th style={{ textAlign: 'right', padding: '7px' }}>Input Cost</th><th style={{ textAlign: 'right', padding: '7px' }}>Output Tokens</th><th style={{ textAlign: 'right', padding: '7px' }}>Output Cost</th><th style={{ textAlign: 'right', padding: '7px' }}>Total Tokens</th><th style={{ textAlign: 'right', padding: '7px' }}>Avg Input / Query</th><th style={{ textAlign: 'right', padding: '7px' }}>Avg Output / Query</th><th style={{ textAlign: 'right', padding: '7px' }}>Weighted Cost / 1M</th><th style={{ textAlign: 'right', padding: '7px' }}>Allowance</th><th style={{ textAlign: 'right', padding: '7px' }}>Remaining Allowance</th><th style={{ textAlign: 'right', padding: '7px' }}>Overage Charge</th></tr></thead>
              <tbody>{(usage.months || []).map((row: any) => {
                const tokens = Number(row.totalTokens || 0);
                const inputTokens = Number(row.promptTokens || 0);
                const outputTokens = Number(row.completionTokens || 0);
                const inputCost = Number(row.inputCostUsd || 0);
                const outputCost = Number(row.outputCostUsd || 0);
                const weightedCostPer1M = tokens > 0 ? (Number(row.costUsd || 0) / tokens) * 1_000_000 : 0;
                const interactions = Number(row.interactions || 0);
                const rowAllowance = allowance;
                return <tr key={row.month} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '7px' }}>{formatHistoryMonth(row.month)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{formatTokens(interactions)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{formatTokens(inputTokens)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{formatCost(inputCost)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{formatTokens(outputTokens)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{formatCost(outputCost)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{formatTokens(tokens)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{formatTokens(interactions > 0 ? inputTokens / interactions : 0)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{formatTokens(interactions > 0 ? outputTokens / interactions : 0)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>${weightedCostPer1M.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{rowAllowance > 0 ? formatTokens(rowAllowance) : 'Not set'}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>{rowAllowance > 0 ? formatTokens(Math.max(0, rowAllowance - tokens)) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '7px' }}>${Number(row.overageChargeUsd || 0).toFixed(2)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
