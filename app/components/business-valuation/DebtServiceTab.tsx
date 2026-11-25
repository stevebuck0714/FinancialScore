'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { computeDebtService, normalizeDebtService, type DebtService, type ExistingLoanChoice } from '@/lib/business-valuation/debt-service';
import { computeIndications } from '@/lib/business-valuation/indications';
import { normalizeReconciliation } from '@/lib/business-valuation/reconciliation';
import NumberInput from './NumberInput';
import { CARD, button, cardSubtitle, cardTitle, formColumns, formRow, formRowLabel, groupTitle, input, money, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const textarea = { ...input, height: 'auto', resize: 'vertical' as const, fontFamily: 'inherit' };
const times = (value: number | null) => (value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}x`);
const pct = (value: number | null) => (value === null ? '—' : `${value}%`);

export default function DebtServiceTab({ engagement, snapshot, locked, saving, run }: Props) {
  const saved: DebtService = engagement.debtService;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const hasPending = Object.keys(pending).length > 0;

  const value = (field: keyof DebtService) => (field in pending ? pending[field] : saved[field]);
  const edit = (field: keyof DebtService, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };
  const pendingLoans = (pending.existingLoans as Record<string, Partial<ExistingLoanChoice>>) || {};
  const editLoan = (key: string, change: Partial<Record<keyof ExistingLoanChoice, unknown>>) =>
    edit('existingLoans', { ...pendingLoans, [key]: { ...pendingLoans[key], ...change } });

  const preview = useMemo(() => {
    const existingLoans: Record<string, object> = { ...saved.existingLoans };
    for (const [key, choice] of Object.entries((pending.existingLoans as Record<string, object>) || {})) existingLoans[key] = { ...(existingLoans[key] || {}), ...choice };
    return normalizeDebtService({ ...saved, ...pending, existingLoans });
  }, [saved, pending]);
  const { deal, appraisals, earnings, income } = useMemo(() => computeIndications(engagement, snapshot), [engagement, snapshot]);
  const concluded = normalizeReconciliation(engagement.reconciliation);
  const result = computeDebtService(preview, {
    deal,
    appraisals,
    snapshot,
    earnings,
    value: concluded.concludedValue ?? income.indicatedValue,
    valueLabel: concluded.concludedValue !== null ? 'Concluded value' : 'Income approach value',
    transactionStructure: engagement.transactionStructure,
    valuationDate: engagement.valuationDate ? String(engagement.valuationDate).slice(0, 10) : null,
  });

  const save = async () => {
    if (await run('debt-service', { action: 'update-debt-service', debtService: pending })) {
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
  const numberRow = (label: string, field: keyof DebtService, kind: 'money' | 'percent' | 'number', placeholder?: string) =>
    row(label, <NumberInput value={value(field)} onChange={(raw) => edit(field, raw)} kind={kind} disabled={locked} placeholder={placeholder} style={{ flex: 1, minWidth: 0 }} />);
  const readOnly = (label: string, text: string) => row(label, <span style={{ fontSize: '12px', color: '#1e293b' }}>{text}</span>);
  const tests = result.tests;
  const numCell = { ...td, textAlign: 'right' as const };
  const lineRow = (label: string, values: Array<number | null | undefined>, options: { bold?: boolean; format?: (v: number | null) => string } = {}) => (
    <tr>
      <td style={{ ...td, fontWeight: options.bold ? 700 : 400 }}>{label}</td>
      {values.map((amount, index) => (
        <td key={index} style={{ ...numCell, fontWeight: options.bold ? 700 : 400 }}>{(options.format || money)(amount ?? null)}</td>
      ))}
    </tr>
  );

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Financing assumptions</div>
            <div style={cardSubtitle}>Supporting analysis for the lender; not weighted into the conclusion. Save records the whole Debt Service tab.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save()}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'debt-service' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        <div style={formColumns}>
          <div>
            <div style={groupTitle}>SBA 7(a) loan</div>
            {numberRow('Down payment', 'downPaymentPct', 'percent')}
            {numberRow('Interest rate', 'sbaRatePct', 'percent', 'e.g. 10.5%')}
            {numberRow('Term (months)', 'sbaTermMonths', 'number')}
            {numberRow('Guarantee fee', 'guaranteeFeePct', 'percent', '% of loan')}
            {row(
              'Fee financed',
              <input type="checkbox" disabled={locked} checked={Boolean(value('financeGuaranteeFee'))} onChange={(event) => edit('financeGuaranteeFee', event.target.checked)} style={{ margin: 0 }} />,
            )}
          </div>
          <div>
            <div style={groupTitle}>Real estate loan and project</div>
            {numberRow('Real estate rate', 'realEstateRatePct', 'percent', 'Same as SBA loan')}
            {numberRow('Real estate term', 'realEstateTermMonths', 'number')}
            {numberRow('Working capital', 'workingCapitalFinanced', 'money', 'Financed with the loan')}
            {numberRow('Closing costs', 'closingCosts', 'money')}
            {numberRow('Required coverage', 'requiredDscr', 'number')}
          </div>
          <div>
            <div style={groupTitle}>Seller note (from Deal Terms)</div>
            {readOnly('Amount', money(deal.sellerNoteAmount))}
            {readOnly('Rate', pct(deal.sellerNoteRatePct))}
            {readOnly('Term (months)', deal.sellerNoteTermMonths === null ? '—' : String(deal.sellerNoteTermMonths))}
            {readOnly('Full standby', deal.sellerNoteStandby ? 'Yes' : 'No')}
            <textarea
              rows={2}
              disabled={locked}
              placeholder="Notes: lender term sheet, rate basis, or other assumptions."
              value={String(value('notes') ?? '')}
              onChange={(event) => edit('notes', event.target.value)}
              style={{ ...textarea, marginTop: '4px' }}
            />
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
          <div style={cardTitle}>Existing debt</div>
          <div style={cardSubtitle}>Open loans from the debt schedule in the latest snapshot. Loans that stay with the business add to debt service.</div>
        </div>
        {result.existingLoans.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>No open loans in the snapshot debt schedule.</div>
        ) : (
          <table style={{ width: '100%', maxWidth: '1000px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Loan</th>
                <th style={th}>Type</th>
                <th style={{ ...th, textAlign: 'right' }}>Balance</th>
                <th style={{ ...th, textAlign: 'right' }}>Rate</th>
                <th style={{ ...th, textAlign: 'right' }}>Months left</th>
                <th style={{ ...th, textAlign: 'right', width: '130px' }}>Annual payment</th>
                <th style={th}>Stays with business</th>
              </tr>
            </thead>
            <tbody>
              {result.existingLoans.map((loan) => (
                <tr key={loan.key}>
                  <td style={td}>
                    {loan.name}
                    {loan.lender && <span style={{ color: '#64748b' }}> · {loan.lender}</span>}
                  </td>
                  <td style={td}>{loan.type === 'LINE_OF_CREDIT' ? 'Line of credit (interest only)' : 'Term loan'}</td>
                  <td style={numCell}>{money(loan.balance)}</td>
                  <td style={numCell}>{pct(loan.ratePct)}</td>
                  <td style={numCell}>{loan.remainingMonths ?? '—'}</td>
                  <td style={{ ...td, padding: '1px 4px' }}>
                    <NumberInput
                      value={pendingLoans[loan.key] && 'annualPayment' in pendingLoans[loan.key] ? pendingLoans[loan.key].annualPayment : saved.existingLoans[loan.key]?.annualPayment ?? ''}
                      onChange={(raw) => editLoan(loan.key, { annualPayment: raw === '' ? null : raw })}
                      placeholder={loan.computedAnnualPayment === null ? 'Enter' : money(loan.computedAnnualPayment)}
                      disabled={locked}
                    />
                  </td>
                  <td style={td}>
                    <input type="checkbox" disabled={locked} checked={loan.stays} onChange={(event) => editLoan(loan.key, { stays: event.target.checked })} style={{ margin: 0 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 560px))', gap: '8px' }}>
        <div style={CARD}>
          <div style={{ ...cardTitle, marginBottom: '6px' }}>Sources and uses</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th} />
                {tests.map((test) => <th key={test.key} style={{ ...th, textAlign: 'right' }}>{test.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={3} style={{ ...td, fontSize: '11px', fontWeight: 700, background: '#f8fafc', textTransform: 'uppercase' }}>Uses</td></tr>
              {lineRow('Business (excluding real estate)', tests.map((test) => test.scenario?.uses.businessPrice))}
              {lineRow('Real estate', tests.map((test) => test.scenario?.uses.realEstate))}
              {lineRow('Working capital', tests.map((test) => test.scenario?.uses.workingCapital))}
              {lineRow('Closing costs', tests.map((test) => test.scenario?.uses.closingCosts))}
              {lineRow('SBA guarantee fee', tests.map((test) => test.scenario?.uses.guaranteeFee))}
              {lineRow('Total uses', tests.map((test) => test.scenario?.uses.total), { bold: true })}
              <tr><td colSpan={3} style={{ ...td, fontSize: '11px', fontWeight: 700, background: '#f8fafc', textTransform: 'uppercase' }}>Sources</td></tr>
              {lineRow('Buyer equity', tests.map((test) => test.scenario?.sources.buyerEquity))}
              {lineRow('Seller note', tests.map((test) => test.scenario?.sources.sellerNote))}
              {lineRow('SBA 7(a) loan, business', tests.map((test) => test.scenario?.sources.sbaLoan))}
              {lineRow('SBA loan, real estate', tests.map((test) => test.scenario?.sources.realEstateLoan))}
              {lineRow('Total sources', tests.map((test) => test.scenario?.sources.total), { bold: true })}
            </tbody>
          </table>
        </div>

        <div style={CARD}>
          <div style={{ ...cardTitle, marginBottom: '6px' }}>Debt service coverage</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th} />
                {tests.map((test) => <th key={test.key} style={{ ...th, textAlign: 'right' }}>{test.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={3} style={{ ...td, fontSize: '11px', fontWeight: 700, background: '#f8fafc', textTransform: 'uppercase' }}>Annual debt service</td></tr>
              {lineRow('SBA loan, business', tests.map((test) => test.scenario?.debtService.sbaLoan))}
              {lineRow('SBA loan, real estate', tests.map((test) => test.scenario?.debtService.realEstateLoan))}
              {lineRow('Seller note', tests.map((test) => test.scenario?.debtService.sellerNote))}
              {lineRow('Existing debt that stays', tests.map((test) => (test.scenario ? test.scenario.debtService.existing : null)))}
              {lineRow('Total debt service', tests.map((test) => test.scenario?.debtService.total), { bold: true })}
              {(['earningsBase', 'latestYear'] as const).map((key) => {
                const label = tests[0]?.coverage.find((line) => line.key === key)?.label || '';
                return [
                  <tr key={`${key}-head`}><td colSpan={3} style={{ ...td, fontSize: '11px', fontWeight: 700, background: '#f8fafc', textTransform: 'uppercase' }}>{label}</td></tr>,
                  <tr key={`${key}-cash`}>
                    <td style={td}>Cash available for debt service</td>
                    {tests.map((test) => <td key={test.key} style={numCell}>{money(test.coverage.find((line) => line.key === key)?.cashAvailable ?? null)}</td>)}
                  </tr>,
                  <tr key={`${key}-dscr`}>
                    <td style={{ ...td, fontWeight: 700 }}>Coverage (required {times(result.requiredDscr)})</td>
                    {tests.map((test) => {
                      const line = test.coverage.find((item) => item.key === key);
                      const color = line?.passes === null || line?.passes === undefined ? '#94a3b8' : line.passes ? '#15803d' : '#b91c1c';
                      return (
                        <td key={test.key} style={{ ...numCell, fontWeight: 700, color }}>
                          {times(line?.dscr ?? null)} {line?.passes === true ? 'Pass' : line?.passes === false ? 'Fail' : ''}
                        </td>
                      );
                    })}
                  </tr>,
                ];
              })}
              <tr><td colSpan={3} style={{ ...td, fontSize: '11px', fontWeight: 700, background: '#f8fafc', textTransform: 'uppercase' }}>Capacity</td></tr>
              {lineRow(`Highest price at ${times(result.requiredDscr)} on the earnings base`, tests.map((test) => test.maxSupportablePrice))}
            </tbody>
          </table>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Pre-tax coverage. The highest price keeps the same down payment, seller note, and loan terms.</div>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Debt service warnings</div>
          {result.warnings.map((warning) => (
            <div key={warning} style={{ fontSize: '12px', color: '#78350f' }}>• {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
