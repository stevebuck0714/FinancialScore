 'use client';
 
 import React, { useEffect, useState } from 'react';
 
 interface PerformanceAnalyticsNavProps {
   currentView: string;
   setCurrentView: (view: string) => void;
 }
 
 const PERFORMANCE_ANALYTICS_VIEWS = [
   { id: 'pa-overview', label: 'Overview' },
  { id: 'pa-critical-issues', label: 'Critical Issues' },
  { id: 'pa-focus-board', label: 'Major Trends' },
   { id: 'pa-trend-explorer', label: 'Trend Explorer' },
   { id: 'pa-anomaly-inbox', label: 'Anomaly Inbox' },
   { id: 'pa-opportunity-workspace', label: 'Actions/Monitor' }
 ];
 
 export default function PerformanceAnalyticsNav({
   currentView,
   setCurrentView
}: PerformanceAnalyticsNavProps) {
  const [isExpanded, setIsExpanded] = useState(currentView.startsWith('pa-'));
 
   useEffect(() => {
    if (currentView.startsWith('pa-')) {
       setIsExpanded(true);
     }
   }, [currentView]);
 
   return (
     <div style={{ marginBottom: '1px' }}>
       <h3
        onClick={() => {
          const nextExpanded = !isExpanded;
          setIsExpanded(nextExpanded);
          if (nextExpanded && !currentView.startsWith('pa-')) {
            setCurrentView('pa-overview');
          }
        }}
         style={{
           fontSize: '14px',
           fontWeight: '700',
          color: currentView.startsWith('pa-') ? '#1F70C1' : '#1e293b',
           textTransform: 'uppercase',
           letterSpacing: '0.5px',
           padding: '1px 24px',
           marginBottom: '1px',
           cursor: 'pointer',
           display: 'flex',
           justifyContent: 'space-between',
           alignItems: 'center',
           transition: 'color 0.2s',
          borderLeft: currentView.startsWith('pa-') ? '4px solid #1F70C1' : '4px solid transparent'
         }}
         onMouseEnter={(e) => {
          e.currentTarget.style.color = '#1F70C1';
         }}
         onMouseLeave={(e) => {
          e.currentTarget.style.color = currentView.startsWith('pa-') ? '#1F70C1' : '#1e293b';
         }}
       >
         <span>Performance Analytics</span>
        <span style={{ fontSize: '12px', color: '#1F70C1' }}>{isExpanded ? '-' : '+'}</span>
       </h3>
       {isExpanded && (
         <div style={{ paddingLeft: '28px' }}>
           {PERFORMANCE_ANALYTICS_VIEWS.map((item) => (
             <div
               key={item.id}
               onClick={() => setCurrentView(item.id)}
               style={{
                 fontSize: '14px',
                color: currentView === item.id ? '#1F70C1' : '#475569',
                 padding: '4px 12px',
                 cursor: 'pointer',
                 borderRadius: '6px',
                 marginBottom: '4px',
                background: currentView === item.id ? '#e0f2fe' : 'transparent',
                 fontWeight: currentView === item.id ? '600' : '400',
                 transition: 'all 0.2s'
               }}
               onMouseEnter={(e) => {
                 if (currentView !== item.id) {
                   e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.color = '#1F70C1';
                 }
               }}
               onMouseLeave={(e) => {
                 if (currentView !== item.id) {
                   e.currentTarget.style.background = 'transparent';
                   e.currentTarget.style.color = '#475569';
                 }
               }}
             >
               {item.label}
             </div>
           ))}
         </div>
       )}
     </div>
   );
 }
