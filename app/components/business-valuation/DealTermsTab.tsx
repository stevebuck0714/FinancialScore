'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { formatEstDateLabel } from '@/lib/time/eastern';
import { formatMonthKey } from '@/lib/business-valuation/fiscal-years';
import {
  APPRAISAL_ASSET_TYPES,
  DEAL_DOCUMENT_TYPES,
  INCLUDED_ASSET_KEYS,
  INCLUDED_ASSET_LABELS,
  computeDealBreakdown,
  normalizeDealTerms,
  type Appraisal,
  type DealTerms,
} from '@/lib/business-valuation/deal-terms';
import NumberInput from './NumberInput';
import { CARD, button, cardSubtitle, cardTitle, fieldLabel, formColumns, formRow, formRowLabel, groupTitle, input, money, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  documents: Array<{ id: string; originalFileName: string; category: string | null }>;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const TRANSACTION_LABELS: Record<string, string> = { ASSET: 'Asset sale', STOCK: 'Stock sale' };
const EMPTY_APPRAISAL = { appraisalId: '', assetType: 'REAL_ESTATE', appraiserFirm: '', effectiveDate: '', value: '', includedInDeal: true, documentId: '', notes: '' };

export default function DealTermsTab({ engagement, snapshot, documents, locked, saving, run }: Props) {
  const saved: DealTerms = engagement.dealTerms;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const [appraisalDraft, setAppraisalDraft] = useState<typeof EMPTY_APPRAISAL>(EMPTY_APPRAISAL);
  const hasPending = Object.keys(pending).length > 0;

  const value = (field: keyof DealTerms) => (field in pending ? pending[field] : saved[field]);
  const included = useMemo(
    () => ({ ...saved.included, ...((pending.included as Record<string, boolean>) || {}) }),
    [saved.included, pending.included],
  );
  const edit = (field: string, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };
  const toggleIncluded = (key: string, next: boolean) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, included: { ...((current.included as Record<string, boolean>) || {}), [key]: next } }));
  };
  const save = async () => {
    if (await run('deal-terms', { action: 'update-deal-terms', dealTerms: pending })) {
      setPending({});
      setJustSaved(true);
    }
  };

  const previewTerms = useMemo(() => normalizeDealTerms({ ...saved, ...pending, included }), [saved, pending, included]);
  const balanceSheet = snapshot?.trailingTwelveMonths?.balanceSheet || null;
  const appraisals: Appraisal[] = useMemo(
    () => (engagement.appraisals || []).map((a: any) => ({ ...a, effectiveDate: a.effectiveDate ? String(a.effectiveDate).slice(0, 10) : null })),
    [engagement.appraisals],
  );
  const breakdown = useMemo(() => computeDealBreakdown(previewTerms, balanceSheet, appraisals), [previewTerms, balanceSheet, appraisals]);
  const documentName = (id: string | null) => documents.find((d) => d.id === id)?.originalFileName || '—';

  const row = (label: string, control: ReactNode) => (
    <label style={formRow}>
      <span style={formRowLabel}>{label}</span>
      {control}
    </label>
  );
  const numberField = (field: keyof DealTerms, label: string, placeholder = '$', kind: 'money' | 'percent' | 'number' = 'money') =>
    row(
      label,
      <NumberInput
        kind={kind}
        disabled={locked}
        placeholder={placeholder}
        value={value(field)}
        onChange={(next) => edit(field, next)}
        style={{ width: '120px' }}
      />,
    );
  const textField = (field: keyof DealTerms, label: string) =>
    row(
      label,
      <input
        type="text"
        disabled={locked}
        value={String(value(field) ?? '')}
        onChange={(event) => edit(field, event.target.value)}
        style={{ ...input, flex: 1, minWidth: 0 }}
      />,
    );

  const saveAppraisal = async () => {
    if (await run('appraisal', { action: 'save-appraisal', ...appraisalDraft })) setAppraisalDraft(EMPTY_APPRAISAL);
  };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Deal terms</div>
            <div style={cardSubtitle}>From the LOI or purchase agreement. Transaction structure is set on the Engagement tab.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save()}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'deal-terms' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div style={formColumns}>
          <div>
            <div style={groupTitle}>Price</div>
            {numberField('purchasePrice', 'Purchase price')}
            {row('Transaction structure', <span style={{ fontSize: '12px', color: '#1e293b' }}>{TRANSACTION_LABELS[engagement.transactionStructure] || engagement.transactionStructure}</span>)}
            {numberField('inventoryAmount', 'Inventory in price', 'Book value')}
            {numberField('workingCapitalTarget', 'Working capital target')}
            <div style={{ ...groupTitle, marginTop: '8px' }}>Assets included</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
              {INCLUDED_ASSET_KEYS.map((key) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#1e293b', cursor: locked ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" disabled={locked} checked={Boolean(included[key])} onChange={(event) => toggleIncluded(key, event.target.checked)} style={{ margin: 0 }} />
                  {INCLUDED_ASSET_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div style={groupTitle}>Seller note</div>
            {numberField('sellerNoteAmount', 'Amount')}
            {numberField('sellerNoteRatePct', 'Rate', '%', 'percent')}
            {numberField('sellerNoteTermMonths', 'Term (months)', '', 'number')}
            {row('Full standby', <input type="checkbox" disabled={locked} checked={Boolean(value('sellerNoteStandby'))} onChange={(event) => edit('sellerNoteStandby', event.target.checked)} style={{ margin: 0 }} />)}
            <div style={{ ...groupTitle, marginTop: '8px' }}>Assumed by buyer</div>
            {numberField('assumedLiabilities', 'Liabilities')}
            {textField('assumedLiabilitiesNote', 'Description')}
            {textField('leasesAssumedNote', 'Leases')}
          </div>

          <div>
            <div style={groupTitle}>Deal document</div>
            {row(
              'Type',
              <select disabled={locked} value={String(value('dealDocumentType') ?? '')} onChange={(event) => edit('dealDocumentType', event.target.value)} style={{ ...input, flex: 1, minWidth: 0 }}>
                <option value="">None yet</option>
                {DEAL_DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>,
            )}
            {row(
              'Date',
              <input type="date" disabled={locked} value={String(value('dealDocumentDate') ?? '')} onChange={(event) => edit('dealDocumentDate', event.target.value)} style={{ ...input, width: '140px' }} />,
            )}
            {row(
              'Data room file',
              <select disabled={locked} value={String(value('dealDocumentId') ?? '')} onChange={(event) => edit('dealDocumentId', event.target.value)} style={{ ...input, flex: 1, minWidth: 0 }}>
                <option value="">Not attached</option>
                {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.originalFileName}</option>)}
              </select>,
            )}
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ marginBottom: '6px' }}>
          <div style={cardTitle}>Outside appraisals</div>
          <div style={cardSubtitle}>Real estate and equipment appraisals replace book values in the breakdown of value.</div>
        </div>
        {appraisals.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
            <thead>
              <tr>
                <th style={th}>Asset</th>
                <th style={th}>Appraiser</th>
                <th style={th}>Effective date</th>
                <th style={{ ...th, textAlign: 'right' }}>Value</th>
                <th style={th}>In deal</th>
                <th style={th}>Report</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {appraisals.map((appraisal) => (
                <tr key={appraisal.id}>
                  <td style={td}>{APPRAISAL_ASSET_TYPES.find((type) => type.value === appraisal.assetType)?.label || appraisal.assetType}</td>
                  <td style={td}>{appraisal.appraiserFirm || '—'}</td>
                  <td style={td}>{appraisal.effectiveDate ? formatEstDateLabel(appraisal.effectiveDate) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(appraisal.value)}</td>
                  <td style={td}>{appraisal.includedInDeal ? 'Yes' : 'No'}</td>
                  <td style={td}>{documentName(appraisal.documentId)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {!locked && (
                      <>
                        <button
                          type="button"
                          onClick={() => setAppraisalDraft({
                            appraisalId: appraisal.id,
                            assetType: appraisal.assetType,
                            appraiserFirm: appraisal.appraiserFirm || '',
                            effectiveDate: appraisal.effectiveDate || '',
                            value: String(appraisal.value),
                            includedInDeal: appraisal.includedInDeal,
                            documentId: appraisal.documentId || '',
                            notes: appraisal.notes || '',
                          })}
                          style={{ border: 0, background: 'transparent', color: '#2751d0', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(saving)}
                          onClick={() => void run('appraisal', { action: 'delete-appraisal', appraisalId: appraisal.id })}
                          style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!locked && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'flex-end' }}>
            <label style={fieldLabel}>
              Asset
              <select value={appraisalDraft.assetType} onChange={(event) => setAppraisalDraft({ ...appraisalDraft, assetType: event.target.value })} style={{ ...input, width: '120px', marginTop: '2px' }}>
                {APPRAISAL_ASSET_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Appraiser
              <input type="text" value={appraisalDraft.appraiserFirm} onChange={(event) => setAppraisalDraft({ ...appraisalDraft, appraiserFirm: event.target.value })} style={{ ...input, width: '180px', marginTop: '2px' }} />
            </label>
            <label style={fieldLabel}>
              Effective date
              <input type="date" value={appraisalDraft.effectiveDate} onChange={(event) => setAppraisalDraft({ ...appraisalDraft, effectiveDate: event.target.value })} style={{ ...input, width: '130px', marginTop: '2px' }} />
            </label>
            <label style={fieldLabel}>
              Appraised value
              <NumberInput placeholder="$" value={appraisalDraft.value} onChange={(next) => setAppraisalDraft({ ...appraisalDraft, value: next })} style={{ width: '110px', marginTop: '2px', display: 'block' }} />
            </label>
            <label style={fieldLabel}>
              Report in the data room
              <select value={appraisalDraft.documentId} onChange={(event) => setAppraisalDraft({ ...appraisalDraft, documentId: event.target.value })} style={{ ...input, width: '220px', marginTop: '2px' }}>
                <option value="">Not attached</option>
                {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.originalFileName}</option>)}
              </select>
            </label>
            <label style={{ ...fieldLabel, display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '6px' }}>
              <input type="checkbox" checked={appraisalDraft.includedInDeal} onChange={(event) => setAppraisalDraft({ ...appraisalDraft, includedInDeal: event.target.checked })} />
              Included in the deal
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={Boolean(saving) || !appraisalDraft.value.trim()}
                onClick={() => void saveAppraisal()}
                style={{ ...button, opacity: saving || !appraisalDraft.value.trim() ? 0.55 : 1 }}
              >
                {saving === 'appraisal' ? 'Saving…' : appraisalDraft.appraisalId ? 'Update appraisal' : 'Add appraisal'}
              </button>
              {appraisalDraft.appraisalId && (
                <button type="button" onClick={() => setAppraisalDraft(EMPTY_APPRAISAL)} style={{ ...button, background: '#64748b' }}>Cancel</button>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 560px))', gap: '8px' }}>
        <div style={CARD}>
          <div style={{ marginBottom: '6px' }}>
            <div style={cardTitle}>Breakdown of value</div>
            <div style={cardSubtitle}>
              Purchase price {money(breakdown.purchasePrice)}
              {balanceSheet?.month ? ` · book values as of ${formatMonthKey(balanceSheet.month)}` : ''}
              {hasPending ? ' · includes unsaved changes' : ''}
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Component</th>
                <th style={th}>Basis</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={{ ...th, textAlign: 'right' }}>% of price</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.lines.map((line) => (
                <tr key={line.key}>
                  <td style={{ ...td, fontWeight: line.key === 'goodwill' ? 700 : 400 }}>{line.label}</td>
                  <td style={{ ...td, color: '#64748b' }}>{line.basis}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: line.key === 'goodwill' ? 700 : 400 }}>{money(line.amount)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {breakdown.purchasePrice ? `${((line.amount / breakdown.purchasePrice) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={CARD}>
          <div style={{ marginBottom: '6px' }}>
            <div style={cardTitle}>What the buyer receives</div>
            <div style={cardSubtitle}>Book balance sheet compared with the assets delivered in the deal.</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Asset</th>
                <th style={{ ...th, textAlign: 'right' }}>Book</th>
                <th style={th}>In deal</th>
                <th style={{ ...th, textAlign: 'right' }}>Deal value</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.buyerReceives.map((line) => (
                <tr key={line.key}>
                  <td style={td}>{line.label}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(line.bookValue)}</td>
                  <td style={{ ...td, color: line.included ? '#166534' : '#64748b' }}>{line.included ? 'Included' : 'Excluded'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(line.dealValue)}</td>
                </tr>
              ))}
              <tr>
                <td style={td}>Less liabilities assumed</td>
                <td style={td}></td>
                <td style={td}></td>
                <td style={{ ...td, textAlign: 'right' }}>{money(-breakdown.assumedLiabilities)}</td>
              </tr>
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>Net tangible assets received</td>
                <td style={td}></td>
                <td style={td}></td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(breakdown.netAssetsReceived)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {breakdown.warnings.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Check before relying on the breakdown</div>
          {breakdown.warnings.map((warning) => (
            <div key={warning} style={{ fontSize: '12px', color: '#78350f' }}>• {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
