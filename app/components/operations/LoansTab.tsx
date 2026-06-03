'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

type LoanTerms = {
  instrumentKey: string;
  displayName?: string | null;
  loanType?: string | null;
  lender?: string | null;
  originalBalance?: number | string | null;
  loanOriginationDate?: string | null;
  currentBalance?: number | string | null;
  interestRatePct?: number | string | null;
  maturityDate?: string | null;
  amortizationTermMonths?: number | string | null;
  paymentFrequency?: string | null;
  notes?: string | null;
};

type LoanInstrument = {
  instrumentKey: string;
  accountId: string;
  displayName: string;
  source: string;
  transactionCount: number;
  firstDate: string | null;
  lastDate: string | null;
  activityTotal: number;
  debits: number;
  credits: number;
  estimatedInterestPaid: number;
  instrumentStatus?: 'active' | 'inactive' | 'unknown';
  statusReason?: string | null;
  derivedCurrentBalance?: number | null;
  derivedCurrentBalanceSource?: string | null;
  derivedCurrentBalanceAsOf?: string | null;
  monthlyActivity: Array<{
    month: string;
    activityTotal: number;
    debits: number;
    credits: number;
    transactionCount: number;
  }>;
  recentActivity: Array<{
    transDate: string;
    accountId: string;
    accountName: string;
    signedAmount: number;
    debitAmount: number;
    creditAmount: number;
    drCr?: string | null;
    description?: string | null;
    ref?: string | null;
    sourceProgram?: string | null;
  }>;
  terms?: LoanTerms | null;
};

type LoansTabProps = {
  selectedCompanyId: string;
  operationalHubSections?: Record<string, any>;
};

const emptyTerms: LoanTerms = {
  instrumentKey: '',
  displayName: '',
  loanType: '',
  lender: '',
  originalBalance: '',
  loanOriginationDate: '',
  currentBalance: '',
  interestRatePct: '',
  maturityDate: '',
  amortizationTermMonths: '',
  paymentFrequency: '',
  notes: '',
};

