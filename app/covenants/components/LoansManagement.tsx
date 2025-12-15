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
      ACTIVE: 'bg-green-100 text-green-800',
      MATURING: 'bg-yellow-100 text-yellow-800',
      PAID_OFF: 'bg-blue-100 text-blue-800',
      DEFAULTED: 'bg-red-100 text-red-800',
      INACTIVE: 'bg-gray-100 text-gray-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || colors.INACTIVE}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return <div className="p-4 text-center">Loading loans...</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Loan Management</h2>
        <button
          onClick={() => setIsAddingLoan(!isAddingLoan)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {isAddingLoan ? '✕ Cancel' : '+ Add Loan'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Add/Edit Form */}
      {isAddingLoan && (
        <form onSubmit={handleSubmit} className="mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4">{editingLoanId ? 'Edit Loan' : 'Add New Loan'}</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Name *</label>
              <input
                type="text"
                required
                value={formData.loanName}
                onChange={(e) => setFormData({ ...formData, loanName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Equipment Finance Loan"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan ID Number</label>
              <input
                type="text"
                value={formData.loanIdNumber}
                onChange={(e) => setFormData({ ...formData, loanIdNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 12345-ABC"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lender Name *</label>
              <input
                type="text"
                required
                value={formData.lenderName}
                onChange={(e) => setFormData({ ...formData, lenderName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Wells Fargo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Amount *</label>
              <input
                type="number"
                required
                value={formData.loanAmount}
                onChange={(e) => setFormData({ ...formData, loanAmount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interest Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={formData.interestRate}
                onChange={(e) => setFormData({ ...formData, interestRate: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Term (Months)</label>
              <input
                type="number"
                value={formData.termMonths}
                onChange={(e) => setFormData({ ...formData, termMonths: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={formData.startDate as string}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Maturity)</label>
              <input
                type="date"
                value={formData.endDate as string}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Type *</label>
              <select
                required
                value={formData.loanType}
                onChange={(e) => setFormData({ ...formData, loanType: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
              <select
                required
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="ACTIVE">Active</option>
                <option value="MATURING">Maturing</option>
                <option value="PAID_OFF">Paid Off</option>
                <option value="DEFAULTED">Defaulted</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Any additional notes about this loan..."
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              {editingLoanId ? 'Update Loan' : 'Create Loan'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Loans List */}
      {loans.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No loans found</p>
          <p className="text-sm">Click "Add Loan" to create your first loan</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {loans.map((loan) => (
            <div
              key={loan.id}
              className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer"
              onClick={() => onLoanSelected && onLoanSelected(loan)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-800">{loan.loanName}</h3>
                  {loan.loanIdNumber && (
                    <p className="text-sm text-gray-500">ID: {loan.loanIdNumber}</p>
                  )}
                </div>
                {getStatusBadge(loan.status)}
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Lender</p>
                  <p className="text-sm font-medium text-gray-800">{loan.lenderName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Amount</p>
                  <p className="text-sm font-medium text-gray-800">{formatCurrency(loan.loanAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Type</p>
                  <p className="text-sm font-medium text-gray-800">{loan.loanType.replace('_', ' ')}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                {loan.interestRate && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">Rate</p>
                    <p className="text-sm font-medium text-gray-800">{loan.interestRate}%</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Start Date</p>
                  <p className="text-sm font-medium text-gray-800">{formatDate(loan.startDate)}</p>
                </div>
                {loan.endDate && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">Maturity</p>
                    <p className="text-sm font-medium text-gray-800">{formatDate(loan.endDate)}</p>
                  </div>
                )}
              </div>

              {loan.notes && (
                <p className="text-sm text-gray-600 mb-4">{loan.notes}</p>
              )}

              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleEdit(loan)}
                  className="px-4 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(loan.id)}
                  className="px-4 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                >
                  Delete
                </button>
                <button
                  onClick={() => onLoanSelected && onLoanSelected(loan)}
                  className="px-4 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition"
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

