'use client';

import React, { useState } from 'react';

interface User {
  name: string | null;
  role?: string;
  userType?: string;
  companyRole?: string | null;
  sidebarAccess?: string[] | null;
}

interface HeaderProps {
  currentUser: User | null;
  currentView: string;
  // currentView is a large union in app/page.tsx; keep this flexible for reuse.
  setCurrentView: (view: any) => void;
  handleLogout: () => void;
  handleNavigation: (view: string) => void;
}

export default function Header({
  currentUser,
  currentView,
  setCurrentView,
  handleLogout,
  handleNavigation
}: HeaderProps) {
  const [showFinancialReportsMenu, setShowFinancialReportsMenu] = useState(false);
  const isCompanyUser = currentUser?.role === 'user' && currentUser?.userType === 'company';
  const isCompanyAdmin = isCompanyUser && currentUser?.companyRole === 'admin';

  const allowedSections = (isCompanyUser && !isCompanyAdmin && Array.isArray(currentUser?.sidebarAccess))
    ? currentUser.sidebarAccess
    : null;

  const canAccess = (sectionId: string) => {
    if (!isCompanyUser) return true;
    if (isCompanyAdmin) return true;
    // If permissions are missing, default to full access rather than locking people out.
    if (!allowedSections) return true;
    return allowedSections.includes(sectionId);
  };

  const financialReportsViews = [
    { id: 'kpis', label: 'Ratios' },
    { id: 'trend-analysis', label: 'Trends' },
    { id: 'goals', label: 'Goals' },
    { id: 'projections', label: 'Projections' },
    { id: 'cash-flow', label: 'Cash Flow' },
    { id: 'working-capital', label: 'Working Capital' },
    { id: 'covenants', label: 'Loan Covenants' }
  ];

  const isFinancialReportsView = ['kpis', 'trend-analysis', 'goals', 'projections', 'cash-flow', 'working-capital', 'covenants'].includes(currentView);

  if (!currentUser) return null;

  // Site Admin Header
  if (currentUser.role === 'siteadmin') {
    return (
      <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '80px' }}>
          <div 
            style={{ fontSize: '28px', fontWeight: '700', color: '#1F70C1', cursor: 'pointer', letterSpacing: '-0.5px' }} 
            onClick={() => setCurrentView('siteadmin')}
          >
            Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b' }}>SITE ADMINISTRATION</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '14px', color: '#64748b' }}>
            {currentUser?.name}
          </div>
          <button 
            onClick={handleLogout} 
            style={{ 
              padding: '10px 20px', 
              background: '#ef4444', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              fontSize: '14px', 
              fontWeight: '600', 
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
          >
            🚪 LOGOUT
          </button>
        </div>
      </header>
    );
  }

  // Assessment User Header (Simple)
  if (currentUser.userType === 'assessment') {
    return (
      <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        <div style={{ fontSize: '28px', fontWeight: '700', color: '#1F70C1', letterSpacing: '-0.5px' }}>
          Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup> - MANAGEMENT ASSESSMENT
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{currentUser?.name}</span>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: '#f8fafc',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.2s, color 0.2s, border-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e2e8f0';
              e.currentTarget.style.borderColor = '#94a3b8';
              e.currentTarget.style.color = '#1e293b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.color = '#334155';
            }}
          >
            Log out
          </button>
        </div>
      </header>
    );
  }

  // Regular User Header (with navigation)
  return (
    <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 48px 12px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '176px', minWidth: 0, flex: 1 }}>
        <div 
          style={{ fontSize: '28px', fontWeight: '700', color: '#1F70C1', cursor: 'pointer', letterSpacing: '-0.5px', paddingTop: '4px', flexShrink: 0 }} 
          onClick={() => {
            if (currentUser.role === 'consultant') {
              setCurrentView('consultant-dashboard');
              return;
            }
            // Company users may be restricted from the dashboard.
            if (canAccess('company-dashboard')) {
              handleNavigation('dashboard');
            }
          }}
        >
          Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <nav style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <button
                onClick={() => canAccess('company-dashboard') && handleNavigation('dashboard')}
                title={!canAccess('company-dashboard') ? 'Access restricted' : undefined}
                style={{
                  background: currentView === 'dashboard' ? '#eef2ff' : 'none',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#000',
                  cursor: canAccess('company-dashboard') ? 'pointer' : 'not-allowed',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  borderBottom: currentView === 'dashboard' ? '3px solid #000' : '3px solid transparent',
                  lineHeight: '1.1',
                  textAlign: 'center',
                  opacity: canAccess('company-dashboard') ? 1 : 0.4
                }}
              >
                <span style={{ display: 'block' }}>FINANCIAL</span>
                <span style={{ display: 'block' }}>DASHBOARD</span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <button
              onClick={() => handleNavigation('mda')}
              style={{
                background: currentView === 'mda' ? '#eef2ff' : 'none',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600',
                color: '#000',
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: '6px',
                borderBottom: currentView === 'mda' ? '3px solid #000' : '3px solid transparent',
                textAlign: 'center',
                lineHeight: '1.1',
                whiteSpace: 'nowrap'
              }}
            >
              MD&A
            </button>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowFinancialReportsMenu((prev) => !prev)}
                style={{
                  background: isFinancialReportsView ? '#eef2ff' : 'none',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#000',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  paddingRight: '26px',
                  borderRadius: '6px',
                  borderBottom: isFinancialReportsView ? '3px solid #000' : '3px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
                aria-haspopup="menu"
                aria-expanded={showFinancialReportsMenu}
              >
                <span>Financial Reports</span>
                <span style={{ fontSize: '12px' }}>▾</span>
              </button>
              {showFinancialReportsMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    padding: '6px',
                    minWidth: '200px',
                    zIndex: 1100
                  }}
                  onMouseLeave={() => setShowFinancialReportsMenu(false)}
                >
                  {financialReportsViews.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        handleNavigation(item.id);
                        setShowFinancialReportsMenu(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#000',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => handleNavigation('valuation')}
              disabled={!canAccess('valuation')}
              title={!canAccess('valuation') ? 'Access restricted' : undefined}
              style={{
                background: currentView === 'valuation' ? '#eef2ff' : 'none',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600',
                color: '#000',
                cursor: canAccess('valuation') ? 'pointer' : 'not-allowed',
                padding: '8px 12px',
                borderRadius: '6px',
                borderBottom: currentView === 'valuation' ? '3px solid #000' : '3px solid transparent',
                whiteSpace: 'nowrap',
                opacity: canAccess('valuation') ? 1 : 0.4
              }}
            >
              Valuation
            </button>
            <button
              onClick={() => handleNavigation('financial-statements')}
              disabled={!canAccess('financial-statements')}
              title={!canAccess('financial-statements') ? 'Access restricted' : undefined}
              style={{
                background: currentView === 'financial-statements' ? '#eef2ff' : 'none',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600',
                color: '#000',
                cursor: canAccess('financial-statements') ? 'pointer' : 'not-allowed',
                padding: '8px 12px',
                borderRadius: '6px',
                borderBottom: currentView === 'financial-statements' ? '3px solid #000' : '3px solid transparent',
                whiteSpace: 'nowrap',
                opacity: canAccess('financial-statements') ? 1 : 0.4
              }}
            >
              Financial Statements
            </button>
            </div>
          </nav>
        </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{currentUser?.name}</span>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: '#f8fafc',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.2s, color 0.2s, border-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e2e8f0';
              e.currentTarget.style.borderColor = '#94a3b8';
              e.currentTarget.style.color = '#1e293b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.color = '#334155';
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

