'use client';

import React, { useEffect, useState } from 'react';
import { getMockCapTableData } from '@/lib/cap-table/mock-data';

type CapTableViewProps = {
  selectedCompanyId: string;
  companyName?: string;
  operationalHubSections?: Record<string, any>;
};

type TabKey = 'ownership' | 'history' | 'securities' | 'waterfall' | 'performance';

type RealCapTableHolding = {
  holder: string;
  accountName: string;
  accountCode?: string | null;
  security: string;
  targetField: string;
  balance: number;
  ownershipPct?: number | null;
  issuedDate?: string | null;
  activity?: Array<{
    txnDate: string;
    txnType: string;
    refNo: string;
    name: string;
    splitAccount: string;
    amount: number;
    balance: number;
  }>;
};

type RealCapTableData = {
  asOfDate: string;
  source: string;
  holdings: RealCapTableHolding[];
  savedInputs?: {
    holderSharePrice?: string;
    sharesIssuedByHolding?: Record<string, string>;
  };
  securitySummary: Array<{ security: string; balance: number; holders: number; ownershipPct: number }>;
  summary: {
    capitalBalance: number;
    holderCount: number;
    securityClassCount: number;
  };
};

function formatCurrency(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toLocaleString('en-US');
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(1)}%`;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { timeZone: 'UTC' });
}

export default function CapTableView({ selectedCompanyId, companyName, operationalHubSections }: CapTableViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('ownership');
  const [realData, setRealData] = useState<RealCapTableData | null>(null);
  const [loadingRealData, setLoadingRealData] = useState(false);
  const [realDataError, setRealDataError] = useState<string | null>(null);
  const [holderSharePrice, setHolderSharePrice] = useState('');
  const [sharesIssuedByHolding, setSharesIssuedByHolding] = useState<Record<string, string>>({});
  const [inputsHydrated, setInputsHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const allowMockCapTableData =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_ENABLE_CAP_TABLE_MOCKS === 'true';
  const data = allowMockCapTableData ? getMockCapTableData() : null;

  useEffect(() => {
    if (!selectedCompanyId) return;
    let cancelled = false;
    setInputsHydrated(false);
    setSaveStatus('idle');
    const loadRealCapTable = async () => {
      setLoadingRealData(true);
      setRealDataError(null);
      try {
        const response = await fetch(`/api/cap-table?companyId=${encodeURIComponent(selectedCompanyId)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setRealData(null);
          setRealDataError(payload?.error || 'Unable to load cap table data.');
          return;
        }
        setRealData(Array.isArray(payload?.holdings) && payload.holdings.length > 0 ? payload : null);
        const savedInputs = payload?.savedInputs && typeof payload.savedInputs === 'object' ? payload.savedInputs : {};
        setHolderSharePrice(typeof savedInputs.holderSharePrice === 'string' ? savedInputs.holderSharePrice : '');
        setSharesIssuedByHolding(
          savedInputs.sharesIssuedByHolding && typeof savedInputs.sharesIssuedByHolding === 'object'
            ? savedInputs.sharesIssuedByHolding
            : {}
        );
        setInputsHydrated(true);
      } catch (error) {
        if (!cancelled) {
          setRealData(null);
          setRealDataError(error instanceof Error ? error.message : 'Unable to load cap table data.');
          setInputsHydrated(true);
        }
      } finally {
        if (!cancelled) setLoadingRealData(false);
      }
    };
    loadRealCapTable();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId || !inputsHydrated) return;
    const timeout = window.setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const response = await fetch('/api/cap-table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            holderSharePrice,
            sharesIssuedByHolding,
          }),
        });
        if (!response.ok) throw new Error('Unable to save cap table inputs.');
        setSaveStatus('saved');
      } catch (error) {
        setSaveStatus('error');
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [holderSharePrice, inputsHydrated, selectedCompanyId, sharesIssuedByHolding]);

  const isSectionEnabled = (sectionKey: string): boolean => {
    const value = operationalHubSections?.[sectionKey];
    return value === undefined ? true : value !== false;
  };
  const tabOptions = [
    { key: 'ownership' as TabKey, label: 'Current Ownership', sections: ['capTableCurrentOwnership'] },
    { key: 'history' as TabKey, label: 'Financing & Dilution', sections: ['capTableFinancingHistory', 'capTableOwnershipEvolution', 'capTableDilutionAnalysis'] },
    { key: 'securities' as TabKey, label: 'Security Classes', sections: ['capTableSecurityClasses'] },
    { key: 'waterfall' as TabKey, label: 'Exit Waterfall', sections: ['capTableExitWaterfall'] },
    { key: 'performance' as TabKey, label: 'Performance Linkage', sections: ['capTableInvestmentPerformance'] },
  ].filter((tab) => tab.sections.some((section) => isSectionEnabled(section)));
  const effectiveActiveTab = tabOptions.some((tab) => tab.key === activeTab) ? activeTab : tabOptions[0]?.key || 'ownership';
  const cardStyle: React.CSSProperties = {
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '16px',
  };
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '9px 10px',
    fontSize: '11px',
    fontWeight: 800,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
  };
  const tdStyle: React.CSSProperties = {
    padding: '9px 10px',
    fontSize: '13px',
    color: '#0f172a',
    borderBottom: '1px solid #f1f5f9',
  };
  const inputStyle: React.CSSProperties = {
    width: '120px',
    padding: '6px 8px',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '13px',
    textAlign: 'right',
  };

  if (realData) {
    const securityHolderTargetFields = new Set(['ownersCapital', 'commonStock', 'preferredStock', 'additionalPaidInCapital']);
    const securityHoldings = realData.holdings.filter(
      (holding) => securityHolderTargetFields.has(holding.targetField) && holding.balance > 0
    );
    const securitySummaryByName = new Map(realData.securitySummary.map((row) => [row.security, row]));
    const holderGroups = Array.from(
      securityHoldings.reduce<Map<string, RealCapTableHolding[]>>((map, holding) => {
        const security = holding.security || 'Unclassified';
        const rows = map.get(security) || [];
        rows.push(holding);
        map.set(security, rows);
        return map;
      }, new Map<string, RealCapTableHolding[]>())
    )
      .map(([security, holdings]) => {
        const summary = securitySummaryByName.get(security);
        return {
          security,
          holdings,
          balance: summary?.balance ?? holdings.reduce((sum, holding) => sum + Number(holding.balance || 0), 0),
          ownershipPct: summary?.ownershipPct ?? holdings.reduce((sum, holding) => sum + Number(holding.ownershipPct || 0), 0),
        };
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    const holderInputKey = (holding: RealCapTableHolding) => `${holding.targetField}:${holding.accountName}:${holding.holder}`;
    const sharePriceValue = Number(holderSharePrice) || 0;
    const getSharesIssued = (holding: RealCapTableHolding) => Number(sharesIssuedByHolding[holderInputKey(holding)]) || 0;
    const getHoldingValue = (holding: RealCapTableHolding) => getSharesIssued(holding) * sharePriceValue;
    const holderDetailTotalBalance = securityHoldings.reduce((sum, holding) => sum + Number(holding.balance || 0), 0);
    const holderDetailTotalShares = securityHoldings.reduce((sum, holding) => sum + getSharesIssued(holding), 0);
    const holderDetailTotalValue = securityHoldings.reduce((sum, holding) => sum + getHoldingValue(holding), 0);
    const subtotalRowStyle: React.CSSProperties = {
      ...tdStyle,
      background: '#f8fafc',
      borderTop: '1px solid #cbd5e1',
      borderBottom: '1px solid #cbd5e1',
      fontWeight: 900,
    };
    const grandTotalRowStyle: React.CSSProperties = {
      ...tdStyle,
      background: '#e0e7ff',
      borderTop: '2px solid #94a3b8',
      borderBottom: 'none',
      fontWeight: 900,
    };
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>Cap Table</h1>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[
              ['Capital Balance', formatCurrency(realData.summary.capitalBalance)],
              ['Holders', formatNumber(realData.summary.holderCount)],
              ['Security Classes', formatNumber(realData.summary.securityClassCount)],
            ].map(([label, value]) => (
              <div key={label} style={{ ...cardStyle, padding: '10px 14px', minWidth: '160px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Current Capitalization Summary</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Security Type</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Capital Balance</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Holders</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>% Ownership</th>
                </tr>
              </thead>
              <tbody>
                {realData.securitySummary.map((security) => (
                  <tr key={security.security}>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{security.security}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(security.balance)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(security.holders)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{security.ownershipPct ? formatPercent(security.ownershipPct) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900 }}>Holder Detail</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ color: saveStatus === 'error' ? '#b91c1c' : '#64748b', fontSize: '12px', fontWeight: 800 }}>
                {saveStatus === 'saving'
                  ? 'Saving...'
                  : saveStatus === 'saved'
                    ? 'Saved'
                    : saveStatus === 'error'
                      ? 'Save failed'
                      : ''}
              </div>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: '#475569' }}>
                Share price
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={holderSharePrice}
                  onChange={(event) => setHolderSharePrice(event.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Holder</th>
                  <th style={thStyle}>Security</th>
                  <th style={thStyle}>Issued Date</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Capital Balance</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Shares Issued</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>% Ownership</th>
                </tr>
              </thead>
              <tbody>
                {holderGroups.map((group) => {
                  const groupShares = group.holdings.reduce((sum, holding) => sum + getSharesIssued(holding), 0);
                  const groupValue = group.holdings.reduce((sum, holding) => sum + getHoldingValue(holding), 0);
                  const groupOwnershipPct = holderDetailTotalValue > 0 ? (groupValue / holderDetailTotalValue) * 100 : null;
                  return (
                    <React.Fragment key={group.security}>
                      <tr>
                        <td colSpan={7} style={{ ...tdStyle, background: '#f8fafc', color: '#334155', fontWeight: 900 }}>
                          {group.security}
                        </td>
                      </tr>
                      {group.holdings.map((holding) => {
                        const key = holderInputKey(holding);
                        const sharesIssued = sharesIssuedByHolding[key] || '';
                        const holdingValue = getHoldingValue(holding);
                        const ownershipPct = holderDetailTotalValue > 0 ? (holdingValue / holderDetailTotalValue) * 100 : null;
                        return (
                          <tr key={`${holding.accountName}-${holding.targetField}`}>
                            <td style={{ ...tdStyle, fontWeight: 800 }}>{holding.holder}</td>
                            <td style={tdStyle}>{holding.security}</td>
                            <td style={tdStyle}>
                              {holding.issuedDate ? formatDate(holding.issuedDate) : '-'}
                              {holding.activity && holding.activity.length > 1 && (
                                <div style={{ marginTop: '2px', color: '#64748b', fontSize: '11px' }}>
                                  {holding.activity.length} tranches
                                </div>
                              )}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(holding.balance)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={sharesIssued}
                                onChange={(event) => setSharesIssuedByHolding((current) => ({ ...current, [key]: event.target.value }))}
                                placeholder="0"
                                style={inputStyle}
                              />
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{holdingValue > 0 ? formatCurrency(holdingValue) : '-'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{ownershipPct == null ? '-' : formatPercent(ownershipPct)}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td style={subtotalRowStyle}>{group.security} Subtotal</td>
                        <td style={subtotalRowStyle}>{group.security}</td>
                        <td style={subtotalRowStyle}>-</td>
                        <td style={{ ...subtotalRowStyle, textAlign: 'right' }}>{formatCurrency(group.balance)}</td>
                        <td style={{ ...subtotalRowStyle, textAlign: 'right' }}>{groupShares > 0 ? formatNumber(groupShares) : '-'}</td>
                        <td style={{ ...subtotalRowStyle, textAlign: 'right' }}>{groupValue > 0 ? formatCurrency(groupValue) : '-'}</td>
                        <td style={{ ...subtotalRowStyle, textAlign: 'right' }}>{groupOwnershipPct == null ? '-' : formatPercent(groupOwnershipPct)}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                <tr>
                  <td style={grandTotalRowStyle}>Total All Securities</td>
                  <td style={grandTotalRowStyle}>All Securities</td>
                  <td style={grandTotalRowStyle}>-</td>
                  <td style={{ ...grandTotalRowStyle, textAlign: 'right' }}>{formatCurrency(holderDetailTotalBalance)}</td>
                  <td style={{ ...grandTotalRowStyle, textAlign: 'right' }}>{holderDetailTotalShares > 0 ? formatNumber(holderDetailTotalShares) : '-'}</td>
                  <td style={{ ...grandTotalRowStyle, textAlign: 'right' }}>{holderDetailTotalValue > 0 ? formatCurrency(holderDetailTotalValue) : '-'}</td>
                  <td style={{ ...grandTotalRowStyle, textAlign: 'right' }}>{holderDetailTotalValue > 0 ? '100.0%' : '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>Cap Table</h1>
          <div style={{ marginTop: '4px', color: '#64748b', fontSize: '13px' }}>
            {companyName || selectedCompanyId}
          </div>
        </div>
        <div style={{ ...cardStyle, background: '#f8fafc' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
            No cap table data connected
          </div>
          <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
            {loadingRealData
              ? 'Loading real cap table data...'
              : realDataError || 'No mapped QBD equity account balances are available for this company. No mock or preview cap table data is shown when real data mode is active.'}
          </div>
        </div>
      </div>
    );
  }

  const fullyDilutedTotal = data.securities.reduce((sum, security) => sum + security.asConvertedShares, 0);
  const totalCapitalRaised = data.rounds.reduce((sum, round) => sum + round.capitalRaised, 0);
  const latestEnterpriseValue = data.performance[data.performance.length - 1]?.enterpriseValue || 0;
  const waterfallHolders = Object.keys(data.exitWaterfall[0]?.distributions || {});

  const tabStyle = (active: boolean): React.CSSProperties => ({
    border: 'none',
    background: 'transparent',
    borderBottom: active ? '3px solid #2751d0' : '3px solid transparent',
    color: active ? '#2751d0' : '#64748b',
    padding: '10px 12px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>Cap Table</h1>
          <div style={{ marginTop: '4px', color: '#64748b', fontSize: '13px' }}>
            Local mock preview for {companyName || selectedCompanyId} as of {formatDate(data.asOfDate)}.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[
            ['Fully Diluted Shares', formatNumber(fullyDilutedTotal)],
            ['Capital Raised', formatCurrency(totalCapitalRaised)],
            ['Latest Enterprise Value', formatCurrency(latestEnterpriseValue)],
          ].map(([label, value]) => (
            <div key={label} style={{ ...cardStyle, padding: '10px 14px', minWidth: '160px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, background: '#f8fafc', color: '#475569', fontSize: '13px' }}>
        Local development preview only. Mock cap table data is hidden unless NEXT_PUBLIC_ENABLE_CAP_TABLE_MOCKS=true in development.
      </div>

      <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e2e8f0', overflowX: 'auto' }}>
        {tabOptions.map((tab) => (
          <button key={tab.key} type="button" style={tabStyle(effectiveActiveTab === tab.key)} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {effectiveActiveTab === 'ownership' && (
        <>
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Current Capitalization Summary</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Security Type</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Units</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>As Converted Shares</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>% Ownership</th>
                  </tr>
                </thead>
                <tbody>
                  {data.securities.filter((security) => security.asConvertedShares > 0).map((security) => (
                    <tr key={security.id}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>{security.series}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(security.units)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(security.asConvertedShares)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{formatPercent((security.asConvertedShares / fullyDilutedTotal) * 100)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 900 }}>Fully Diluted Total</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>{formatNumber(fullyDilutedTotal)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>{formatNumber(fullyDilutedTotal)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Holder Detail</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Holder</th>
                    <th style={thStyle}>Security</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Shares</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Cost Basis</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Basic %</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Fully Diluted %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((holding) => (
                    <tr key={`${holding.holder}-${holding.security}`}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>{holding.holder}</td>
                      <td style={tdStyle}>{holding.security}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(holding.shares)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(holding.costBasis, holding.costBasis < 1 ? 3 : 2)}/share</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPercent(holding.basicOwnershipPct)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{formatPercent(holding.fullyDilutedOwnershipPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {effectiveActiveTab === 'history' && (
        <>
          {isSectionEnabled('capTableFinancingHistory') && (
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Financing Round History</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Round</th>
                    <th style={thStyle}>Date</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Capital Raised</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Pre-Money</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Post-Money</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Share Price</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Shares Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rounds.map((round) => (
                    <tr key={round.id}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>{round.name}</td>
                      <td style={tdStyle}>{formatDate(round.date)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(round.capitalRaised)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(round.preMoneyValuation)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(round.postMoneyValuation)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{round.sharePrice == null ? '-' : formatCurrency(round.sharePrice, round.sharePrice < 1 ? 3 : 2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(round.sharesIssued)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
            {isSectionEnabled('capTableOwnershipEvolution') && (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Ownership Evolution</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Holder</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Founder</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Seed</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Series A</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Series B</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ownershipEvolution.map((row) => (
                      <tr key={row.holder}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>{row.holder}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPercent(row.founder)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPercent(row.seed)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPercent(row.seriesA)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPercent(row.seriesB)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{formatPercent(row.current)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {isSectionEnabled('capTableDilutionAnalysis') && (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Round-by-Round Dilution</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Round</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>New Shares</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Dilution</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Founder Before</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Founder After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dilution.map((row) => (
                      <tr key={row.round}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>{row.round}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(row.newSharesIssued)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPercent(row.dilutionPct)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPercent(row.founderOwnershipBefore)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{formatPercent(row.founderOwnershipAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        </>
      )}

      {effectiveActiveTab === 'securities' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {data.securities.map((security) => (
            <div key={security.id} style={cardStyle}>
              <div style={{ fontWeight: 900, color: '#0f172a' }}>{security.series}</div>
              <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>{security.securityType}</div>
              <div style={{ display: 'grid', gap: '8px', marginTop: '12px', fontSize: '13px' }}>
                <div><strong>Units:</strong> {formatNumber(security.units)}</div>
                <div><strong>As Converted:</strong> {formatNumber(security.asConvertedShares)}</div>
                {security.votingRights && <div><strong>Voting:</strong> {security.votingRights}</div>}
                {security.liquidationPreference && <div><strong>Liquidation:</strong> {security.liquidationPreference}</div>}
                {security.conversionRatio && <div><strong>Conversion:</strong> {security.conversionRatio}</div>}
                {security.participationRights && <div><strong>Participation:</strong> {security.participationRights}</div>}
                {security.dividendRights && <div><strong>Dividends:</strong> {security.dividendRights}</div>}
                {security.strikePrice != null && <div><strong>Strike:</strong> {formatCurrency(security.strikePrice, 2)}</div>}
                {security.expiration && <div><strong>Expiration:</strong> {formatDate(security.expiration)}</div>}
                {security.valuationCap != null && <div><strong>Valuation Cap:</strong> {formatCurrency(security.valuationCap)}</div>}
                {security.discountPct != null && <div><strong>Discount:</strong> {formatPercent(security.discountPct)}</div>}
                {security.principalAmount != null && <div><strong>Principal:</strong> {formatCurrency(security.principalAmount)}</div>}
                {security.interestRatePct != null && <div><strong>Interest Rate:</strong> {formatPercent(security.interestRatePct)}</div>}
                {security.maturityDate && <div><strong>Maturity:</strong> {formatDate(security.maturityDate)}</div>}
                {security.conversionTrigger && <div><strong>Conversion Trigger:</strong> {security.conversionTrigger}</div>}
                {security.accruedInterest != null && <div><strong>Accrued Interest:</strong> {formatCurrency(security.accruedInterest)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {effectiveActiveTab === 'waterfall' && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Waterfall Exit Analysis</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Exit Value</th>
                  {waterfallHolders.map((holder) => <th key={holder} style={{ ...thStyle, textAlign: 'right' }}>{holder}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.exitWaterfall.map((row) => (
                  <tr key={row.exitValue}>
                    <td style={{ ...tdStyle, fontWeight: 900 }}>{formatCurrency(row.exitValue)}</td>
                    {waterfallHolders.map((holder) => (
                      <td key={holder} style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.distributions[holder] || 0)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {effectiveActiveTab === 'performance' && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Investment Performance Linkage</div>
          <div style={{ padding: '0 16px 12px', color: '#64748b', fontSize: '12px', marginTop: '12px' }}>
            Corelytics differentiator: ownership linked to operating performance and valuation at each financing round.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Round</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>EBITDA</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Enterprise Value</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Ownership %</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Invested Capital</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Implied Current Value</th>
                </tr>
              </thead>
              <tbody>
                {data.performance.map((row) => (
                  <tr key={row.round}>
                    <td style={{ ...tdStyle, fontWeight: 900 }}>{row.round}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.revenue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.ebitda < 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(row.ebitda)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.enterpriseValue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPercent(row.ownershipPct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.investedCapital)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>{formatCurrency(row.impliedCurrentValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
