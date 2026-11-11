'use client';

import React from 'react';
import { assessmentData } from '../../../data/assessmentData';
import MAScoresSummaryView from '../assessment/MAScoresSummaryView';
import MAYourResultsView from '../assessment/MAYourResultsView';
import MAChartsView from '../assessment/MAChartsView';
import MAScoringGuideView from '../assessment/MAScoringGuideView';

type ResultsTab = 'group' | 'individual' | 'charts' | 'scoring-guide';

const TABS: Array<{ id: ResultsTab; label: string }> = [
  { id: 'group', label: 'Group Results' },
  { id: 'individual', label: 'Individual Results' },
  { id: 'charts', label: 'Charts' },
  { id: 'scoring-guide', label: 'Scoring Guide' },
];

const ALL_GROUPS = 'all';

const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0);

function categoryAverage(records: any[], questionIds: string[]): number {
  const participantScores = records
    .map((record) => average(questionIds.map((qId) => record.responses?.[qId]).filter((r) => r !== undefined)))
    .filter((s) => s > 0);
  return average(participantScores);
}

function GroupComparison({ groups, records }: { groups: Array<{ id: string; name: string }>; records: any[] }) {
  const columns = groups.map((group) => ({ ...group, records: records.filter((r) => r.groupId === group.id) }));
  const cell: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', textAlign: 'center' };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginTop: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Compare Groups</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', color: '#64748b', fontSize: '12px' }}>Category</th>
            {columns.map((column) => (
              <th key={column.id} style={{ ...cell, color: '#1e293b', fontSize: '12px' }}>
                {column.name}
                <div style={{ fontWeight: 400, color: '#64748b', fontSize: '11px' }}>{column.records.length} submitted</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assessmentData.map((category) => {
            const questionIds = category.questions.map((q) => q.id);
            return (
              <tr key={category.id}>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 600, color: '#475569' }}>{category.name}</td>
                {columns.map((column) => (
                  <td key={column.id} style={{ ...cell, fontWeight: 700, color: '#667eea' }}>
                    {column.records.length > 0 ? categoryAverage(column.records, questionIds).toFixed(2) : '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TeamAssessmentResults({
  companyId,
  currentUser,
  assessmentRecords,
  groups,
}: {
  companyId: string;
  currentUser: any;
  assessmentRecords: any[];
  groups: Array<{ id: string; name: string }>;
}) {
  const [activeTab, setActiveTab] = React.useState<ResultsTab>('group');
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>(ALL_GROUPS);

  const companyRecords = assessmentRecords.filter((r) => String(r.companyId) === String(companyId));
  const groupStillExists = selectedGroupId === ALL_GROUPS || groups.some((g) => g.id === selectedGroupId);
  const effectiveGroupId = groupStillExists ? selectedGroupId : ALL_GROUPS;
  const records = effectiveGroupId === ALL_GROUPS ? companyRecords : companyRecords.filter((r) => r.groupId === effectiveGroupId);

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#475569', margin: 0 }}>Team Assessment Results</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {records.length} submitted assessment{records.length === 1 ? '' : 's'}
          </span>
          <select
            value={effectiveGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white' }}
          >
            <option value={ALL_GROUPS}>All Groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '16px' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              background: 'none',
              color: activeTab === tab.id ? '#2751d0' : '#64748b',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #2751d0' : '3px solid transparent',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'group' && (
        <>
          <MAScoresSummaryView selectedCompanyId={companyId as any} assessmentData={assessmentData} assessmentRecords={records} embedded />
          {effectiveGroupId === ALL_GROUPS && groups.length > 1 && <GroupComparison groups={groups} records={companyRecords} />}
        </>
      )}
      {activeTab === 'individual' && (
        <MAYourResultsView
          selectedCompanyId={companyId as any}
          currentUser={currentUser}
          companyName=""
          assessmentRecords={records}
          assessmentData={assessmentData}
          assessmentResponses={{}}
          setCurrentView={() => {}}
          isReviewer
          embedded
        />
      )}
      {activeTab === 'charts' && (
        <MAChartsView
          selectedCompanyId={companyId}
          assessmentData={assessmentData}
          assessmentRecords={records}
          assessmentResponses={{}}
          isReviewer
          embedded
        />
      )}
      {activeTab === 'scoring-guide' && <MAScoringGuideView embedded />}
    </div>
  );
}
