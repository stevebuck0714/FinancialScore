// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';

interface Loan {
  id: string;
  companyId: string;
  loanName: string;
  loanIdNumber?: string;
  lenderName: string;
  loanAmount: number;
  interestRate?: number;
  termMonths?: number;
  startDate: Date | string;
  endDate?: Date | string;
  loanType: 'TERM' | 'REVOLVER' | 'BRIDGE' | 'LINE_OF_CREDIT' | 'MORTGAGE' | 'OTHER';
  status: 'ACTIVE' | 'MATURING' | 'PAID_OFF' | 'DEFAULTED' | 'INACTIVE';
  notes?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface LoansManagementProps {
  companyId: string;
  onLoanSelected?: (loan: Loan) => void;
}

type LoanDoc = {
  id: string;
  category: 'LOAN_DOCUMENTS' | 'FINANCING_DOCUMENTS' | 'LEGAL_AND_REGULATORY' | 'OTHER';
  originalFileName: string;
  extractionStatus: string;
  indexStatus?: string | null;
  createdAt: string;
};

type DocAskResponse = {
  shortAnswer: string;
  longAnswer: string;
  citedBullets: Array<{ text: string; citations: Array<{ url: string; title?: string; publishedDate?: string | null }> }>;
  howThisImpactsUs: string;
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
};

function FormRow(props: {
  label: string;
  htmlFor: string;
  required?: boolean;
  fullWidth?: boolean;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  const { label, htmlFor, required, fullWidth, alignTop, children } = props;
  return (
    <div
      style={{
        ...(fullWidth ? { gridColumn: '1 / -1' } : null),
        // Use an internal 2-col grid so the input can't overflow into adjacent
        // columns when the outer form uses a multi-column CSS grid.
        display: 'grid',
        gridTemplateColumns: '110px minmax(0, 1fr)',
        alignItems: alignTop ? 'start' : 'center',
        columnGap: '8px',
        rowGap: '6px',
        width: '100%',
        minWidth: 0,
        padding: '2px 0',
      }}
    >
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: '12px',
          fontWeight: '600',
          color: '#475569',
          lineHeight: '1.2',
          paddingTop: alignTop ? '8px' : '0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <div style={{ minWidth: 0, width: '90%', justifySelf: 'start' }}>{children}</div>
    </div>
  );
}

export default function LoansManagement({ companyId, onLoanSelected }: LoansManagementProps) {
  const money = useCompanyMoneyFormatter(companyId);
  const formatCurrency = (amount: number) => money.fmt(amount, 0);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingLoan, setIsAddingLoan] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<Loan>>({
    loanName: '',
    loanIdNumber: '',
    lenderName: '',
    loanAmount: 0,
    interestRate: 0,
    termMonths: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    loanType: 'TERM',
    status: 'ACTIVE',
    notes: '',
  });

  // Loan-doc search (Option A: only Loan Documents)
  const [loanDocs, setLoanDocs] = useState<LoanDoc[]>([]);
  const [loanDocsLoading, setLoanDocsLoading] = useState(false);
  const [loanDocsError, setLoanDocsError] = useState<string | null>(null);
  const [selectedLoanDocId, setSelectedLoanDocId] = useState<string>('');
  const [loanDocQuestion, setLoanDocQuestion] = useState<string>('');
  const [loanDocAskLoading, setLoanDocAskLoading] = useState(false);
  const [loanDocAskError, setLoanDocAskError] = useState<string | null>(null);
  const [loanDocAskResponse, setLoanDocAskResponse] = useState<DocAskResponse | null>(null);

  // Fetch loans for this company
  useEffect(() => {
    fetchLoans();
  }, [companyId]);

  // Clear edit state whenever active company changes.
  useEffect(() => {
    resetForm();
    setError(null);
  }, [companyId]);

  useEffect(() => {
    // Only load docs when the add/edit form is visible.
    if (!isAddingLoan) return;
    if (!companyId) return;

    const load = async () => {
      try {
        setLoanDocsLoading(true);
        setLoanDocsError(null);
        const res = await fetch(`/api/company-documents?companyId=${encodeURIComponent(companyId)}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Failed to load company documents');

        const docs: LoanDoc[] = Array.isArray(data?.documents) ? data.documents : [];
        const loanOnly = docs
          .filter((d) => String(d?.category || '') === 'LOAN_DOCUMENTS')
          .map((d) => ({
            id: String(d.id),
            category: d.category,
            originalFileName: String(d.originalFileName || ''),
            extractionStatus: String(d.extractionStatus || ''),
            indexStatus: d.indexStatus ? String(d.indexStatus) : null,
            createdAt: String(d.createdAt || ''),
          }));
        setLoanDocs(loanOnly);
      } catch (e: any) {
        setLoanDocsError(e?.message || 'Failed to load loan documents');
        setLoanDocs([]);
      } finally {
        setLoanDocsLoading(false);
      }
    };

    load();
  }, [companyId, isAddingLoan]);

  async function runLoanDocAsk() {
    const q = loanDocQuestion.trim();
    if (!q) return;
    if (!selectedLoanDocId) {
      setLoanDocAskError('Select a loan document first.');
      return;
    }

    try {
      setLoanDocAskLoading(true);
      setLoanDocAskError(null);
      setLoanDocAskResponse(null);

      const res = await fetch('/api/ai-analysis/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          companyName: '',
          question: q,
          mode: 'document',
          documentId: selectedLoanDocId,
          useExternalSources: false,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Document search failed');
      setLoanDocAskResponse(data as DocAskResponse);
    } catch (e: any) {
      setLoanDocAskError(e?.message || 'Document search failed');
    } finally {
      setLoanDocAskLoading(false);
    }
  }

  const fetchLoans = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/loans?companyId=${companyId}`);
      if (!response.ok) throw new Error('Failed to fetch loans');
      const data = await response.json();
      setLoans(data.loans || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching loans:', err);
      setError(err.message);
      setLoans([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingLoanId ? `/api/loans/${editingLoanId}` : '/api/loans';
      const method = editingLoanId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, companyId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || payload?.details || `Failed to ${editingLoanId ? 'update' : 'create'} loan`);
      }

      await fetchLoans();
      resetForm();
      setError(null);
    } catch (err: any) {
      console.error('Error saving loan:', err);
      setError(err.message);
    }
  };

  const handleDelete = async (loanId: string) => {
    if (!confirm('Are you sure you want to delete this loan?')) return;

    try {
      const response = await fetch(`/api/loans/${loanId}?companyId=${encodeURIComponent(companyId)}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || payload?.details || 'Failed to delete loan');
      }
      await fetchLoans();
      setError(null);
    } catch (err: any) {
      console.error('Error deleting loan:', err);
      setError(err.message);
    }
  };

  const handleEdit = (loan: Loan) => {
    const rawLoanAmount = typeof loan.loanAmount === 'string'
      ? parseFloat(loan.loanAmount.replace(/,/g, ''))
      : Number(loan.loanAmount ?? 0);
    const rawInterestRate = typeof loan.interestRate === 'string'
      ? parseFloat(loan.interestRate.replace(/,/g, ''))
      : Number(loan.interestRate ?? 0);

    setFormData({
      loanName: loan.loanName,
      loanIdNumber: loan.loanIdNumber || '',
      lenderName: loan.lenderName,
      loanAmount: Number.isFinite(rawLoanAmount) ? Math.round(rawLoanAmount) : 0,
      interestRate: Number.isFinite(rawInterestRate) ? Number(rawInterestRate.toFixed(2)) : 0,
      termMonths: loan.termMonths || 0,
      startDate: typeof loan.startDate === 'string' ? loan.startDate.split('T')[0] : new Date(loan.startDate).toISOString().split('T')[0],
      endDate: loan.endDate ? (typeof loan.endDate === 'string' ? loan.endDate.split('T')[0] : new Date(loan.endDate).toISOString().split('T')[0]) : '',
      loanType: loan.loanType,
      status: loan.status,
      notes: loan.notes || '',
    });
    setEditingLoanId(loan.id);
    setIsAddingLoan(true);
  };

  const resetForm = () => {
    setFormData({
      loanName: '',
      loanIdNumber: '',
      lenderName: '',
      loanAmount: 0,
      interestRate: 0,
      termMonths: 0,
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      loanType: 'TERM',
      status: 'ACTIVE',
      notes: '',
    });
    setEditingLoanId(null);
    setIsAddingLoan(false);
    setSelectedLoanDocId('');
    setLoanDocQuestion('');
    setLoanDocAskError(null);
    setLoanDocAskResponse(null);
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      ACTIVE: { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
      MATURING: { bg: '#fef3c7', text: '#d97706', border: '#fde047' },
      PAID_OFF: { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' },
      DEFAULTED: { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
      INACTIVE: { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
    };
    const colorSet = colors[status as keyof typeof colors] || colors.INACTIVE;
    return (
      <span style={{ 
        padding: '4px 12px', 
        borderRadius: '12px', 
        fontSize: '11px', 
        fontWeight: '600', 
        background: colorSet.bg,
        color: colorSet.text,
        border: `1px solid ${colorSet.border}`,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return <div className="p-4 text-center">Loading loans...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '16px' }}>
        <button
          onClick={() => setIsAddingLoan(!isAddingLoan)}
          style={{ padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
        >
          {isAddingLoan ? '✕ Cancel' : '+ Add Loan'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px', background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '4px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Add/Edit Form */}
      {isAddingLoan && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '16px' }}>
          <div style={{ background: 'white', borderRadius: '6px', padding: '10px', border: '2px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>
              {editingLoanId ? 'Edit Loan' : 'Add New Loan'}
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '6px 10px' }}>
              <FormRow label="Loan Name" htmlFor="loanName" required>
                <input
                  id="loanName"
                  type="text"
                  required
                  value={formData.loanName}
                  onChange={(e) => setFormData({ ...formData, loanName: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                  placeholder="e.g., Equipment Finance Loan"
                />
              </FormRow>

              <FormRow label="Loan ID Number" htmlFor="loanIdNumber">
                <input
                  id="loanIdNumber"
                  type="text"
                  value={formData.loanIdNumber}
                  onChange={(e) => setFormData({ ...formData, loanIdNumber: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                  placeholder="e.g., 12345-ABC"
                />
              </FormRow>

              <FormRow label="Lender Name" htmlFor="lenderName">
                <input
                  id="lenderName"
                  type="text"
                  value={formData.lenderName}
                  onChange={(e) => setFormData({ ...formData, lenderName: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                  placeholder="e.g., Wells Fargo"
                />
              </FormRow>

              <FormRow label="Loan Amount" htmlFor="loanAmount" required>
                <input
                  id="loanAmount"
                  type="text"
                  inputMode="numeric"
                  required
                  value={money.fmt(Math.round(Number(formData.loanAmount || 0)), 0)}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/[^\d]/g, '');
                    setFormData({ ...formData, loanAmount: Math.round(parseFloat(digitsOnly) || 0) });
                  }}
                  onBlur={() => setFormData({ ...formData, loanAmount: Math.round(Number(formData.loanAmount || 0)) })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                  placeholder="$0"
                />
              </FormRow>

              <FormRow label="Loan Type" htmlFor="loanType" required>
                <select
                  id="loanType"
                  required
                  value={formData.loanType}
                  onChange={(e) => setFormData({ ...formData, loanType: e.target.value as any })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: 'white' }}
                >
                  <option value="TERM">Term Loan</option>
                  <option value="REVOLVER">Revolver</option>
                  <option value="BRIDGE">Bridge Loan</option>
                  <option value="LINE_OF_CREDIT">Line of Credit</option>
                  <option value="MORTGAGE">Mortgage</option>
                  <option value="OTHER">Other</option>
                </select>
              </FormRow>

              <FormRow label="Interest Rate (%)" htmlFor="interestRate">
                <input
                  id="interestRate"
                  type="text"
                  value={Number(formData.interestRate || 0).toFixed(2)}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                    setFormData({ ...formData, interestRate: parseFloat(cleaned) || 0 });
                  }}
                  onBlur={() => setFormData({ ...formData, interestRate: Number(Number(formData.interestRate || 0).toFixed(2)) })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                  placeholder="0.00"
                />
              </FormRow>

              <FormRow label="Term (Months)" htmlFor="termMonths">
                <input
                  id="termMonths"
                  type="number"
                  value={formData.termMonths}
                  onChange={(e) => setFormData({ ...formData, termMonths: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                  placeholder="0"
                />
              </FormRow>

              <FormRow label="Start Date" htmlFor="startDate">
                <input
                  id="startDate"
                  type="date"
                  value={formData.startDate as string}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                />
              </FormRow>

              <FormRow label="End Date (Maturity)" htmlFor="endDate">
                <input
                  id="endDate"
                  type="date"
                  value={formData.endDate as string}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                />
              </FormRow>

              <FormRow label="Status" htmlFor="status">
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: 'white' }}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="MATURING">Maturing</option>
                  <option value="PAID_OFF">Paid Off</option>
                  <option value="DEFAULTED">Defaulted</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </FormRow>

              <FormRow label="Notes" htmlFor="notes" fullWidth alignTop>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}
                  placeholder="Any additional notes about this loan..."
                />
              </FormRow>

              <div style={{ gridColumn: '1 / -1', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Search Loan Documents</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Pick a loan document uploaded in Documents, then ask a question (e.g., “list financial covenants”).
                    </div>
                  </div>
                </div>

                {loanDocsError && (
                  <div style={{ marginBottom: '10px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', fontSize: '13px' }}>
                    {loanDocsError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '110px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>Loan doc</div>
                      <select
                        value={selectedLoanDocId}
                        onChange={(e) => setSelectedLoanDocId(e.target.value)}
                        style={{ width: '420px', maxWidth: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', background: 'white' }}
                        disabled={loanDocsLoading}
                      >
                        <option value="">{loanDocsLoading ? 'Loading…' : loanDocs.length ? 'Select a loan document…' : 'No loan documents found'}</option>
                        {loanDocs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.originalFileName}
                          </option>
                        ))}
                      </select>
                      {selectedLoanDocId && (
                        <button
                          type="button"
                          onClick={() => window.open(`/api/company-documents/${selectedLoanDocId}/open`, '_blank', 'noreferrer')}
                          style={{
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            color: '#0f172a',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                          }}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap' }}>
                    <input
                      value={loanDocQuestion}
                      onChange={(e) => setLoanDocQuestion(e.target.value)}
                      placeholder="Ask about covenants in the selected loan document…"
                      style={{
                        flex: '1 1 520px',
                        minWidth: '320px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        outline: 'none',
                        fontSize: '14px',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          runLoanDocAsk();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={runLoanDocAsk}
                      disabled={loanDocAskLoading || !loanDocQuestion.trim() || !selectedLoanDocId}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: loanDocAskLoading ? '#94a3b8' : '#0ea5e9',
                        color: 'white',
                        fontWeight: '800',
                        cursor: loanDocAskLoading ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title="Run (Ctrl/Cmd+Enter)"
                    >
                      {loanDocAskLoading ? 'Searching…' : 'Search Document'}
                    </button>
                  </div>

                  {loanDocAskError && (
                    <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '10px', fontSize: '13px' }}>
                      {loanDocAskError}
                    </div>
                  )}

                  {loanDocAskResponse && (
                    <div style={{ padding: '12px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>Answer</div>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#0f172a', fontSize: '13px' }}>
                        {loanDocAskResponse.shortAnswer}
                      </div>
                      {Array.isArray(loanDocAskResponse.citedBullets) && loanDocAskResponse.citedBullets.length > 0 && (
                        <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                          {loanDocAskResponse.citedBullets.slice(0, 6).map((b, idx) => (
                            <div key={idx} style={{ padding: '8px 10px', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                              <div style={{ color: '#0f172a', lineHeight: '1.55', fontSize: '13px' }}>• {b.text}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={resetForm}
                style={{ padding: '8px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontWeight: '500', color: '#64748b', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{ padding: '8px 16px', background: '#667eea', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: '500', color: 'white', cursor: 'pointer' }}
              >
                {editingLoanId ? 'Update Loan' : 'Create Loan'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Loans List */}
      {loans.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>No loans found</p>
          <p style={{ fontSize: '14px' }}>Click "Add Loan" to create your first loan</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {loans.map((loan) => (
            <div
              key={loan.id}
              style={{ background: 'white', borderRadius: '6px', padding: '6px 8px', border: '2px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', cursor: 'pointer' }}
              onClick={() => onLoanSelected && onLoanSelected(loan)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '6px' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '2px', lineHeight: 1.2 }}>{loan.loanName}</h3>
                  {loan.loanIdNumber && (
                    <p style={{ fontSize: '12px', color: '#64748b' }}>ID: {loan.loanIdNumber}</p>
                  )}
                </div>
                {getStatusBadge(loan.status)}
              </div>

              <div style={{ overflowX: 'auto', marginBottom: loan.notes ? '6px' : '0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(110px, 1fr))', gap: '6px', minWidth: '680px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Lender</p>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{loan.lenderName}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Amount</p>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{formatCurrency(loan.loanAmount)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Type</p>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{loan.loanType.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Rate</p>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>
                      {typeof loan.interestRate === 'number' ? `${loan.interestRate.toFixed(2)}%` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Start Date</p>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{formatDate(loan.startDate)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Maturity</p>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{loan.endDate ? formatDate(loan.endDate) : 'N/A'}</p>
                  </div>
                </div>
              </div>

              {loan.notes && (
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', borderTop: '1px solid #e5e7eb', paddingTop: '6px' }}>{loan.notes}</p>
              )}

              <div style={{ display: 'flex', gap: '6px', paddingTop: '6px', borderTop: '1px solid #e5e7eb' }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleEdit(loan)}
                  style={{ padding: '5px 10px', fontSize: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(loan.id)}
                  style={{ padding: '5px 10px', fontSize: '12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Delete
                </button>
                <button
                  onClick={() => onLoanSelected && onLoanSelected(loan)}
                  style={{ padding: '5px 10px', fontSize: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', marginLeft: 'auto' }}
                >
                  View Covenants
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

