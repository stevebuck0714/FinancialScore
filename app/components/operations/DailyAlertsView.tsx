'use client';

import React, { useEffect, useMemo, useState } from 'react';

type AlertItem = {
  id: string;
  source: 'daily-change' | 'unresolved' | 'open-critical';
  title: string;
  detail: string;
  owner: string;
  drillView: string;
  deltaText?: string;
  updatedAt?: string;
  itemLabel?: string;
};

interface DailyAlertsViewProps {
  companyId: string;
  companyName: string;
  onNavigate: (view: string) => void;
}

const RESOLVED_STATUSES = new Set(['resolved', 'realized', 'closed', 'done', 'complete', 'completed']);

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dayOverDayPct(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

export default function DailyAlertsView({ companyId, companyName, onNavigate }: DailyAlertsViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        const startDate = start.toISOString().split('T')[0];
        const endDate = end.toISOString().split('T')[0];

        const fetchOps = async (type: 'ar-aging' | 'ap-aging' | 'cash') => {
          const params = new URLSearchParams({
            companyId,
            type,
            frequency: 'daily',
            startDate,
            endDate,
          });
          const response = await fetch(`/api/operational-data?${params}`);
          if (!response.ok) throw new Error(`Failed to load ${type} data`);
          return response.json();
        };

        const fetchFindings = async () => {
          const params = new URLSearchParams({
            companyId,
            severity: 'critical',
            limit: '100',
          });
          const response = await fetch(`/api/performance-analytics/findings?${params}`);
          if (!response.ok) throw new Error('Failed to load findings');
          return response.json();
        };

        const [arData, apData, cashData, findingsData] = await Promise.all([
          fetchOps('ar-aging'),
          fetchOps('ap-aging'),
          fetchOps('cash'),
          fetchFindings(),
        ]);

        const built: AlertItem[] = [];

        const arRecords = Array.isArray(arData?.records) ? arData.records : [];
        if (arRecords.length >= 2) {
          const latest = arRecords[0];
          const prev = arRecords[1];
          const latestOver30 = ((asNumber(latest.days1to30) + asNumber(latest.days31to60) + asNumber(latest.days61to90) + asNumber(latest.days90plus)) / Math.max(asNumber(latest.totalAR), 1)) * 100;
          const prevOver30 = ((asNumber(prev.days1to30) + asNumber(prev.days31to60) + asNumber(prev.days61to90) + asNumber(prev.days90plus)) / Math.max(asNumber(prev.totalAR), 1)) * 100;
          const deltaPts = latestOver30 - prevOver30;
          const topCustomer = (Array.isArray(arData?.summary?.unpaidByCustomer) ? arData.summary.unpaidByCustomer : [])
            .map((row: any) => ({
              customerName: row.customerName,
              overdue: asNumber(row.days31to60) + asNumber(row.days61to90) + asNumber(row.days90plus),
            }))
            .sort((a: any, b: any) => b.overdue - a.overdue)[0];
          if (latestOver30 >= 30 && deltaPts >= 2) {
            built.push({
              id: `daily-ar-${latest.snapshotDate}`,
              source: 'daily-change',
              title: 'AR Deteriorated Today',
              detail: `AR >30d is ${latestOver30.toFixed(1)}% (${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts vs prior day)`,
              owner: 'Collections Lead',
              drillView: 'pa-critical-issues',
              deltaText: `DoD ${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts`,
              updatedAt: latest.snapshotDate,
              itemLabel: topCustomer?.customerName || undefined,
            });
          }
        }

        const apRecords = Array.isArray(apData?.records) ? apData.records : [];
        if (apRecords.length >= 2) {
          const latest = apRecords[0];
          const prev = apRecords[1];
          const latestOver30 = ((asNumber(latest.days1to30) + asNumber(latest.days31to60) + asNumber(latest.days61to90) + asNumber(latest.days90plus)) / Math.max(asNumber(latest.totalAP), 1)) * 100;
          const prevOver30 = ((asNumber(prev.days1to30) + asNumber(prev.days31to60) + asNumber(prev.days61to90) + asNumber(prev.days90plus)) / Math.max(asNumber(prev.totalAP), 1)) * 100;
          const deltaPts = latestOver30 - prevOver30;
          const topVendor = (Array.isArray(apData?.summary?.unpaidByVendor) ? apData.summary.unpaidByVendor : [])
            .map((row: any) => ({
              vendorName: row.vendorName,
              overdue: asNumber(row.days31to60) + asNumber(row.days61to90) + asNumber(row.days90plus),
            }))
            .sort((a: any, b: any) => b.overdue - a.overdue)[0];
          if (latestOver30 >= 30 && deltaPts >= 2) {
            built.push({
              id: `daily-ap-${latest.snapshotDate}`,
              source: 'daily-change',
              title: 'AP Pressure Increased Today',
              detail: `AP >30d is ${latestOver30.toFixed(1)}% (${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts vs prior day)`,
              owner: 'AP Manager',
              drillView: 'pa-critical-issues',
              deltaText: `DoD ${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts`,
              updatedAt: latest.snapshotDate,
              itemLabel: topVendor?.vendorName || undefined,
            });
          }
        }

        const cashRecords = Array.isArray(cashData?.records) ? cashData.records : [];
        if (cashRecords.length >= 2) {
          const byDate = cashRecords.reduce((acc: Record<string, number>, row: any) => {
            const key = String(row.snapshotDate || '');
            acc[key] = (acc[key] || 0) + asNumber(row.cashBalance);
            return acc;
          }, {});
          const orderedDates = Object.keys(byDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          if (orderedDates.length >= 2) {
            const latest = byDate[orderedDates[0]];
            const previous = byDate[orderedDates[1]];
            const pct = dayOverDayPct(latest, previous);
            if (pct <= -5) {
              built.push({
                id: `daily-cash-${orderedDates[0]}`,
                source: 'daily-change',
                title: 'Cash Dropped Today',
                detail: `Total cash moved ${pct.toFixed(1)}% day-over-day`,
                owner: 'Controller',
                drillView: 'pa-critical-issues',
                deltaText: `DoD ${pct.toFixed(1)}%`,
                updatedAt: orderedDates[0],
              });
            }

            // Account-level deterioration (daily) for visibility into specific accounts/items.
            const latestRows = cashRecords.filter((r: any) => String(r.snapshotDate) === orderedDates[0]);
            const prevRows = cashRecords.filter((r: any) => String(r.snapshotDate) === orderedDates[1]);
            const prevByAccount = new Map<string, number>(
              prevRows.map((row: any) => [String(row.accountName || ''), asNumber(row.cashBalance)])
            );
            latestRows.forEach((row: any) => {
              const accountName = String(row.accountName || '').trim();
              if (!accountName) return;
              const latestBal = asNumber(row.cashBalance);
              const prevBal = prevByAccount.get(accountName) || 0;
              const accountPct = dayOverDayPct(latestBal, prevBal);
              if (accountPct <= -8) {
                built.push({
                  id: `daily-cash-account-${orderedDates[0]}-${accountName}`,
                  source: 'daily-change',
                  title: 'Cash Account Worsened Today',
                  detail: `${accountName} moved ${accountPct.toFixed(1)}% day-over-day`,
                  owner: 'Controller',
                  drillView: 'pa-critical-issues',
                  deltaText: `DoD ${accountPct.toFixed(1)}%`,
                  updatedAt: orderedDates[0],
                  itemLabel: accountName,
                });
              }
            });
          }
        }

        // Outstanding operational critical conditions from current daily snapshots
        // (kept visible even if not newly worsened today).
        const arSummary = arData?.summary || {};
        const apSummary = apData?.summary || {};
        const cashSummary = cashData?.summary || {};
        const arOver30 = asNumber(arSummary.over30Pct);
        const apOver30 = asNumber(apSummary.over30Pct);
        const dso = asNumber(arSummary.dso);
        const cashChangePct = asNumber(cashSummary.changePercent);
        const totalCash = asNumber(cashSummary.totalCash);
        const burnProxy = Math.max(1, Math.abs(asNumber(cashSummary.changeAmount)));
        const runwayWeeks = (totalCash / burnProxy) * 4.33;

        if (arOver30 >= 35 || dso >= 50) {
          built.push({
            id: `open-critical-ar-${endDate}`,
            source: 'open-critical',
            title: 'Outstanding Critical: AR Quality',
            detail: `AR >30d ${arOver30.toFixed(1)}% | DSO ${dso.toFixed(1)} days remains at critical levels`,
            owner: 'Collections Lead',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
          });
        }
        if (apOver30 >= 35) {
          built.push({
            id: `open-critical-ap-${endDate}`,
            source: 'open-critical',
            title: 'Outstanding Critical: AP Pressure',
            detail: `AP >30d ${apOver30.toFixed(1)}% remains in critical range`,
            owner: 'AP Manager',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
          });
        }
        if (cashChangePct <= -10 || runwayWeeks < 8) {
          built.push({
            id: `open-critical-cash-${endDate}`,
            source: 'open-critical',
            title: 'Outstanding Critical: Cash Risk',
            detail: `Cash change ${cashChangePct.toFixed(1)}% | Runway ~${runwayWeeks.toFixed(1)} weeks`,
            owner: 'Controller',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
          });
        }

        const findings = Array.isArray(findingsData?.findings) ? findingsData.findings : [];
        findings
          .filter((finding: any) => {
            const status = String(finding?.payload?.status || '').trim().toLowerCase();
            return !status || !RESOLVED_STATUSES.has(status);
          })
          .slice(0, 25)
          .forEach((finding: any) => {
            built.push({
              id: `open-${finding.id}`,
              source: 'unresolved',
              title: finding?.payload?.title || finding?.metric || 'Open Critical Finding',
              detail: finding?.payload?.summary || finding?.payload?.likelyCause || 'Previously flagged critical item remains unresolved.',
              owner: finding?.payload?.owner || 'Ops/Finance Owner',
              drillView: finding?.type === 'anomaly' ? 'pa-anomaly-inbox' : 'pa-critical-issues',
              updatedAt: finding?.updatedAt,
              itemLabel: finding?.metric || undefined,
            });
          });

        const sourceRank: Record<AlertItem['source'], number> = {
          'daily-change': 3,
          'open-critical': 2,
          unresolved: 1,
        };
        built.sort((a, b) => {
          if (a.source !== b.source) return sourceRank[b.source] - sourceRank[a.source];
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
        });

        if (!cancelled) {
          setAlerts(built);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load daily alerts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (companyId) load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const counts = useMemo(() => {
    return {
      total: alerts.length,
      daily: alerts.filter((a) => a.source === 'daily-change').length,
      unresolved: alerts.filter((a) => a.source === 'unresolved' || a.source === 'open-critical').length,
    };
  }, [alerts]);

  if (loading) return <div style={{ padding: '32px', color: '#475569' }}>Loading daily alerts…</div>;
  if (error) return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Daily Alerts</h1>
      <p style={{ marginTop: '10px', fontSize: '15px', color: '#475569' }}>
        Critical items for <strong>{companyName}</strong>: major daily deterioration plus outstanding unresolved critical alerts.
      </p>

      <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: '10px' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', background: 'white' }}>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Critical Queue</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b' }}>{counts.total}</div>
        </div>
        <div style={{ border: '1px solid #fecaca', borderRadius: '10px', padding: '10px', background: '#fef2f2' }}>
          <div style={{ fontSize: '12px', color: '#b91c1c' }}>New Worsened Today</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#991b1b' }}>{counts.daily}</div>
        </div>
        <div style={{ border: '1px solid #fde68a', borderRadius: '10px', padding: '10px', background: '#fffbeb' }}>
          <div style={{ fontSize: '12px', color: '#92400e' }}>Unresolved Critical</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#92400e' }}>{counts.unresolved}</div>
        </div>
      </div>

      <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(320px, 1fr))', gap: '12px' }}>
        {alerts.length === 0 && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: 'white', color: '#475569', gridColumn: '1 / -1' }}>
            No critical day-over-day deteriorations or unresolved critical findings right now.
          </div>
        )}
        {alerts.map((alert) => (
          <div key={alert.id} style={{ border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', background: '#fff7f7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#7f1d1d' }}>{alert.title}</div>
                <div style={{ fontSize: '14px', color: '#334155', marginTop: '2px' }}>{alert.detail}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  <strong>Owner:</strong> {alert.owner}
                  {alert.itemLabel ? ` | ${alert.itemLabel}` : ''}
                  {alert.deltaText ? ` | ${alert.deltaText}` : ''}
                </div>
              </div>
              <button
                onClick={() => onNavigate(alert.drillView)}
                style={{ fontSize: '13px', fontWeight: 700, color: '#1f70c1', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                Open
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

