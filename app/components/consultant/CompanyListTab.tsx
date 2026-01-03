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
  setCompanyManagementSubTab: (tab: string) => void;
  setCompanyToDelete: (company: { companyId: string; businessId: string; companyName: string }) => void;
  setShowDeleteConfirmation: (show: boolean) => void;
}

export default function CompanyListTab({
  companies,
  setCurrentView,
  setSelectedCompanyId,
  setAdminDashboardTab,
  setCompanyManagementSubTab,
  setCompanyToDelete,
  setShowDeleteConfirmation
}: CompanyListTabProps) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
          Your Companies ({companies.length}) - <span style={{ fontWeight: '400', color: '#64748b' }}>Select a Company to Get Started</span>
        </h2>
        <button
          onClick={() => {
            setCurrentView('admin');
            setSelectedCompanyId('');
            setAdminDashboardTab('company-management');
            setCompanyManagementSubTab('details');
          }}
          style={{
            padding: '6px 12px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
        >
          <span style={{ fontSize: '16px', fontWeight: '700' }}>+</span> Add Company
        </button>
      </div>
      
      {!Array.isArray(companies) || companies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 12px', color: '#94a3b8' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>No companies yet</div>
          <div style={{ fontSize: '12px' }}>Companies will appear here once they are added to your account.</div>
        </div>
      ) : (
        <div>
          {(Array.isArray(companies) ? [...companies] : [])
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map((company, index) => (
              <div key={company.id}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '4px 2px',
                    transition: 'background 0.15s',
                    borderRadius: '2px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div 
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCompanyId(company.id);
                      setCurrentView('admin');
                      setAdminDashboardTab('company-management');
                      setCompanyManagementSubTab('details');
                    }}
                  >
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0, lineHeight: '1.2' }}>
                      {company.name}
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#64748b', lineHeight: '1.2' }}>
                      {company.industry && (
                        <span>{company.industry}</span>
                      )}
                      {company.city && company.state && (
                        <span>{company.city}, {company.state}</span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {company.subscriptionStatus === 'cancelled' && (
                      <div style={{
                        padding: '2px 6px',
                        background: '#ef4444',
                        color: 'white',
                        borderRadius: '2px',
                        fontSize: '9px',
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
                        padding: '3px 8px',
                        background: 'transparent',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#ef4444';
                        e.currentTarget.style.color = 'white';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#ef4444';
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {index < companies.length - 1 && (
                  <div style={{ height: '1px', background: '#e2e8f0' }}></div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

