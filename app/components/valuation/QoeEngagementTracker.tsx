'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ACCOUNTING_SYSTEMS } from '@/lib/constants/company-options';
import { US_STATES } from '@/app/constants';

type Props = {
  companyId: string | null;
  onOpenBankStatements: () => void;
  onOpenCashProof: () => void;
};

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,.05)' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', color: '#1e293b', background: '#fff' };
const th: React.CSSProperties = { padding: '7px 8px', fontSize: '11px', fontWeight: 700, color: '#475569', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '6px 8px', fontSize: '12px', color: '#1e293b', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
const button: React.CSSProperties = { border: 0, borderRadius: '6px', padding: '7px 11px', color: '#fff', background: '#2751d0', cursor: 'pointer', fontWeight: 600, fontSize: '12px' };

const CONTACT_LABELS: Record<string, string> = {
  PRIMARY_CLIENT: 'Primary client',
  ACCOUNTING_ADMIN: 'Accounting-system administrator',
  BOOKKEEPER_OR_CPA: 'Bookkeeper / CPA',
  BANK_ADMIN: 'Bank / online-banking administrator',
  TRANSACTION_CONTACT: 'Transaction-question contact',
  OTHER: 'Other',
};

const ENGAGEMENT_TYPES = [
  'SBA 7(a) – Business Acquisition',
  'SBA 7(a) – Partial Change of Ownership / Partner Buyout',
  'SBA 7(a) – Refinance',
  'SBA 7(a) – Expansion / Working Capital',
  'SBA 504',
  'Conventional Bank Loan',
  'Buy-Side QoE (non-lender)',
  'Sell-Side QoE',
  'Other',
];

const DOCUMENT_STATUSES = ['NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'FILED', 'REVIEWED', 'NOT_NEEDED'] as const;
const BANK_STATUSES = ['IDENTIFIED', 'CONNECTION_PLANNED', 'CONNECTED', 'STATEMENTS_REQUESTED', 'COVERAGE_COMPLETE'] as const;
const statusLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const asDate = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

const LENDER_FIELDS = ['name', 'address1', 'address2', 'city', 'state', 'zip', 'country'] as const;
type LenderDraft = Record<(typeof LENDER_FIELDS)[number], string>;
const fieldLabel: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#475569' };

function LenderFields({ initial, submitLabel, disabled, onSubmit }: {
  initial: Partial<Record<(typeof LENDER_FIELDS)[number], string | null>>;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (draft: LenderDraft) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<LenderDraft>(() => Object.fromEntries(LENDER_FIELDS.map((field) => [field, initial[field] || ''])) as LenderDraft);
  const field = (key: keyof LenderDraft, label: string) => (
    <label key={key} style={fieldLabel}>
      {label}
      <input value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} style={{ ...input, marginTop: '4px' }} />
    </label>
  );
  const blocked = disabled || !draft.name.trim();
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(240px, 1.5fr) minmax(180px, 1fr)', gap: '8px' }}>
        {field('name', 'Lender name')}
        {field('address1', 'Address line 1')}
        {field('address2', 'Address line 2')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 170px 110px minmax(150px, 1fr) auto', gap: '8px', marginTop: '8px', alignItems: 'end' }}>
        {field('city', 'City')}
        <label style={fieldLabel}>
          State
          <select value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value })} style={{ ...input, marginTop: '4px', cursor: 'pointer' }}>
            <option value="">State</option>
            {draft.state && !US_STATES.some((state) => state.code === draft.state) && <option value={draft.state}>{draft.state}</option>}
            {US_STATES.filter((state) => state.code !== '').map((state) => (
              <option key={state.code} value={state.code}>{state.code} - {state.name}</option>
            ))}
          </select>
        </label>
        {field('zip', 'ZIP')}
        {field('country', 'Country')}
        <button type="button" disabled={blocked} onClick={() => void onSubmit(draft)} style={{ ...button, opacity: blocked ? 0.55 : 1 }}>
          {submitLabel}
        </button>
      </div>
    </>
  );
}

