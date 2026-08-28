'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  FINANCIAL_SCORE_GLOSSARY,
  FINANCIAL_SCORE_TERMS,
} from '@/app/constants/financial-score-descriptions';

// Dynamic imports for charts
const LineChart = dynamic(() => import('./charts/Charts').then(mod => mod.LineChart), { ssr: false });

interface MonthlyData {
  date: Date;
  month: string;
  revenue: number;
  expense: number;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  ap: number;
  otherCL: number;
  tcl: number;
  totalAssets: number;
  totalLiab: number;
  totalEquity: number;
  cogsTotal?: number;
  netProfit?: number;
  depreciationAmortization?: number;
  fixedAssets?: number;
}

interface TrendDataPoint {
  month: string;
  revenue: number;
  expense: number;
  financialScore: number;
  profitabilityScore: number;
  rgs: number;
  rgsAdj: number;
  expenseAdj: number;
  adsScore: number;
  alr1: number;
  alrGrowth: number;
}

interface FinancialScoreViewProps {
  monthly: MonthlyData[];
  trendData: TrendDataPoint[];
  companyName: string | null;
  finalScore: number;
  profitabilityScore: number;
  assetDevScore: number;
  baseRGS: number;
  adjustedRGS: number;
  growth_24mo: number;
  growth_6mo: number;
  expenseAdjustment: number;
  alr1: number | string;
  alrGrowth: number;
}

