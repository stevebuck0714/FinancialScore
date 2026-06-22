'use client';

import React, { useState } from 'react';
import RevenueDashboardTab from './RevenueDashboardTab';
import RevenueRecordsTab from './RevenueRecordsTab';
import PayablesTab from './PayablesTab';
import BillingReportsTab from './BillingReportsTab';
import CommercialTermsTab from './CommercialTermsTab';
import ReferralPartnersTab from './ReferralPartnersTab';

type BillingTab = 'dashboard' | 'commercial-terms' | 'referral-partners' | 'revenue-records' | 'payables' | 'reports';

export default function BillingDashboard() {
  const [activeTab, setActiveTab] = useState<BillingTab>('dashboard');

  return (
    <div style={{ padding: '24px' }}>
      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px', 
        borderBottom: '2px solid #e2e8f0' 
      }}>
        <button
          onClick={() => setActiveTab('dashboard')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'dashboard' ? '#667eea' : 'transparent',
            color: activeTab === 'dashboard' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'dashboard' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          📊 Dashboard
        </button>
        <button
          onClick={() => setActiveTab('commercial-terms')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'commercial-terms' ? '#667eea' : 'transparent',
            color: activeTab === 'commercial-terms' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'commercial-terms' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Commercial Terms
        </button>
        <button
          onClick={() => setActiveTab('revenue-records')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'revenue-records' ? '#667eea' : 'transparent',
            color: activeTab === 'revenue-records' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'revenue-records' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          💵 Revenue Records
        </button>
        <button
          onClick={() => setActiveTab('referral-partners')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'referral-partners' ? '#667eea' : 'transparent',
            color: activeTab === 'referral-partners' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'referral-partners' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Referral Partners
        </button>
        <button
          onClick={() => setActiveTab('payables')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'payables' ? '#667eea' : 'transparent',
            color: activeTab === 'payables' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'payables' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Payables
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          style={{
            padding: '12px 24px',
            background: activeTab === 'reports' ? '#667eea' : 'transparent',
            color: activeTab === 'reports' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'reports' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          📈 Reports
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && <RevenueDashboardTab />}
      {activeTab === 'commercial-terms' && <CommercialTermsTab />}
      {activeTab === 'referral-partners' && <ReferralPartnersTab />}
      {activeTab === 'revenue-records' && <RevenueRecordsTab />}
      {activeTab === 'payables' && <PayablesTab />}
      {activeTab === 'reports' && <BillingReportsTab />}
    </div>
  );
}
