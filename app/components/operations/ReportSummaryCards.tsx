'use client';

import React, { useState } from 'react';

export type ReportSummaryCard = {
  label: string;
  value: string;
  title?: string;
};

export type ReportSummaryCardGroup = {
  key: string;
  title?: string;
  tone?: 'neutral' | 'annual' | 'month' | 'prior';
  cards: ReportSummaryCard[];
};

const TONES: Record<NonNullable<ReportSummaryCardGroup['tone']>, { title: string; background: string; border: string }> = {
  neutral: { title: '#475569', background: '#ffffff', border: '#e2e8f0' },
  annual: { title: '#92400e', background: '#fffbeb', border: '#fde68a' },
  month: { title: '#3730a3', background: '#eef2ff', border: '#c7d2fe' },
  prior: { title: '#475569', background: '#f8fafc', border: '#e2e8f0' },
};

export default function ReportSummaryCards({ groups }: { groups: ReportSummaryCardGroup[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleGroups = groups.filter((group) => group.cards.length > 0);
  if (!visibleGroups.length) return null;
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#ffffff', marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          border: 'none',
          background: 'transparent',
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 700,
          color: '#334155',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-block', width: 10, color: '#64748b' }}>{expanded ? '▾' : '▸'}</span>
        Summary
      </button>
      {expanded ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', padding: '4px 10px 10px' }}>
          {visibleGroups.map((group) => {
            const tone = TONES[group.tone || 'neutral'];
            return (
              <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                {group.title ? (
                  <div style={{ fontSize: 11, fontWeight: 800, color: tone.title, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {group.title}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {group.cards.map((card) => (
                    <div
                      key={card.label}
                      title={card.title}
                      style={{
                        background: tone.background,
                        border: `1px solid ${tone.border}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                        minWidth: 120,
                      }}
                    >
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, whiteSpace: 'nowrap' }}>{card.label}</div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          maxWidth: 280,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {card.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
