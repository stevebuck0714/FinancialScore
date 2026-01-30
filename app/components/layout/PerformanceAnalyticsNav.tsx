 'use client';
 
 import React, { useEffect, useState } from 'react';
 
 interface PerformanceAnalyticsNavProps {
   currentView: string;
   setCurrentView: (view: string) => void;
 }
 
 const PERFORMANCE_ANALYTICS_VIEWS = [
   { id: 'pa-overview', label: 'Overview' },
   { id: 'pa-focus-board', label: 'Focus Board' },
   { id: 'pa-trend-explorer', label: 'Trend Explorer' },
   { id: 'pa-anomaly-inbox', label: 'Anomaly Inbox' },
   { id: 'pa-opportunity-workspace', label: 'Opportunity Workspace' }
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
          setIsExpanded((prev) => {
            const next = !prev;
            if (next && !currentView.startsWith('pa-')) {
              setCurrentView('pa-overview');
            }
            return next;
          });
        }}
         style={{
           fontSize: '14px',
           fontWeight: '700',
           color: currentView.startsWith('pa-') ? '#667eea' : '#1e293b',
           textTransform: 'uppercase',
           letterSpacing: '0.5px',
           padding: '1px 24px',
           marginBottom: '1px',
           cursor: 'pointer',
           display: 'flex',
           justifyContent: 'space-between',
           alignItems: 'center',
           transition: 'color 0.2s',
           borderLeft: currentView.startsWith('pa-') ? '4px solid #667eea' : '4px solid transparent'
         }}
         onMouseEnter={(e) => {
           e.currentTarget.style.color = '#667eea';
         }}
         onMouseLeave={(e) => {
           e.currentTarget.style.color = currentView.startsWith('pa-') ? '#667eea' : '#1e293b';
         }}
       >
         <span>Performance Analytics</span>
         <span style={{ fontSize: '12px', color: '#667eea' }}>{isExpanded ? '-' : '+'}</span>
       </h3>
       {isExpanded && (
         <div style={{ paddingLeft: '28px' }}>
           {PERFORMANCE_ANALYTICS_VIEWS.map((item) => (
             <div
               key={item.id}
               onClick={() => setCurrentView(item.id)}
               style={{
                 fontSize: '14px',
                 color: currentView === item.id ? '#667eea' : '#475569',
                 padding: '4px 12px',
                 cursor: 'pointer',
                 borderRadius: '6px',
                 marginBottom: '4px',
                 background: currentView === item.id ? '#ede9fe' : 'transparent',
                 fontWeight: currentView === item.id ? '600' : '400',
                 transition: 'all 0.2s'
               }}
               onMouseEnter={(e) => {
                 if (currentView !== item.id) {
                   e.currentTarget.style.background = '#f8fafc';
                   e.currentTarget.style.color = '#667eea';
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
