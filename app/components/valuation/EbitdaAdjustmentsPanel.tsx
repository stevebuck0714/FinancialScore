'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  SDE_BUCKETS,
  SDE_BUCKET_LABELS,
  SDE_BUCKET_SHORT_LABELS,
  SDE_LINE_ITEMS,
  type SdeBucket as CatalogSdeBucket,
} from '@/lib/sde/adjustment-line-items';

// -----------------------------------------------------------------------------
// Types — kept in sync with /api/sde/ebitda-adjustments and
// /api/sde/ebitda-adjustments/save
// -----------------------------------------------------------------------------

export type SdeBucket = CatalogSdeBucket;

type AdjustmentAccount = {
  mappingId: string;
  accountId: string | null;
  accountCode: string | null;
  accountName: string;
  targetField: string;
  ltm: number;
  monthly: Array<{ month: string; value: number }>;
  ownerPercent: number;
  ownerAmount: number;
  lineItem?: string | null;
};

type LineItemDetail = {
  key: string;
  label: string;
  accounts: AdjustmentAccount[];
  ltmTotal: number;
  ownerAmountTotal: number;
};

type BucketDetail = {
  bucket: SdeBucket;
  label: string;
  accounts: AdjustmentAccount[];
  ltmTotal: number;
  ownerAmountTotal: number;
  lineItems?: LineItemDetail[];
};

type AccountCategory = 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity' | 'Other';

type AccountListEntry = {
  mappingId: string;
  accountId: string | null;
  accountCode: string | null;
  accountName: string;
  targetField: string;
  category: AccountCategory;
  ltm: number;
  sdeAdjustmentBucket: SdeBucket | null;
  sdeAdjustmentLineItem: string | null;
};

type EbitdaAdjustmentsApiResponse = {
  companyId: string;
  companyName: string | null;
  accountingSystem: string;
  asOfMonth: string;
  ltmWindow: { start: string; end: string; months: string[] };
  sourceUsed: string;
  buckets: BucketDetail[];
  allAccounts?: AccountListEntry[];
};

export type LiveTotals = {
  ownerComp: number;
  personal: number;
  nonRecurring: number;
  oneTimeRevenue: number;
  qoeAdjustmentsNet: number;
};

/**
 * Per-line-item assignment totals, keyed by bucket → lineItem key → sum of
 * (LTM × ownerPercent/100) across all accounts effectively assigned to that
 * (bucket, lineItem). Buckets without assignments have an empty inner record.
 */
export type LineItemAssignmentTotals = Partial<Record<SdeBucket, Record<string, number>>>;

// -----------------------------------------------------------------------------
// Formatters
// -----------------------------------------------------------------------------

const fmtMoney = (n: number): string => {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

type ContextValue = {
  api: EbitdaAdjustmentsApiResponse | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveMessage: string | null;
  ownerPctEdits: Record<string, number>;
  bucketEdits: Record<string, SdeBucket | null>;
  lineItemEdits: Record<string, string | null>;
  expandedRows: Set<string>;
  unassignedMappings: Array<{
    id: string;
    accountName: string;
    accountCode: string | null;
    accountId: string | null;
    targetField: string;
  }> | null;
  assignPickerOpen: SdeBucket | null;
  liveTotals: LiveTotals;
  lineItemTotals: LineItemAssignmentTotals;
  /** Convenience: total LTM × pct for a given (bucket, lineItem). Returns 0 if none. */
  lineItemTotal: (bucket: SdeBucket, lineItem: string) => number;
  dirtyCount: number;
  handleChangePct: (mappingId: string, pct: number) => void;
  handleToggleExpand: (mappingId: string) => void;
  handleUnassign: (mappingId: string) => void;
  handleAssign: (mappingId: string, bucket: SdeBucket, lineItem?: string | null) => void;
  /** Effective bucket for a mapping (edits override server state). null = unassigned. */
  effectiveBucket: (mappingId: string, serverBucket: SdeBucket | null) => SdeBucket | null;
  /** Effective line item for a mapping (edits override server state). null = no line item. */
  effectiveLineItem: (mappingId: string, serverLineItem: string | null) => string | null;
  setAssignPickerOpen: (b: SdeBucket | null) => void;
  refreshUnassignedMappings: () => Promise<void>;
  handleSave: () => Promise<void>;
};

const Ctx = createContext<ContextValue | null>(null);

const useEbitdaCtx = (): ContextValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error('EbitdaAdjustments components must be wrapped in <EbitdaAdjustmentsProvider>');
  return v;
};

