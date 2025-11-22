'use client';

import React from 'react';
import { INDUSTRY_SECTORS } from '../../../data/industrySectors';
import { profilesApi, ApiError } from '@/lib/api-client';
import type { Company, CompanyProfile, MonthlyDataRow, User } from '../../types';

interface ProfileTabProps {
  selectedCompanyId: string;
  currentUser: User | null;
  company: Company | null;
  companyProfiles: CompanyProfile[];
  setCompanyProfiles: (profiles: CompanyProfile[]) => void;
  monthly: MonthlyDataRow[];
  trendData: any[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function ProfileTab({
  selectedCompanyId,
  currentUser,
  company,
  companyProfiles,
  setCompanyProfiles,
  monthly,
  trendData,
  isLoading,
  setIsLoading
}: ProfileTabProps) {
  // Get or create profile for this company
  let profile = companyProfiles.find(p => p.companyId === selectedCompanyId);
  
  if (!profile) {
    profile = {
      companyId: selectedCompanyId,
      legalStructure: '',
      businessStatus: '',
      ownership: '',
      keyEmployees: [],
      workforce: '',
      keyAdvisors: '',
      specialNotes: '',
      qoeNotes: '',
      disclosures: {
        bankruptcies: 'None',
        liens: 'None',
        contracts: 'None',
        lawsuits: 'None',
        mostFavoredNation: 'None',
        equityControl: 'None',
        rightOfFirstRefusal: 'None',
        shareholderProtections: 'None',
        changeInControl: 'None',
        regulatoryApprovals: 'None',
        auditedFinancials: 'No'
      }
    };
  }
  
  // Ensure keyEmployees exists
  if (!profile.keyEmployees) {
    profile.keyEmployees = [];
  }

  const updateProfile = (updates: Partial<CompanyProfile>) => {
    const updatedProfiles = companyProfiles.filter(p => p.companyId !== selectedCompanyId);
    updatedProfiles.push({ ...profile!, ...updates });
    setCompanyProfiles(updatedProfiles);
  };

  // Get company data
  const ltmData = monthly.length >= 12 ? monthly.slice(-12) : monthly;
  const ltmRev = ltmData.reduce((sum, m) => sum + m.revenue, 0);
  const ltmAssets = ltmData.length > 0 ? ltmData[ltmData.length - 1].totalAssets : 0;
  
  // Get latest 3 years of data for financial statement overview
  const latest = monthly[monthly.length - 1];
  const oneYearAgo = monthly.length >= 13 ? monthly[monthly.length - 13] : null;
  const twoYearsAgo = monthly.length >= 25 ? monthly[monthly.length - 25] : null;
  
  // Financial statement data is available here
  if (monthly.length > 0) {
    console.log('📊 Financial Statement Data:', {
      monthsCount: monthly.length,
      latest: latest ? {
        month: latest.month,
        totalAssets: latest.totalAssets,
        totalLiab: latest.totalLiab,
        totalEquity: latest.totalEquity
      } : null,
      oneYearAgo: oneYearAgo ? oneYearAgo.month : null,
      twoYearsAgo: twoYearsAgo ? twoYearsAgo.month : null,
      ltmRev
    });
  }

  // Get industry info
  const industry = INDUSTRY_SECTORS.find(i => i.id === company?.industrySector);
  
  // Calculate Last 12 months for ratio table
  // Get up to last 12 trend data points (or fewer if less data available)
  const last12Trends = trendData.slice(-12);
  // Get the corresponding months for these trend points
  // trendData starts at month index 12, so we need to match up the months
  const trendStartIndex = Math.max(0, monthly.length - trendData.length);
  const last12Months = monthly.slice(trendStartIndex + Math.max(0, trendData.length - 12));

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '8px 32px 32px 32px' }}>
      <style>{`
        @media print {
          @page {
            margin: 0.75in 0.75in 0.75in 0.75in;
          }
          
          body, main, main * {
            margin-top: 0 !important;
          }
          
          #first-profile-section {
            padding: 0 32px 32px 32px !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          
          .page-break {
            page-break-after: always;
            break-after: page;
            padding: 32px !important;
            margin: 0 !important;
          }
          
          .print-page-header {
            display: none !important;
          }
          
          aside, header, .no-print, .dashboard-header-print-hide, .dashboard-tabs-print-hide {
            display: none !important;
          }
          
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          
          main {
            padding: 0 !important;
            margin: 0 !important;
          }
          
          main > div {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
          }
          
          * {
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
        
        .print-page-header {
          display: none;
        }
      `}</style>
      
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '8px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Company Profile</h1>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          style={{ 
            padding: '12px 24px', 
            background: '#667eea', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            fontSize: '14px', 
            fontWeight: '600', 
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(102, 126, 234, 0.3)'
          }}
        >
          🖨️ Print Profile
        </button>
      </div>

      {/* Section 1: Business Profile */}
      <div id="first-profile-section" className="page-break" style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div className="print-page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{company?.name}</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
          Business Profile
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '12px 16px', marginBottom: '16px' }}>
          <div style={{ fontWeight: '600', color: '#475569' }}>COMPANY NAME</div>
          <div style={{ color: '#1e293b', gridColumn: 'span 3' }}>{company?.name || 'N/A'}</div>
          
          <div style={{ fontWeight: '600', color: '#475569' }}>LEGAL STRUCTURE</div>
          <input 
            type="text" 
            value={profile.legalStructure} 
            onChange={(e) => updateProfile({ legalStructure: e.target.value })}
            placeholder="e.g., C Corp, S Corp, LLC"
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', maxWidth: '200px' }}
          />
          
          <div style={{ fontWeight: '600', color: '#475569' }}>BUSINESS STATUS</div>
          <select
            value={profile.businessStatus}
            onChange={(e) => updateProfile({ businessStatus: e.target.value })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', maxWidth: '200px' }}
          >
            <option value="">Select status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="PENDING">PENDING</option>
          </select>
          
          <div style={{ fontWeight: '600', color: '#475569' }}>OWNERSHIP</div>
          <input 
            type="text" 
            value={profile.ownership} 
            onChange={(e) => updateProfile({ ownership: e.target.value })}
            placeholder="Owner name(s)"
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', gridColumn: 'span 3' }}
          />
        </div>
        
        {/* Key Employees Section */}
        <div style={{ marginTop: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontWeight: '600', color: '#475569' }}>KEY EMPLOYEES</div>
            <button
              onClick={() => {
                const newEmployees = [...(profile.keyEmployees || []), { name: '', title: '', yearEmployed: '' }];
                updateProfile({ keyEmployees: newEmployees });
              }}
              style={{
                padding: '6px 12px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              + Add Employee
            </button>
          </div>
          
          {profile.keyEmployees && profile.keyEmployees.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {profile.keyEmployees.map((employee: any, index: number) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 40px', gap: '12px', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                  <input
                    type="text"
                    value={employee.name || ''}
                    onChange={(e) => {
                      const newEmployees = [...profile.keyEmployees];
                      newEmployees[index] = { ...newEmployees[index], name: e.target.value };
                      updateProfile({ keyEmployees: newEmployees });
                    }}
                    placeholder="Name"
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <input
                    type="text"
                    value={employee.title || ''}
                    onChange={(e) => {
                      const newEmployees = [...profile.keyEmployees];
                      newEmployees[index] = { ...newEmployees[index], title: e.target.value };
                      updateProfile({ keyEmployees: newEmployees });
                    }}
                    placeholder="Title"
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <input
                    type="text"
                    value={employee.yearEmployed || ''}
                    onChange={(e) => {
                      const newEmployees = [...profile.keyEmployees];
                      newEmployees[index] = { ...newEmployees[index], yearEmployed: e.target.value };
                      updateProfile({ keyEmployees: newEmployees });
                    }}
                    placeholder="Year"
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <button
                    onClick={() => {
                      const newEmployees = profile.keyEmployees.filter((_: any, i: number) => i !== index);
                      updateProfile({ keyEmployees: newEmployees });
                    }}
                    style={{
                      padding: '8px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Remove employee"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', background: '#f8fafc', borderRadius: '8px' }}>
              No key employees added. Click "+ Add Employee" to add one.
            </div>
          )}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '12px 16px', marginBottom: '16px' }}>
          <div style={{ fontWeight: '600', color: '#475569' }}>ADDRESS</div>
          <div style={{ color: '#1e293b', gridColumn: 'span 3' }}>
            {company?.addressStreet || company?.addressCity ? (
              <>
                {company?.addressStreet && `${company.addressStreet}, `}
                {company?.addressCity && company.addressCity}
                {company?.addressState && `, ${company.addressState}`}
                {company?.addressZip && ` ${company.addressZip}`}
                {company?.addressCountry && `, ${company.addressCountry}`}
              </>
            ) : (
              'Not set'
            )}
          </div>
          
          <div style={{ fontWeight: '600', color: '#475569' }}>INDUSTRY</div>
          <div style={{ color: '#1e293b', gridColumn: 'span 3' }}>
            {industry ? `${industry.id} - ${industry.name}` : 'Not set'}
          </div>
          
          <div style={{ fontWeight: '600', color: '#475569' }}>WORKFORCE</div>
          <input 
            type="text" 
            value={profile.workforce} 
            onChange={(e) => updateProfile({ workforce: e.target.value })}
            placeholder="e.g., 3 FT, 1 owner"
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', gridColumn: 'span 3' }}
          />
          
          <div style={{ fontWeight: '600', color: '#475569' }}>KEY ADVISORS</div>
          <input 
            type="text" 
            value={profile.keyAdvisors} 
            onChange={(e) => updateProfile({ keyAdvisors: e.target.value })}
            placeholder="Advisor names"
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', gridColumn: 'span 3' }}
          />
        </div>
        
        <div style={{ marginTop: '24px' }}>
          <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px' }}>SPECIAL NOTES</div>
          <textarea
            value={profile.specialNotes}
            onChange={(e) => updateProfile({ specialNotes: e.target.value })}
            placeholder="Any special notes about sale, buyer requirements, financing, etc."
            rows={4}
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
        
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Quality of Earnings (QoE)</div>
          <textarea
            value={profile.qoeNotes}
            onChange={(e) => updateProfile({ qoeNotes: e.target.value })}
            placeholder="Notes on revenue quality, recurring vs. non-recurring, cash vs. credit, etc."
            rows={3}
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
      </div>

      {/* Section 2: Financial Statement Overview */}
      <div className="page-break" style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div className="print-page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{company?.name}</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
          Financial Statement Overview
        </h2>
        
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '16px' }}>BALANCE SHEET</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}></th>
                <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Current</th>
                <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Yr End 2024</th>
                <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Yr End 2023</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Total Assets</td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${latest ? latest.totalAssets.toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${oneYearAgo ? oneYearAgo.totalAssets.toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${twoYearsAgo ? twoYearsAgo.totalAssets.toLocaleString() : 'N/A'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Total Liabilities</td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${latest ? latest.totalLiab.toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${oneYearAgo ? oneYearAgo.totalLiab.toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${twoYearsAgo ? twoYearsAgo.totalLiab.toLocaleString() : 'N/A'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Total Equity</td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${latest ? latest.totalEquity.toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${oneYearAgo ? oneYearAgo.totalEquity.toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${twoYearsAgo ? twoYearsAgo.totalEquity.toLocaleString() : 'N/A'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginTop: '32px', marginBottom: '16px' }}>INCOME STATEMENT</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}></th>
                <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>LTM</th>
                <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>2024</th>
                <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>2023</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Revenue</td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${ltmRev.toLocaleString()}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${oneYearAgo ? monthly.slice(-24, -12).reduce((sum, m) => sum + m.revenue, 0).toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${twoYearsAgo ? monthly.slice(-36, -24).reduce((sum, m) => sum + m.revenue, 0).toLocaleString() : 'N/A'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Margin %</td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  {((ltmData.reduce((sum, m) => sum + (m.revenue - m.cogsTotal), 0) / ltmRev) * 100).toFixed(2)}%
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  {oneYearAgo ? ((monthly.slice(-24, -12).reduce((sum, m) => sum + (m.revenue - m.cogsTotal), 0) / monthly.slice(-24, -12).reduce((sum, m) => sum + m.revenue, 0)) * 100).toFixed(1) + '%' : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  {twoYearsAgo ? ((monthly.slice(-36, -24).reduce((sum, m) => sum + (m.revenue - m.cogsTotal), 0) / monthly.slice(-36, -24).reduce((sum, m) => sum + m.revenue, 0)) * 100).toFixed(1) + '%' : 'N/A'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Total Expenses</td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${ltmData.reduce((sum, m) => sum + m.expense, 0).toLocaleString()}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${oneYearAgo ? monthly.slice(-24, -12).reduce((sum, m) => sum + m.expense, 0).toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                  ${twoYearsAgo ? monthly.slice(-36, -24).reduce((sum, m) => sum + m.expense, 0).toLocaleString() : 'N/A'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Net Income</td>
                <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>
                  ${ltmData.reduce((sum, m) => sum + (m.revenue - m.expense), 0).toLocaleString()}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>
                  ${oneYearAgo ? monthly.slice(-24, -12).reduce((sum, m) => sum + (m.revenue - m.expense), 0).toLocaleString() : 'N/A'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>
                  ${twoYearsAgo ? monthly.slice(-36, -24).reduce((sum, m) => sum + (m.revenue - m.expense), 0).toLocaleString() : 'N/A'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Company Disclosures */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div className="print-page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{company?.name}</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
          Company Disclosures
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '12px' }}>
          <div style={{ fontWeight: '600', color: '#475569' }}>DISCLOSURE</div>
          <div style={{ fontWeight: '600', color: '#475569' }}>STATUS</div>
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Bankruptcies</div>
          <input 
            type="text" 
            value={profile.disclosures.bankruptcies} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, bankruptcies: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Liens or Judgements (business, equipment)</div>
          <input 
            type="text" 
            value={profile.disclosures.liens} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, liens: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Material Contract Covenants (e.g. on loans)</div>
          <input 
            type="text" 
            value={profile.disclosures.contracts} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, contracts: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Lawsuits (as plaintiff a/o defendant)</div>
          <input 
            type="text" 
            value={profile.disclosures.lawsuits} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, lawsuits: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Most Favored Nation on contracts</div>
          <input 
            type="text" 
            value={profile.disclosures.mostFavoredNation} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, mostFavoredNation: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Equity Control (who/how many needed)</div>
          <input 
            type="text" 
            value={profile.disclosures.equityControl} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, equityControl: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Right of First Refusal on sale</div>
          <input 
            type="text" 
            value={profile.disclosures.rightOfFirstRefusal} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, rightOfFirstRefusal: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Shareholder Protections (i.e. blocking/approvals)</div>
          <input 
            type="text" 
            value={profile.disclosures.shareholderProtections} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, shareholderProtections: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Change-in-Control triggers (i.e. with customers and/or suppliers)</div>
          <input 
            type="text" 
            value={profile.disclosures.changeInControl} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, changeInControl: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Regulatory Approvals (local/State/Federal)</div>
          <input 
            type="text" 
            value={profile.disclosures.regulatoryApprovals} 
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, regulatoryApprovals: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
          
          <div style={{ fontSize: '14px', color: '#1e293b' }}>Audited Financial Statements</div>
          <select
            value={profile.disclosures.auditedFinancials}
            onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, auditedFinancials: e.target.value } })}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          >
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value="Partial">Partial</option>
          </select>
        </div>
      </div>

      <div className="no-print" style={{ textAlign: 'center', padding: '24px' }}>
        <button
          onClick={async () => {
            setIsLoading(true);
            try {
              await profilesApi.save(selectedCompanyId, profile);
              alert('Profile saved successfully!');
            } catch (error) {
              alert(error instanceof ApiError ? error.message : 'Failed to save profile');
            } finally {
              setIsLoading(false);
            }
          }}
          disabled={isLoading}
          style={{ 
            padding: '12px 32px', 
            background: isLoading ? '#94a3b8' : '#667eea', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            fontSize: '16px', 
            fontWeight: '600', 
            cursor: isLoading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 6px rgba(102, 126, 234, 0.3)',
            opacity: isLoading ? 0.7 : 1
          }}
        >
          {isLoading ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
