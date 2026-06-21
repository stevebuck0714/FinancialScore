'use client';

import React, { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/billing/billingHelpers';

interface RevenueData {
  totalMRR: number;
  totalARR: number;
  consultantMRR: number;
  directMRR: number;
  currentMonthRevenue: number;
  currentMonthConsultantRevenue: number;
  currentMonthDirectRevenue: number;
  currentMonthRevenueByService?: Record<string, number>;
  currentMonthReferralAttributedRevenue: number;
  currentMonthReferralPayableEstimate: number;
  previousMonthRevenue: number;
  revenueGrowth: {
    value: number;
    isPositive: boolean;
    formatted: string;
  };
  totalPendingPayables: number;
  pendingPayablesCount: number;
  totalPendingReferralPayables: number;
  pendingReferralPayablesCount: number;
  platformRevenue: number;
  activeCompaniesCount: number;
  consultantCompaniesCount: number;
  directCompaniesCount: number;
  companyCountsByBillingMethod?: Record<string, number>;
  companyCountsByPaymentStatus?: Record<string, number>;
}

export default function RevenueDashboardTab() {
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRevenueData();
  }, []);

  const fetchRevenueData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/billing/revenue');
      if (!response.ok) throw new Error('Failed to fetch revenue data');
      const data = await response.json();
      setRevenueData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        Loading revenue data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', background: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>
        Error loading revenue data: {error}
      </div>
    );
  }

  if (!revenueData) return null;
  const billingMethodLabels: Record<string, string> = {
    usaepay: 'USAePay',
    quickbooks_invoice: 'QuickBooks Invoice',
    manual_external: 'Manual / External',
    no_platform_payment: 'No Platform Payment',
  };
  const paymentStatusLabels: Record<string, string> = {
    not_billed: 'Not Billed',
    invoiced: 'Invoiced',
    paid: 'Paid',
    overdue: 'Overdue',
    waived: 'Waived',
    no_payment_required: 'No Payment Required',
    external_paid: 'External Paid',
  };

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
        gap: '20px',
        marginBottom: '32px'
      }}>
        {/* Total Revenue This Month */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>
            💵 Total Revenue This Month
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
            {formatCurrency(revenueData.currentMonthRevenue)}
          </div>
          <div style={{ 
            fontSize: '12px', 
            color: revenueData.revenueGrowth.isPositive ? '#10b981' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span>{revenueData.revenueGrowth.isPositive ? '↑' : '↓'}</span>
            <span>{revenueData.revenueGrowth.formatted} vs last month</span>
          </div>
        </div>

        {/* Consultant Revenue */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>
            👥 Consultant Companies Revenue
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
            {formatCurrency(revenueData.currentMonthConsultantRevenue)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {revenueData.consultantCompaniesCount} companies • MRR: {formatCurrency(revenueData.consultantMRR)}
          </div>
        </div>

        {/* Direct Business Revenue */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>
            🏢 Direct Business Revenue
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
            {formatCurrency(revenueData.currentMonthDirectRevenue)}
          </div>
          <div style={{ fontSize: '12px', color: '#10b981' }}>
            {revenueData.directCompaniesCount} companies • MRR: {formatCurrency(revenueData.directMRR)}
          </div>
        </div>

        {/* Consultant Payables */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>
            ⚠️ Pending Consultant Payables
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
            {formatCurrency(revenueData.totalPendingPayables)}
          </div>
          <div style={{ fontSize: '12px', color: '#f59e0b' }}>
            {revenueData.pendingPayablesCount} pending payment{revenueData.pendingPayablesCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Referral Partner Payables */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>
            Referral Partner Payables
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
            {formatCurrency(revenueData.currentMonthReferralPayableEstimate || 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            On {formatCurrency(revenueData.currentMonthReferralAttributedRevenue || 0)} referral-attributed revenue
          </div>
          <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>
            Pending generated: {formatCurrency(revenueData.totalPendingReferralPayables || 0)} across {revenueData.pendingReferralPayablesCount || 0} payable{(revenueData.pendingReferralPayablesCount || 0) !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          📊 Revenue Breakdown
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Expected Monthly Recurring Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>
              {formatCurrency(revenueData.totalMRR)}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Consultant: {formatCurrency(revenueData.consultantMRR)} • Direct: {formatCurrency(revenueData.directMRR)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Expected Annual Recurring Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>
              {formatCurrency(revenueData.totalARR)}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Based on active subscriptions
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          Revenue By Service
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {Object.entries(revenueData.currentMonthRevenueByService || {}).map(([serviceType, amount]) => (
            <div key={serviceType} style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'capitalize', marginBottom: '6px' }}>
                {serviceType.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>
                {formatCurrency(amount)}
              </div>
            </div>
          ))}
          {Object.keys(revenueData.currentMonthRevenueByService || {}).length === 0 && (
            <div style={{ fontSize: '13px', color: '#64748b' }}>No received revenue this month.</div>
          )}
        </div>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          Customer Billing Terms
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>By Billing Method</div>
            {Object.entries(revenueData.companyCountsByBillingMethod || {}).map(([method, count]) => (
              <div key={method} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#334155', padding: '4px 0' }}>
                <span>{billingMethodLabels[method] || method}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>By Payment Status</div>
            {Object.entries(revenueData.companyCountsByPaymentStatus || {}).map(([status, count]) => (
              <div key={status} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#334155', padding: '4px 0' }}>
                <span>{paymentStatusLabels[status] || status}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          Quick Actions
        </h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={fetchRevenueData}
            style={{
              padding: '10px 20px',
              background: '#f3f4f6',
              color: '#1e293b',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
}
