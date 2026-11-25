'use client';

import { useMemo, useState } from 'react';
import { computeIndications } from '@/lib/business-valuation/indications';
import {
  APPROACHES,
  ROUNDING_INCREMENTS,
  computeReconciliation,
  normalizeReconciliation,
  type ApproachKey,
  type Reconciliation,
} from '@/lib/business-valuation/reconciliation';
import { formatEstDateLabel, formatEstDateTime } from '@/lib/time/eastern';
import NumberInput from './NumberInput';
import { CARD, button, cardSubtitle, cardTitle, input, money, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  companyName: string;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const textarea = { ...input, height: 'auto', resize: 'vertical' as const, fontFamily: 'inherit' };

export default function ReconciliationTab({ engagement, snapshot, companyName, locked, saving, run }: Props) {
  const saved: Reconciliation = engagement.reconciliation;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const hasPending = Object.keys(pending).length > 0;

  const pendingWeights = (pending.weights as Record<string, unknown>) || {};
  const pendingReasons = (pending.reasons as Record<string, unknown>) || {};
  const editMap = (field: 'weights' | 'reasons', key: ApproachKey, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: { ...((current[field] as Record<string, unknown>) || {}), [key]: next } }));
  };
  const edit = (field: 'roundingIncrement' | 'conclusionNote', next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };

  const preview = useMemo(
    () =>
      normalizeReconciliation({
        ...saved,
        ...pending,
        weights: { ...saved.weights, ...((pending.weights as Record<string, unknown>) || {}) },
        reasons: { ...saved.reasons, ...((pending.reasons as Record<string, unknown>) || {}) },
      }),
    [saved, pending],
  );
  const indications = useMemo(() => computeIndications(engagement, snapshot), [engagement, snapshot]);
  const valuationDate = engagement.valuationDate ? String(engagement.valuationDate).slice(0, 10) : null;
  const result = computeReconciliation(preview, indications, {
    companyName,
    valuationDateLabel: valuationDate ? formatEstDateLabel(valuationDate) : null,
    standardOfValue: engagement.standardOfValue,
    premiseOfValue: engagement.premiseOfValue,
    ownershipBasis: engagement.ownershipBasis,
    transactionStructure: engagement.transactionStructure,
    interestPercent: engagement.interestPercent,
    balanceSheet: snapshot?.trailingTwelveMonths?.balanceSheet || null,
    formatMoney: money,
  });
  const concluded = Boolean(saved.concludedAt) && !result.stale && !hasPending;
  const canConclude = !locked && !hasPending && result.blockers.length === 0 && result.concludedValue !== null && !concluded && Boolean(snapshot);

  const save = async () => {
    if (await run('reconciliation', { action: 'update-reconciliation', reconciliation: pending })) {
      setPending({});
      setJustSaved(true);
    }
  };

  const breakdownKeys = Array.from(new Set([...(result.breakdownAtValue?.lines || []), ...(result.breakdownAtPrice?.lines || [])].map((line) => line.key)));
  const breakdownLabel = (key: string) => [...(result.breakdownAtValue?.lines || []), ...(result.breakdownAtPrice?.lines || [])].find((line) => line.key === key)?.label || key;
  const breakdownAmount = (which: 'breakdownAtValue' | 'breakdownAtPrice', key: string) => result[which]?.lines.find((line) => line.key === key)?.amount ?? null;
  const numCell = { ...td, textAlign: 'right' as const };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Reconciliation</div>
            <div style={cardSubtitle}>Weight each approach and give the reason, including for any approach given no weight. Save records the whole tab.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save()}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'reconciliation' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
            <button
              type="button"
              disabled={!canConclude || Boolean(saving)}
              onClick={() => void run('conclude', { action: 'conclude-value' })}
              style={{ ...button, background: concluded ? '#16a34a' : button.background, opacity: canConclude || concluded ? 1 : 0.55 }}
              title={hasPending ? 'Save first' : result.blockers[0]}
            >
              {saving === 'conclude' ? 'Concluding…' : concluded ? 'Concluded' : saved.concludedAt ? 'Conclude again' : 'Conclude value'}
            </button>
          </div>
        </div>
        <table style={{ width: '100%', maxWidth: '1200px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '130px' }}>Approach</th>
              <th style={{ ...th, width: '230px' }}>Basis</th>
              <th style={{ ...th, textAlign: 'right', width: '110px' }}>Indicated value</th>
              <th style={{ ...th, textAlign: 'right', width: '80px' }}>Weight</th>
              <th style={{ ...th, textAlign: 'right', width: '110px' }}>Weighted</th>
              <th style={th}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((line) => (
              <tr key={line.key}>
                <td style={{ ...td, fontWeight: 600 }}>{line.label}</td>
                <td style={{ ...td, color: '#64748b', fontSize: '11px' }}>{line.basis}</td>
                <td style={numCell}>{money(line.value)}</td>
                <td style={{ ...td, padding: '1px 4px' }}>
                  <NumberInput
                    value={line.key in pendingWeights ? pendingWeights[line.key] : saved.weights[line.key] ?? ''}
                    onChange={(raw) => editMap('weights', line.key, raw === '' ? null : raw)}
                    kind="percent"
                    disabled={locked || (line.value === null && !(saved.weights[line.key] ?? 0))}
                    placeholder="0%"
                  />
                </td>
                <td style={numCell}>{line.weighted === null ? '—' : money(line.weighted)}</td>
                <td style={{ ...td, padding: '1px 4px' }}>
                  <textarea
                    rows={2}
                    disabled={locked}
                    placeholder={line.value === null ? `Why the ${line.label.toLowerCase()} was not used.` : `Why the ${line.label.toLowerCase()} received this weight.`}
                    value={String(line.key in pendingReasons ? pendingReasons[line.key] ?? '' : saved.reasons[line.key] ?? '')}
                    onChange={(event) => editMap('reasons', line.key, event.target.value)}
                    style={textarea}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Weighted value</td>
              <td style={{ ...numCell, fontWeight: 700, color: Math.abs(result.weightTotal - 100) > 0.001 ? '#b91c1c' : '#1e293b' }}>{result.weightTotal}%</td>
              <td style={{ ...numCell, fontWeight: 700 }}>{money(result.weightedValue)}</td>
              <td style={td} />
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={3}>
                Concluded value, rounded to the nearest{' '}
                <select
                  disabled={locked}
                  value={String(preview.roundingIncrement)}
                  onChange={(event) => edit('roundingIncrement', Number(event.target.value))}
                  style={{ ...input, width: '100px', display: 'inline-block' }}
                >
                  {ROUNDING_INCREMENTS.map((increment) => <option key={increment} value={increment}>{money(increment)}</option>)}
                </select>
              </td>
              <td style={td} />
              <td style={{ ...numCell, fontWeight: 700, fontSize: '13px' }}>{money(result.concludedValue)}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
        <textarea
          rows={2}
          disabled={locked}
          placeholder="Reconciliation narrative (optional): how the indications were considered together."
          value={String('conclusionNote' in pending ? pending.conclusionNote ?? '' : saved.conclusionNote ?? '')}
          onChange={(event) => edit('conclusionNote', event.target.value)}
          style={{ ...textarea, marginTop: '6px', maxWidth: '1200px' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 560px))', gap: '8px' }}>
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
            <div style={cardTitle}>Conclusion of value</div>
            <div style={cardSubtitle}>
              {saved.concludedAt ? `Concluded by ${saved.concludedByName || 'unknown'} on ${formatEstDateTime(saved.concludedAt)}.` : 'Not concluded.'}
            </div>
          </div>
          {result.stale && (
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '4px 8px', marginBottom: '6px' }}>
              Inputs changed since this value was concluded. Conclude again.
            </div>
          )}
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>{result.conclusionStatement || 'Complete the weights and reasons to state a conclusion.'}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={td}>Concluded value</td><td style={numCell}>{money(result.concludedValue)}</td></tr>
              <tr><td style={td}>Purchase price</td><td style={numCell}>{money(result.purchasePrice)}</td></tr>
              <tr>
                <td style={td}>Value above (below) price</td>
                <td style={numCell}>
                  {money(result.priceDifference)}
                  {result.priceDifferencePct !== null ? ` (${result.priceDifferencePct.toFixed(1)}%)` : ''}
                </td>
              </tr>
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>Purchase price</td>
                <td style={{ ...numCell, fontWeight: 700, color: result.priceSupported === null ? '#94a3b8' : result.priceSupported ? '#15803d' : '#b91c1c' }}>
                  {result.priceSupported === null ? '—' : result.priceSupported ? 'Supported' : 'Not supported'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
            <div style={cardTitle}>Breakdown of value</div>
            <div style={cardSubtitle}>Tangible assets from Deal Terms; goodwill is the remainder.</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th} />
                <th style={{ ...th, textAlign: 'right' }}>At concluded value</th>
                <th style={{ ...th, textAlign: 'right' }}>At purchase price</th>
              </tr>
            </thead>
            <tbody>
              {breakdownKeys.length === 0 ? (
                <tr><td colSpan={3} style={{ ...td, color: '#64748b' }}>Conclude a value or enter the purchase price.</td></tr>
              ) : (
                <>
                  {breakdownKeys.map((key) => (
                    <tr key={key}>
                      <td style={{ ...td, fontWeight: key === 'goodwill' ? 600 : 400 }}>{breakdownLabel(key)}</td>
                      <td style={numCell}>{money(breakdownAmount('breakdownAtValue', key))}</td>
                      <td style={numCell}>{money(breakdownAmount('breakdownAtPrice', key))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }}>Total</td>
                    <td style={{ ...numCell, fontWeight: 700 }}>{money(result.breakdownAtValue?.purchasePrice ?? null)}</td>
                    <td style={{ ...numCell, fontWeight: 700 }}>{money(result.breakdownAtPrice?.purchasePrice ?? null)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(result.blockers.length > 0 || result.warnings.length > 0) && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          {result.blockers.length > 0 && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Before concluding</div>
              {result.blockers.map((item) => <div key={item} style={{ fontSize: '12px', color: '#78350f' }}>• {item}</div>)}
            </>
          )}
          {result.warnings.length > 0 && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', margin: result.blockers.length ? '6px 0 4px' : '0 0 4px' }}>Reconciliation warnings</div>
              {result.warnings.map((item) => <div key={item} style={{ fontSize: '12px', color: '#78350f' }}>• {item}</div>)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
