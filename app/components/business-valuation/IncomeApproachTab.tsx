'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { computeEarningsBase, normalizeEarningsBase } from '@/lib/business-valuation/earnings-base';
import { normalizeDealTerms } from '@/lib/business-valuation/deal-terms';
import {
  EARNINGS_MEASURES,
  QOE_BUCKETS,
  computeIncomeApproach,
  normalizeIncomeApproach,
  type IncomeApproach,
  type RiskFactor,
} from '@/lib/business-valuation/income-approach';
import { formatEstDateLabel } from '@/lib/time/eastern';
import NumberInput from './NumberInput';
import { CARD, button, cardSubtitle, cardTitle, formColumns, formRow, formRowLabel, groupTitle, input, money, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const pct = (value: number | null, digits = 2) => (value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`);
const multiple = (value: number | null) => (value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}x`);
const newRowId = () => globalThis.crypto?.randomUUID?.() ?? `r${Date.now()}`;
const note: CSSProperties = { fontSize: '11px', color: '#64748b', padding: '2px 0' };

export default function IncomeApproachTab({ engagement, snapshot, locked, saving, run }: Props) {
  const saved: IncomeApproach = engagement.incomeApproach;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const hasPending = Object.keys(pending).length > 0;

  const value = (field: keyof IncomeApproach) => (field in pending ? pending[field] : saved[field]);
  const edit = (field: keyof IncomeApproach, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };
  const factors = (value('riskFactors') as RiskFactor[]) || [];
  const setFactors = (next: RiskFactor[]) => edit('riskFactors', next);

  const preview = useMemo(() => normalizeIncomeApproach({ ...saved, ...pending }), [saved, pending]);
  const earnings = useMemo(() => computeEarningsBase(normalizeEarningsBase(engagement.earningsBase), snapshot), [engagement.earningsBase, snapshot]);
  const result = useMemo(
    () =>
      computeIncomeApproach(preview, earnings, {
        transactionStructure: engagement.transactionStructure,
        balanceSheet: snapshot?.trailingTwelveMonths?.balanceSheet || null,
        purchasePrice: normalizeDealTerms(engagement.dealTerms).purchasePrice,
      }),
    [preview, earnings, engagement.transactionStructure, engagement.dealTerms, snapshot],
  );
  const qoeBuckets: Array<{ bucket: string; ownerAmountTotal: number }> = snapshot?.qoe?.accountAdjustments?.buckets || [];
  const bucketAmount = (bucket: string | null) => (bucket ? qoeBuckets.find((item) => item.bucket === bucket)?.ownerAmountTotal ?? null : null);
  const isStock = engagement.transactionStructure === 'STOCK';

  const save = async (action: 'update-income-approach' | 'lookup-risk-free' | 'lookup-inflation') => {
    const label = action === 'update-income-approach' ? 'income' : action;
    if (await run(label, { action, incomeApproach: pending })) {
      setPending({});
      setJustSaved(action === 'update-income-approach');
    }
  };

  const row = (label: string, control: ReactNode) => (
    <label style={formRow}>
      <span style={formRowLabel}>{label}</span>
      {control}
    </label>
  );
  const pctInput = (field: keyof IncomeApproach, onChange?: (next: string) => void) => (
    <NumberInput
      kind="percent"
      disabled={locked}
      placeholder="%"
      value={value(field)}
      onChange={(next) => (onChange ? onChange(next) : edit(field, next))}
      style={{ width: '80px' }}
    />
  );
  const sourceInput = (field: keyof IncomeApproach, placeholder: string) => (
    <input
      type="text"
      disabled={locked}
      placeholder={placeholder}
      value={String(value(field) ?? '')}
      onChange={(event) => edit(field, event.target.value)}
      style={{ ...input, flex: 1, minWidth: 0 }}
    />
  );
  const lookupButton = (action: 'lookup-risk-free' | 'lookup-inflation', label: string) => (
    <button
      type="button"
      disabled={locked || Boolean(saving) || !engagement.valuationDate}
      title={engagement.valuationDate ? undefined : 'Set the valuation date on the Engagement tab first'}
      onClick={() => void save(action)}
      style={{ ...button, padding: '3px 8px', fontSize: '11px', opacity: locked || saving || !engagement.valuationDate ? 0.55 : 1 }}
    >
      {saving === action ? 'Looking up…' : label}
    </button>
  );
  const line = (label: string, amount: ReactNode, options: { bold?: boolean; indent?: boolean; muted?: boolean; alert?: boolean } = {}) => {
    const color = options.alert ? '#b91c1c' : options.muted ? '#64748b' : td.color;
    return (
      <tr key={label}>
        <td style={{ ...td, fontWeight: options.bold ? 700 : 400, color, ...(options.indent ? { paddingLeft: '18px' } : {}) }}>{label}</td>
        <td style={{ ...td, textAlign: 'right', fontWeight: options.bold ? 700 : 400, whiteSpace: 'nowrap', color }}>{amount}</td>
      </tr>
    );
  };
  const alert = result.capRateOutOfRange;

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Income approach</div>
            <div style={cardSubtitle}>Capitalization of earnings with a build-up discount rate. Earnings come from the Earnings Base tab.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save('update-income-approach')}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'income' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div style={formColumns}>
          <div>
            <div style={groupTitle}>Cash flow</div>
            {row(
              'Earnings measure',
              <select disabled={locked} value={String(value('earningsMeasure'))} onChange={(event) => edit('earningsMeasure', event.target.value)} style={{ ...input, flex: 1, minWidth: 0 }}>
                {EARNINGS_MEASURES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>,
            )}
            {row('Tax rate', pctInput('taxRatePct'))}
            <div style={note}>Blank capitalizes pre-tax earnings. Taxes assume tax depreciation equals normal capital spending.</div>
            {row(
              'Long-term growth',
              <>
                {pctInput('longTermGrowthPct', (next) => {
                  setJustSaved(false);
                  setPending((current) => ({ ...current, longTermGrowthPct: next, growthSource: next.trim() ? 'Entered by appraiser' : null }));
                })}
                {lookupButton('lookup-inflation', 'Use FRED inflation')}
              </>,
            )}
            <div style={note}>{String(value('growthSource') ?? 'No growth rate yet.')}</div>
            <label style={{ ...formRow, cursor: locked ? 'not-allowed' : 'pointer' }}>
              <span style={formRowLabel}>Add excess working capital</span>
              <input type="checkbox" disabled={locked} checked={Boolean(value('addExcessWorkingCapital'))} onChange={(event) => edit('addExcessWorkingCapital', event.target.checked)} style={{ margin: 0 }} />
            </label>
          </div>

          <div>
            <div style={groupTitle}>Build-up discount rate</div>
            {row(
              'Risk-free rate',
              <>
                {pctInput('riskFreeRatePct', (next) => {
                  setJustSaved(false);
                  setPending((current) => ({ ...current, riskFreeRatePct: next, riskFreeSource: next.trim() ? 'Entered by appraiser' : null, riskFreeAsOf: null }));
                })}
                {lookupButton('lookup-risk-free', 'Look up FRED')}
              </>,
            )}
            <div style={note}>
              {String(value('riskFreeSource') ?? '20-year Treasury on or before the valuation date.')}
              {value('riskFreeAsOf') ? ` (as of ${formatEstDateLabel(String(value('riskFreeAsOf')))})` : ''}
            </div>
            {row('Equity risk premium', pctInput('equityRiskPremiumPct'))}
            {row('ERP source', sourceInput('equityRiskPremiumSource', 'e.g. Kroll recommended ERP'))}
            {row('Size premium', pctInput('sizePremiumPct'))}
            {row('Size source', sourceInput('sizePremiumSource', 'e.g. Kroll CRSP decile 10'))}
            {row('Industry premium', pctInput('industryPremiumPct'))}
            {row('Industry source', sourceInput('industryPremiumSource', 'e.g. Kroll industry risk premium'))}
          </div>

          <div>
            <div style={groupTitle}>Earnings Base (saved)</div>
            {row('Normalized EBITDA', <span style={{ fontSize: '12px', marginLeft: 'auto' }}>{money(earnings.normalizedEbitda)}</span>)}
            {row('Normal capital spending', <span style={{ fontSize: '12px', marginLeft: 'auto' }}>{money(earnings.normalCapex)}</span>)}
            {row('EBITDA less capital spending', <span style={{ fontSize: '12px', marginLeft: 'auto' }}>{money(earnings.ebitdaLessCapex)}</span>)}
            {row("Seller's discretionary earnings", <span style={{ fontSize: '12px', marginLeft: 'auto' }}>{money(earnings.sde)}</span>)}
            {row('Excess (deficit) working capital', <span style={{ fontSize: '12px', marginLeft: 'auto' }}>{money(earnings.workingCapital.excess)}</span>)}
            <div style={note}>{earnings.periodLabel}. Change these on the Earnings Base tab.</div>
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Company-specific risk</div>
            <div style={cardSubtitle}>Each premium needs a rationale. Link the Quality of Earnings adjustment that supports it where one applies.</div>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={() => setFactors([...factors, { id: newRowId(), label: '', premiumPct: 0, rationale: null, qoeBucket: null }])}
              style={{ ...button, marginLeft: 'auto', padding: '3px 8px', fontSize: '11px' }}
            >
              Add risk factor
            </button>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '24%' }}>Factor</th>
              <th style={{ ...th, width: '90px', textAlign: 'right' }}>Premium</th>
              <th style={th}>Rationale</th>
              <th style={{ ...th, width: '22%' }}>Quality of Earnings evidence</th>
              <th style={{ ...th, width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {factors.map((factor, index) => {
              const update = (patch: Partial<RiskFactor>) => setFactors(factors.map((item, i) => (i === index ? { ...item, ...patch } : item)));
              const amount = bucketAmount(factor.qoeBucket);
              return (
                <tr key={factor.id}>
                  <td style={td}><input type="text" disabled={locked} value={factor.label} onChange={(event) => update({ label: event.target.value })} style={input} /></td>
                  <td style={td}><NumberInput kind="percent" disabled={locked} value={factor.premiumPct} onChange={(next) => update({ premiumPct: next as unknown as number })} /></td>
                  <td style={td}><input type="text" disabled={locked} value={factor.rationale ?? ''} onChange={(event) => update({ rationale: event.target.value })} style={input} /></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select disabled={locked} value={factor.qoeBucket ?? ''} onChange={(event) => update({ qoeBucket: event.target.value || null })} style={{ ...input, flex: 1, minWidth: 0 }}>
                        <option value="">None</option>
                        {QOE_BUCKETS.map((bucket) => <option key={bucket.value} value={bucket.value}>{bucket.label}</option>)}
                      </select>
                      {amount !== null && <span style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap' }}>{money(amount)}</span>}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => setFactors(factors.filter((_, i) => i !== index))}
                        style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>Company-specific risk premium</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{pct(result.companySpecificPct)}</td>
              <td style={td} colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 560px))', gap: '8px' }}>
        <div style={CARD}>
          <div style={{ marginBottom: '6px' }}>
            <div style={cardTitle}>Discount and capitalization rate</div>
            <div style={cardSubtitle}>{hasPending ? 'Includes unsaved changes' : 'Build-up method'}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {line('Risk-free rate', pct(preview.riskFreeRatePct))}
              {line('Equity risk premium', pct(preview.equityRiskPremiumPct))}
              {line('Size premium', pct(preview.sizePremiumPct))}
              {line('Industry premium', pct(preview.industryPremiumPct ?? 0))}
              {line('Company-specific risk premium', pct(result.companySpecificPct))}
              {line('Discount rate', pct(result.discountRatePct), { bold: true })}
              {line('Less long-term growth', pct(-result.growthPct))}
              {line('Capitalization rate', pct(result.capRatePct), { bold: true, alert })}
            </tbody>
          </table>
        </div>

        <div style={CARD}>
          <div style={{ marginBottom: '6px' }}>
            <div style={cardTitle}>Indicated value</div>
            <div style={cardSubtitle}>{isStock ? 'Equity value (stock sale)' : 'Cash-free, debt-free value of the business assets (asset sale)'}</div>
          </div>
          {result.capRateOutOfRange && (
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '4px 8px', marginBottom: '6px' }}>
              Not reliable: a {pct(result.capRatePct)} capitalization rate is far below the 15%–35% typical for small private companies. Check the build-up and growth rate.
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {line(result.earningsLabel, money(result.earnings))}
              {line('Less income taxes', money(result.taxes ? -result.taxes : 0))}
              {line('Net cash flow', money(result.netCashFlow))}
              {line(`Grown one year at ${pct(result.growthPct)}`, money(result.netCashFlow === null ? null : result.netCashFlow * (1 + result.growthPct / 100)), { indent: true })}
              {line('Less working capital to support growth', money(result.workingCapitalInvestment ? -result.workingCapitalInvestment : 0), { indent: true })}
              {line('Next-year net cash flow', money(result.nextYearCashFlow))}
              {line('Divided by capitalization rate', pct(result.capRatePct), { alert })}
              {line('Value of operations', money(result.operatingValue), { bold: true, alert })}
              {preview.addExcessWorkingCapital && line('Plus excess (less deficit) working capital', money(result.excessWorkingCapital))}
              {isStock && line('Less interest-bearing debt', money(result.debt === null ? null : -result.debt))}
              {isStock && line('Plus cash', money(result.cash))}
              {line('Indicated value, income approach', money(result.indicatedValue), { bold: true, alert })}
              {line('Implied multiple of normalized EBITDA', multiple(result.impliedEbitdaMultiple), { muted: !alert, alert })}
              {line(
                "Implied multiple of seller's discretionary earnings",
                earnings.sde === null ? 'Needs market owner salary' : multiple(result.impliedSdeMultiple),
                { muted: !alert, alert },
              )}
              {result.purchasePrice !== null && line('Purchase price in deal terms', money(result.purchasePrice), { muted: true })}
              {result.priceDifference !== null && line('Price above (below) indicated value', money(result.priceDifference), { muted: true })}
            </tbody>
          </table>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Check before relying on the income approach</div>
          {result.warnings.map((warning) => (
            <div key={warning} style={{ fontSize: '12px', color: '#78350f' }}>• {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
