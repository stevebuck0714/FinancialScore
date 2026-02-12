'use client';

import React, { useState } from 'react';

interface User {
  name: string | null;
  role?: string;
  userType?: string;
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

  const analysisViews = [
    { id: 'pa-overview', label: 'Overview' },
    { id: 'pa-focus-board', label: 'Focus Board' },
    { id: 'pa-trend-explorer', label: 'Trend Explorer' },
    { id: 'pa-anomaly-inbox', label: 'Anomalies' },
    { id: 'pa-opportunity-workspace', label: 'Actions/Monitor' },
    { id: 'ai-analysis', label: 'Ask Corelytics' }
  ];

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
      </header>
    );
  }

  // Regular User Header (with navigation)
  return (
    <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 48px 12px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '128px', width: '100%' }}>
        <div 
          style={{ fontSize: '28px', fontWeight: '700', color: '#1F70C1', cursor: 'pointer', letterSpacing: '-0.5px', paddingTop: '4px' }} 
          onClick={() => currentUser.role === 'consultant' ? setCurrentView('consultant-dashboard') : setCurrentView('fs-score')}
        >
          Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <nav style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'nowrap' }}>
            {/* Left: DASHBOARD, OPERATIONS - centered vertically with ANALYSIS block */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <button onClick={() => handleNavigation('dashboard')} style={{ background: currentView === 'dashboard' ? '#eef2ff' : 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: '#000', cursor: 'pointer', padding: '8px 12px', borderRadius: '6px', borderBottom: currentView === 'dashboard' ? '3px solid #000' : '3px solid transparent', whiteSpace: 'nowrap' }}>DASHBOARD</button>
              <button onClick={() => handleNavigation('operations')} style={{ background: currentView === 'operations' ? '#eef2ff' : 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: '#000', cursor: 'pointer', padding: '8px 12px', borderRadius: '6px', borderBottom: currentView === 'operations' ? '3px solid #000' : '3px solid transparent', whiteSpace: 'nowrap' }}>OPERATIONS</button>
            </div>
            {/* Center: ANALYSIS block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#000', padding: '8px 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>ANALYSIS</span>
              <div style={{ borderTop: '2px solid #e2e8f0', alignSelf: 'stretch', marginTop: '8px', marginBottom: '8px' }} />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap' }}>
                {analysisViews.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item.id)}
                    style={{
                      background: currentView === item.id ? '#eef2ff' : 'none',
                      border: 'none',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: currentView === item.id ? '#000' : '#64748b',
                      cursor: 'pointer',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      if (currentView !== item.id) {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.color = '#000';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentView !== item.id) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#64748b';
                      }
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Right: MD&A, Financial Reports - centered vertically with ANALYSIS block */}
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
              <span style={{ display: 'block' }}>Management</span>
              <span style={{ display: 'block' }}>Discussion</span>
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
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

