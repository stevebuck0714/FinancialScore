'use client';

import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDate, formatDateRange, getCurrentMonthRange } from '@/lib/billing/billingHelpers';

interface ConsultantPayable {
  id: string;
  consultant: {
    id: string;
    fullName: string;
    companyName: string;
    revenueSharePercentage: number;
    paymentMethod?: string;
  };
  periodStart: string;
  periodEnd: string;
  totalCompanyRevenue: number;
  revenueSharePercentage: number;
  payableAmount: number;
  platformAmount: number;
  status: string;
  paidDate?: string;
  paymentMethod?: string;
  paymentReference?: string;
}

export default function ConsultantPayablesTab() {
  const [payables, setPayables] = useState<ConsultantPayable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchPayables();
  }, [statusFilter]);

  const fetchPayables = async () => {
    try {
      setIsLoading(true);
      const url = statusFilter === 'all' 
        ? '/api/consultant-payables'
        : `/api/consultant-payables?status=${statusFilter}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch payables');
      const data = await response.json();
      setPayables(data.payables);
    } catch (err) {
      console.error('Error fetching payables:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateMonthlyPayables = async () => {
    if (!confirm('Generate payables for all consultants for the current month?')) {
      return;
    }

    try {
      setIsGenerating(true);
      const { start, end } = getCurrentMonthRange();
      
      const response = await fetch('/api/consultant-payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: start.toISOString(),
          periodEnd: end.toISOString()
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate payables');
      const data = await response.json();
      alert(`Successfully generated ${data.payablesCreated} payable(s)`);
      fetchPayables();
    } catch (err) {
      alert('Error generating payables');
    } finally {
      setIsGenerating(false);
    }
  };

  const markAsPaid = async (payableId: string) => {
    const paymentMethod = prompt('Payment method (check, ACH, wire, etc.):');
    if (!paymentMethod) return;
    
    const paymentReference = prompt('Payment reference (check #, transaction ID, etc.):');

    try {
      const response = await fetch(`/api/consultant-payables/${payableId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paymentMethod,
          paymentReference
        })
      });
      
      if (!response.ok) throw new Error('Failed to update payable');
      fetchPayables();
    } catch (err) {
      alert('Error updating payable');
    }
  };

  return (
    <div>
      {/* Actions and Filters */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        padding: '20px', 
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginRight: '8px' }}>Status:</span>
            {['all', 'pending', 'paid', 'on_hold'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: '6px 16px',
                  marginRight: '8px',
                  background: statusFilter === status ? '#667eea' : '#f3f4f6',
                  color: statusFilter === status ? 'white' : '#64748b',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {status === 'all' ? 'All' : status.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={generateMonthlyPayables}
            disabled={isGenerating}
            style={{
              padding: '10px 20px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isGenerating ? 'wait' : 'pointer',
              opacity: isGenerating ? 0.6 : 1
            }}
          >
            {isGenerating ? 'Generating...' : '📊 Generate Current Month Payables'}
          </button>
        </div>
      </div>

      {/* Payables Table */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          Loading payables...
        </div>
      ) : payables.length === 0 ? (
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          padding: '40px', 
          textAlign: 'center',
          color: '#64748b'
        }}>
          No consultant payables found. Click "Generate Current Month Payables" to create them.
        </div>
      ) : (
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Consultant</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Period</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Total Revenue</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Share %</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Payable Amount</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Platform Amount</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payables.map((payable) => (
                <tr key={payable.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '600' }}>
                    <div>{payable.consultant.fullName}</div>
                    {payable.consultant.companyName && (
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '400' }}>{payable.consultant.companyName}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                    {formatDateRange(payable.periodStart, payable.periodEnd)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '600' }}>
                    {formatCurrency(payable.totalCompanyRevenue)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                    {payable.revenueSharePercentage}%
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#ef4444', fontWeight: '700' }}>
                    {formatCurrency(payable.payableAmount)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#10b981', fontWeight: '700' }}>
                    {formatCurrency(payable.platformAmount)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      background: payable.status === 'paid' ? '#dcfce720' : 
                                 payable.status === 'pending' ? '#fef3c720' : '#f1f5f9',
                      color: payable.status === 'paid' ? '#16a34a' : 
                            payable.status === 'pending' ? '#ca8a04' : '#64748b'
                    }}>
                      {payable.status.replace('_', ' ')}
                    </span>
                    {payable.paidDate && (
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        Paid: {formatDate(payable.paidDate)}
                      </div>
                    )}
                    {payable.paymentMethod && (
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {payable.paymentMethod}{payable.paymentReference ? ` #${payable.paymentReference}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {payable.status === 'pending' && (
                      <button
                        onClick={() => markAsPaid(payable.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={4} style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>
                  Totals
                </td>
                <td style={{ padding: '12px 16px', fontSize: '15px', fontWeight: '700', color: '#ef4444' }}>
                  {formatCurrency(payables.reduce((sum, p) => sum + p.payableAmount, 0))}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '15px', fontWeight: '700', color: '#10b981' }}>
                  {formatCurrency(payables.reduce((sum, p) => sum + p.platformAmount, 0))}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

