'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ALL_ASSET_SIZES,
  ASSET_SIZE_BANDS,
  BENCHMARK_GROUPS,
  BENCHMARK_METRICS,
  computeBenchmarks,
  formatBenchmarkDifference,
  formatBenchmarkValue,
  type Benchmarking,
  type IndustryTable,
} from '@/lib/business-valuation/benchmarking';
import { CARD, button, cardSubtitle, cardTitle, formColumns, formRow, formRowLabel, groupTitle, input, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  context: { companyIndustryCode: string | null; defaultSizeBand: string; industryTable: IndustryTable } | null;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const textarea = { ...input, height: 'auto', resize: 'vertical' as const, fontFamily: 'inherit' };
const ASSESSMENT_COLORS: Record<string, string> = { Better: '#15803d', Worse: '#b91c1c', 'In line': '#475569' };
const NEUTRAL_METRICS = BENCHMARK_METRICS.filter((metric) => metric.higherIsBetter === null).map((metric) => metric.label.toLowerCase()).join(', ');

export default function BenchmarkingTab({ engagement, snapshot, context, locked, saving, run }: Props) {
  const saved: Benchmarking = engagement.benchmarking;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const hasPending = Object.keys(pending).length > 0;

  const value = (field: keyof Benchmarking) => (field in pending ? pending[field] : saved[field]);
  const edit = (field: keyof Benchmarking, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };
  const table = context?.industryTable || null;
  const result = useMemo(() => computeBenchmarks(snapshot, table), [snapshot, table]);
  const sourceChanged = 'industryCode' in pending || 'sizeBand' in pending;

  const save = async () => {
    if (await run('benchmarking', { action: 'update-benchmarking', benchmarking: pending })) {
      setPending({});
      setJustSaved(true);
    }
  };

  const row = (label: string, control: ReactNode) => (
    <label style={formRow}>
      <span style={formRowLabel}>{label}</span>
      {control}
    </label>
  );
  const textInput = (field: keyof Benchmarking, placeholder = '') => (
    <input type="text" disabled={locked} placeholder={placeholder} value={String(value(field) ?? '')} onChange={(event) => edit(field, event.target.value)} style={{ ...input, flex: 1, minWidth: 0 }} />
  );
  const columnCount = result.years.length + 4;

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Benchmark sources</div>
            <div style={cardSubtitle}>The company is compared with the Corelytics industry table. Save records the whole Benchmarking tab.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save()}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'benchmarking' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        <div style={formColumns}>
          <div>
            <div style={groupTitle}>Corelytics industry table</div>
            {row('NAICS code', textInput('industryCode', context?.companyIndustryCode ? `${context.companyIndustryCode} (company profile)` : 'Not set in the company profile'))}
            {row(
              'Size band',
              <select disabled={locked} value={String(value('sizeBand') ?? '')} onChange={(event) => edit('sizeBand', event.target.value || null)} style={{ ...input, flex: 1, minWidth: 0 }}>
                <option value="">{`From total assets (${context?.defaultSizeBand || ALL_ASSET_SIZES})`}</option>
                {ASSET_SIZE_BANDS.map((band) => <option key={band} value={band}>{band}</option>)}
                <option value={ALL_ASSET_SIZES}>{ALL_ASSET_SIZES}</option>
              </select>,
            )}
            {row(
              'Matched',
              <span style={{ fontSize: '12px', color: table ? '#1e293b' : '#b45309' }}>
                {sourceChanged ? 'Save to load the new code or band' : table ? `${table.industryId} ${table.industryName}, ${table.sizeBand}` : 'No match'}
              </span>,
            )}
          </div>
          <div>
            <div style={groupTitle}>Notes</div>
            <textarea
              rows={3}
              disabled={locked}
              placeholder="Why these benchmarks fit, and any adjustments to comparability."
              value={String(value('notes') ?? '')}
              onChange={(event) => edit('notes', event.target.value)}
              style={{ ...textarea, marginTop: '4px' }}
            />
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
          <div style={cardTitle}>Company compared with industry</div>
          <div style={cardSubtitle}>Complete fiscal years from the latest snapshot. Difference and assessment compare the latest year with the benchmark used.</div>
        </div>
        <table style={{ width: '100%', maxWidth: '1200px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Metric</th>
              {result.years.map((year) => <th key={year.key} style={{ ...th, textAlign: 'right' }}>{year.label}</th>)}
              <th style={{ ...th, textAlign: 'right' }}>Industry table</th>
              <th style={{ ...th, textAlign: 'right' }}>Difference</th>
              <th style={th}>Assessment</th>
            </tr>
          </thead>
          <tbody>
            {BENCHMARK_GROUPS.flatMap((group) => [
              <tr key={group.key}>
                <td colSpan={columnCount} style={{ ...td, fontSize: '11px', fontWeight: 700, color: '#0f172a', background: '#f8fafc', textTransform: 'uppercase' }}>{group.label}</td>
              </tr>,
              ...result.rows
                .filter((item) => item.group === group.key)
                .map((item) => (
                  <tr key={item.key}>
                    <td style={td}>{item.label}</td>
                    {item.company.map((amount, index) => (
                      <td key={result.years[index].key} style={{ ...td, textAlign: 'right', fontWeight: index === 0 ? 600 : 400 }}>{formatBenchmarkValue(amount, item.unit)}</td>
                    ))}
                    <td style={{ ...td, textAlign: 'right' }}>
                      {formatBenchmarkValue(item.table, item.unit)}
                      {item.tableUsedAllSizes && item.table !== null ? '*' : ''}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{formatBenchmarkDifference(item.difference, item.unit)}</td>
                    <td style={{ ...td, color: item.assessment ? ASSESSMENT_COLORS[item.assessment] : '#94a3b8', fontWeight: 600 }}>{item.assessment || '—'}</td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
          Industry table figures are 5-year values. * All asset sizes, because the size band has no figure. No better or worse direction for: {NEUTRAL_METRICS}.
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Benchmarking warnings</div>
          {result.warnings.map((warning) => (
            <div key={warning} style={{ fontSize: '12px', color: '#78350f' }}>• {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