function formatCurrency(value: unknown): string {
  const number = Number(value || 0);
  return number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatNumber(value: unknown): string {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '0';
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-US', { timeZone: 'UTC' });
}

function formatActivityPeriod(firstDate: unknown, lastDate: unknown): string {
  if (!firstDate && !lastDate) return '-';
  const first = formatDate(firstDate);
  const last = formatDate(lastDate);
  return first === last ? first : `${first} - ${last}`;
}

function normalizeInputValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

function normalizeDateInput(value: unknown): string {
  if (!value) return '';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function classifyLoanTransaction(row: LoanInstrument['recentActivity'][number]): string {
  const accountText = `${row.accountId || ''} ${row.accountName || ''} ${row.description || ''}`.toLowerCase();
  const netAmount = Number(row.signedAmount || 0);
  if (/interest/.test(accountText) || ['39140', '76050', '76350', '83010'].includes(String(row.accountId || '').trim())) {
    return 'Interest activity';
  }
  if (netAmount < 0) return 'Borrowing / draw';
  if (netAmount > 0) return 'Principal payment';
  return 'Adjustment / reclass';
}

function buildTerms(instrument: LoanInstrument): LoanTerms {
  return {
    ...emptyTerms,
    instrumentKey: instrument.instrumentKey,
    displayName: instrument.terms?.displayName || instrument.displayName,
    loanType: normalizeInputValue(instrument.terms?.loanType),
    lender: normalizeInputValue(instrument.terms?.lender),
    originalBalance: normalizeInputValue(instrument.terms?.originalBalance),
    loanOriginationDate: normalizeDateInput(instrument.terms?.loanOriginationDate),
    currentBalance: normalizeInputValue(instrument.terms?.currentBalance),
    interestRatePct: normalizeInputValue(instrument.terms?.interestRatePct),
    maturityDate: normalizeDateInput(instrument.terms?.maturityDate),
    amortizationTermMonths: normalizeInputValue(instrument.terms?.amortizationTermMonths),
    paymentFrequency: normalizeInputValue(instrument.terms?.paymentFrequency),
    notes: normalizeInputValue(instrument.terms?.notes),
  };
}

export default function LoansTab({ selectedCompanyId, operationalHubSections }: LoansTabProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [instruments, setInstruments] = useState<LoanInstrument[]>([]);
  const [selectedInstrumentKey, setSelectedInstrumentKey] = useState<string>('');
  const [termsDraft, setTermsDraft] = useState<LoanTerms>(emptyTerms);

  const selectedInstrument = useMemo(
    () => instruments.find((instrument) => instrument.instrumentKey === selectedInstrumentKey) || instruments[0] || null,
    [instruments, selectedInstrumentKey]
  );
  const isSectionEnabled = (sectionKey: string): boolean => {
    const value = operationalHubSections?.[sectionKey];
    return value === undefined ? true : value !== false;
  };

  const loadLoans = useCallback(async (force = false) => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyId: selectedCompanyId });
      if (force) params.set('force', 'true');
      const response = await fetch(`/api/operations/loans?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to load loan data');
      }
      const nextInstruments = Array.isArray(data?.instruments) ? data.instruments : [];
      setInstruments(nextInstruments);
      setSelectedInstrumentKey((currentKey) => {
        const nextSelected =
          nextInstruments.find((instrument: LoanInstrument) => instrument.instrumentKey === currentKey) ||
          nextInstruments[0] ||
          null;
        setTermsDraft(nextSelected ? buildTerms(nextSelected) : emptyTerms);
        return nextSelected?.instrumentKey || '';
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load loan data');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    void loadLoans();
  }, [loadLoans]);

  useEffect(() => {
    if (selectedInstrument) {
      setTermsDraft(buildTerms(selectedInstrument));
    }
  }, [selectedInstrument]);

  const updateTerms = (key: keyof LoanTerms, value: string) => {
    setTermsDraft((prev) => ({ ...prev, [key]: value }));
  };

  const saveTerms = async () => {
    if (!selectedInstrument) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch('/api/operations/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          terms: {
            ...termsDraft,
            instrumentKey: selectedInstrument.instrumentKey,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to save loan terms');
      }
      setSaveMessage('Loan terms saved.');
      await loadLoans(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to save loan terms');
    } finally {
      setSaving(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '18px',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '4px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
    color: '#0f172a',
    background: '#fff',
  };
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '13px',
    color: '#0f172a',
    borderBottom: '1px solid #f1f5f9',
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => void loadLoans(true)}
          disabled={loading}
          style={{
            border: '1px solid #cbd5e1',
            background: 'white',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#334155',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ ...cardStyle, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {loading && instruments.length === 0 ? (
        <div style={{ ...cardStyle, color: '#64748b' }}>Loading loan activity...</div>
      ) : instruments.length === 0 ? (
        <div style={{ ...cardStyle, color: '#64748b' }}>
          No debt-like GL activity was detected. Enable this tab for the company after loan accounts are present in the imported ledger, or save a manual instrument once API support is expanded.
        </div>
      ) : (
        <>
          {isSectionEnabled('loansInstrumentTable') && <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#0f172a' }}>
              Loan Instruments
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Loan / Instrument Name</th>
                    <th style={thStyle}>GL Account</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Original Balance</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Principal GL Activity</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Interest</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Current Balance</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Transactions</th>
                    <th style={thStyle}>Last Transaction</th>
                    <th style={thStyle}>Maturity Date</th>
                  </tr>
                </thead>
                <tbody>
                  {instruments.map((instrument) => {
                    const selected = instrument.instrumentKey === selectedInstrument?.instrumentKey;
                    return (
                      <tr
                        key={instrument.instrumentKey}
                        onClick={() => setSelectedInstrumentKey(instrument.instrumentKey)}
                        style={{ cursor: 'pointer', background: selected ? '#eff6ff' : 'white' }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 800 }}>
                          {instrument.terms?.displayName || instrument.displayName}
                          <div style={{ marginTop: '2px', fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                            {instrument.terms?.loanType || 'Loan type not set'}
                            {instrument.terms?.lender ? ` | ${instrument.terms.lender}` : ''}
                            {instrument.instrumentStatus === 'inactive' ? ' | Inactive' : ''}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          {instrument.accountId || '-'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {instrument.terms?.originalBalance ? formatCurrency(instrument.terms.originalBalance) : '-'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{formatCurrency(instrument.activityTotal)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(instrument.estimatedInterestPaid)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {instrument.terms?.currentBalance || instrument.derivedCurrentBalance
                            ? (
                              formatCurrency(instrument.terms?.currentBalance || instrument.derivedCurrentBalance)
                            )
                            : '-'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(instrument.transactionCount)}</td>
                        <td style={tdStyle}>{formatDate(instrument.lastDate)}</td>
                        <td style={tdStyle}>{instrument.terms?.maturityDate ? formatDate(instrument.terms.maturityDate) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>}

          {selectedInstrument && isSectionEnabled('loansTermsEditor') && (
            <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>Loan Terms</h3>
                    <div style={{ marginTop: '4px', color: '#64748b', fontSize: '12px' }}>
                      Saved by company and instrument. These fields do not change ERP mapping or the chart of accounts.
                    </div>
                  </div>
                  {saveMessage && <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 700 }}>{saveMessage}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', alignItems: 'start' }}>
                  {[
                    ['displayName', 'Display Name', 'text'],
                    ['loanType', 'Loan Type', 'text'],
                    ['lender', 'Lender', 'text'],
                    ['originalBalance', 'Original Balance', 'number'],
                    ['loanOriginationDate', 'Loan Origination Date', 'date'],
                    ['currentBalance', 'Current Balance', 'number'],
                    ['interestRatePct', 'Interest Rate %', 'number'],
                    ['maturityDate', 'Maturity Date', 'date'],
                    ['amortizationTermMonths', 'Amortization Term Months', 'number'],
                    ['paymentFrequency', 'Payment Frequency', 'text'],
                  ].map(([key, label, type]) => (
                    <label key={key} style={{ display: 'block' }}>
                      <div style={labelStyle}>{label}</div>
                      <input
                        type={type}
                        step={type === 'number' ? '0.01' : undefined}
                        value={normalizeInputValue(termsDraft[key as keyof LoanTerms])}
                        onChange={(event) => updateTerms(key as keyof LoanTerms, event.target.value)}
                        style={inputStyle}
                      />
                    </label>
                  ))}
                  <label style={{ display: 'block', gridColumn: '1 / -1' }}>
                    <div style={labelStyle}>Notes</div>
                    <textarea
                      value={normalizeInputValue(termsDraft.notes)}
                      onChange={(event) => updateTerms('notes', event.target.value)}
                      rows={4}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void saveTerms()}
                  disabled={saving}
                  style={{
                    marginTop: '14px',
                    border: 'none',
                    background: '#2751d0',
                    color: 'white',
                    borderRadius: '8px',
                    padding: '9px 14px',
                    fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : 'Save Loan Terms'}
                </button>
            </div>
          )}

          {selectedInstrument && isSectionEnabled('loansRecentGlActivity') && (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#0f172a' }}>
                Recent GL Activity
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Account #</th>
                      <th style={thStyle}>Account Name</th>
                      <th style={thStyle}>Transaction Type</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInstrument.recentActivity.map((row, index) => (
                      <tr key={`${row.transDate}-${row.ref}-${index}`}>
                        <td style={tdStyle}>{formatDate(row.transDate)}</td>
                        <td style={tdStyle}>{row.accountId || '-'}</td>
                        <td style={tdStyle}>{row.accountName || selectedInstrument.displayName || '-'}</td>
                        <td style={tdStyle}>{classifyLoanTransaction(row)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{formatCurrency(row.signedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
