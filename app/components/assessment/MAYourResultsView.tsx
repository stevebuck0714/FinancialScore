'use client';

import React from 'react';
import { User, Consultant, AssessmentRecord, AssessmentResponses } from '../../types';

interface MAYourResultsViewProps {
  selectedCompanyId: number;
  currentUser: User | Consultant | null;
  companyName: string;
  assessmentRecords: AssessmentRecord[];
  assessmentData: Array<{ id: number; name: string; questions: Array<{ id: string }> }>;
  assessmentResponses: AssessmentResponses;
  setCurrentView: (view: string) => void;
}

export default function MAYourResultsView({
  selectedCompanyId,
  currentUser,
  companyName,
  assessmentRecords,
  assessmentData,
  assessmentResponses,
  setCurrentView
}: MAYourResultsViewProps) {
  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
          {currentUser?.role === 'consultant' ? 'Assessment Results - All Participants' : 'Your Assessment Results'}
        </h1>
        {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
      </div>
      
      {currentUser?.role === 'consultant' ? (
        // Show all participants' results for consultants
        <>
          {assessmentRecords.filter(r => r.companyId === selectedCompanyId).length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>No Assessments Yet</h3>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>No users have completed assessments for this company</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '24px' }}>
              {assessmentRecords.filter(r => r.companyId === selectedCompanyId).map((record) => (
                <div key={record.id} style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                    <div>
                      <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{record.user?.name || record.userName || 'Unknown User'}</h2>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>
                        Completed: {new Date(record.completedAt || record.completedDate || '').toLocaleDateString()} | 
                        <span style={{ fontWeight: '600', color: '#667eea', marginLeft: '8px' }}>Overall Score: {record.overallScore.toFixed(2)}/5.0</span>
                      </div>
                    </div>
                  </div>
                  
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '16px' }}>Scores by Category</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    {assessmentData.map((category) => {
                      const categoryQuestions = category.questions.map(q => q.id);
                      const categoryResponses = categoryQuestions.map(qId => record.responses[qId]).filter(r => r !== undefined);
                      const avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                      
                      return (
                        <div key={category.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>{category.name}</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(2)}</div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>out of 5.0</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        // Show individual results for users
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Score by Category</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '12px' }}>
            {assessmentData.map((category) => {
              const categoryQuestions = category.questions.map(q => q.id);
              const categoryResponses = categoryQuestions.map(qId => assessmentResponses[qId]).filter(r => r !== undefined);
              const avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
              
              return (
                <div key={category.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>{category.name}</div>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(2)}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>out of 5.0</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button 
              onClick={() => setCurrentView('ma-questionnaire')}
              style={{ padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              Edit Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

