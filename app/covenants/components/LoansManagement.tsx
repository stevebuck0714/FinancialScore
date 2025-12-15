'use client';

import React, { useState, useEffect } from 'react';

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

export default function LoansManagement({ companyId, onLoanSelected }: LoansManagementProps) {
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

  // Fetch loans for this company
  useEffect(() => {
    fetchLoans();
  }, [companyId]);

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

      if (!response.ok) throw new Error(`Failed to ${editingLoanId ? 'update' : 'create'} loan`);

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
      const response = await fetch(`/api/loans/${loanId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete loan');
      await fetchLoans();
      setError(null);
    } catch (err: any) {
      console.error('Error deleting loan:', err);
      setError(err.message);
    }
  };

  const handleEdit = (loan: Loan) => {
    setFormData({
      loanName: loan.loanName,
      loanIdNumber: loan.loanIdNumber || '',
      lenderName: loan.lenderName,
      loanAmount: loan.loanAmount,
      interestRate: loan.interestRate || 0,
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
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>Loan Management</h2>
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
        <form onSubmit={handleSubmit} style={{ marginBottom: '24px' }}>
          <div style={{ background: 'white', borderRadius: '6px', padding: '20px', border: '2px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
              {editingLoanId ? 'Edit Loan' : 'Add New Loan'}
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Loan Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.loanName}
                  onChange={(e) => setFormData({ ...formData, loanName: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                  placeholder="e.g., Equipment Finance Loan"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Loan ID Number
                </label>
                <input
                  type="text"
                  value={formData.loanIdNumber}
                  onChange={(e) => setFormData({ ...formData, loanIdNumber: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                  placeholder="e.g., 12345-ABC"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Lender Name
                </label>
                <input
                  type="text"
                  value={formData.lenderName}
                  onChange={(e) => setFormData({ ...formData, lenderName: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                  placeholder="e.g., Wells Fargo"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Loan Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.loanAmount}
                  onChange={(e) => setFormData({ ...formData, loanAmount: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.interestRate}
                  onChange={(e) => setFormData({ ...formData, interestRate: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Term (Months)
                </label>
                <input
                  type="number"
                  value={formData.termMonths}
                  onChange={(e) => setFormData({ ...formData, termMonths: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                  placeholder="0"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={formData.startDate as string}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  End Date (Maturity)
                </label>
                <input
                  type="date"
                  value={formData.endDate as string}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Loan Type
                </label>
                <select
                  value={formData.loanType}
                  onChange={(e) => setFormData({ ...formData, loanType: e.target.value as any })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', background: 'white' }}
                >
                  <option value="TERM">Term Loan</option>
                  <option value="REVOLVER">Revolver</option>
                  <option value="BRIDGE">Bridge Loan</option>
                  <option value="LINE_OF_CREDIT">Line of Credit</option>
                  <option value="MORTGAGE">Mortgage</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', background: 'white' }}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="MATURING">Maturing</option>
                  <option value="PAID_OFF">Paid Off</option>
                  <option value="DEFAULTED">Defaulted</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '6px' }}>
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', resize: 'vertical' }}
                  placeholder="Any additional notes about this loan..."
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
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
              style={{ background: 'white', borderRadius: '6px', padding: '16px', border: '2px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', cursor: 'pointer' }}
              onClick={() => onLoanSelected && onLoanSelected(loan)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{loan.loanName}</h3>
                  {loan.loanIdNumber && (
                    <p style={{ fontSize: '12px', color: '#64748b' }}>ID: {loan.loanIdNumber}</p>
                  )}
                </div>
                {getStatusBadge(loan.status)}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Lender</p>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{loan.lenderName}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Amount</p>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{formatCurrency(loan.loanAmount)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Type</p>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{loan.loanType.replace('_', ' ')}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: loan.notes ? '12px' : '0' }}>
                {loan.interestRate && (
                  <div>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Rate</p>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{loan.interestRate}%</p>
                  </div>
                )}
                <div>
                  <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Start Date</p>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{formatDate(loan.startDate)}</p>
                </div>
                {loan.endDate && (
                  <div>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Maturity</p>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{formatDate(loan.endDate)}</p>
                  </div>
                )}
              </div>

              {loan.notes && (
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>{loan.notes}</p>
              )}

              <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleEdit(loan)}
                  style={{ padding: '6px 12px', fontSize: '13px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(loan.id)}
                  style={{ padding: '6px 12px', fontSize: '13px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Delete
                </button>
                <button
                  onClick={() => onLoanSelected && onLoanSelected(loan)}
                  style={{ padding: '6px 12px', fontSize: '13px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', marginLeft: 'auto' }}
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

