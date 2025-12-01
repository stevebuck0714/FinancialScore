'use client';

import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDate, getStatusColor, getStatusText } from '@/lib/billing/billingHelpers';

interface RevenueRecord {
  id: string;
  transactionId: string;
  company: { id: string; name: string };
  consultant: { id: string; fullName: string; revenueSharePercentage: number } | null;
  amount: number;
  paymentStatus: string;
  paymentDate: string;
  subscriptionPlan: string;
  billingPeriodStart: string;
}

export default function RevenueRecordsTab() {
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'consultant', 'direct'

  useEffect(() => {
    fetchRecords();
  }, [statusFilter, typeFilter]);

  const fetchRecords = async () => {
    try {
      setIsLoading(true);
      let url = '/api/revenue-records?';
      if (statusFilter !== 'all') {
        url += `status=${statusFilter}&`;
      }
      if (typeFilter !== 'all') {
        url += `type=${typeFilter}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch revenue records');
      const data = await response.json();
      setRecords(data.records);
    } catch (err) {
      console.error('Error fetching revenue records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateRecordStatus = async (recordId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/revenue-records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: newStatus })
      });
      if (!response.ok) throw new Error('Failed to update record');
      fetchRecords();
    } catch (err) {
      alert('Error updating record');
    }
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        padding: '20px', 
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginRight: '8px' }}>Type:</span>
            {['all', 'consultant', 'direct'].map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                style={{
                  padding: '6px 16px',
                  marginRight: '8px',
                  background: typeFilter === type ? '#667eea' : '#f3f4f6',
                  color: typeFilter === type ? 'white' : '#64748b',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {type === 'consultant' ? 'Consultant Companies' : type === 'direct' ? 'Direct Businesses' : 'All'}
              </button>
            ))}
          </div>
          
          <div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginRight: '8px' }}>Status:</span>
            {['all', 'received', 'pending', 'failed', 'refunded'].map(status => (
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
                {getStatusText(status)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Records Table */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          Loading revenue records...
        </div>
      ) : records.length === 0 ? (
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          padding: '40px', 
          textAlign: 'center',
          color: '#64748b'
        }}>
          No revenue records found
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
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Transaction ID</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Company</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Consultant</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Amount</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Share</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Plan</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Date</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const consultantShare = record.consultant 
                  ? (record.amount * record.consultant.revenueSharePercentage) / 100
                  : 0;
                const platformShare = record.amount - consultantShare;
                
                return (
                  <tr key={record.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontFamily: 'monospace' }}>
                      {record.transactionId}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>
                      {record.company.name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {record.consultant ? record.consultant.fullName : <em style={{ color: '#10b981' }}>Direct Business</em>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '600' }}>
                      {formatCurrency(record.amount)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b' }}>
                      {record.consultant ? (
                        <div>
                          <div>Consultant: {formatCurrency(consultantShare)}</div>
                          <div>Platform: {formatCurrency(platformShare)}</div>
                        </div>
                      ) : (
                        <div style={{ color: '#10b981', fontWeight: '600' }}>100% Platform</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', textTransform: 'capitalize' }}>
                      {record.subscriptionPlan}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {formatDate(record.paymentDate)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: `${getStatusColor(record.paymentStatus)}20`,
                        color: getStatusColor(record.paymentStatus)
                      }}>
                        {getStatusText(record.paymentStatus)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

