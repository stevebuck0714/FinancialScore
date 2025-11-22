'use client';

import React from 'react';

interface MAWelcomeViewProps {
  companyName: string;
  assessmentData: Array<{ id: number; name: string; questions: any[] }>;
  setCurrentView: (view: string) => void;
}

export default function MAWelcomeView({
  companyName,
  assessmentData,
  setCurrentView
}: MAWelcomeViewProps) {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '40px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        {companyName && <div style={{ fontSize: '36px', fontWeight: '700', color: '#1e293b', textAlign: 'center', marginBottom: '12px' }}>{companyName}</div>}
        <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#1e293b', marginBottom: '12px', textAlign: 'center' }}>Management Assessment Questionnaire</h1>
        
        <div style={{ fontSize: '16px', color: '#475569', lineHeight: '1.8', maxWidth: '900px', margin: '0 auto 32px', textAlign: 'left' }}>
          <p style={{ marginBottom: '16px' }}>
            Our Trademarked assessment tool is designed to facilitate the discovery of Management Maturity Level in small businesses. It has been developed to highlight areas under financial management that can be targeted for improvement.
          </p>
          
          <p style={{ marginBottom: '16px' }}>
            The tool is a questionnaire to be completed by the key employees in your company. It is designed as a tool for management to help you better understand the strengths and weaknesses of your processes and communications across teams in your company.
          </p>
          
          <p style={{ marginBottom: '0' }}>
            The Management Assessment service provides detailed evaluation of your company's management practices, leadership effectiveness, and organizational structure to help you optimize performance and drive growth.
          </p>
        </div>
        
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '32px', marginTop: '32px', textAlign: 'left' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>Topics Covered</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '14px', color: '#475569' }}>
            {assessmentData.map((cat) => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span>
                <span>{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={() => setCurrentView('ma-questionnaire')}
          style={{ marginTop: '32px', padding: '16px 48px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(102,126,234,0.3)' }}
        >
          Start Assessment
        </button>
      </div>
    </div>
  );
}