export { useEbitdaCtx };

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export const EbitdaAdjustmentsProvider: React.FC<{
  companyId: string | null | undefined;
  onLiveTotalsChange?: (totals: LiveTotals) => void;
  /**
   * Notified whenever per-(bucket, lineItem) assignment sums change. Lets a
   * parent feed assignment-driven values into its own SDE math without
   * duplicating the aggregation logic.
   */
  onLineItemTotalsChange?: (totals: LineItemAssignmentTotals) => void;
  children: React.ReactNode;
}> = ({ companyId, onLiveTotalsChange, onLineItemTotalsChange, children }) => {
  const [api, setApi] = useState<EbitdaAdjustmentsApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerPctEdits, setOwnerPctEdits] = useState<Record<string, number>>({});
  const [bucketEdits, setBucketEdits] = useState<Record<string, SdeBucket | null>>({});
  const [lineItemEdits, setLineItemEdits] = useState<Record<string, string | null>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [unassignedMappings, setUnassignedMappings] = useState<ContextValue['unassignedMappings']>(null);
  const [assignPickerOpen, setAssignPickerOpen] = useState<SdeBucket | null>(null);

  const refreshApi = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sde/ebitda-adjustments?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EbitdaAdjustmentsApiResponse;
      setApi(json);
      setOwnerPctEdits({});
      setBucketEdits({});
      setLineItemEdits({});
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const refreshUnassignedMappings = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/account-mappings?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const all: Array<any> = Array.isArray(json?.mappings) ? json.mappings : [];
      const assignedIds = new Set<string>();
      for (const b of api?.buckets || []) for (const a of b.accounts) assignedIds.add(a.mappingId);
      const unassigned = all
        .filter((m) => m && !assignedIds.has(m.id) && !(bucketEdits[m.id] && bucketEdits[m.id] !== null))
        .filter((m) => {
          const target = String(m.targetField || '').toLowerCase().trim();
          return target !== '' && target !== 'unmapped' && target !== 'ignored';
        })
        .map((m) => ({
          id: m.id,
          accountName: m.accountName || m.name || '',
          accountCode: m.accountCode || null,
          accountId: m.accountId || null,
          targetField: m.targetField || '',
        }));
      setUnassignedMappings(unassigned);
    } catch {
      // silent
    }
  }, [companyId, api, bucketEdits]);

  useEffect(() => {
    if (companyId) refreshApi();
  }, [companyId, refreshApi]);

  const handleChangePct = useCallback((mappingId: string, pct: number) => {
    setOwnerPctEdits((prev) => ({ ...prev, [mappingId]: pct }));
  }, []);

  const handleToggleExpand = useCallback((mappingId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(mappingId)) next.delete(mappingId);
      else next.add(mappingId);
      return next;
    });
  }, []);

  const handleUnassign = useCallback((mappingId: string) => {
    setBucketEdits((prev) => ({ ...prev, [mappingId]: null }));
    setLineItemEdits((prev) => ({ ...prev, [mappingId]: null }));
  }, []);

  const handleAssign = useCallback(
    (mappingId: string, bucket: SdeBucket, lineItem: string | null = null) => {
      setBucketEdits((prev) => ({ ...prev, [mappingId]: bucket }));
      setLineItemEdits((prev) => ({ ...prev, [mappingId]: lineItem }));
      setAssignPickerOpen(null);
    },
    [],
  );

  const effectiveBucket = useCallback(
    (mappingId: string, serverBucket: SdeBucket | null): SdeBucket | null => {
      if (Object.prototype.hasOwnProperty.call(bucketEdits, mappingId)) {
        return bucketEdits[mappingId] ?? null;
      }
      return serverBucket;
    },
    [bucketEdits],
  );

  const effectiveLineItem = useCallback(
    (mappingId: string, serverLineItem: string | null): string | null => {
      if (Object.prototype.hasOwnProperty.call(lineItemEdits, mappingId)) {
        return lineItemEdits[mappingId] ?? null;
      }
      return serverLineItem;
    },
    [lineItemEdits],
  );

  const dirtyCount = useMemo(() => {
    let n = 0;
    if (api) {
      for (const b of api.buckets) {
        for (const a of b.accounts) {
          if (ownerPctEdits[a.mappingId] !== undefined && ownerPctEdits[a.mappingId] !== a.ownerPercent) n += 1;
          if (bucketEdits[a.mappingId] !== undefined && bucketEdits[a.mappingId] !== b.bucket) n += 1;
          if (
            lineItemEdits[a.mappingId] !== undefined &&
            lineItemEdits[a.mappingId] !== (a.lineItem ?? null)
          )
            n += 1;
        }
      }
    }
    for (const id of Object.keys(bucketEdits)) {
      const wasAssignedHere = api?.buckets.some((b) => b.accounts.some((a) => a.mappingId === id));
      if (!wasAssignedHere && bucketEdits[id]) n += 1;
    }
    return n;
  }, [api, ownerPctEdits, bucketEdits, lineItemEdits]);

  const handleSave = useCallback(async () => {
    if (!companyId) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      type Item = {
        mappingId: string;
        ownerPercent: number;
        sdeAdjustmentBucket?: SdeBucket | null;
        sdeAdjustmentLineItem?: string | null;
      };
      const items: Item[] = [];
      const seen = new Set<string>();
      if (api) {
        for (const b of api.buckets) {
          for (const a of b.accounts) {
            const editedPct = ownerPctEdits[a.mappingId];
            const editedBucket = bucketEdits[a.mappingId];
            const editedLineItem = lineItemEdits[a.mappingId];
            if (editedPct !== undefined || editedBucket !== undefined || editedLineItem !== undefined) {
              const item: Item = {
                mappingId: a.mappingId,
                ownerPercent: editedPct !== undefined ? editedPct : a.ownerPercent,
              };
              if (editedBucket !== undefined) item.sdeAdjustmentBucket = editedBucket;
              if (editedLineItem !== undefined) item.sdeAdjustmentLineItem = editedLineItem;
              items.push(item);
              seen.add(a.mappingId);
            }
          }
        }
      }
      for (const [id, bucket] of Object.entries(bucketEdits)) {
        if (seen.has(id)) continue;
        if (!bucket) continue;
        const item: Item = {
          mappingId: id,
          ownerPercent: ownerPctEdits[id] ?? 0,
          sdeAdjustmentBucket: bucket,
        };
        if (Object.prototype.hasOwnProperty.call(lineItemEdits, id)) {
          item.sdeAdjustmentLineItem = lineItemEdits[id];
        }
        items.push(item);
      }
      const res = await fetch('/api/sde/ebitda-adjustments/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, items }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setSaveMessage(`Saved (${body.updated || 0} updated, ${body.skipped || 0} skipped)`);
      await refreshApi();
    } catch (e: any) {
      setSaveMessage(`Save failed: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }, [companyId, api, ownerPctEdits, bucketEdits, lineItemEdits, refreshApi]);

  const bucketByKey = useMemo(() => {
    const map = new Map<SdeBucket, BucketDetail>();
    for (const b of api?.buckets || []) map.set(b.bucket, b);
    return map;
  }, [api]);

  const liveTotals = useMemo<LiveTotals>(() => {
    const sum = (bucket: SdeBucket): number => {
      const detail = bucketByKey.get(bucket);
      if (!detail) return 0;
      return detail.accounts.reduce((s, a) => {
        const pct = ownerPctEdits[a.mappingId] ?? a.ownerPercent;
        return s + (a.ltm * pct) / 100;
      }, 0);
    };
    const ownerComp = sum('OWNER_COMP');
    const personal = sum('PERSONAL');
    const nonRecurring = sum('NON_RECURRING');
    const oneTimeRevenue = sum('ONE_TIME_REVENUE');
    return {
      ownerComp,
      personal,
      nonRecurring,
      oneTimeRevenue,
      qoeAdjustmentsNet: ownerComp + personal + nonRecurring - oneTimeRevenue,
    };
  }, [bucketByKey, ownerPctEdits]);

  /**
   * Per-(bucket, lineItem) assignment sums.
   *
   * We walk every account in api.allAccounts (so accounts moved by pending
   * edits are counted in their NEW bucket, not the saved one), resolve the
   * effective bucket/lineItem, then accumulate (LTM × ownerPct / 100).
   *
   * Note: AccountListEntry (allAccounts) intentionally omits ownerPercent —
   * that field only lives on AccountDetail inside api.buckets[].accounts. We
   * build a (mappingId → serverOwnerPercent) lookup from api.buckets so saved
   * percentages survive the union, and unsaved accounts fall back to their
   * pending edit (ownerPctEdits) or 0.
   */
  const lineItemTotals = useMemo<LineItemAssignmentTotals>(() => {
    const totals: LineItemAssignmentTotals = {};
    const serverOwnerPct = new Map<string, number>();
    for (const b of api?.buckets || []) {
      for (const a of b.accounts) {
        serverOwnerPct.set(a.mappingId, Number(a.ownerPercent) || 0);
      }
    }
    const all = api?.allAccounts || [];
    for (const a of all) {
      const effBucket = Object.prototype.hasOwnProperty.call(bucketEdits, a.mappingId)
        ? bucketEdits[a.mappingId]
        : (a.sdeAdjustmentBucket as SdeBucket | null | undefined) ?? null;
      if (!effBucket) continue;
      const effLine = Object.prototype.hasOwnProperty.call(lineItemEdits, a.mappingId)
        ? lineItemEdits[a.mappingId]
        : a.sdeAdjustmentLineItem ?? null;
      if (!effLine) continue;
      const pct =
        ownerPctEdits[a.mappingId] ?? serverOwnerPct.get(a.mappingId) ?? 0;
      const contrib = ((Number(a.ltm) || 0) * (Number(pct) || 0)) / 100;
      const inner = totals[effBucket] || (totals[effBucket] = {});
      inner[effLine] = (inner[effLine] || 0) + contrib;
    }
    return totals;
  }, [api, bucketEdits, lineItemEdits, ownerPctEdits]);

  const lineItemTotal = useCallback(
    (bucket: SdeBucket, lineItem: string): number => {
      return lineItemTotals[bucket]?.[lineItem] ?? 0;
    },
    [lineItemTotals],
  );

  useEffect(() => {
    onLiveTotalsChange?.(liveTotals);
  }, [liveTotals, onLiveTotalsChange]);

  useEffect(() => {
    onLineItemTotalsChange?.(lineItemTotals);
  }, [lineItemTotals, onLineItemTotalsChange]);

  const value = useMemo<ContextValue>(
    () => ({
      api,
      loading,
      error,
      saving,
      saveMessage,
      ownerPctEdits,
      bucketEdits,
      lineItemEdits,
      expandedRows,
      unassignedMappings,
      assignPickerOpen,
      liveTotals,
      lineItemTotals,
      lineItemTotal,
      dirtyCount,
      handleChangePct,
      handleToggleExpand,
      handleUnassign,
      handleAssign,
      effectiveBucket,
      effectiveLineItem,
      setAssignPickerOpen,
      refreshUnassignedMappings,
      handleSave,
    }),
    [
      api,
      loading,
      error,
      saving,
      saveMessage,
      ownerPctEdits,
      bucketEdits,
      lineItemEdits,
      expandedRows,
      unassignedMappings,
      assignPickerOpen,
      liveTotals,
      lineItemTotals,
      lineItemTotal,
      dirtyCount,
      handleChangePct,
      handleToggleExpand,
      handleUnassign,
      handleAssign,
      effectiveBucket,
      effectiveLineItem,
      refreshUnassignedMappings,
      handleSave,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

// -----------------------------------------------------------------------------
// Subcomponents
// -----------------------------------------------------------------------------

const MonthlyDrilldown: React.FC<{ months: Array<{ month: string; value: number }> }> = ({ months }) => {
  const values = months.map((m) => m.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const total = values.reduce((s, v) => s + v, 0);
  const avg = values.length > 0 ? total / values.length : 0;

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          12-Month Detail
        </span>
        <span style={{ fontSize: '10px', color: '#64748b' }}>
          Avg <strong style={{ color: '#0f172a' }}>{fmtMoney(avg)}</strong>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '32px', marginBottom: '6px' }}>
        {months.map((m) => {
          const h = range > 0 ? Math.max(2, ((m.value - min) / range) * 30) : 2;
          return (
            <div
              key={m.month}
              title={`${m.month}: ${fmtMoney(m.value)}`}
              style={{
                flex: 1,
                height: `${h}px`,
                background: m.value >= 0 ? '#10b981' : '#ef4444',
                borderRadius: '1px',
                opacity: 0.85,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '2px', fontSize: '9px' }}>
        {months.map((m) => (
          <div key={m.month} style={{ textAlign: 'center', color: '#475569' }}>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{m.month.slice(5)}</div>
            <div style={{ fontFamily: 'monospace' }}>{fmtMoney(m.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BUCKET_LABELS: Record<SdeBucket, { title: string; subtitle?: string }> = {
  OWNER_COMP: { title: '1. Owner Compensation Adjustment', subtitle: 'Replace owner pay with market salary.' },
  PERSONAL: { title: '2. Personal / Discretionary Expenses' },
  NON_RECURRING: { title: '3. Non-Recurring Expenses', subtitle: 'One-time items.' },
  ONE_TIME_REVENUE: { title: '4. One-Time Revenue', subtitle: 'Remove revenue that will not repeat.' },
};

// -----------------------------------------------------------------------------
// Single bucket card — drop into any grid slot
// -----------------------------------------------------------------------------

export const EbitdaBucketCard: React.FC<{ bucket: SdeBucket }> = ({ bucket }) => {
  const ctx = useEbitdaCtx();
  const detail = (ctx.api?.buckets || []).find((b) => b.bucket === bucket) || null;
  const accounts = detail?.accounts || [];
  const liveLtmTotal = accounts.reduce((s, a) => s + a.ltm, 0);
  const liveOwnerTotal = accounts.reduce((s, a) => {
    const pct = ctx.ownerPctEdits[a.mappingId] ?? a.ownerPercent;
    return s + (a.ltm * pct) / 100;
  }, 0);
  const { title, subtitle } = BUCKET_LABELS[bucket];

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: subtitle ? '2px' : '8px' }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontStyle: 'italic' }}>{subtitle}</div>
      )}

      {ctx.loading && accounts.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
          No accounts assigned. Use the Assign helper bar below.
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 70px 50px 70px 16px',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '4px 0',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <span>Account</span>
            <span style={{ textAlign: 'right' }}>LTM</span>
            <span style={{ textAlign: 'right' }}>Own %</span>
            <span style={{ textAlign: 'right' }}>Calc</span>
            <span />
          </div>
          {accounts.map((a) => {
            const pct = ctx.ownerPctEdits[a.mappingId] ?? a.ownerPercent;
            const ownerAmount = (a.ltm * pct) / 100;
            const dirty = ctx.ownerPctEdits[a.mappingId] !== undefined && ctx.ownerPctEdits[a.mappingId] !== a.ownerPercent;
            const expanded = ctx.expandedRows.has(a.mappingId);
            return (
              <React.Fragment key={a.mappingId}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 70px 50px 70px 16px',
                    gap: '4px',
                    fontSize: '11px',
                    color: '#334155',
                    padding: '4px 0',
                    borderBottom: '1px dashed #f1f5f9',
                    alignItems: 'center',
                    background: dirty ? '#fefce8' : 'transparent',
                  }}
                >
                  <button
                    onClick={() => ctx.handleToggleExpand(a.mappingId)}
                    style={{
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: '#1e293b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={`${a.accountCode || a.accountId || ''} ${a.accountName} (→ ${a.targetField})`}
                  >
                    <span style={{ color: '#64748b', fontSize: '10px', marginRight: '4px' }}>{expanded ? '▾' : '▸'}</span>
                    <span style={{ color: '#94a3b8', fontFamily: 'monospace', marginRight: '4px' }}>
                      {a.accountCode || a.accountId || ''}
                    </span>
                    {a.accountName}
                  </button>
                  <span style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '11px' }}>{fmtMoney(a.ltm)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={pct}
                    onChange={(e) =>
                      ctx.handleChangePct(a.mappingId, Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    style={{
                      width: '46px',
                      padding: '2px 4px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '3px',
                      fontSize: '11px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      background: dirty ? '#fef9c3' : 'white',
                    }}
                  />
                  <span
                    style={{
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: ownerAmount > 0 ? '#059669' : '#94a3b8',
                    }}
                  >
                    {fmtMoney(ownerAmount)}
                  </span>
                  <button
                    onClick={() => ctx.handleUnassign(a.mappingId)}
                    title="Remove from this bucket"
                    style={{
                      width: '14px',
                      height: '14px',
                      padding: 0,
                      lineHeight: '12px',
                      background: 'transparent',
                      border: '1px solid #cbd5e1',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '10px',
                      color: '#94a3b8',
                    }}
                  >
                    ×
                  </button>
                </div>
                {expanded && (
                  <div style={{ padding: '6px 0' }}>
                    <MonthlyDrilldown months={a.monthly} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 70px 50px 70px 16px',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#0f172a',
              padding: '6px 0 0 0',
              borderTop: '1px solid #cbd5e1',
              marginTop: '4px',
              alignItems: 'center',
            }}
          >
            <span>Total</span>
            <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtMoney(liveLtmTotal)}</span>
            <span />
            <span style={{ textAlign: 'right', fontFamily: 'monospace', color: liveOwnerTotal > 0 ? '#059669' : '#94a3b8' }}>
              {fmtMoney(liveOwnerTotal)}
            </span>
            <span />
          </div>
        </>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Helper bar (assign + save)
// -----------------------------------------------------------------------------

const BUCKET_ORDER: SdeBucket[] = ['OWNER_COMP', 'PERSONAL', 'NON_RECURRING', 'ONE_TIME_REVENUE'];

export const EbitdaHelperBar: React.FC = () => {
  const ctx = useEbitdaCtx();

  return (
    <div>
      <div
        style={{
          padding: '8px 10px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '11px', color: '#475569' }}>
          LTM through <strong style={{ color: '#0f172a' }}>{ctx.api?.asOfMonth || '—'}</strong>{' '}
          {ctx.api?.ltmWindow && (
            <span style={{ color: '#64748b' }}>
              ({ctx.api.ltmWindow.start} → {ctx.api.ltmWindow.end})
            </span>
          )}
          <span style={{ marginLeft: '12px', color: '#64748b' }}>
            Net adjustments:{' '}
            <strong style={{ color: ctx.liveTotals.qoeAdjustmentsNet > 0 ? '#059669' : '#0f172a' }}>
              {fmtMoney(ctx.liveTotals.qoeAdjustmentsNet)}
            </strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {ctx.saveMessage && (
            <span style={{ fontSize: '11px', color: ctx.saveMessage.startsWith('Save failed') ? '#ef4444' : '#10b981' }}>
              {ctx.saveMessage}
            </span>
          )}
          {ctx.error && <span style={{ fontSize: '10px', color: '#ef4444' }}>API: {ctx.error}</span>}
          <button
            onClick={ctx.handleSave}
            disabled={ctx.saving || ctx.dirtyCount === 0}
            style={{
              padding: '6px 14px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'white',
              background: ctx.dirtyCount === 0 ? '#94a3b8' : '#10b981',
              border: 'none',
              borderRadius: '4px',
              cursor: ctx.saving || ctx.dirtyCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {ctx.saving ? 'Saving…' : ctx.dirtyCount > 0 ? `Save (${ctx.dirtyCount})` : 'Save'}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: '8px',
          padding: '8px 10px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '11px', color: '#64748b' }}>
          Assign mapped accounts to a bucket. Bucket changes are queued — click <strong>Save</strong> above to persist.
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {BUCKET_ORDER.map((b) => (
            <button
              key={b}
              onClick={() => {
                ctx.setAssignPickerOpen(ctx.assignPickerOpen === b ? null : b);
                if (ctx.assignPickerOpen !== b) ctx.refreshUnassignedMappings();
              }}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                fontWeight: 700,
                color: '#1e293b',
                background: ctx.assignPickerOpen === b ? '#dbeafe' : 'white',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              + Assign to {BUCKET_LABELS[b].title.replace(/^\d+\.\s*/, '')}
            </button>
          ))}
        </div>
      </div>

      {ctx.assignPickerOpen && (
        <div
          style={{
            marginTop: '6px',
            padding: '10px',
            background: 'white',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
            Pick an account to add to <code>{ctx.assignPickerOpen}</code>:
          </div>
          {(ctx.unassignedMappings ?? []).length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
              {ctx.unassignedMappings === null ? 'Loading…' : 'No unassigned mapped accounts available.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
              {(ctx.unassignedMappings ?? []).slice(0, 200).map((m) => (
                <button
                  key={m.id}
                  onClick={() => ctx.handleAssign(m.id, ctx.assignPickerOpen!)}
                  style={{
                    padding: '4px 6px',
                    fontSize: '10px',
                    color: '#1e293b',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={`${m.accountCode || m.accountId || ''} ${m.accountName} (→ ${m.targetField})`}
                >
                  <span style={{ color: '#64748b', fontFamily: 'monospace', marginRight: '4px' }}>
                    {m.accountCode || m.accountId || ''}
                  </span>
                  {m.accountName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// EbitdaAccountList — full-height scrollable rail showing every mapped account
// grouped by category. Click a row to assign it to one of the four SDE
// adjustment buckets (or unassign).
// -----------------------------------------------------------------------------

const CATEGORY_ORDER: AccountCategory[] = ['Revenue', 'Expense', 'Asset', 'Liability', 'Equity'];

const BUCKET_CHIP_LABELS: Record<SdeBucket, string> = {
  OWNER_COMP: 'Owner Comp',
  PERSONAL: 'Personal',
  NON_RECURRING: 'Non-Recurring',
  ONE_TIME_REVENUE: 'One-Time Rev',
};

const BUCKET_CHIP_COLORS: Record<SdeBucket, { bg: string; fg: string }> = {
  OWNER_COMP: { bg: '#dbeafe', fg: '#1e40af' },
  PERSONAL: { bg: '#fce7f3', fg: '#9d174d' },
  NON_RECURRING: { bg: '#fef3c7', fg: '#92400e' },
  ONE_TIME_REVENUE: { bg: '#dcfce7', fg: '#166534' },
};

export const EbitdaAccountList: React.FC = () => {
  const ctx = useEbitdaCtx();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<AccountCategory, boolean>>({
    Revenue: false,
    Expense: false,
    Asset: false,
    Liability: false,
    Equity: false,
    Other: true,
  });
  const [pickerForRow, setPickerForRow] = useState<string | null>(null);

  const accounts = ctx.api?.allAccounts ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.accountName.toLowerCase().includes(q) ||
        (a.accountCode || '').toLowerCase().includes(q) ||
        (a.accountId || '').toLowerCase().includes(q) ||
        (a.targetField || '').toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const grouped = useMemo(() => {
    const map = new Map<AccountCategory, AccountListEntry[]>();
    for (const c of CATEGORY_ORDER) map.set(c, []);
    for (const a of filtered) {
      const cat = (a.category || 'Other') as AccountCategory;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(a);
    }
    return map;
  }, [filtered]);

  const totals = useMemo(() => {
    const out: Record<AccountCategory, { count: number; total: number }> = {
      Revenue: { count: 0, total: 0 },
      Expense: { count: 0, total: 0 },
      Asset: { count: 0, total: 0 },
      Liability: { count: 0, total: 0 },
      Equity: { count: 0, total: 0 },
      Other: { count: 0, total: 0 },
    };
    for (const [cat, list] of grouped.entries()) {
      out[cat] = {
        count: list.length,
        total: list.reduce((s, a) => s + a.ltm, 0),
      };
    }
    return out;
  }, [grouped]);

  const toggleCategory = (c: AccountCategory) => setCollapsed((prev) => ({ ...prev, [c]: !prev[c] }));

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '10px',
        gridColumnStart: 4,
        gridRowStart: 1,
        gridRowEnd: 'span 2',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        maxHeight: '780px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>Accounts (LTM)</div>
        <div style={{ fontSize: '10px', color: '#64748b' }}>{accounts.length} mapped</div>
      </div>
      <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '8px' }}>
        Click a row to assign it to an EBITDA adjustment bucket. Edits queue until you Save.
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search account name, code, or target field…"
        style={{
          width: '100%',
          padding: '5px 8px',
          fontSize: '11px',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          marginBottom: '8px',
          boxSizing: 'border-box',
        }}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          border: '1px solid #f1f5f9',
          borderRadius: '6px',
          background: '#fafbfc',
        }}
      >
        {ctx.loading && accounts.length === 0 ? (
          <div style={{ padding: '12px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Loading…</div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: '12px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
            No mapped accounts found for this company.
          </div>
        ) : (
          CATEGORY_ORDER.map((cat) => {
            const list = grouped.get(cat) ?? [];
            if (list.length === 0) return null;
            const t = totals[cat];
            const isCollapsed = collapsed[cat];
            return (
              <div key={cat} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => toggleCategory(cat)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderBottom: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b' }}>
                    <span style={{ color: '#64748b', marginRight: '4px' }}>{isCollapsed ? '▸' : '▾'}</span>
                    {cat} <span style={{ color: '#64748b', fontWeight: 500 }}>({t.count})</span>
                  </span>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#475569', fontWeight: 700 }}>
                    {fmtMoney(t.total)}
                  </span>
                </button>
                {!isCollapsed && (
                  <div>
                    {list.map((a) => {
                      const eff = ctx.effectiveBucket(a.mappingId, a.sdeAdjustmentBucket);
                      const isOpen = pickerForRow === a.mappingId;
                      const dirty =
                        eff !== a.sdeAdjustmentBucket &&
                        Object.prototype.hasOwnProperty.call(ctx.bucketEdits, a.mappingId);
                      return (
                        <div
                          key={a.mappingId}
                          style={{
                            padding: '5px 8px',
                            borderBottom: '1px dashed #f1f5f9',
                            background: dirty ? '#fefce8' : 'transparent',
                          }}
                        >
                          <button
                            onClick={() => setPickerForRow(isOpen ? null : a.mappingId)}
                            style={{
                              width: '100%',
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              gap: '4px',
                              alignItems: 'baseline',
                              padding: 0,
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                            title={`${a.accountName} (→ ${a.targetField})`}
                          >
                            <span
                              style={{
                                fontSize: '11px',
                                color: '#1e293b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span style={{ color: '#94a3b8', fontFamily: 'monospace', marginRight: '4px' }}>
                                {a.accountCode || a.accountId || ''}
                              </span>
                              {a.accountName}
                            </span>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                              {fmtMoney(a.ltm)}
                            </span>
                          </button>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                            <span style={{ fontSize: '9px', color: '#64748b' }}>{a.targetField}</span>
                            {eff && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '8px',
                                  background: BUCKET_CHIP_COLORS[eff].bg,
                                  color: BUCKET_CHIP_COLORS[eff].fg,
                                }}
                              >
                                → {BUCKET_CHIP_LABELS[eff]}
                                {(() => {
                                  const li = ctx.effectiveLineItem(a.mappingId, a.sdeAdjustmentLineItem);
                                  if (!li) return null;
                                  const item = SDE_LINE_ITEMS[eff].find((x) => x.key === li);
                                  return item ? ` · ${item.label}` : null;
                                })()}
                              </span>
                            )}
                          </div>
                          {isOpen && (
                            <div
                              style={{
                                marginTop: '4px',
                                padding: '6px',
                                background: 'white',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                              }}
                            >
                              {SDE_BUCKETS.map((b) => {
                                const lineItems = SDE_LINE_ITEMS[b];
                                const effLine = ctx.effectiveLineItem(a.mappingId, a.sdeAdjustmentLineItem);
                                return (
                                  <div
                                    key={b}
                                    style={{
                                      borderLeft: `3px solid ${BUCKET_CHIP_COLORS[b].bg}`,
                                      paddingLeft: '5px',
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: '9px',
                                        fontWeight: 700,
                                        color: BUCKET_CHIP_COLORS[b].fg,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em',
                                        marginBottom: '2px',
                                      }}
                                    >
                                      {SDE_BUCKET_SHORT_LABELS[b]}
                                    </div>
                                    <div
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: '2px',
                                      }}
                                    >
                                      {lineItems.map((li) => {
                                        const isCurrent = eff === b && effLine === li.key;
                                        return (
                                          <button
                                            key={li.key}
                                            onClick={() => {
                                              ctx.handleAssign(a.mappingId, b, li.key);
                                              setPickerForRow(null);
                                            }}
                                            disabled={isCurrent}
                                            title={`${SDE_BUCKET_SHORT_LABELS[b]} → ${li.label}`}
                                            style={{
                                              padding: '2px 5px',
                                              fontSize: '9px',
                                              fontWeight: 600,
                                              color: isCurrent ? '#94a3b8' : BUCKET_CHIP_COLORS[b].fg,
                                              background: isCurrent ? '#f1f5f9' : BUCKET_CHIP_COLORS[b].bg,
                                              border: '1px solid #e2e8f0',
                                              borderRadius: '2px',
                                              cursor: isCurrent ? 'not-allowed' : 'pointer',
                                              textAlign: 'left',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            {isCurrent ? '✓ ' : '+ '}{li.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                              {eff && (
                                <button
                                  onClick={() => {
                                    ctx.handleUnassign(a.mappingId);
                                    setPickerForRow(null);
                                  }}
                                  style={{
                                    padding: '3px 6px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: '#dc2626',
                                    background: 'white',
                                    border: '1px solid #fecaca',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                  }}
                                >
                                  × Unassign from all
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// EbitdaLineItemTotal — read-only display of the assignment-driven LTM × pct
// total for a specific (bucket, lineItem). Lets a parent show an
// "auto-derived" value next to the line-item label without knowing the
// internal aggregation logic.
// -----------------------------------------------------------------------------

export const EbitdaLineItemTotal: React.FC<{
  bucket: SdeBucket;
  lineItem: string;
  /** Optional formatter (defaults to whole-dollar with commas). */
  format?: (n: number) => string;
  style?: React.CSSProperties;
  /** When true, returns null if the total is zero. Defaults to false. */
  hideIfZero?: boolean;
}> = ({ bucket, lineItem, format, style, hideIfZero }) => {
  const ctx = useEbitdaCtx();
  const value = ctx.lineItemTotal(bucket, lineItem);
  if (hideIfZero && !value) return null;
  const fmt = format || fmtMoney;
  return <span style={style}>{fmt(value)}</span>;
};

// -----------------------------------------------------------------------------
// EbitdaLineItemAccounts — small inline list of accounts assigned to a
// specific (bucket, lineItem). Designed to render directly inside the
// existing line-item rows on the SDE Valuation > EBITDA Adjustments tab.
// -----------------------------------------------------------------------------

export const EbitdaLineItemAccounts: React.FC<{
  bucket: SdeBucket;
  lineItem: string;
}> = ({ bucket, lineItem }) => {
  const ctx = useEbitdaCtx();
  const detail = (ctx.api?.buckets || []).find((b) => b.bucket === bucket);
  const allAccounts = detail?.accounts || [];

  // An account belongs to this (bucket, lineItem) if its EFFECTIVE bucket and
  // line item match — i.e., either it's already saved that way or there's a
  // pending edit putting it here.
  const localAccounts = allAccounts.filter((a) => {
    const effBucket = ctx.effectiveBucket(a.mappingId, bucket);
    const effLine = ctx.effectiveLineItem(a.mappingId, a.lineItem ?? null);
    return effBucket === bucket && effLine === lineItem;
  });

  // Plus any accounts that aren't currently in this bucket on the server
  // but have a pending edit moving them here. These come from api.allAccounts
  // (since they may be in a different bucket on the server side).
  const movedHere = (ctx.api?.allAccounts || []).filter((a) => {
    const wasHere = a.sdeAdjustmentBucket === bucket && a.sdeAdjustmentLineItem === lineItem;
    if (wasHere) return false; // already counted above
    const effBucket = ctx.effectiveBucket(a.mappingId, a.sdeAdjustmentBucket);
    const effLine = ctx.effectiveLineItem(a.mappingId, a.sdeAdjustmentLineItem);
    return effBucket === bucket && effLine === lineItem;
  });

  // Merge & dedupe by mappingId
  const seen = new Set<string>();
  const accounts: Array<{
    mappingId: string;
    accountCode: string | null;
    accountId: string | null;
    accountName: string;
    ltm: number;
    ownerPercent: number;
  }> = [];
  for (const a of localAccounts) {
    if (seen.has(a.mappingId)) continue;
    seen.add(a.mappingId);
    accounts.push({
      mappingId: a.mappingId,
      accountCode: a.accountCode,
      accountId: a.accountId,
      accountName: a.accountName,
      ltm: a.ltm,
      ownerPercent: a.ownerPercent,
    });
  }
  for (const a of movedHere) {
    if (seen.has(a.mappingId)) continue;
    seen.add(a.mappingId);
    accounts.push({
      mappingId: a.mappingId,
      accountCode: a.accountCode,
      accountId: a.accountId,
      accountName: a.accountName,
      ltm: a.ltm,
      ownerPercent: 0,
    });
  }

  if (accounts.length === 0) return null;

  return (
    <div
      style={{
        marginTop: '2px',
        marginBottom: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      {accounts.map((a) => {
        const pct = ctx.ownerPctEdits[a.mappingId] ?? a.ownerPercent;
        const ownerAmt = (a.ltm * pct) / 100;
        return (
          <div
            key={a.mappingId}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 60px 36px 60px 14px',
              gap: '4px',
              fontSize: '10px',
              color: '#475569',
              alignItems: 'center',
            }}
          >
            <span
              title={`${a.accountCode || a.accountId || ''} ${a.accountName}`}
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: '#94a3b8', fontFamily: 'monospace', marginRight: '3px' }}>
                {a.accountCode || a.accountId || ''}
              </span>
              {a.accountName}
            </span>
            <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtMoney(a.ltm)}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) =>
                ctx.handleChangePct(a.mappingId, Math.max(0, Math.min(100, Number(e.target.value) || 0)))
              }
              style={{
                width: '34px',
                padding: '1px 3px',
                border: '1px solid #cbd5e1',
                borderRadius: '2px',
                fontSize: '10px',
                textAlign: 'right',
                fontFamily: 'monospace',
              }}
            />
            <span
              style={{
                textAlign: 'right',
                fontFamily: 'monospace',
                fontWeight: 600,
                color: ownerAmt > 0 ? '#059669' : '#94a3b8',
              }}
            >
              {fmtMoney(ownerAmt)}
            </span>
            <button
              onClick={() => ctx.handleUnassign(a.mappingId)}
              title="Remove from this line"
              style={{
                width: '12px',
                height: '12px',
                padding: 0,
                lineHeight: '10px',
                background: 'transparent',
                border: '1px solid #cbd5e1',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '8px',
                color: '#94a3b8',
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
