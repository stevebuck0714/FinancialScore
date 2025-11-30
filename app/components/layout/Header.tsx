'use client';

import React from 'react';

interface User {
  name: string | null;
  role?: string;
  userType?: string;
}

interface HeaderProps {
  currentUser: User | null;
  currentView: string;
  setCurrentView: (view: string) => void;
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
  if (!currentUser) return null;

  // Site Admin Header
  if (currentUser.role === 'siteadmin') {
    return (
      <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '80px' }}>
          <div 
            style={{ fontSize: '28px', fontWeight: '700', color: '#4338ca', cursor: 'pointer', letterSpacing: '-0.5px' }} 
            onClick={() => setCurrentView('siteadmin')}
          >
            Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b' }}>Site Administration</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: '700', color: '#475569' }}>{currentUser.name}</span>
          <button 
            onClick={handleLogout} 
            style={{ 
              padding: '8px 16px', 
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
            Logout
          </button>
        </div>
      </header>
    );
  }

  // Assessment User Header (Simple)
  if (currentUser.userType === 'assessment') {
    return (
      <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        <div style={{ fontSize: '28px', fontWeight: '700', color: '#4338ca', letterSpacing: '-0.5px' }}>
          Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup> - Management Assessment
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: '700', color: '#475569' }}>{currentUser.name}</span>
          <button 
            onClick={handleLogout} 
            style={{ 
              padding: '8px 16px', 
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
            Logout
          </button>
        </div>
      </header>
    );
  }

  // Regular User Header (with navigation)
  return (
    <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '80px' }}>
        <div 
          style={{ fontSize: '28px', fontWeight: '700', color: '#4338ca', cursor: 'pointer', letterSpacing: '-0.5px' }} 
          onClick={() => currentUser.role === 'consultant' ? setCurrentView('consultant-dashboard') : setCurrentView('fs-score')}
        >
          Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
        </div>
        <nav style={{ display: 'flex', gap: '24px' }}>
          <button onClick={() => handleNavigation('dashboard')} style={{ background: currentView === 'dashboard' ? '#eef2ff' : 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'dashboard' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderRadius: '6px', borderBottom: currentView === 'dashboard' ? '3px solid #667eea' : '3px solid transparent' }}>Dashboard</button>
          <button onClick={() => handleNavigation('mda')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'mda' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'mda' ? '3px solid #667eea' : '3px solid transparent' }}>MD&A</button>
          <button onClick={() => handleNavigation('kpis')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'kpis' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'kpis' ? '3px solid #667eea' : '3px solid transparent' }}>Ratios</button>
          <button onClick={() => handleNavigation('trend-analysis')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'trend-analysis' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'trend-analysis' ? '3px solid #667eea' : '3px solid transparent' }}>Trend Analysis</button>
          <button onClick={() => handleNavigation('projections')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'projections' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'projections' ? '3px solid #667eea' : '3px solid transparent' }}>Projections</button>
          <button onClick={() => handleNavigation('goals')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'goals' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'goals' ? '3px solid #667eea' : '3px solid transparent' }}>Goals</button>
          <button onClick={() => handleNavigation('cash-flow')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'cash-flow' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'cash-flow' ? '3px solid #667eea' : '3px solid transparent' }}>Cash Flow</button>
          <button onClick={() => handleNavigation('working-capital')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'working-capital' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'working-capital' ? '3px solid #667eea' : '3px solid transparent' }}>Working Capital</button>
          <button onClick={() => handleNavigation('valuation')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'valuation' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'valuation' ? '3px solid #667eea' : '3px solid transparent' }}>Valuation</button>
          <button onClick={() => handleNavigation('financial-statements')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'financial-statements' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'financial-statements' ? '3px solid #667eea' : '3px solid transparent' }}>Financial Statements</button>
        </nav>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
        <span style={{ fontSize: '16px', fontWeight: '700', color: '#475569' }}>{currentUser.name}</span>
        <button 
          onClick={handleLogout} 
          style={{ 
            padding: '8px 16px', 
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
          Logout
        </button>
      </div>
    </header>
  );
}

