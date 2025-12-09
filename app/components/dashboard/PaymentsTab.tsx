'use client';

import React from 'react';

interface Subscription {
  status: string;
  plan: string;
  amount: number;
  nextBillingDate?: string;
  cardLast4?: string;
  cardType?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  failedPaymentCount: number;
  lastFailureReason?: string;
  transactions?: Array<{
    id: number;
    type: string;
    status: string;
    amount: number;
    description?: string;
    createdAt: string;
  }>;
}

interface PaymentsTabProps {
  selectedCompany: any;
  selectedSubscriptionPlan: string | null;
  setSelectedSubscriptionPlan: (plan: string | null) => void;
  activeSubscription: Subscription | null;
  setActiveSubscription: (sub: Subscription | null) => void;
  loadingSubscription: boolean;
  setShowCheckoutModal: (show: boolean) => void;
  setShowUpdatePaymentModal: (show: boolean) => void;
  selectedCompanyId: number | null;
  subscriptionMonthlyPrice?: number;
  subscriptionQuarterlyPrice?: number;
  subscriptionAnnualPrice?: number;
}

export default function PaymentsTab({
  selectedCompany,
  selectedSubscriptionPlan,
  setSelectedSubscriptionPlan,
  activeSubscription,
  setActiveSubscription,
  loadingSubscription,
  setShowCheckoutModal,
  setShowUpdatePaymentModal,
  selectedCompanyId,
  subscriptionMonthlyPrice = 0,
  subscriptionQuarterlyPrice = 0,
  subscriptionAnnualPrice = 0
}: PaymentsTabProps) {
  const monthlyPrice = subscriptionMonthlyPrice;
  const quarterlyPrice = subscriptionQuarterlyPrice;
  const annualPrice = subscriptionAnnualPrice;

  return (
    <>
      <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px' }}>Payments & Subscription</h2>
      
      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
        
        {/* LEFT COLUMN - Plan Selection & Checkout */}
        <div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
              {activeSubscription ? 'Change Plan' : 'Select a Plan'}
            </h3>
            
            {((monthlyPrice === 0 || monthlyPrice === undefined) &&
              (quarterlyPrice === 0 || quarterlyPrice === undefined) &&
              (annualPrice === 0 || annualPrice === undefined)) ? (
              <div style={{ background: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', padding: '12px' }}>
                <p style={{ fontSize: '14px', color: '#065f46', fontWeight: '600' }}>
                  No Payment Required
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                {/* Monthly Plan */}
                <div 
                  onClick={() => setSelectedSubscriptionPlan('monthly')}
                  style={{ 
                    border: selectedSubscriptionPlan === 'monthly' ? '3px solid #667eea' : '2px solid #e2e8f0', 
                    borderRadius: '8px', 
                    padding: '14px', 
                    background: selectedSubscriptionPlan === 'monthly' ? '#f0f9ff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: selectedSubscriptionPlan === 'monthly' ? '0 4px 12px rgba(102, 126, 234, 0.2)' : 'none'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    {selectedSubscriptionPlan === 'monthly' && <span style={{ color: '#667eea', marginRight: '4px' }}>✓</span>}
                    Monthly
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#667eea' }}>
                    ${monthlyPrice.toFixed(2)}
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>/mo</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Billed monthly</div>
                </div>

                {/* Quarterly Plan */}
                <div 
                  onClick={() => setSelectedSubscriptionPlan('quarterly')}
                  style={{ 
                    border: selectedSubscriptionPlan === 'quarterly' ? '3px solid #667eea' : '2px solid #e2e8f0', 
                    borderRadius: '8px', 
                    padding: '14px', 
                    background: selectedSubscriptionPlan === 'quarterly' ? '#f0f9ff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: selectedSubscriptionPlan === 'quarterly' ? '0 4px 12px rgba(102, 126, 234, 0.2)' : 'none'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    {selectedSubscriptionPlan === 'quarterly' && <span style={{ color: '#667eea', marginRight: '4px' }}>✓</span>}
                    Quarterly
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#667eea' }}>
                    ${quarterlyPrice.toFixed(2)}
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>/qtr</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Billed every 3 months</div>
                </div>

                {/* Annual Plan */}
                <div 
                  onClick={() => setSelectedSubscriptionPlan('annual')}
                  style={{ 
                    border: selectedSubscriptionPlan === 'annual' ? '3px solid #667eea' : '2px solid #10b981', 
                    borderRadius: '8px', 
                    padding: '14px', 
                    background: selectedSubscriptionPlan === 'annual' ? '#f0f9ff' : '#f0fdf4',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: selectedSubscriptionPlan === 'annual' ? '0 4px 12px rgba(102, 126, 234, 0.2)' : 'none'
                  }}
                >
                  <div style={{ position: 'absolute', top: '6px', right: '6px', background: '#10b981', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '600' }}>
                    BEST VALUE
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    {selectedSubscriptionPlan === 'annual' && <span style={{ color: '#667eea', marginRight: '4px' }}>✓</span>}
                    Annual
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#059669' }}>
                    ${annualPrice.toFixed(2)}
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>/yr</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px', fontWeight: '500' }}>Save 15% annually</div>
                </div>
              </div>
            )}
          </div>
          
          {/* Shopping Cart */}
          {selectedSubscriptionPlan && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🛒 Checkout
              </h3>
              
              <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', textTransform: 'capitalize' }}>
                      {selectedSubscriptionPlan} Plan
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      Billed {selectedSubscriptionPlan === 'monthly' ? 'monthly' : selectedSubscriptionPlan === 'quarterly' ? 'quarterly' : 'annually'}
                    </div>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#667eea' }}>
                    ${selectedSubscriptionPlan === 'monthly' ? monthlyPrice.toFixed(2) : 
                       selectedSubscriptionPlan === 'quarterly' ? quarterlyPrice.toFixed(2) : 
                       annualPrice.toFixed(2)}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSubscriptionPlan(null)}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    color: '#ef4444',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  ✕ Remove
                </button>
              </div>

              <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>Total</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981' }}>
                    ${selectedSubscriptionPlan === 'monthly' ? monthlyPrice.toFixed(2) : 
                       selectedSubscriptionPlan === 'quarterly' ? quarterlyPrice.toFixed(2) : 
                       annualPrice.toFixed(2)}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'right' }}>
                  {selectedSubscriptionPlan === 'monthly' && 'Per month'}
                  {selectedSubscriptionPlan === 'quarterly' && 'Per quarter'}
                  {selectedSubscriptionPlan === 'annual' && 'Per year'}
                </div>
              </div>
              
              <button
                onClick={() => setShowCheckoutModal(true)}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px rgba(16, 185, 129, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
              >
                🛒 Proceed to Checkout
              </button>
              <p style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginTop: '12px' }}>
                Subscription activates immediately after checkout
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Subscription Management */}
        <div>
          {loadingSubscription ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '16px', color: '#64748b' }}>Loading subscription...</div>
            </div>
          ) : activeSubscription ? (
            <>
              {/* Subscription Status */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>Your Subscription</h3>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: activeSubscription.status === 'ACTIVE' ? '#d1fae5' : activeSubscription.status === 'SUSPENDED' ? '#fee2e2' : activeSubscription.status === 'CANCELED' ? '#f3f4f6' : '#fef3c7',
                    color: activeSubscription.status === 'ACTIVE' ? '#065f46' : activeSubscription.status === 'SUSPENDED' ? '#991b1b' : activeSubscription.status === 'CANCELED' ? '#1f2937' : '#92400e'
                  }}>
                    {activeSubscription.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Plan</p>
                    <p style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', textTransform: 'capitalize' }}>{activeSubscription.plan}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Amount</p>
                    <p style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${activeSubscription.amount.toFixed(2)}</p>
                  </div>
                </div>

                {activeSubscription.nextBillingDate && (
                  <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>📅</span>
                      <div>
                        <p style={{ fontSize: '11px', color: '#1e40af', fontWeight: '500' }}>Next Billing Date</p>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a8a' }}>
                          {new Date(activeSubscription.nextBillingDate).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeSubscription.cardLast4 && (
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Payment Method</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '18px' }}>💳</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                        {activeSubscription.cardType} ending in {activeSubscription.cardLast4}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
                        Exp: {activeSubscription.cardExpMonth}/{activeSubscription.cardExpYear}
                      </span>
                    </div>
                  </div>
                )}

                {activeSubscription.failedPaymentCount > 0 && (
                  <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>⚠️</span>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b' }}>Payment Issue</p>
                        <p style={{ fontSize: '11px', color: '#7f1d1d' }}>
                          {activeSubscription.failedPaymentCount} failed attempt(s). {activeSubscription.lastFailureReason}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => setShowUpdatePaymentModal(true)}
                    style={{
                      width: '100%',
                      background: '#667eea',
                      color: 'white',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Update Payment Method
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Are you sure you want to cancel your subscription?')) {
                        try {
                          const response = await fetch(`/api/subscriptions?companyId=${selectedCompanyId}`, {
                            method: 'DELETE'
                          });
                          if (response.ok) {
                            alert('Subscription canceled successfully');
                            setActiveSubscription(null);
                          }
                        } catch (error) {
                          alert('Failed to cancel subscription');
                        }
                      }
                    }}
                    style={{
                      width: '100%',
                      background: 'white',
                      color: '#ef4444',
                      border: '2px solid #ef4444',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel Subscription
                  </button>
                </div>
              </div>

              {/* Payment History */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Payment History</h3>
                
                {activeSubscription.transactions && activeSubscription.transactions.length > 0 ? (
                  <div>
                    {activeSubscription.transactions.map((txn: any) => (
                      <div key={txn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '18px' }}>
                            {txn.status === 'SUCCESS' ? '✅' : '❌'}
                          </span>
                          <div>
                            <p style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>
                              {txn.description || `${txn.type} Payment`}
                            </p>
                            <p style={{ fontSize: '11px', color: '#64748b' }}>
                              {new Date(txn.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
                            ${txn.amount.toFixed(2)}
                          </p>
                          <p style={{
                            fontSize: '11px',
                            fontWeight: '500',
                            color: txn.status === 'SUCCESS' ? '#10b981' : '#ef4444'
                          }}>
                            {txn.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px' }}>
                    No transaction history available
                  </p>
                )}
              </div>
            </>
          ) : (
            <div style={{ background: 'white', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛒</div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>No Active Subscription</h3>
              <p style={{ fontSize: '14px', color: '#64748b' }}>
                Select a plan from the left to get started
              </p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
