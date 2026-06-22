'use client';

import React, { useState } from 'react';
import ConsultantPayablesTab from './ConsultantPayablesTab';

type PayablesView = 'consultants' | 'referral-partners';

export default function PayablesTab() {
  const [activeView, setActiveView] = useState<PayablesView>('consultants');

  const tabStyle = (view: PayablesView) => ({
    padding: '8px 14px',
    background: activeView === view ? '#1d4ed8' : '#f3f4f6',
    color: activeView === view ? 'white' : '#475569',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setActiveView('consultants')} style={tabStyle('consultants')}>
          Consultant Payables
        </button>
        <button type="button" onClick={() => setActiveView('referral-partners')} style={tabStyle('referral-partners')}>
          Referral Partner Payables
        </button>
      </div>

      {activeView === 'consultants' && (
        <ConsultantPayablesTab
          payableType="consultant_revenue_share"
          title="Consultant Payables"
          emptyMessage={'No consultant payables found. Click "Generate Current Month Payables" to create them.'}
        />
      )}
      {activeView === 'referral-partners' && (
        <ConsultantPayablesTab
          payableType="referral_partner"
          title="Referral Partner Payables"
          emptyMessage={'No referral partner payables found. Click "Generate Current Month Payables" to create them.'}
        />
      )}
    </div>
  );
}
