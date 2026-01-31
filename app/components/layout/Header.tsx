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
  const [showCashMenu, setShowCashMenu] = useState(false);
  const [showRatiosMenu, setShowRatiosMenu] = useState(false);
  const [showProjectionsMenu, setShowProjectionsMenu] = useState(false);
  const [showPerformanceMenu, setShowPerformanceMenu] = useState(false);

  const performanceAnalyticsViews = [
    { id: 'pa-overview', label: 'Overview' },
    { id: 'pa-focus-board', label: 'Focus Board' },
    { id: 'pa-trend-explorer', label: 'Trend Explorer' },
    { id: 'pa-anomaly-inbox', label: 'Anomaly Inbox' },
    { id: 'pa-opportunity-workspace', label: 'Opportunity Workspace' }
  ];

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
    <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 48px 16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '128px', width: '100%' }}>
        <div 
          style={{ fontSize: '28px', fontWeight: '700', color: '#1F70C1', cursor: 'pointer', letterSpacing: '-0.5px' }} 
          onClick={() => currentUser.role === 'consultant' ? setCurrentView('consultant-dashboard') : setCurrentView('fs-score')}
        >
          Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
        </div>
        <nav style={{ display: 'flex', gap: '24px', marginLeft: 'auto', marginRight: 'auto', alignItems: 'center' }}>
          <button onClick={() => handleNavigation('dashboard')} style={{ background: currentView === 'dashboard' ? '#eef2ff' : 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: '#000', cursor: 'pointer', padding: '8px 12px', borderRadius: '6px', borderBottom: currentView === 'dashboard' ? '3px solid #000' : '3px solid transparent' }}>Dashboard</button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPerformanceMenu((prev) => !prev)}
              style={{
                background: currentView.startsWith('pa-') ? '#eef2ff' : 'none',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600',
                color: '#000',
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: '6px',
                borderBottom: currentView.startsWith('pa-') ? '3px solid #000' : '3px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              aria-haspopup="menu"
              aria-expanded={showPerformanceMenu}
            >
              <span>Analysis</span>
              <span style={{ fontSize: '12px' }}>▾</span>
            </button>
            {showPerformanceMenu && (
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
                  minWidth: '220px',
                  zIndex: 1100
                }}
                onMouseLeave={() => setShowPerformanceMenu(false)}
              >
                {performanceAnalyticsViews.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      handleNavigation(item.id);
                      setShowPerformanceMenu(false);
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f1f5f9';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => handleNavigation('ai-analysis')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: '#000', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'ai-analysis' ? '3px solid #000' : '3px solid transparent' }}>Ask Corelytics</button>
          <button onClick={() => handleNavigation('mda')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: '#000', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'mda' ? '3px solid #000' : '3px solid transparent' }}>MD&A</button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowRatiosMenu((prev) => !prev)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600',
                color: '#000',
                cursor: 'pointer',
                padding: '8px 12px',
                paddingRight: '26px',
                borderBottom: (currentView === 'kpis' || currentView === 'trend-analysis') ? '3px solid #000' : '3px solid transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                lineHeight: '1.1',
                position: 'relative'
              }}
              aria-haspopup="menu"
              aria-expanded={showRatiosMenu}
            >
              <span>Ratios and</span>
              <span style={{ display: 'block', textAlign: 'center' }}>Trends</span>
              <span style={{ fontSize: '12px', position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }}>▾</span>
            </button>
            {showRatiosMenu && (
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
                  minWidth: '180px',
                  zIndex: 1100
                }}
                onMouseLeave={() => setShowRatiosMenu(false)}
              >
                <button
                  onClick={() => {
                    handleNavigation('kpis');
                    setShowRatiosMenu(false);
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Ratios
                </button>
                <button
                  onClick={() => {
                    handleNavigation('trend-analysis');
                    setShowRatiosMenu(false);
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Trend Analysis
                </button>
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowProjectionsMenu((prev) => !prev)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600',
                color: '#000',
                cursor: 'pointer',
                padding: '8px 12px',
                paddingRight: '26px',
                borderBottom: (currentView === 'projections' || currentView === 'goals') ? '3px solid #000' : '3px solid transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                lineHeight: '1.1',
                position: 'relative'
              }}
              aria-haspopup="menu"
              aria-expanded={showProjectionsMenu}
            >
              <span>Goals and</span>
              <span style={{ display: 'block', textAlign: 'center' }}>Projections</span>
              <span style={{ fontSize: '12px', position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }}>▾</span>
            </button>
            {showProjectionsMenu && (
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
                  minWidth: '180px',
                  zIndex: 1100
                }}
                onMouseLeave={() => setShowProjectionsMenu(false)}
              >
                <button
                  onClick={() => {
                    handleNavigation('projections');
                    setShowProjectionsMenu(false);
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Projections
                </button>
                <button
                  onClick={() => {
                    handleNavigation('goals');
                    setShowProjectionsMenu(false);
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Goals
                </button>
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowCashMenu((prev) => !prev)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600',
                color: '#000',
                cursor: 'pointer',
                padding: '8px 12px',
                paddingRight: '26px',
                borderBottom: (currentView === 'cash-flow' || currentView === 'working-capital') ? '3px solid #000' : '3px solid transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                lineHeight: '1.1',
                position: 'relative'
              }}
              aria-haspopup="menu"
              aria-expanded={showCashMenu}
            >
              <span>Cash Flow and</span>
              <span style={{ display: 'block', textAlign: 'center' }}>Working Capital</span>
              <span style={{ fontSize: '12px', position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }}>▾</span>
            </button>
            {showCashMenu && (
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
                onMouseLeave={() => setShowCashMenu(false)}
              >
                <button
                  onClick={() => {
                    handleNavigation('cash-flow');
                    setShowCashMenu(false);
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Cash Flow
                </button>
                <button
                  onClick={() => {
                    handleNavigation('working-capital');
                    setShowCashMenu(false);
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Working Capital
                </button>
              </div>
            )}
          </div>
          <button onClick={() => handleNavigation('covenants')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: '#000', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'covenants' ? '3px solid #000' : '3px solid transparent' }}>Covenants</button>
          <button onClick={() => handleNavigation('operations')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: '#000', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'operations' ? '3px solid #000' : '3px solid transparent' }}>OPERATIONS</button>
        </nav>
      </div>
    </header>
  );
}

