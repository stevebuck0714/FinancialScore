'use client';

import React from 'react';
import { AssessmentRecord, AssessmentResponses } from '../../types';

interface MAChartsViewProps {
  selectedCompanyId: string | number;
  assessmentData: Array<{ id: number; name: string; questions: Array<{ id: string }> }>;
  assessmentRecords: AssessmentRecord[];
  assessmentResponses: AssessmentResponses;
  isReviewer: boolean;
  setCurrentView?: (view: string) => void;
  embedded?: boolean;
}

const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0);

export default function MAChartsView({
  selectedCompanyId,
  assessmentData,
  assessmentRecords,
  assessmentResponses,
  isReviewer,
  setCurrentView,
  embedded = false,
}: MAChartsViewProps) {
  const companyRecords = assessmentRecords.filter((r) => String(r.companyId) === String(selectedCompanyId));
  const hasData = isReviewer ? companyRecords.length > 0 : Object.keys(assessmentResponses).length > 0;

  // Reviewers see the average across all participants; participants see their own responses.
  const categoryScore = (category: { questions: Array<{ id: string }> }) => {
    const categoryQuestions = category.questions.map((q) => q.id);
    if (isReviewer) {
      const participantScores = companyRecords
        .map((record) => average(categoryQuestions.map((qId) => record.responses[qId]).filter((r) => r !== undefined)))
        .filter((s) => s > 0);
      return average(participantScores);
    }
    return average(categoryQuestions.map((qId) => assessmentResponses[qId]).filter((r) => r !== undefined));
  };
  const scores = assessmentData.map((category) => categoryScore(category));

  return (
    <div style={embedded ? undefined : { maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
      {!embedded && <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Assessment Charts</h1>}

      {!hasData ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#64748b', marginBottom: '16px' }}>No Assessment Data</h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '12px' }}>
            {isReviewer ? 'No users have completed assessments for this company yet.' : 'Please complete the questionnaire first to view charts.'}
          </p>
          {!isReviewer && setCurrentView && (
            <button
              onClick={() => setCurrentView('ma-questionnaire')}
              style={{ padding: '12px 32px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
            >
              Go to Questionnaire
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
              {isReviewer ? 'Average Category Scores - All Participants' : 'Category Scores - Bar Chart'}
            </h2>

            <div style={{ padding: '20px' }}>
              {assessmentData.map((category, idx) => {
                const avgScore = scores[idx];
                const percentage = (avgScore / 5) * 100;
                return (
                  <div key={category.id} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>{category.name}</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(2)} / 5.0</span>
                    </div>
                    <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '24px', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)', height: '100%', width: `${percentage}%`, transition: 'width 0.5s', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px' }}>
                        {percentage > 15 && <span style={{ fontSize: '12px', fontWeight: '600', color: 'white' }}>{percentage.toFixed(0)}%</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Category Scores - Radar Chart</h2>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <svg width="500" height="500" viewBox="0 0 500 500">
                <g transform="translate(250, 250)">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <circle key={level} cx="0" cy="0" r={level * 40} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                  ))}

                  {assessmentData.map((category, idx) => {
                    const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                    return (
                      <g key={category.id}>
                        <line x1="0" y1="0" x2={Math.cos(angle) * 200} y2={Math.sin(angle) * 200} stroke="#cbd5e1" strokeWidth="1" />
                        <text
                          x={Math.cos(angle) * 220}
                          y={Math.sin(angle) * 220}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="600"
                          fill="#475569"
                          dominantBaseline="middle"
                        >
                          {category.name.length > 20 ? category.name.substring(0, 18) + '...' : category.name}
                        </text>
                      </g>
                    );
                  })}

                  <polygon
                    points={assessmentData
                      .map((_, idx) => {
                        const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                        const radius = (scores[idx] / 5) * 200;
                        return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
                      })
                      .join(' ')}
                    fill="rgba(102, 126, 234, 0.2)"
                    stroke="#667eea"
                    strokeWidth="3"
                  />

                  {assessmentData.map((category, idx) => {
                    const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                    const radius = (scores[idx] / 5) * 200;
                    return (
                      <circle key={category.id} cx={Math.cos(angle) * radius} cy={Math.sin(angle) * radius} r="6" fill="#667eea" stroke="white" strokeWidth="2">
                        <title>{category.name}: {scores[idx].toFixed(2)}</title>
                      </circle>
                    );
                  })}

                  <circle cx="0" cy="0" r="30" fill="white" stroke="#cbd5e1" strokeWidth="1" />
                  <text x="0" y="-5" textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748b">Scale</text>
                  <text x="0" y="8" textAnchor="middle" fontSize="10" fill="#64748b">1 to 5</text>
                </g>
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
