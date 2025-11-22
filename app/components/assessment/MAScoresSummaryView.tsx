'use client';

import React from 'react';
import { AssessmentRecord } from '../../types';

interface MAScoresSummaryViewProps {
  selectedCompanyId: number;
  assessmentData: Array<{ id: number; name: string; questions: Array<{ id: string }> }>;
  assessmentRecords: AssessmentRecord[];
}

export default function MAScoresSummaryView({
  selectedCompanyId,
  assessmentData,
  assessmentRecords
}: MAScoresSummaryViewProps) {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Scores Summary - All Participants</h1>
      
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Average Scores Across All Participants</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {assessmentData.map((category) => {
            const companyRecords = assessmentRecords.filter(r => r.companyId === selectedCompanyId);
            const allCategoryScores = companyRecords.map(record => {
              const categoryQuestions = category.questions.map(q => q.id);
              const categoryResponses = categoryQuestions.map(qId => record.responses[qId]).filter(r => r !== undefined);
              return categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
            }).filter(s => s > 0);
            
            const avgScore = allCategoryScores.length > 0 ? allCategoryScores.reduce((sum, val) => sum + val, 0) / allCategoryScores.length : 0;
            
            return (
              <div key={category.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>{category.name}</div>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(2)}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>avg across {allCategoryScores.length} participant(s)</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

