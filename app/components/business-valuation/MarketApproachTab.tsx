'use client';

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { computeEarningsBase, normalizeEarningsBase } from '@/lib/business-valuation/earnings-base';
import { computeIncomeApproach, normalizeIncomeApproach } from '@/lib/business-valuation/income-approach';
import { normalizeDealTerms } from '@/lib/business-valuation/deal-terms';
import {
  MAX_COMPARABLES,
  MULTIPLE_TYPES,
  comparableMultiple,
  computeMarketApproach,
  importComparablesCsv,
  normalizeMarketApproach,
  type Comparable,
  type MarketApproach,
  type MultipleKey,
  type MultipleSelection,
} from '@/lib/business-valuation/market-approach';
import NumberInput from './NumberInput';
import { CARD, button, cardSubtitle, cardTitle, fieldLabel, input, money, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const newRowId = () => globalThis.crypto?.randomUUID?.() ?? `c${Date.now()}`;
const checkboxLabel = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1e293b' } as const;
const smallButton = { ...button, padding: '3px 8px', fontSize: '11px' };
const textarea = { ...input, height: 'auto', resize: 'vertical' as const, fontFamily: 'inherit' };
const ratio = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(2));
const right = { ...td, textAlign: 'right' as const };

export default function MarketApproachTab({ engagement, snapshot, locked, saving, run }: Props) {
  const saved: MarketApproach = engagement.marketApproach;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasPending = Object.keys(pending).length > 0;

  const value = (field: keyof MarketApproach) => (field in pending ? pending[field] : saved[field]);
  const edit = (field: keyof MarketApproach, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };
  const comparables = (value('comparables') as Comparable[]) || [];
  const setComparables = (next: Comparable[]) => edit('comparables', next);
  const selections = (value('selections') as Partial<Record<MultipleKey, MultipleSelection>>) || {};
  const editSelection = (key: MultipleKey, patch: Partial<Record<keyof MultipleSelection, unknown>>) =>
    edit('selections', { ...selections, [key]: { multiple: selections[key]?.multiple ?? null, weight: selections[key]?.weight ?? null, reason: selections[key]?.reason ?? null, ...patch } });

  const preview = useMemo(() => normalizeMarketApproach({ ...saved, ...pending }), [saved, pending]);
  const earnings = useMemo(() => computeEarningsBase(normalizeEarningsBase(engagement.earningsBase), snapshot), [engagement.earningsBase, snapshot]);
  const balanceSheet = snapshot?.trailingTwelveMonths?.balanceSheet || null;
  const valuationDate: string | null = engagement.valuationDate ? String(engagement.valuationDate).slice(0, 10) : null;
  const result = useMemo(
    () => computeMarketApproach(preview, earnings, balanceSheet, { transactionStructure: engagement.transactionStructure, valuationDate }),
    [preview, earnings, balanceSheet, engagement.transactionStructure, valuationDate],
  );
  const incomeValue = useMemo(
    () =>
      computeIncomeApproach(normalizeIncomeApproach(engagement.incomeApproach), earnings, {
        transactionStructure: engagement.transactionStructure,
        balanceSheet,
        purchasePrice: normalizeDealTerms(engagement.dealTerms).purchasePrice,
      }).indicatedValue,
    [engagement.incomeApproach, engagement.transactionStructure, engagement.dealTerms, earnings, balanceSheet],
  );
  const isStock = engagement.transactionStructure === 'STOCK';

  const save = async () => {
    if (await run('market', { action: 'update-market-approach', marketApproach: pending })) {
      setPending({});
      setJustSaved(true);
      setImportNote(null);
    }
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const imported = importComparablesCsv(await file.text());
    if (imported.error) {
      setImportNote(imported.error);
      return;
    }
    const room = MAX_COMPARABLES - comparables.length;
    const added = imported.comparables.slice(0, Math.max(0, room));
    setComparables([...comparables, ...added]);
    setImportNote(
      [
        `Added ${added.length} sale${added.length === 1 ? '' : 's'} from ${file.name}.`,
        imported.skippedRows ? `${imported.skippedRows} row${imported.skippedRows === 1 ? '' : 's'} without a sale price skipped.` : '',
        added.length < imported.comparables.length ? `${imported.comparables.length - added.length} not added (limit ${MAX_COMPARABLES}).` : '',
        `Columns used: ${imported.matchedColumns.join(', ')}.`,
        imported.ignoredColumns.length ? `Ignored: ${imported.ignoredColumns.join(', ')}.` : '',
        'Review, then Save.',
      ]
        .filter(Boolean)
        .join(' '),
    );
  };

  const updateComparable = (index: number, patch: Partial<Record<keyof Comparable, unknown>>) =>
    setComparables(comparables.map((row, i) => (i === index ? ({ ...row, ...patch } as Comparable) : row)));

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Market approach</div>
            <div style={cardSubtitle}>Completed sales of comparable private businesses. Import a CSV export from the data provider or enter sales by hand.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save()}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'market' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) minmax(0, 180px) minmax(0, 1fr)', gap: '8px 16px', maxWidth: '1300px' }}>
          <label>
            <span style={fieldLabel}>Data source</span>
            <input type="text" disabled={locked} placeholder="e.g. BIZCOMPS, DealStats" value={String(value('dataSource') ?? '')} onChange={(event) => edit('dataSource', event.target.value)} style={input} />
          </label>
          <label>
            <span style={fieldLabel}>Edition or date pulled</span>
            <input type="text" disabled={locked} value={String(value('dataEdition') ?? '')} onChange={(event) => edit('dataEdition', event.target.value)} style={input} />
          </label>
          <label>
            <span style={fieldLabel}>Search criteria</span>
            <input
              type="text"
              disabled={locked}
              placeholder="Industry codes, revenue range, years, and region searched"
              value={String(value('searchCriteria') ?? '')}
              onChange={(event) => edit('searchCriteria', event.target.value)}
              style={input}
            />
          </label>
        </div>
        <label style={{ ...checkboxLabel, marginTop: '8px', cursor: locked ? 'not-allowed' : 'pointer' }}>
          <input type="checkbox" disabled={locked} checked={Boolean(value('priceExcludesInventory'))} onChange={(event) => edit('priceExcludesInventory', event.target.checked)} style={{ margin: 0 }} />
          Sale prices exclude inventory (the company&apos;s inventory is added to the indicated value)
        </label>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Comparable sales</div>
            <div style={cardSubtitle}>
              {comparables.length} sale{comparables.length === 1 ? '' : 's'}, {result.includedCount} included. Exclude a sale with a reason instead of deleting it.
            </div>
          </div>
          {!locked && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(event) => void onImport(event)} style={{ display: 'none' }} />
              <button type="button" onClick={() => fileRef.current?.click()} style={{ ...smallButton, background: '#64748b' }}>Import CSV</button>
              <button
                type="button"
                disabled={comparables.length >= MAX_COMPARABLES}
                onClick={() =>
                  setComparables([
                    ...comparables,
                    { id: newRowId(), saleDate: null, description: '', industryCode: null, location: null, revenue: null, sde: null, ebitda: null, price: 0, included: true, exclusionReason: null },
                  ])
                }
                style={smallButton}
              >
                Add sale
              </button>
            </div>
          )}
        </div>
        {importNote && <div style={{ fontSize: '12px', color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '4px 8px', marginBottom: '6px' }}>{importNote}</div>}
        {comparables.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            No sales yet. The CSV needs a header row; recognized columns include Sale date, Description, NAICS, Location, Revenue, SDE, EBITDA, and Sale price.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1300px' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '44px' }}>Use</th>
                  <th style={{ ...th, width: '96px' }}>Sale date</th>
                  <th style={th}>Description</th>
                  <th style={{ ...th, width: '80px' }}>NAICS</th>
                  <th style={{ ...th, width: '110px' }}>Location</th>
                  <th style={{ ...th, width: '110px', textAlign: 'right' }}>Revenue</th>
                  <th style={{ ...th, width: '100px', textAlign: 'right' }}>SDE</th>
                  <th style={{ ...th, width: '100px', textAlign: 'right' }}>EBITDA</th>
                  <th style={{ ...th, width: '110px', textAlign: 'right' }}>Sale price</th>
                  <th style={{ ...th, width: '60px', textAlign: 'right' }}>P/SDE</th>
                  <th style={{ ...th, width: '68px', textAlign: 'right' }}>P/EBITDA</th>
                  <th style={{ ...th, width: '60px', textAlign: 'right' }}>P/Rev</th>
                  <th style={{ ...th, width: '170px' }}>Reason excluded</th>
                  <th style={{ ...th, width: '56px' }}></th>
                </tr>
              </thead>
              <tbody>
                {comparables.map((row, index) => {
                  const normalized = preview.comparables[index];
                  return (
                    <tr key={row.id} style={row.included ? undefined : { background: '#f8fafc', color: '#94a3b8' }}>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <input type="checkbox" disabled={locked} checked={row.included} onChange={(event) => updateComparable(index, { included: event.target.checked })} style={{ margin: 0 }} />
                      </td>
                      <td style={td}><input type="text" disabled={locked} placeholder="YYYY-MM-DD" value={row.saleDate ?? ''} onChange={(event) => updateComparable(index, { saleDate: event.target.value })} style={input} /></td>
                      <td style={td}><input type="text" disabled={locked} value={row.description} onChange={(event) => updateComparable(index, { description: event.target.value })} style={input} /></td>
                      <td style={td}><input type="text" disabled={locked} value={row.industryCode ?? ''} onChange={(event) => updateComparable(index, { industryCode: event.target.value })} style={input} /></td>
                      <td style={td}><input type="text" disabled={locked} value={row.location ?? ''} onChange={(event) => updateComparable(index, { location: event.target.value })} style={input} /></td>
                      <td style={td}><NumberInput disabled={locked} value={row.revenue ?? ''} onChange={(next) => updateComparable(index, { revenue: next })} /></td>
                      <td style={td}><NumberInput disabled={locked} value={row.sde ?? ''} onChange={(next) => updateComparable(index, { sde: next })} /></td>
                      <td style={td}><NumberInput disabled={locked} value={row.ebitda ?? ''} onChange={(next) => updateComparable(index, { ebitda: next })} /></td>
                      <td style={td}><NumberInput disabled={locked} value={row.price || ''} onChange={(next) => updateComparable(index, { price: next })} /></td>
                      <td style={right}>{ratio(normalized ? comparableMultiple(normalized, 'sde') : null)}</td>
                      <td style={right}>{ratio(normalized ? comparableMultiple(normalized, 'ebitda') : null)}</td>
                      <td style={right}>{ratio(normalized ? comparableMultiple(normalized, 'revenue') : null)}</td>
                      <td style={td}>
                        {!row.included && (
                          <input type="text" disabled={locked} placeholder="Why it is not comparable" value={row.exclusionReason ?? ''} onChange={(event) => updateComparable(index, { exclusionReason: event.target.value })} style={input} />
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => setComparables(comparables.filter((_, i) => i !== index))}
                            style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
          <div style={cardTitle}>Multiples</div>
          <div style={cardSubtitle}>Statistics from the included sales. Select a multiple for each measure you rely on and weight them to 100%.</div>
        </div>
        <table style={{ width: '100%', maxWidth: '1300px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Multiple</th>
              <th style={{ ...th, textAlign: 'right' }}>Sales</th>
              <th style={{ ...th, textAlign: 'right' }}>Low</th>
              <th style={{ ...th, textAlign: 'right' }}>Lower quartile</th>
              <th style={{ ...th, textAlign: 'right' }}>Median</th>
              <th style={{ ...th, textAlign: 'right' }}>Upper quartile</th>
              <th style={{ ...th, textAlign: 'right' }}>High</th>
              <th style={{ ...th, width: '90px', textAlign: 'right' }}>Selected</th>
              <th style={{ ...th, textAlign: 'right' }}>Company figure</th>
              <th style={{ ...th, textAlign: 'right' }}>Indication</th>
              <th style={{ ...th, width: '80px', textAlign: 'right' }}>Weight</th>
              <th style={{ ...th, width: '28%' }}>Reason for the selected multiple</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((line) => (
              <tr key={line.key}>
                <td style={td}>{line.label}</td>
                <td style={right}>{line.stats?.count ?? 0}</td>
                <td style={right}>{ratio(line.stats?.min)}</td>
                <td style={right}>{ratio(line.stats?.q1)}</td>
                <td style={{ ...right, fontWeight: 600 }}>{ratio(line.stats?.median)}</td>
                <td style={right}>{ratio(line.stats?.q3)}</td>
                <td style={right}>{ratio(line.stats?.max)}</td>
                <td style={td}>
                  <NumberInput kind="number" disabled={locked} placeholder={line.stats ? ratio(line.stats.median) : ''} value={selections[line.key]?.multiple ?? ''} onChange={(next) => editSelection(line.key, { multiple: next })} />
                </td>
                <td style={right} title={line.metricLabel}>{money(line.companyMetric)}</td>
                <td style={right}>{money(line.indication)}</td>
                <td style={td}>
                  <NumberInput kind="percent" disabled={locked || line.selected === null} placeholder={line.selected !== null ? `${line.weight}%` : ''} value={selections[line.key]?.weight ?? ''} onChange={(next) => editSelection(line.key, { weight: next })} />
                </td>
                <td style={td}>
                  <textarea rows={1} disabled={locked} value={selections[line.key]?.reason ?? ''} onChange={(event) => editSelection(line.key, { reason: event.target.value })} style={textarea} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label style={{ display: 'block', marginTop: '8px', maxWidth: '1300px' }}>
          <span style={fieldLabel}>Notes on comparability</span>
          <textarea rows={2} disabled={locked} value={String(value('notes') ?? '')} onChange={(event) => edit('notes', event.target.value)} style={textarea} />
        </label>
      </div>

      <div style={{ ...CARD, maxWidth: '560px' }}>
        <div style={{ marginBottom: '6px' }}>
          <div style={cardTitle}>Indicated value</div>
          <div style={cardSubtitle}>{hasPending ? 'Includes unsaved changes' : 'Market approach compared with the income approach'}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={td}>Weighted value from selected multiples</td><td style={right}>{money(result.operatingValue)}</td></tr>
            {result.inventory !== null && <tr><td style={td}>Plus inventory</td><td style={right}>{money(result.inventory)}</td></tr>}
            {isStock && <tr><td style={td}>Less interest-bearing debt</td><td style={right}>{money(result.debt === null ? null : -result.debt)}</td></tr>}
            {isStock && <tr><td style={td}>Plus cash</td><td style={right}>{money(result.cash)}</td></tr>}
            <tr><td style={{ ...td, fontWeight: 700 }}>Indicated value, market approach</td><td style={{ ...right, fontWeight: 700 }}>{money(result.indicatedValue)}</td></tr>
            <tr><td style={{ ...td, color: '#64748b' }}>{result.basis}</td><td style={td}></td></tr>
            <tr><td style={{ ...td, color: '#64748b' }}>Indicated value, income approach</td><td style={{ ...right, color: '#64748b' }}>{money(incomeValue)}</td></tr>
          </tbody>
        </table>
      </div>

      {result.warnings.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Check before relying on the market approach</div>
          {result.warnings.map((warning) => (
            <div key={warning} style={{ fontSize: '12px', color: '#78350f' }}>• {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
