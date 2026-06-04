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
  companyName?: string;
  previewAdminName?: string | null;
  /** When set, site admins in company admin workspace get full nav chrome (sidebar/header parity). */
  selectedCompanyId?: string;
  dataRoomEnabledByAdmin?: boolean;
  customReportsEnabledByAdmin?: boolean;
  // currentView is a large union in app/page.tsx; keep this flexible for reuse.
  setCurrentView: (view: any) => void;
  handleLogout: () => void;
  handleNavigation: (view: string) => void;
}

export default function Header({
  currentUser,
  currentView,
  companyName,
  previewAdminName,
  selectedCompanyId = '',
  dataRoomEnabledByAdmin = false,
  customReportsEnabledByAdmin = false,
  setCurrentView,
  handleLogout,
  handleNavigation
}: HeaderProps) {
  const [showFinancialReportsMenu, setShowFinancialReportsMenu] = useState(false);
  const isCompanyUser = currentUser?.role === 'user' && currentUser?.userType === 'company';
  const isCompanyAdmin = isCompanyUser && currentUser?.companyRole === 'admin';
  const displayedUserName =
    previewAdminName && previewAdminName.trim() ? previewAdminName : currentUser?.name;

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

  // Items shown in the header "Reports" dropdown. Standard Reports and
  // Valuation Reports are intentionally omitted here per product direction —
  // they remain reachable from the left sidebar but should not appear in the
  // header dropdown.
  const financialReportsViews = [
    { id: 'dashboard', label: "Financial KPI's", section: 'company-dashboard' },
    { id: 'kpis', label: 'Key Ratios', section: 'financial-reports' },
    { id: 'mda', label: 'MD&A', section: 'mda' },
    { id: 'trend-analysis', label: 'Performance Trends', section: 'financial-reports' },
    { id: 'goals', label: 'Targets and Goals', section: 'financial-reports' },
    { id: 'projections', label: 'Projections', section: 'financial-reports' },
    { id: 'cash-flow', label: 'Cash Flow', section: 'financial-reports' },
    { id: 'working-capital', label: 'Working Capital', section: 'financial-reports' },
    { id: 'financial-statements', label: 'Financial Statements', section: 'financial-statements' },
  ];
  // Views that should still light up the header "Reports" tab when active,
  // even if they don't appear in the dropdown (sidebar-only entries).
  const sidebarOnlyReportViews = ['custom-print', 'valuation-reports'];
  const isFinancialReportsView =
    financialReportsViews.some((item) => item.id === currentView) ||
    sidebarOnlyReportViews.includes(currentView);

  if (!currentUser) return null;

  const siteAdminCompanyWorkspace =
    currentUser.role === 'siteadmin' &&
    Boolean(String(selectedCompanyId || '').trim());

  // Site Admin Header (full company nav when previewing / opening a company workspace)
  if (currentUser.role === 'siteadmin' && !siteAdminCompanyWorkspace) {
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
  const headerCompanyName = (companyName || '').trim() || 'Company Dashboard';
  return (
    <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 48px 12px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
        <div 
          style={{ cursor: 'pointer', flexShrink: 0, width: '300px', minWidth: '300px', maxWidth: '300px' }} 
          onClick={() => {
            // Company identity in header routes to Company Dashboard workspace.
            handleNavigation('admin');
          }}
          title={headerCompanyName}
        >
          <div
            style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#2751d0',
              letterSpacing: '-0.2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.1,
            }}
          >
            {headerCompanyName}
          </div>
        </div>
        <div style={{ width: '28px', minWidth: '28px', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <nav style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <button
                onClick={() => handleNavigation('daily-alerts')}
                style={{
                  background: currentView === 'daily-alerts' ? '#eef2ff' : 'none',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#000',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  borderBottom: currentView === 'daily-alerts' ? '3px solid #000' : '3px solid transparent',
                  lineHeight: '1.1',
                  textAlign: 'center'
                }}
              >
                DAILY ALERTS
              </button>
              <button
                onClick={() => handleNavigation('operations')}
                style={{
                  background: currentView === 'operations' ? '#eef2ff' : 'none',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#000',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  borderBottom: currentView === 'operations' ? '3px solid #000' : '3px solid transparent',
                  lineHeight: '1.1',
                  textAlign: 'center'
                }}
              >
                OPERATIONAL PERFORMANCE
              </button>
            </div>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
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
                <span>FINANCIAL REPORTING</span>
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
                        if (!canAccess(item.section)) return;
                        handleNavigation(item.id);
                        setShowFinancialReportsMenu(false);
                      }}
                      title={!canAccess(item.section) ? 'Access restricted' : undefined}
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
                        cursor: !canAccess(item.section) ? 'not-allowed' : 'pointer',
                        opacity: !canAccess(item.section) ? 0.4 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!canAccess(item.section)) return;
                        e.currentTarget.style.background = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {dataRoomEnabledByAdmin && (
              <button
                onClick={() => canAccess('dataroom') && handleNavigation('dataroom')}
                title={!canAccess('dataroom') ? 'Access restricted' : undefined}
                style={{
                  background: currentView === 'dataroom' ? '#eef2ff' : 'none',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#000',
                  cursor: canAccess('dataroom') ? 'pointer' : 'not-allowed',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  borderBottom: currentView === 'dataroom' ? '3px solid #000' : '3px solid transparent',
                  whiteSpace: 'nowrap',
                  opacity: canAccess('dataroom') ? 1 : 0.4
                }}
              >
                DATA ROOM
              </button>
            )}
            {customReportsEnabledByAdmin && (
              <button
                onClick={() => canAccess('custom-reports') && handleNavigation('custom-reports')}
                title={!canAccess('custom-reports') ? 'Access restricted' : undefined}
                style={{
                  background: currentView === 'custom-reports' ? '#eef2ff' : 'none',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#000',
                  cursor: canAccess('custom-reports') ? 'pointer' : 'not-allowed',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  borderBottom: currentView === 'custom-reports' ? '3px solid #000' : '3px solid transparent',
                  whiteSpace: 'nowrap',
                  opacity: canAccess('custom-reports') ? 1 : 0.4
                }}
              >
                CUSTOM REPORTS
              </button>
            )}
            </div>
          </nav>
        </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{displayedUserName}</span>
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

