'use client';

import React from 'react';

interface Company {
  id: string;
  name: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  subscriptionStatus?: string | null;
  businessId?: string;
}

interface CompanyListTabProps {
  companies: Company[];
  setCurrentView: (view: any) => void;
  setSelectedCompanyId: (id: string) => void;
  setAdminDashboardTab: (tab: string) => void;
  setCompanyToDelete: (company: { companyId: string; businessId: string; companyName: string }) => void;
  setShowDeleteConfirmation: (show: boolean) => void;
}

export default function CompanyListTab({
  companies,
  setCurrentView,
  setSelectedCompanyId,
  setAdminDashboardTab,
  setCompanyToDelete,
  setShowDeleteConfirmation
}: CompanyListTabProps) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
          Your Companies ({companies.length})
        </h2>
        <button
          onClick={() => {
            setCurrentView('admin');
            setSelectedCompanyId('');
            setAdminDashboardTab('company-management');
          }}
          style={{
            padding: '10px 20px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
        >
          <span style={{ fontSize: '18px', fontWeight: '700' }}>+</span> Add Company
        </button>
      </div>
      
      {companies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No companies yet</div>
          <div style={{ fontSize: '14px' }}>Companies will appear here once they are added to your account.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {[...companies]
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map((company) => (
              <div
                key={company.id}
                style={{
                  background: '#f8fafc',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px' }}>
                  <div 
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCompanyId(company.id);
                      setCurrentView('admin');
                      setAdminDashboardTab('company-management');
                    }}
                  >
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                      {company.name}
                    </h3>
                    {company.industry && (
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                        Industry: {company.industry}
                      </div>
                    )}
                    {company.city && company.state && (
                      <div style={{ fontSize: '13px', color: '#64748b' }}>
                        Location: {company.city}, {company.state}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {company.subscriptionStatus === 'cancelled' && (
                      <div style={{
                        padding: '4px 12px',
                        background: '#ef4444',
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase'
                      }}>
                        Inactive
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const businessId = company.businessId || company.id;
                        setCompanyToDelete({
                          companyId: company.id,
                          businessId: businessId,
                          companyName: company.name || 'this company'
                        });
                        setShowDeleteConfirmation(true);
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