export default function FinancialScoreView({
  monthly,
  trendData,
  companyName,
  finalScore,
  profitabilityScore,
  assetDevScore,
  baseRGS,
  adjustedRGS,
  growth_24mo,
  growth_6mo,
  expenseAdjustment,
  alr1,
  alrGrowth
}: FinancialScoreViewProps) {
  const [showScoreGuide, setShowScoreGuide] = useState(false);
  const [openTermKey, setOpenTermKey] = useState<string | null>(null);
  const openTerm = openTermKey ? FINANCIAL_SCORE_TERMS[openTermKey] : null;

  const termPopup = openTerm ? (
    <div
      className="no-print"
      onClick={() => setOpenTermKey(null)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px 28px',
          maxWidth: '560px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '12px' }}>
          <div>
            {openTerm.acronym ? (
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1F70C1', letterSpacing: '0.04em', marginBottom: '4px' }}>
                {openTerm.acronym}
              </div>
            ) : null}
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
              {openTerm.fullName}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpenTermKey(null)}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              lineHeight: 1,
              cursor: 'pointer',
              color: '#94a3b8',
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#334155', margin: 0 }}>
          {openTerm.definition}
        </p>
      </div>
    </div>
  ) : null;

  const glossaryList = (
    <div style={{ display: 'grid', gap: '10px' }}>
      {FINANCIAL_SCORE_GLOSSARY.map((item) => (
        <div key={item.term}>
          <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '2px' }}>{item.term}</div>
          <div>{item.definition}</div>
        </div>
      ))}
    </div>
  );

  const scoreGuideLink = (
    <button
      type="button"
      className="no-print"
      onClick={() => setShowScoreGuide(true)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: '#1F70C1',
        fontSize: '13px',
        fontWeight: 700,
        cursor: 'pointer',
        textDecoration: 'underline',
        whiteSpace: 'nowrap',
      }}
    >
      What is Corelytics Score?
    </button>
  );

  const scoreGuideModal = showScoreGuide ? (
    <div
      className="no-print"
      onClick={() => setShowScoreGuide(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '28px 32px',
          maxWidth: '720px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            About the Corelytics Financial Score
          </h2>
          <button
            type="button"
            onClick={() => setShowScoreGuide(false)}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              lineHeight: 1,
              cursor: 'pointer',
              color: '#94a3b8',
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: '14px', lineHeight: 1.7, color: '#334155' }}>
          <p style={{ margin: '0 0 12px 0' }}>
            We would like to introduce to you the emerging standard score for small and medium businesses, Corelytics Financial Score. On a scale of 1 to 100, 100 indicates a company that is firing on all cylinders and building value at a steady clip; a score of zero indicates no operations. The scores in between have a lot to say about the general health of any company being measured.
          </p>
          <p style={{ margin: '0 0 16px 0' }}>
            The score tells a lot about a company’s financial stability and their potential value in the market regardless of specific industry.
          </p>
          <p style={{ margin: '0 0 8px 0', fontWeight: 700, color: '#1e293b' }}>
            Approximate interpretation of Corelytics Financial Scores:
          </p>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, color: '#166534', marginBottom: '4px' }}>70 – 100 — Strong financial performance</div>
              <div>Good growth and good balance. In a good position for considering an M&A transaction. Excellent time to expand offerings and invest in R&D.</div>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: '4px' }}>50 – 70 — Good fundamentals</div>
              <div>In a good position for revenue growth. Needs to focus on bringing costs down as volume grows.</div>
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, color: '#b45309', marginBottom: '4px' }}>30 – 50 — Basic problems with cost structure</div>
              <div>Not in a position to grow. Improvements needed in operations and process controls. Growth without operating improvements could do significant harm.</div>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: '4px' }}>0 – 30 — Serious performance problems</div>
              <div>Problems exist which may not be correctable. Some form of major restructuring or liquidation may be best.</div>
            </div>
          </div>
          <p style={{ margin: '0 0 12px 0' }}>
            These scores are both diagnostic and prescriptive. They are diagnostic in that they identify a fundamental level of performance and related potential problems; prescriptive in that they point to specific actions that should be taken to remedy identified problems or take advantage of opportunities.
          </p>
          <p style={{ margin: '0 0 8px 0', fontWeight: 700, color: '#1e293b' }}>
            The overall score is based on the following major elements of financial performance:
          </p>
          <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px' }}>
            <li>Long-term and short-term trends in revenue growth and expense growth</li>
            <li>Trends in asset and liability growth</li>
          </ul>
          <p style={{ margin: '0 0 8px 0', fontWeight: 700, color: '#1e293b' }}>
            Score term definitions:
          </p>
          {glossaryList}
        </div>
      </div>
    </div>
  ) : null;

  const termLabel = (termKey: string, label: string) => {
    const term = FINANCIAL_SCORE_TERMS[termKey];
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpenTermKey(termKey)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpenTermKey(termKey);
          }
        }}
        title={term ? `${term.fullName}. ${term.definition}` : label}
        style={{
          cursor: 'help',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: '2px',
        }}
      >
        {label}
      </span>
    );
  };

  const chartDescription = (termKey: string) => ({
    showDescriptionButton: true as const,
    onDescriptionClick: () => setOpenTermKey(termKey),
  });

  if (!monthly || monthly.length === 0 || !trendData || trendData.length === 0) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {scoreGuideModal}
        {termPopup}
        <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#64748b', marginBottom: '16px' }}>
            No Financial Data Available
          </h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '16px' }}>
            Please upload financial data to view your Financial Score analysis.
          </p>
          {scoreGuideLink}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '12px 24px 24px' }}>
      <style>{`
        @media print {
          @page {
            margin: 0.3in;
          }
          
          /* Hide navigation and UI elements */
          .no-print,
          header,
          nav,
          aside,
          [role="navigation"],
          button {
            display: none !important;
          }
          
          /* Remove backgrounds and shadows for print */
          * {
            box-shadow: none !important;
          }
          
          /* Compress title and header */
          .fs-header h1 {
            font-size: 18px !important;
            margin-bottom: 8px !important;
          }
          
          .fs-header > div {
            font-size: 16px !important;
          }
          
          /* Compress main score cards */
          .fs-score-cards {
            margin-bottom: 12px !important;
            gap: 10px !important;
          }
          
          .fs-score-cards > div {
            padding: 10px !important;
            border-radius: 6px !important;
          }
          
          .fs-score-cards > div > div:first-child {
            font-size: 9px !important;
            margin-bottom: 4px !important;
          }
          
          .fs-score-cards > div > div:nth-child(2) {
            font-size: 22px !important;
          }
          
          /* Compress detail cards */
          .fs-detail-cards {
            gap: 8px !important;
            margin-bottom: 12px !important;
          }
          
          .fs-detail-cards > div {
            padding: 8px !important;
          }
          
          .fs-detail-cards > div > div:first-child {
            font-size: 8px !important;
          }
          
          .fs-detail-cards > div > div:nth-child(2) {
            font-size: 14px !important;
          }
          
          .fs-detail-cards > div > div:last-child {
            font-size: 7px !important;
          }
          
          /* Compress chart grid */
          .fs-charts-grid {
            gap: 8px !important;
          }
          
          .fs-charts-grid > div {
            transform: scale(0.65);
            transform-origin: top left;
            width: 153.85%;
            height: 250px;
            margin-bottom: -69px;
          }
          
          /* Force page break after row 2 (after 4th chart) */
          .fs-charts-grid > div:nth-child(4) {
            page-break-after: always;
            break-after: page;
          }
          
          /* Show page 2 header only on print */
          .page-2-header {
            display: block !important;
            margin-top: 72px !important;
          }
          
          h2 {
            font-size: 12px !important;
            margin-bottom: 8px !important;
          }
        }
      `}</style>
      
      {scoreGuideModal}
      {termPopup}
      <div className="fs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Corelytics Financial Score Trends</h1>
          {scoreGuideLink}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            className="no-print"
            onClick={() => window.print()} 
            style={{ 
              padding: '6px 14px', 
              background: '#667eea', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              fontSize: '13px', 
              fontWeight: '600', 
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}>
            🖨️ Print
          </button>
        </div>
      </div>
      
      {monthly.length >= 24 && (
        <div style={{ background: 'white', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Financial Score Analysis</h2>
          
          <div className="fs-score-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '8px' }}>
            <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '6px', padding: '8px 10px', color: 'white' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', marginBottom: '2px', opacity: 0.9 }}>{termLabel('Corelytics Financial Score', 'Corelytics Financial Score')}</div>
              <div style={{ fontSize: '22px', fontWeight: '700', lineHeight: 1.15 }}>{finalScore.toFixed(2)}</div>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: '6px', padding: '8px 10px', border: '1px solid #86efac' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#166534', marginBottom: '2px' }}>{termLabel('Profitability Score', 'Profitability Score')}</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#10b981', lineHeight: 1.15 }}>{profitabilityScore.toFixed(2)}</div>
            </div>
            <div style={{ background: '#ede9fe', borderRadius: '6px', padding: '8px 10px', border: '1px solid #c4b5fd' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#5b21b6', marginBottom: '2px' }}>{termLabel('Asset Development Score', 'ADS — Asset Development Score')}</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#8b5cf6', lineHeight: 1.15 }}>{assetDevScore.toFixed(2)}</div>
            </div>
          </div>

          <div className="fs-detail-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '8px' }}>
            <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '6px 8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{termLabel('Base RGS (24mo)', 'Base RGS — Revenue Growth Score (24 mo)')}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', lineHeight: 1.2 }}>{baseRGS.toFixed(0)}</div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Growth: {growth_24mo.toFixed(1)}%</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '6px 8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{termLabel('Adjusted RGS (6mo)', 'Adjusted RGS — 6-month adjustment')}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', lineHeight: 1.2 }}>{adjustedRGS.toFixed(1)}</div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Growth: {growth_6mo.toFixed(1)}%</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '6px 8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{termLabel('Expense Adjustment', 'Expense Adjustment')}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: expenseAdjustment >= 0 ? '#10b981' : '#ef4444', lineHeight: 1.2 }}>
                {expenseAdjustment >= 0 ? '+' : ''}{expenseAdjustment}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>
                {expenseAdjustment > 0 ? '✓ BONUS' : expenseAdjustment < 0 ? '✗ PENALTY' : 'NEUTRAL'}
              </div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '6px 8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{termLabel('ALR-1 (Current)', 'ALR — Asset-Liability Ratio')}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', lineHeight: 1.2 }}>{typeof alr1 === 'number' ? alr1.toFixed(2) : alr1}</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '6px 8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b' }}>{termLabel('ALR Growth %', 'ALR Growth %')}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: alrGrowth >= 0 ? '#10b981' : '#ef4444', lineHeight: 1.2 }}>
                {alrGrowth >= 0 ? '+' : ''}{alrGrowth.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="no-print" style={{ background: 'white', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Score term definitions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 20px', fontSize: '12px', lineHeight: 1.55, color: '#334155' }}>
          {FINANCIAL_SCORE_GLOSSARY.map((item) => (
            <div key={item.term}>
              <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '2px' }}>{item.term}</div>
              <div>{item.definition}</div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="fs-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
        <LineChart title="Financial Score Trend" data={trendData} valueKey="financialScore" color="#667eea" compact {...chartDescription('Financial Score Trend')} />
        <LineChart title="Profitability Score Trend" data={trendData} valueKey="profitabilityScore" color="#10b981" compact {...chartDescription('Profitability Score Trend')} />
        <LineChart title="Revenue Growth Score (RGS)" data={trendData} valueKey="rgs" color="#f59e0b" compact {...chartDescription('Revenue Growth Score (RGS)')} />
        <LineChart title="RGS with 6-Month Adjustment" data={trendData} valueKey="rgsAdj" color="#3b82f6" compact {...chartDescription('RGS with 6-Month Adjustment')} />
        
        {/* Page 2 Header - only visible in print */}
        <div className="page-2-header" style={{ display: 'none', gridColumn: '1 / -1', paddingBottom: '72px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Corelytics Financial Score Trends (cont)</h1>
            {companyName && <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
          </div>
        </div>
        
        <LineChart title="Expense Adjustment" data={trendData} valueKey="expenseAdj" color="#8b5cf6" compact {...chartDescription('Expense Adjustment')} />
        <LineChart title="Asset Development Score (ADS)" data={trendData} valueKey="adsScore" color="#ec4899" compact {...chartDescription('Asset Development Score (ADS)')} />
        <LineChart title="ALR-1 (Asset-Liability Ratio)" data={trendData} valueKey="alr1" color="#14b8a6" compact {...chartDescription('ALR-1 (Asset-Liability Ratio)')} />
        <LineChart title="ALR Growth %" data={trendData} valueKey="alrGrowth" color="#f97316" compact {...chartDescription('ALR Growth %')} />
      </div>
    </div>
  );
}

