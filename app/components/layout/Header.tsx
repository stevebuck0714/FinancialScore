'use client';

import React, { useEffect, useState } from 'react';

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
  hasSiteAdminOverride?: boolean;
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
  hasSiteAdminOverride = false,
  setCurrentView,
  handleLogout,
  handleNavigation
}: HeaderProps) {
  const [currentDate, setCurrentDate] = useState('');
  const isCompanyUser = currentUser?.role === 'user' && currentUser?.userType === 'company';
  const isCompanyAdmin = isCompanyUser && currentUser?.companyRole === 'admin';
  const displayedUserName =
    currentUser?.role === 'siteadmin'
      ? currentUser.name
      : (previewAdminName && previewAdminName.trim() ? previewAdminName : currentUser?.name);

  const allowedSections = (isCompanyUser && !isCompanyAdmin && Array.isArray(currentUser?.sidebarAccess))
    ? currentUser.sidebarAccess
    : null;

  const canAccess = (sectionId: string) => {
    if (hasSiteAdminOverride) return true;
    if (!isCompanyUser) return true;
    if (isCompanyAdmin) return true;
    // If permissions are missing, default to full access rather than locking people out.
    if (!allowedSections) return true;
    return allowedSections.includes(sectionId);
  };
  const isFinancialReportsView = [
    'dashboard',
    'kpis',
    'mda',
    'trend-analysis',
    'goals',
    'projections',
    'cash-flow',
    'working-capital',
    'financial-statements',
  ].includes(currentView);

  useEffect(() => {
    setCurrentDate(
      new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date())
    );
  }, []);

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
          <nav data-financial-reports-view={isFinancialReportsView ? 'true' : 'false'} style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            </div>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            </div>
          </nav>
        </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
          <span style={{ color: '#475569', fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap' }}>
            {currentDate}
          </span>
          <a
            href="/support"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#1F70C1',
              fontSize: '14px',
              fontWeight: '700',
              textDecoration: 'none',
              padding: '8px 10px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            📞 SUPPORT
          </a>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
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
      </div>
    </header>
  );
}

