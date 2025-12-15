'use client';

import React, { useMemo } from 'react';
import { useMasterData } from '@/lib/master-data-store';
import dynamic from 'next/dynamic';

const ProjectionChart = dynamic(() => import('./charts/Charts').then(mod => mod.ProjectionChart), { ssr: false });

interface ProjectionsTabProps {
  selectedCompanyId: string;
  companyName: string;
}

export default function ProjectionsTab({
  selectedCompanyId,
  companyName,
}: ProjectionsTabProps) {
  const { monthlyData, loading, error } = useMasterData(selectedCompanyId);
  const monthly = monthlyData || [];

  // Projections calculation
  const projections = useMemo(() => {
    if (monthly.length < 24) return { mostLikely: [], bestCase: [], worstCase: [], monthlyWithNetIncome: [] };
    
    // Add computed netIncome field to monthly data
    const monthlyWithNetIncome = monthly.map(m => ({
      ...m,
      netIncome: (m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0)
    }));
    
    // Holt-Winters Triple Exponential Smoothing
    const holtWinters = (data: number[], seasonalPeriod: number = 12, alpha: number = 0.2, beta: number = 0.1, gamma: number = 0.1) => {
      const n = data.length;
      if (n < seasonalPeriod * 2) return null;
      
      // Initialize components
      const level: number[] = [];
      const trend: number[] = [];
      const seasonal: number[] = new Array(n).fill(1);
      
      // Calculate initial seasonal indices (average of first two complete seasons)
      for (let i = 0; i < seasonalPeriod; i++) {
        let sum = 0;
        let count = 0;
        for (let j = i; j < n; j += seasonalPeriod) {
          if (j < seasonalPeriod * 2) {
            sum += data[j];
            count++;
          }
        }
        const avg = sum / count;
        const overallAvg = data.slice(0, seasonalPeriod * 2).reduce((a, b) => a + b, 0) / (seasonalPeriod * 2);
        seasonal[i] = avg / overallAvg;
      }
      
      // Initialize level and trend
      level[0] = data[0] / seasonal[0];
      trend[0] = (data[seasonalPeriod] - data[0]) / seasonalPeriod;
      
      // Apply Holt-Winters equations
      for (let t = 1; t < n; t++) {
        const prevLevel = level[t - 1];
        const prevTrend = trend[t - 1];
        const seasonalIdx = t % seasonalPeriod;
        const prevSeasonal = seasonal[seasonalIdx];
        
        // Update level
        level[t] = alpha * (data[t] / prevSeasonal) + (1 - alpha) * (prevLevel + prevTrend);
        
        // Update trend
        trend[t] = beta * (level[t] - prevLevel) + (1 - beta) * prevTrend;
        
        // Update seasonal
        seasonal[t] = gamma * (data[t] / level[t]) + (1 - gamma) * prevSeasonal;
      }
      
      return { level: level[n - 1], trend: trend[n - 1], seasonal };
    };
    
    // Apply Holt-Winters to each metric
    const revData = monthlyWithNetIncome.map(m => m.revenue || 0);
    const cogsData = monthlyWithNetIncome.map(m => m.cogsTotal || 0);
    const expData = monthlyWithNetIncome.map(m => m.expense || 0);
    
    const revHW = holtWinters(revData);
    const cogsHW = holtWinters(cogsData);
    const expHW = holtWinters(expData);
    
    // For assets and liabilities, use simple growth
    const last12 = monthlyWithNetIncome.slice(-12);
    const prev12 = monthlyWithNetIncome.slice(-24, -12);
    const avgAssetGrowth = ((last12[last12.length - 1].totalAssets - prev12[prev12.length - 1].totalAssets) / prev12[prev12.length - 1].totalAssets) / 12;
    const avgLiabGrowth = ((last12[last12.length - 1].totalLiab - prev12[prev12.length - 1].totalLiab) / prev12[prev12.length - 1].totalLiab) / 12;
    
    const lastMonth = monthlyWithNetIncome[monthlyWithNetIncome.length - 1];
    const mostLikely: any[] = [];
    const bestCase: any[] = [];
    const worstCase: any[] = [];
    
    // Check if Holt-Winters is available (need 24+ months)
    if (revHW && cogsHW && expHW) {
      const seasonalPeriod = 12;
      const n = monthlyWithNetIncome.length;
      
      for (let i = 1; i <= 12; i++) {
        const monthName = `+${i}mo`;
        const seasonalIdx = (n + i - 1) % seasonalPeriod;
        
        // Most Likely: Standard Holt-Winters forecast
        const mlRev = Math.max(0, (revHW.level + i * revHW.trend) * revHW.seasonal[seasonalIdx]);
        const mlCogs = Math.max(0, (cogsHW.level + i * cogsHW.trend) * cogsHW.seasonal[seasonalIdx]);
        const mlExp = Math.max(0, (expHW.level + i * expHW.trend) * expHW.seasonal[seasonalIdx]);
        const mlAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth, i);
        const mlLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth, i);
        const mlEquity = mlAssets - mlLiab;
        
        mostLikely.push({
          month: monthName,
          revenue: mlRev,
          expense: mlExp,
          netIncome: mlRev - mlCogs - mlExp,
          totalAssets: mlAssets,
          totalLiab: mlLiab,
          totalEquity: mlEquity
        });
        
        // Best Case: Amplify trend by 50%
        const bcRev = Math.max(0, (revHW.level + i * revHW.trend * 1.5) * revHW.seasonal[seasonalIdx]);
        const bcCogs = Math.max(0, (cogsHW.level + i * cogsHW.trend * 0.5) * cogsHW.seasonal[seasonalIdx]); // Lower trend is better
        const bcExp = Math.max(0, (expHW.level + i * expHW.trend * 0.5) * expHW.seasonal[seasonalIdx]); // Lower trend is better
        const bcAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth * 1.2, i);
        const bcLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth * 0.8, i);
        const bcEquity = bcAssets - bcLiab;
        
        bestCase.push({
          month: monthName,
          revenue: bcRev,
          expense: bcExp,
          netIncome: bcRev - bcCogs - bcExp,
          totalAssets: bcAssets,
          totalLiab: bcLiab,
          totalEquity: bcEquity
        });
        
        // Worst Case: Reduce trend by 50%
        const wcRev = Math.max(0, (revHW.level + i * revHW.trend * 0.5) * revHW.seasonal[seasonalIdx]);
        const wcCogs = Math.max(0, (cogsHW.level + i * cogsHW.trend * 1.5) * cogsHW.seasonal[seasonalIdx]); // Higher trend is worse
        const wcExp = Math.max(0, (expHW.level + i * expHW.trend * 1.5) * expHW.seasonal[seasonalIdx]); // Higher trend is worse
        const wcAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth * 0.8, i);
        const wcLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth * 1.2, i);
        const wcEquity = wcAssets - wcLiab;
        
        worstCase.push({
          month: monthName,
          revenue: wcRev,
          expense: wcExp,
          netIncome: wcRev - wcCogs - wcExp,
          totalAssets: wcAssets,
          totalLiab: wcLiab,
          totalEquity: wcEquity
        });
      }
    } else {
      // Fallback to simple projection if not enough data
      const avgRevGrowth = monthlyWithNetIncome.length >= 2 
        ? (lastMonth.revenue - monthlyWithNetIncome[0].revenue) / monthlyWithNetIncome[0].revenue / monthlyWithNetIncome.length
        : 0;
      const avgCogsGrowth = monthlyWithNetIncome.length >= 2 
        ? ((lastMonth.cogsTotal || 0) - (monthlyWithNetIncome[0].cogsTotal || 0)) / (monthlyWithNetIncome[0].cogsTotal || 1) / monthlyWithNetIncome.length
        : 0;
      const avgExpGrowth = monthlyWithNetIncome.length >= 2 
        ? (lastMonth.expense - monthlyWithNetIncome[0].expense) / monthlyWithNetIncome[0].expense / monthlyWithNetIncome.length
        : 0;
      
      for (let i = 1; i <= 12; i++) {
        const monthName = `+${i}mo`;
        
        const mlRev = lastMonth.revenue * Math.pow(1 + avgRevGrowth, i);
        const mlCogs = (lastMonth.cogsTotal || 0) * Math.pow(1 + avgCogsGrowth, i);
        const mlExp = lastMonth.expense * Math.pow(1 + avgExpGrowth, i);
        const mlAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth, i);
        const mlLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth, i);
        const mlEquity = mlAssets - mlLiab;
        
        mostLikely.push({
          month: monthName,
          revenue: mlRev,
          expense: mlExp,
          netIncome: mlRev - mlCogs - mlExp,
          totalAssets: mlAssets,
          totalLiab: mlLiab,
          totalEquity: mlEquity
        });
        
        bestCase.push({
          month: monthName,
          revenue: mlRev * 1.1,
          expense: mlExp * 0.9,
          netIncome: (mlRev * 1.1) - (mlCogs * 0.9) - (mlExp * 0.9),
          totalAssets: mlAssets,
          totalLiab: mlLiab,
          totalEquity: mlEquity
        });
        
        worstCase.push({
          month: monthName,
          revenue: mlRev * 0.9,
          expense: mlExp * 1.1,
          netIncome: (mlRev * 0.9) - (mlCogs * 1.1) - (mlExp * 1.1),
          totalAssets: mlAssets,
          totalLiab: mlLiab,
          totalEquity: mlEquity
        });
      }
    }
    
    return { mostLikely, bestCase, worstCase, monthlyWithNetIncome };
  }, [monthly]);

  if (loading) {
    return (
      <div style={{ maxWidth: '100%', padding: '32px 32px 32px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#64748b' }}>Loading projections data...</div>
      </div>
    );
  }

  if (error || !monthly || monthly.length === 0) {
    return (
      <div style={{ maxWidth: '100%', padding: '32px 32px 32px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#ef4444' }}>No financial data available for projections</div>
      </div>
    );
  }

  if (projections.mostLikely.length === 0) {
    return (
      <div style={{ maxWidth: '100%', padding: '32px 32px 32px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#f59e0b' }}>
          Insufficient data for projections. Need at least 24 months of historical data.
        </div>
        <div style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>
          Currently have {monthly.length} months of data.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '100%', padding: '32px 32px 32px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Financial Projections</h1>
        {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
      </div>

      <div style={{ display: 'grid', gap: '32px' }}>
        <ProjectionChart 
          title="Revenue Projection" 
          historicalData={projections.monthlyWithNetIncome || monthly} 
          projectedData={projections} 
          valueKey="revenue" 
          formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} 
        />
        <ProjectionChart 
          title="Expense Projection" 
          historicalData={projections.monthlyWithNetIncome || monthly} 
          projectedData={projections} 
          valueKey="expense" 
          formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} 
        />
        <ProjectionChart 
          title="Net Income Projection" 
          historicalData={projections.monthlyWithNetIncome || monthly} 
          projectedData={projections} 
          valueKey="netIncome" 
          formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} 
        />
        <ProjectionChart 
          title="Total Assets Projection" 
          historicalData={monthly} 
          projectedData={projections} 
          valueKey="totalAssets" 
          formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} 
        />
        <ProjectionChart 
          title="Total Liabilities Projection" 
          historicalData={monthly} 
          projectedData={projections} 
          valueKey="totalLiab" 
          formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} 
        />
        <ProjectionChart 
          title="Equity Projection" 
          historicalData={monthly} 
          projectedData={projections} 
          valueKey="totalEquity" 
          formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} 
        />
      </div>
    </div>
  );
}

