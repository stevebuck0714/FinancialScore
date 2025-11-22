'use client';

import React from 'react';

export default function MAScoringGuideView() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Scoring Guide</h1>
      
      <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Rating Scale Descriptions</h2>
        
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ background: '#fee2e2', borderRadius: '8px', padding: '20px', border: '2px solid #ef4444' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#991b1b', marginBottom: '8px' }}>1 - No Evidence</div>
            <p style={{ fontSize: '14px', color: '#7f1d1d', margin: 0 }}>No evidence to support practices or any knowledge of subject</p>
          </div>
          <div style={{ background: '#fed7aa', borderRadius: '8px', padding: '20px', border: '2px solid #f97316' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#9a3412', marginBottom: '8px' }}>2 - Limited</div>
            <p style={{ fontSize: '14px', color: '#7c2d12', margin: 0 }}>Limited practices in place, limited knowledge of subject</p>
          </div>
          <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '20px', border: '2px solid #f59e0b' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#92400e', marginBottom: '8px' }}>3 - Basic</div>
            <p style={{ fontSize: '14px', color: '#78350f', margin: 0 }}>Basic practices in place, basic awareness of subject</p>
          </div>
          <div style={{ background: '#dbeafe', borderRadius: '8px', padding: '20px', border: '2px solid #3b82f6' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e40af', marginBottom: '8px' }}>4 - Clear Practices</div>
            <p style={{ fontSize: '14px', color: '#1e3a8a', margin: 0 }}>Clear practices in place, above average knowledge of subject</p>
          </div>
          <div style={{ background: '#d1fae5', borderRadius: '8px', padding: '20px', border: '2px solid #10b981' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#065f46', marginBottom: '8px' }}>5 - Extensive</div>
            <p style={{ fontSize: '14px', color: '#064e3b', margin: 0 }}>Extensive practices in place, extensive knowledge of subject</p>
          </div>
        </div>
      </div>
    </div>
  );
}