export default function QoeEngagementTracker({ companyId, onOpenBankStatements, onOpenCashProof }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(companyId));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingLender, setAddingLender] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/qoe-engagement-tracker?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to load engagement tracker');
      setData(json);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (label: string, body: Record<string, unknown>) => {
    if (!companyId) return;
    setSaving(label);
    try {
      const response = await fetch('/api/qoe-engagement-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...body }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to save engagement tracker');
      setData(json);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(null);
    }
  };

  const tracker = data?.tracker;
  const documents = useMemo(() => tracker?.documentRequirements || [], [tracker?.documentRequirements]);
  const counts = useMemo(() => ({
    required: documents.filter((document: any) => document.required).length,
    reviewed: documents.filter((document: any) => document.required && document.status === 'REVIEWED').length,
    open: documents.filter((document: any) => document.required && !['REVIEWED', 'NOT_NEEDED'].includes(document.status)).length,
  }), [documents]);

  if (!companyId) return <div style={CARD}>Select a company to use the QoE Engagement Tracker.</div>;
  if (loading && !data) return <div style={CARD}>Loading QoE Engagement Tracker…</div>;
  if (!tracker) return <div style={CARD}>{error || 'Unable to load the QoE Engagement Tracker.'}</div>;

  const saveTracker = (patch: Record<string, unknown>) => run('engagement', { action: 'update-tracker', ...tracker, ...patch, reportDueDate: asDate(patch.reportDueDate ?? tracker.reportDueDate) });
  const updateContact = (contact: any, patch: Record<string, unknown>) => run(`contact-${contact.id}`, { action: 'update-contact', ...contact, ...patch });
  const updateBank = (account: any, patch: Record<string, unknown>) => run(`bank-${account.id}`, { action: 'update-bank-account', ...account, ...patch });
  const updateDocument = (document: any, patch: Record<string, unknown>) => run(`document-${document.id}`, { action: 'update-document-requirement', ...document, ...patch });
  const updateAccountingSystem = (accountingSystem: string) => run('accounting-system', { action: 'update-accounting-system', accountingSystem });

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px' }}>QoE Engagement Tracker</h2>
            <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '13px', lineHeight: 1.5 }}>
              Internal Account Manager workspace for intake contacts, bank inventory, required evidence, and follow-up. Documents remain in the Data Room; bank connections and coverage remain in Bank Statements.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" style={{ ...button, background: '#475569' }} onClick={onOpenBankStatements}>Open Bank Statements</button>
            <button type="button" style={{ ...button, background: '#475569' }} onClick={onOpenCashProof}>Open Cash Proof</button>
          </div>
        </div>
        {error && <div style={{ color: '#b91c1c', fontSize: '12px', marginTop: '10px' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(125px, 1fr))', gap: '8px', marginTop: '14px' }}>
          {[
            ['Required documents', String(counts.required)],
            ['Reviewed', `${counts.reviewed} of ${counts.required}`],
            ['Open document items', String(counts.open)],
            ['Data Room files', String(data.dataRoom?.documentCount || 0)],
            ['Cash Proof', data.cashProof ? (data.cashProof.status === 'LOCKED' ? 'Locked' : statusLabel(data.cashProof.status)) : 'Not started'],
          ].map(([label, value]) => (
            <div key={label} style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '8px', padding: '9px 10px' }}>
              <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700 }}>{label}</div>
              <div style={{ color: '#1e293b', fontSize: '15px', fontWeight: 700, marginTop: '3px' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <section style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ order: -2, margin: '0 0 10px', color: '#1e293b', fontSize: '15px' }}>Engagement Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))', gap: '10px', order: 0 }}>
          {[
            ['Engagement type', 'engagementType', ''],
            ['Review period start', 'reviewPeriodStart', 'YYYY-MM'],
            ['Review period end', 'reviewPeriodEnd', 'YYYY-MM'],
            ['Fiscal year-end month', 'fiscalYearEndMonth', '1–12'],
            ['Report due date', 'reportDueDate', ''],
            ['Account Manager', 'accountManagerName', ''],
            ['Corelytics accountant', 'corelyticsAccountant', ''],
            ['Team lead', 'teamLeadName', ''],
            ['Loan officer', 'loanOfficerName', ''],
            ['Buyer / broker', 'buyerOrBrokerName', ''],
          ].map(([label, key, placeholder]) => (
            <label key={key} style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>
              {label}
              {key === 'engagementType' ? (
                <select
                  value={tracker.engagementType || ''}
                  onChange={(event) => void saveTracker({ engagementType: event.target.value })}
                  style={{ ...input, marginTop: '4px', cursor: 'pointer' }}
                >
                  <option value="">Select Engagement Type</option>
                  {tracker.engagementType && !ENGAGEMENT_TYPES.includes(tracker.engagementType) && <option value={tracker.engagementType}>{tracker.engagementType}</option>}
                  {ENGAGEMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              ) : key === 'accountManagerName' ? (
                <select
                  value={tracker.accountManagerUserId || ''}
                  onChange={(event) => void saveTracker({ accountManagerUserId: event.target.value })}
                  style={{ ...input, marginTop: '4px' }}
                >
                  <option value="">Select Account Manager</option>
                  {(data.accountManagers || []).map((manager: any) => (
                    <option key={manager.id} value={manager.id}>{manager.name || manager.email} ({manager.email})</option>
                  ))}
                </select>
              ) : (
                <input
                  type={key === 'reportDueDate' ? 'date' : key === 'reviewPeriodStart' || key === 'reviewPeriodEnd' ? 'month' : 'text'}
                  defaultValue={key === 'reportDueDate' ? asDate(tracker[key]) : tracker[key] || ''}
                  placeholder={placeholder}
                  onBlur={(event) => void saveTracker({ [key]: event.target.value })}
                  style={{ ...input, marginTop: '4px' }}
                />
              )}
            </label>
          ))}
        </div>
        <div style={{ order: -1, marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: '8px', flexWrap: 'wrap' }}>
            <label style={{ width: '25%', minWidth: 220, fontSize: '11px', fontWeight: 600, color: '#475569' }}>
              Lender
              <select value={tracker.lenderId || ''} onChange={(event) => { setAddingLender(false); void saveTracker({ lenderId: event.target.value }); }} style={{ ...input, marginTop: '4px' }}>
                <option value="">Select Lender</option>
                {(data.lenders || []).map((lender: any) => <option key={lender.id} value={lender.id}>{lender.name}</option>)}
              </select>
            </label>
            {!tracker.lender && <button type="button" style={button} onClick={() => setAddingLender((open) => !open)}>{addingLender ? 'Cancel' : 'Add Lender'}</button>}
          </div>
          {tracker.lender && (
            <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #dbeafe' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', marginBottom: '8px' }}>Selected Lender</div>
              <LenderFields
                key={`${tracker.lender.id}-${tracker.lender.updatedAt}`}
                initial={tracker.lender}
                submitLabel="Save"
                disabled={Boolean(saving)}
                onSubmit={(draft) => run('update-lender', { action: 'update-lender', lenderId: tracker.lender.id, ...draft })}
              />
            </div>
          )}
          {addingLender && !tracker.lender && (
            <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Add Lender to the Corelytics Directory</div>
              <LenderFields
                initial={{ country: 'United States' }}
                submitLabel="Add and Select Lender"
                disabled={Boolean(saving)}
                onSubmit={async (draft) => {
                  await run('create-lender', { action: 'create-lender', ...draft });
                  setAddingLender(false);
                }}
              />
            </div>
          )}
        </div>
      </section>

      <section style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
          <div><h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>Client and Bank Contacts</h3><div style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>Capture the people who can authorize access and explain accounting or cash activity.</div></div>
          <button type="button" style={button} disabled={Boolean(saving)} onClick={() => void run('new-contact', { action: 'create-contact' })}>Add contact</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Contact type', 'Name', 'Role', 'Email', 'Phone', 'Preferred contact', 'Notes', ''].map((label) => <th key={label} style={th}>{label}</th>)}</tr></thead>
            <tbody>
              {tracker.contacts.map((contact: any) => (
                <tr key={contact.id}>
                  <td style={td}><select value={contact.contactType} onChange={(event) => void updateContact(contact, { contactType: event.target.value })} style={input}>{Object.entries(CONTACT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  {(['name', 'role', 'email', 'phone', 'preferredContactMethod'] as const).map((field) => <td key={field} style={td}><input defaultValue={contact[field] || ''} onBlur={(event) => void updateContact(contact, { [field]: event.target.value })} style={input} /></td>)}
                  <td style={td}><textarea defaultValue={contact.notes || ''} onBlur={(event) => void updateContact(contact, { notes: event.target.value })} rows={2} style={{ ...input, resize: 'vertical', minWidth: 180 }} /></td>
                  <td style={td}><button type="button" aria-label="Remove contact" title="Remove contact" onClick={() => void run(`delete-contact-${contact.id}`, { action: 'delete-contact', id: contact.id })} style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
          <div><h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>Bank Account Inventory</h3><div style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>Intro-call inventory only. Connect banks and resolve statement coverage in Bank Statements.</div></div>
          <button type="button" style={button} disabled={Boolean(saving)} onClick={() => void run('new-bank-account', { action: 'create-bank-account' })}>Add bank account</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Institution', 'Account / type', 'Last 4', 'Legal entity', 'Purpose', 'Customer receipts?', 'Statements needed?', 'Needed from / through', 'Bank contact', 'Status', 'Notes', ''].map((label) => <th key={label} style={th}>{label}</th>)}</tr></thead>
            <tbody>
              {tracker.bankAccounts.length === 0 && <tr><td colSpan={12} style={{ ...td, color: '#64748b' }}>Add every operating, savings, payroll, merchant-settlement, trust/escrow, credit-card settlement, and recently closed business account identified during intake.</td></tr>}
              {tracker.bankAccounts.map((account: any) => (
                <tr key={account.id}>
                  <td style={td}><input defaultValue={account.institution || ''} onBlur={(event) => void updateBank(account, { institution: event.target.value })} style={input} /></td>
                  <td style={td}><input defaultValue={[account.accountName, account.accountType].filter(Boolean).join(' / ')} placeholder="Name / type" onBlur={(event) => { const [accountName, accountType] = event.target.value.split('/').map((value) => value.trim()); void updateBank(account, { accountName, accountType }); }} style={input} /></td>
                  <td style={td}><input defaultValue={account.last4 || ''} maxLength={4} onBlur={(event) => void updateBank(account, { last4: event.target.value })} style={{ ...input, width: 70 }} /></td>
                  <td style={td}><input defaultValue={account.legalEntity || ''} onBlur={(event) => void updateBank(account, { legalEntity: event.target.value })} style={input} /></td>
                  <td style={td}><input defaultValue={account.purpose || ''} placeholder="Operating, payroll…" onBlur={(event) => void updateBank(account, { purpose: event.target.value })} style={input} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={account.receivesCustomerPayments} onChange={(event) => void updateBank(account, { receivesCustomerPayments: event.target.checked })} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={account.statementsNeeded} onChange={(event) => void updateBank(account, { statementsNeeded: event.target.checked })} /></td>
                  <td style={td}><div style={{ display: 'flex', gap: 4 }}><input defaultValue={account.statementsFromMonth || ''} placeholder="YYYY-MM" onBlur={(event) => void updateBank(account, { statementsFromMonth: event.target.value })} style={{ ...input, minWidth: 76 }} /><input defaultValue={account.statementsThroughMonth || ''} placeholder="YYYY-MM" onBlur={(event) => void updateBank(account, { statementsThroughMonth: event.target.value })} style={{ ...input, minWidth: 76 }} /></div></td>
                  <td style={td}><input defaultValue={account.bankContactName || ''} onBlur={(event) => void updateBank(account, { bankContactName: event.target.value })} style={input} /></td>
                  <td style={td}><select value={account.status} onChange={(event) => void updateBank(account, { status: event.target.value })} style={input}>{BANK_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></td>
                  <td style={td}><textarea defaultValue={account.notes || ''} onBlur={(event) => void updateBank(account, { notes: event.target.value })} rows={2} style={{ ...input, resize: 'vertical', minWidth: 160 }} /></td>
                  <td style={td}><button type="button" aria-label="Remove bank account" title="Remove bank account" onClick={() => void run(`delete-bank-${account.id}`, { action: 'delete-bank-account', id: account.id })} style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
          <div><h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>Required Documents and Follow-Up</h3><div style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>The standard QoE request is preloaded. “Filed” means in the Data Room; “Reviewed” requires staff confirmation.</div></div>
          <button type="button" style={button} disabled={Boolean(saving)} onClick={() => void run('new-document', { action: 'create-document-requirement' })}>Add requirement</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Required?', 'Category / required document', 'Status', 'Owner', 'Requested', 'Due', 'Received', 'Data Room folder', 'Notes / follow-up (below)', ''].map((label) => <th key={label} style={{ ...th, ...(label === 'Owner' ? { minWidth: 170 } : {}), ...(label === 'Data Room folder' ? { minWidth: 190 } : {}) }}>{label}</th>)}</tr></thead>
            <tbody>
              {documents.map((document: any) => {
                const isAccountingSystemRequirement = document.requirement === 'Accounting-system connection or trial balance';
                if (isAccountingSystemRequirement) {
                  return (
                    <Fragment key={document.id}>
                      <tr key={document.id}>
                        <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={document.required} onChange={(event) => void updateDocument(document, { required: event.target.checked })} /></td>
                        <td style={td}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Financial records</div>
                          <select value={data.company?.accountingSystem || ''} onChange={(event) => void updateAccountingSystem(event.target.value)} style={{ ...input, minWidth: 260 }}>
                            {ACCOUNTING_SYSTEMS.map((system) => <option key={system.value} value={system.value}>{system.label}</option>)}
                          </select>
                        </td>
                        <td style={td}><select value={document.status} onChange={(event) => void updateDocument(document, { status: event.target.value })} style={input}>{DOCUMENT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></td>
                        <td style={td}><input defaultValue={document.owner || ''} onBlur={(event) => void updateDocument(document, { owner: event.target.value })} style={{ ...input, minWidth: 170 }} /></td>
                        {(['requestedDate', 'dueDate', 'receivedDate'] as const).map((field) => <td key={field} style={td}><input type="date" defaultValue={asDate(document[field])} onBlur={(event) => void updateDocument(document, { [field]: event.target.value })} style={input} /></td>)}
                        <td style={td}><input defaultValue={document.dataRoomFolder || ''} onBlur={(event) => void updateDocument(document, { dataRoomFolder: event.target.value })} style={{ ...input, minWidth: 190 }} /></td>
                        <td style={{ ...td, background: '#f8fafc' }} />
                        <td style={td}><button type="button" aria-label="Remove document requirement" title="Remove document requirement" onClick={() => void run(`delete-document-${document.id}`, { action: 'delete-document-requirement', id: document.id })} style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}>Remove</button></td>
                      </tr>
                      <tr key={`${document.id}-notes`}>
                        <td style={{ ...td, background: '#f8fafc' }} />
                        <td style={{ ...td, background: '#f8fafc', fontWeight: 700, color: '#475569' }}>Accounting system notes / follow-up</td>
                        <td colSpan={8} style={{ ...td, background: '#f8fafc' }}>
                          <textarea defaultValue={document.notes || ''} onBlur={(event) => void updateDocument(document, { notes: event.target.value })} rows={2} placeholder="Connection owner, access status, history needed, or CSV file request…" style={{ ...input, resize: 'vertical' }} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                }
                return (
                <Fragment key={document.id}>
                <tr>
                  <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={document.required} onChange={(event) => void updateDocument(document, { required: event.target.checked })} /></td>
                  <td style={td}><input defaultValue={document.category} onBlur={(event) => void updateDocument(document, { category: event.target.value })} style={{ ...input, marginBottom: 4, minWidth: 120 }} /><input defaultValue={document.requirement} onBlur={(event) => void updateDocument(document, { requirement: event.target.value })} style={{ ...input, minWidth: 260 }} /></td>
                  <td style={td}><select value={document.status} onChange={(event) => void updateDocument(document, { status: event.target.value })} style={input}>{DOCUMENT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></td>
                  <td style={td}><input defaultValue={document.owner || ''} onBlur={(event) => void updateDocument(document, { owner: event.target.value })} style={{ ...input, minWidth: 170 }} /></td>
                  {(['requestedDate', 'dueDate', 'receivedDate'] as const).map((field) => <td key={field} style={td}><input type="date" defaultValue={asDate(document[field])} onBlur={(event) => void updateDocument(document, { [field]: event.target.value })} style={input} /></td>)}
                  <td style={td}><input defaultValue={document.dataRoomFolder || ''} onBlur={(event) => void updateDocument(document, { dataRoomFolder: event.target.value })} style={{ ...input, minWidth: 190 }} /></td>
                  <td style={{ ...td, background: '#f8fafc' }} />
                  <td style={td}><button type="button" aria-label="Remove document requirement" title="Remove document requirement" onClick={() => void run(`delete-document-${document.id}`, { action: 'delete-document-requirement', id: document.id })} style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}>Remove</button></td>
                </tr>
                <tr>
                  <td style={{ ...td, background: '#f8fafc' }} />
                  <td style={{ ...td, background: '#f8fafc', fontWeight: 700, color: '#475569' }}>Notes / follow-up</td>
                  <td colSpan={8} style={{ ...td, background: '#f8fafc' }}>
                    <textarea defaultValue={document.notes || ''} onBlur={(event) => void updateDocument(document, { notes: event.target.value })} rows={2} placeholder="Missing item, owner, next action, resolution…" style={{ ...input, resize: 'vertical' }} />
                  </td>
                </tr>
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
