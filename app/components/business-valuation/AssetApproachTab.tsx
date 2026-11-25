'use client';

import { useMemo, useState } from 'react';
import { computeEarningsBase, normalizeEarningsBase } from '@/lib/business-valuation/earnings-base';
import { computeIncomeApproach, normalizeIncomeApproach } from '@/lib/business-valuation/income-approach';
import { normalizeDealTerms, type Appraisal } from '@/lib/business-valuation/deal-terms';
import {
  computeAssetApproach,
  normalizeAssetApproach,
  type AssetApproach,
  type AssetRow,
  type BalanceLineKey,
  type IdentifiedIntangible,
  type LineAdjustment,
} from '@/lib/business-valuation/asset-approach';
import { formatMonthKey } from '@/lib/business-valuation/fiscal-years';
import NumberInput from './NumberInput';
import { CARD, button, cardSubtitle, cardTitle, input, money, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const newRowId = () => globalThis.crypto?.randomUUID?.() ?? `i${Date.now()}`;
const checkboxLabel = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1e293b' } as const;

export default function AssetApproachTab({ engagement, snapshot, locked, saving, run }: Props) {
  const saved: AssetApproach = engagement.assetApproach;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const hasPending = Object.keys(pending).length > 0;

  const value = (field: keyof AssetApproach) => (field in pending ? pending[field] : saved[field]);
  const edit = (field: keyof AssetApproach, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };
  const adjustments = (value('adjustments') as Partial<Record<BalanceLineKey, LineAdjustment>>) || {};
  const editAdjustment = (key: BalanceLineKey, patch: Partial<LineAdjustment>) =>
    edit('adjustments', { ...adjustments, [key]: { amount: adjustments[key]?.amount ?? null, note: adjustments[key]?.note ?? null, ...patch } });
  const intangibles = (value('intangibles') as IdentifiedIntangible[]) || [];
  const setIntangibles = (next: IdentifiedIntangible[]) => edit('intangibles', next);

  const preview = useMemo(() => normalizeAssetApproach({ ...saved, ...pending }), [saved, pending]);
  const appraisals: Appraisal[] = useMemo(() => engagement.appraisals || [], [engagement.appraisals]);
  const incomeValue = useMemo(() => {
    const earnings = computeEarningsBase(normalizeEarningsBase(engagement.earningsBase), snapshot);
    return computeIncomeApproach(normalizeIncomeApproach(engagement.incomeApproach), earnings, {
      transactionStructure: engagement.transactionStructure,
      balanceSheet: snapshot?.trailingTwelveMonths?.balanceSheet || null,
      purchasePrice: normalizeDealTerms(engagement.dealTerms).purchasePrice,
    }).indicatedValue;
  }, [engagement.earningsBase, engagement.incomeApproach, engagement.transactionStructure, engagement.dealTerms, snapshot]);
  const result = useMemo(
    () =>
      computeAssetApproach(preview, snapshot?.trailingTwelveMonths?.balanceSheet || null, appraisals, {
        transactionStructure: engagement.transactionStructure,
        incomeValue,
      }),
    [preview, snapshot, appraisals, engagement.transactionStructure, incomeValue],
  );

  const save = async () => {
    if (await run('asset', { action: 'update-asset-approach', assetApproach: pending })) {
      setPending({});
      setJustSaved(true);
    }
  };

  const lineRow = (row: AssetRow) => (
    <tr key={row.key}>
      <td style={td}>{row.label}</td>
      <td style={{ ...td, textAlign: 'right' }}>{money(row.book)}</td>
      <td style={{ ...td, width: '130px' }}>
        {row.fromAppraisal ? (
          <div style={{ textAlign: 'right', padding: '2px 6px' }}>{money(row.adjustment)}</div>
        ) : (
          <NumberInput disabled={locked} placeholder="$0" value={adjustments[row.key]?.amount ?? ''} onChange={(next) => editAdjustment(row.key, { amount: next as unknown as number })} />
        )}
      </td>
      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{money(row.fairValue)}</td>
      <td style={{ ...td, color: '#64748b', whiteSpace: 'nowrap' }}>{row.basis}</td>
      <td style={td}>
        <input
          type="text"
          disabled={locked}
          placeholder={row.fromAppraisal ? '' : 'Support for the adjustment'}
          value={adjustments[row.key]?.note ?? ''}
          onChange={(event) => editAdjustment(row.key, { note: event.target.value })}
          style={input}
        />
      </td>
    </tr>
  );
  const totalRow = (label: string, book: number | null, fair: number | null, bold = true) => (
    <tr key={label}>
      <td style={{ ...td, fontWeight: bold ? 700 : 600 }}>{label}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: bold ? 700 : 600 }}>{money(book)}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: bold ? 700 : 600 }}>{book === null || fair === null ? '' : money(fair - book)}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: bold ? 700 : 600 }}>{money(fair)}</td>
      <td style={td} colSpan={2}></td>
    </tr>
  );
  const sectionRow = (label: string) => (
    <tr key={label}>
      <td style={{ ...td, fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '.03em', background: '#f8fafc' }} colSpan={6}>{label}</td>
    </tr>
  );

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Asset approach</div>
            <div style={cardSubtitle}>
              Adjusted net assets{result.month ? `, book balances as of ${formatMonthKey(result.month)}` : ''}. Outside appraisals come from the Deal Terms tab.
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save()}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'asset' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '6px' }}>
          <label style={{ ...checkboxLabel, cursor: locked ? 'not-allowed' : 'pointer' }}>
            <input type="checkbox" disabled={locked} checked={Boolean(value('useAppraisals'))} onChange={(event) => edit('useAppraisals', event.target.checked)} style={{ margin: 0 }} />
            Use outside appraisals for fixed assets ({appraisals.length} recorded)
          </label>
          <label style={{ ...checkboxLabel, cursor: locked ? 'not-allowed' : 'pointer' }}>
            <input type="checkbox" disabled={locked} checked={Boolean(value('realEstateOwnedByCompany'))} onChange={(event) => edit('realEstateOwnedByCompany', event.target.checked)} style={{ margin: 0 }} />
            Real estate owned by the company
          </label>
        </div>

        <table style={{ width: '100%', maxWidth: '1300px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '20%' }}>Line</th>
              <th style={{ ...th, width: '120px', textAlign: 'right' }}>Book</th>
              <th style={{ ...th, width: '130px', textAlign: 'right' }}>Adjustment</th>
              <th style={{ ...th, width: '120px', textAlign: 'right' }}>Fair value</th>
              <th style={{ ...th, width: '170px' }}>Basis</th>
              <th style={th}>Support</th>
            </tr>
          </thead>
          <tbody>
            {sectionRow('Assets')}
            {result.assets.map(lineRow)}
            {totalRow('Total assets', result.bookAssets, result.fairAssets)}
            {sectionRow('Liabilities')}
            {result.liabilities.map(lineRow)}
            {totalRow('Total liabilities', result.bookLiabilities, result.fairLiabilities)}
            {totalRow('Net tangible assets', snapshot ? result.bookAssets - result.bookLiabilities : null, result.adjustedNetTangibleAssets)}
          </tbody>
        </table>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Identified intangible assets</div>
            <div style={cardSubtitle}>Only intangibles valued separately with support, such as a franchise agreement, customer list or trade name.</div>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={() => setIntangibles([...intangibles, { id: newRowId(), label: '', amount: 0, note: null }])}
              style={{ ...button, marginLeft: 'auto', padding: '3px 8px', fontSize: '11px' }}
            >
              Add intangible
            </button>
          )}
        </div>
        {intangibles.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>None recorded.</div>
        ) : (
          <table style={{ width: '100%', maxWidth: '1100px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '32%' }}>Intangible</th>
                <th style={{ ...th, width: '130px', textAlign: 'right' }}>Value</th>
                <th style={th}>Support</th>
                <th style={{ ...th, width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {intangibles.map((item, index) => {
                const update = (patch: Partial<IdentifiedIntangible>) => setIntangibles(intangibles.map((row, i) => (i === index ? { ...row, ...patch } : row)));
                return (
                  <tr key={item.id}>
                    <td style={td}><input type="text" disabled={locked} value={item.label} onChange={(event) => update({ label: event.target.value })} style={input} /></td>
                    <td style={td}><NumberInput disabled={locked} value={item.amount} onChange={(next) => update({ amount: next as unknown as number })} /></td>
                    <td style={td}><input type="text" disabled={locked} value={item.note ?? ''} onChange={(event) => update({ note: event.target.value })} style={input} /></td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => setIntangibles(intangibles.filter((_, i) => i !== index))}
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

      <div style={{ ...CARD, maxWidth: '560px' }}>
        <div style={{ marginBottom: '6px' }}>
          <div style={cardTitle}>Indicated value</div>
          <div style={cardSubtitle}>{hasPending ? 'Includes unsaved changes' : 'Asset approach compared with the income approach'}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={td}>Adjusted net tangible assets</td><td style={{ ...td, textAlign: 'right' }}>{money(result.adjustedNetTangibleAssets)}</td></tr>
            <tr><td style={td}>Plus identified intangible assets</td><td style={{ ...td, textAlign: 'right' }}>{money(result.intangiblesTotal)}</td></tr>
            <tr><td style={{ ...td, fontWeight: 700 }}>Indicated value, asset approach</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(result.indicatedValue)}</td></tr>
            <tr><td style={{ ...td, color: '#64748b' }}>{result.comparableBasis}</td><td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{money(result.comparableNetAssets)}</td></tr>
            <tr><td style={{ ...td, color: '#64748b' }}>Indicated value, income approach</td><td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{money(incomeValue)}</td></tr>
            <tr>
              <td style={{ ...td, color: '#64748b' }}>Implied goodwill (income approach less net assets)</td>
              <td style={{ ...td, textAlign: 'right', color: result.impliedUnidentifiedIntangibles !== null && result.impliedUnidentifiedIntangibles < 0 ? '#b91c1c' : '#64748b' }}>
                {money(result.impliedUnidentifiedIntangibles)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {result.warnings.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Check before relying on the asset approach</div>
          {result.warnings.map((warning) => (
            <div key={warning} style={{ fontSize: '12px', color: '#78350f' }}>• {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
