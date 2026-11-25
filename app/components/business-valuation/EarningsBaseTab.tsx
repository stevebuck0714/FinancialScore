'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  EARNINGS_SOURCES,
  MARKET_STATISTICS,
  OWNER_OCCUPATIONS,
  WEIGHTED_PERIOD,
  completeFiscalYears,
  computeEarningsBase,
  defaultWeights,
  normalizeEarningsBase,
  type EarningsBase,
  type Normalization,
} from '@/lib/business-valuation/earnings-base';
import { normalizeDealTerms } from '@/lib/business-valuation/deal-terms';
import { formatMonthKey } from '@/lib/business-valuation/fiscal-years';
import NumberInput from './NumberInput';
import { CARD, button, cardSubtitle, cardTitle, formColumns, formRow, formRowLabel, groupTitle, input, money, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  companyState: string | null;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const pct = (value: number | null) => (value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`);
const newRowId = () => globalThis.crypto?.randomUUID?.() ?? `n${Date.now()}`;

export default function EarningsBaseTab({ engagement, snapshot, companyState, locked, saving, run }: Props) {
  const saved: EarningsBase = engagement.earningsBase;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const hasPending = Object.keys(pending).length > 0;

  const value = (field: keyof EarningsBase) => (field in pending ? pending[field] : saved[field]);
  const edit = (field: keyof EarningsBase, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };
  const normalizations = (value('normalizations') as Normalization[]) || [];
  const weights = { ...((value('weights') as Record<string, number>) || {}) };
  const setNormalizations = (next: Normalization[]) => edit('normalizations', next);

  const preview = useMemo(() => normalizeEarningsBase({ ...saved, ...pending }), [saved, pending]);
  const result = useMemo(() => computeEarningsBase(preview, snapshot), [preview, snapshot]);
  const years = useMemo(() => completeFiscalYears(snapshot), [snapshot]);
  const weightDefaults = useMemo(() => defaultWeights(snapshot), [snapshot]);
  const dealTarget = normalizeDealTerms(engagement.dealTerms).workingCapitalTarget;

  const save = async (action: 'update-earnings-base' | 'lookup-owner-salary') => {
    if (await run(action === 'lookup-owner-salary' ? 'bls' : 'earnings', { action, earningsBase: pending })) {
      setPending({});
      setJustSaved(action === 'update-earnings-base');
    }
  };

  const row = (label: string, control: ReactNode) => (
    <label style={formRow}>
      <span style={formRowLabel}>{label}</span>
      {control}
    </label>
  );
  const rowSelect: CSSProperties = { ...input, flex: 1, minWidth: 0, cursor: locked ? 'not-allowed' : 'pointer' };
  const numberInput = (field: keyof EarningsBase, placeholder = '$', onChange?: (next: string) => void, kind: 'money' | 'percent' = 'money') => (
    <NumberInput
      kind={kind}
      disabled={locked}
      placeholder={placeholder}
      value={value(field)}
      onChange={(next) => (onChange ? onChange(next) : edit(field, next))}
      style={{ width: '120px' }}
    />
  );
  const textInput = (field: keyof EarningsBase, placeholder = '') => (
    <input
      type="text"
      disabled={locked}
      placeholder={placeholder}
      value={String(value(field) ?? '')}
      onChange={(event) => edit(field, event.target.value)}
      style={{ ...input, flex: 1, minWidth: 0 }}
    />
  );

  const qoeSelected = result.source === 'QOE_ADJUSTED';
  const summaryRow = (label: string, amount: number | null, options: { bold?: boolean; indent?: boolean; muted?: string } = {}) => (
    <tr key={label}>
      <td style={{ ...td, fontWeight: options.bold ? 700 : 400, ...(options.indent ? { paddingLeft: '18px' } : {}) }}>
        {label}
        {options.muted && <span style={{ color: '#64748b', fontWeight: 400 }}> · {options.muted}</span>}
      </td>
      <td style={{ ...td, textAlign: 'right', fontWeight: options.bold ? 700 : 400, whiteSpace: 'nowrap' }}>{money(amount)}</td>
    </tr>
  );

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Earnings base</div>
            <div style={cardSubtitle}>The earnings the income approach capitalizes, normalized for a buyer.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save('update-earnings-base')}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'earnings' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div style={formColumns}>
          <div>
            <div style={groupTitle}>Starting earnings</div>
            {row(
              'Source',
              <select disabled={locked} value={String(value('source') ?? '')} onChange={(event) => edit('source', event.target.value || null)} style={rowSelect}>
                <option value="">{result.hasQoe ? 'Automatic (Quality of Earnings)' : 'Automatic (book EBITDA)'}</option>
                {EARNINGS_SOURCES.map((item) => (
                  <option key={item.value} value={item.value} disabled={item.value === 'QOE_ADJUSTED' && !result.hasQoe}>
                    {item.label}{item.value === 'QOE_ADJUSTED' && !result.hasQoe ? ' (none saved)' : ''}
                  </option>
                ))}
              </select>,
            )}
            {row(
              'Period',
              <select
                disabled={locked || qoeSelected}
                value={qoeSelected ? 'TTM' : String(value('period') ?? 'TTM')}
                onChange={(event) => edit('period', event.target.value)}
                style={rowSelect}
              >
                <option value="TTM">{snapshot?.trailingTwelveMonths?.period?.label || 'Trailing 12 months'}</option>
                {(snapshot?.periods || []).map((period: any) => (
                  <option key={period.key} value={period.key}>{period.label}</option>
                ))}
                <option value={WEIGHTED_PERIOD} disabled={years.length === 0}>Weighted average of fiscal years</option>
              </select>,
            )}
            {qoeSelected && <div style={{ fontSize: '11px', color: '#64748b', padding: '2px 0' }}>Quality of Earnings totals cover the trailing 12 months.</div>}
            {!qoeSelected && value('period') === WEIGHTED_PERIOD &&
              years.map(({ period }) =>
                row(
                  `Weight ${period.label}`,
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={locked}
                    placeholder={String(weightDefaults[period.key] ?? 0)}
                    value={weights[period.key] === undefined ? '' : String(weights[period.key])}
                    onChange={(event) => {
                      const next = { ...weightDefaults, ...weights };
                      if (event.target.value.trim() === '') delete next[period.key];
                      else next[period.key] = event.target.value as unknown as number;
                      edit('weights', next);
                    }}
                    style={{ ...input, width: '60px', textAlign: 'right' }}
                  />,
                ),
              )}
            {row('Why this base', textInput('reason', 'Required'))}
          </div>

          <div>
            <div style={groupTitle}>Owner compensation</div>
            {row('Actual owner pay', numberInput('ownerActualComp'))}
            {row(
              'Market role',
              <select disabled={locked} value={String(value('ownerOccupationCode'))} onChange={(event) => edit('ownerOccupationCode', event.target.value)} style={rowSelect}>
                {OWNER_OCCUPATIONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>,
            )}
            {row(
              'Market area',
              <select disabled={locked} value={String(value('ownerMarketArea'))} onChange={(event) => edit('ownerMarketArea', event.target.value)} style={rowSelect}>
                <option value="STATE">{companyState ? `Company state (${companyState})` : 'Company state (not set)'}</option>
                <option value="NATIONAL">National</option>
              </select>,
            )}
            {row(
              'Statistic',
              <select disabled={locked} value={String(value('ownerMarketStatistic'))} onChange={(event) => edit('ownerMarketStatistic', event.target.value)} style={rowSelect}>
                {MARKET_STATISTICS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>,
            )}
            {row(
              'Market salary',
              <>
                {numberInput('ownerMarketSalary', '$', (next) => {
                  setJustSaved(false);
                  setPending((current) => ({ ...current, ownerMarketSalary: next, ownerMarketSource: next.trim() ? 'Entered by appraiser' : null }));
                })}
                <button
                  type="button"
                  disabled={locked || Boolean(saving)}
                  onClick={() => void save('lookup-owner-salary')}
                  style={{ ...button, padding: '3px 8px', fontSize: '11px', opacity: locked || saving ? 0.55 : 1 }}
                >
                  {saving === 'bls' ? 'Looking up…' : 'Look up BLS'}
                </button>
              </>,
            )}
            <div style={{ fontSize: '11px', color: '#64748b', padding: '2px 0' }}>{String(value('ownerMarketSource') ?? 'No market salary yet.')}</div>
          </div>

          <div>
            <div style={groupTitle}>Capital spending</div>
            {row('Normal annual capex', numberInput('normalCapex', result.capexSuggestion !== null ? money(result.capexSuggestion) : '$'))}
            <div style={{ fontSize: '11px', color: '#64748b', padding: '2px 0' }}>Blank uses {result.capexBasis.toLowerCase()}.</div>
            {row('Capex support', textInput('capexNote'))}
            <div style={{ ...groupTitle, marginTop: '8px' }}>Working capital</div>
            {row('Normal (% of revenue)', numberInput('normalWorkingCapitalPct', result.workingCapital.actualPct !== null ? pct(result.workingCapital.actualPct) : '%', undefined, 'percent'))}
            <div style={{ fontSize: '11px', color: '#64748b', padding: '2px 0' }}>Blank uses the actual level at the as-of date.</div>
            {row('Working capital support', textInput('workingCapitalNote'))}
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Normalizations</div>
            <div style={cardSubtitle}>Positive amounts add to earnings; negative amounts deduct. Owner pay is handled above.</div>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={() => setNormalizations([...normalizations, { id: newRowId(), label: '', amount: 0, note: null }])}
              style={{ ...button, marginLeft: 'auto', padding: '3px 8px', fontSize: '11px' }}
            >
              Add normalization
            </button>
          )}
        </div>
        {normalizations.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>None recorded.</div>
        ) : (
          <table style={{ width: '100%', maxWidth: '1100px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '36%' }}>Description</th>
                <th style={{ ...th, width: '130px', textAlign: 'right' }}>Amount</th>
                <th style={th}>Support</th>
                <th style={{ ...th, width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {normalizations.map((item, index) => {
                const update = (patch: Partial<Normalization>) => setNormalizations(normalizations.map((row, i) => (i === index ? { ...row, ...patch } : row)));
                return (
                  <tr key={item.id}>
                    <td style={td}>
                      <input type="text" disabled={locked} value={item.label} onChange={(event) => update({ label: event.target.value })} style={input} />
                    </td>
                    <td style={td}>
                      <NumberInput disabled={locked} value={item.amount} onChange={(next) => update({ amount: next as unknown as number })} />
                    </td>
                    <td style={td}>
                      <input type="text" disabled={locked} value={item.note ?? ''} onChange={(event) => update({ note: event.target.value })} style={input} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => setNormalizations(normalizations.filter((_, i) => i !== index))}
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
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 560px))', gap: '8px' }}>
        <div style={CARD}>
          <div style={{ marginBottom: '6px' }}>
            <div style={cardTitle}>Normalized earnings</div>
            <div style={cardSubtitle}>
              {EARNINGS_SOURCES.find((item) => item.value === result.source)?.label} · {result.periodLabel}
              {hasPending ? ' · includes unsaved changes' : ''}
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {summaryRow('Starting earnings', result.startingEarnings)}
              {result.weightedLines.map((line) => summaryRow(line.label, line.ebitda, { indent: true, muted: `weight ${line.weight}` }))}
              {summaryRow('Owner pay above (below) market', result.ownerCompAdjustment, { muted: result.ownerCompAdjustment === null ? 'enter actual pay and market salary' : undefined })}
              {preview.normalizations.map((item) => summaryRow(item.label || 'Unnamed normalization', item.amount, { indent: true }))}
              {summaryRow('Normalized EBITDA', result.normalizedEbitda, { bold: true })}
              {summaryRow('Less normal capital spending', result.normalCapex === null ? null : -result.normalCapex)}
              {summaryRow('Normalized EBITDA less capital spending', result.ebitdaLessCapex, { bold: true })}
              {summaryRow("Seller's discretionary earnings", result.sde, {
                muted: result.sde === null ? 'enter the market owner salary' : 'normalized EBITDA plus one owner at market salary',
              })}
            </tbody>
          </table>
        </div>

        <div style={CARD}>
          <div style={{ marginBottom: '6px' }}>
            <div style={cardTitle}>Working capital</div>
            <div style={cardSubtitle}>
              Receivables, inventory and other current assets less payables and other current liabilities
              {result.workingCapital.month ? ` · as of ${formatMonthKey(result.workingCapital.month)}` : ''}
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}></th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={{ ...th, textAlign: 'right' }}>% of revenue</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={td}>Trailing 12 months revenue</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(result.workingCapital.revenue)}</td>
                <td style={td}></td>
              </tr>
              <tr>
                <td style={td}>Actual working capital</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(result.workingCapital.actual)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{pct(result.workingCapital.actualPct)}</td>
              </tr>
              <tr>
                <td style={td}>Normal working capital</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(result.workingCapital.normal)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{pct(result.workingCapital.normalPct)}</td>
              </tr>
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>Excess (deficit) working capital</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(result.workingCapital.excess)}</td>
                <td style={td}></td>
              </tr>
              {dealTarget !== null && (
                <tr>
                  <td style={{ ...td, color: '#64748b' }}>Target in deal terms</td>
                  <td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{money(dealTarget)}</td>
                  <td style={td}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Check before relying on the earnings base</div>
          {result.warnings.map((warning) => (
            <div key={warning} style={{ fontSize: '12px', color: '#78350f' }}>• {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
