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
  setEditingCompanyId?: (id: string) => void;
  setCompanyAddressStreet?: (street: string) => void;
  setCompanyAddressCity?: (city: string) => void;
  setCompanyAddressState?: (state: string) => void;
  setCompanyAddressZip?: (zip: string) => void;
  setCompanyAddressCountry?: (country: string) => void;
  setCompanyIndustrySector?: (sector: string) => void;
  setAccountingSystem?: (system: string) => void;
  setCompanySizeCategory?: (size: string) => void;
  setIndustrySectorCategory?: (sector: string) => void;
  setShowCompanyDetailsModal?: (show: boolean) => void;
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
  setIsLoading,
  setEditingCompanyId,
  setCompanyAddressStreet,
  setCompanyAddressCity,
  setCompanyAddressState,
  setCompanyAddressZip,
  setCompanyAddressCountry,
  setCompanyIndustrySector,
  setAccountingSystem,
  setCompanySizeCategory,
  setIndustrySectorCategory,
  setShowCompanyDetailsModal
}: ProfileTabProps) {
  // State for LOB management
  const [linesOfBusiness, setLinesOfBusiness] = React.useState<string[]>(['', '', '', '', '']);
  const [headcountAllocations, setHeadcountAllocations] = React.useState<{ [lobName: string]: number }>({});
  const [userDefinedAllocations, setUserDefinedAllocations] = React.useState<{ lobName: string; percentage: number }[]>([]);

  // Load LOB data when component mounts or company changes
  React.useEffect(() => {
    if (company?.linesOfBusiness) {
      // Extract LOB names from objects (in case they're objects with name property)
      const lobs = company.linesOfBusiness.map(lob =>
        typeof lob === 'string' ? lob : (lob as any)?.name || ''
      );
      while (lobs.length < 5) lobs.push('');
      setLinesOfBusiness(lobs);
    }

    if (company?.headcountAllocations) {
      setHeadcountAllocations(company.headcountAllocations as { [lobName: string]: number });
    }

    if (company?.userDefinedAllocations && Array.isArray(company.userDefinedAllocations)) {
      setUserDefinedAllocations(company.userDefinedAllocations as { lobName: string; percentage: number }[]);
    }
  }, [company]);

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
          
          /* Hide non-print elements */
          aside, header, .no-print, .dashboard-header-print-hide, .dashboard-tabs-print-hide {
            display: none !important;
          }
          
          /* Reset body and main */
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          
          main {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          
          /* Reset all parent containers that might constrain the profile */
          body *, main *, main > div, main > div > div, 
          .company-management-container, #profile-print-wrapper {
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            min-height: 0 !important;
            max-width: none !important;
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          
          /* Profile sections */
          #first-profile-section {
            padding: 0 32px 32px 32px !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            background: white !important;
          }
          
          .page-break {
            page-break-after: always;
            break-after: page;
            padding: 32px !important;
            margin: 0 !important;
            background: white !important;
          }
          
          .print-page-header {
            display: block !important;
          }
          
          /* Grid layout for print */
          .profile-grid {
            display: block !important;
          }
          
          .profile-grid > div {
            page-break-inside: avoid;
            margin-bottom: 20px !important;
          }
        }
        
        .print-page-header {
          display: none;
        }
      `}</style>
      

      {/* 2-Column Layout */}
      <div className="profile-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '12px' }}>
        
        {/* Container 1: Company Profile */}
        <div id="first-profile-section" className="page-break" style={{ background: 'white', borderRadius: '12px', padding: '4px 32px 32px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
              Company Profile
            </h2>
            <button
              className="no-print"
              onClick={() => window.print()}
              style={{ 
                padding: '8px 16px', 
                background: '#667eea', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                fontSize: '13px', 
                fontWeight: '600', 
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)',
                whiteSpace: 'nowrap'
              }}
            >
              🖨️ Print
            </button>
          </div>
        
        {/* Company Header Info */}
        <div style={{ marginBottom: '24px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '2px solid #667eea' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{company?.name}</h3>
              <div style={{ fontSize: '13px', color: '#10b981', fontWeight: '600' }}>✓ Active Company</div>
            </div>
            {setEditingCompanyId && setShowCompanyDetailsModal && (
              <button
                onClick={() => {
                  if (company && setEditingCompanyId && setCompanyAddressStreet && setCompanyAddressCity && 
                      setCompanyAddressState && setCompanyAddressZip && setCompanyAddressCountry && 
                      setCompanyIndustrySector && setShowCompanyDetailsModal) {
                    setEditingCompanyId(company.id);
                    setCompanyAddressStreet(company.addressStreet || '');
                    setCompanyAddressCity(company.addressCity || '');
                    setCompanyAddressState(company.addressState || '');
                    setCompanyAddressZip(company.addressZip || '');
                    setCompanyAddressCountry(company.addressCountry || 'USA');
                    setCompanyIndustrySector(company.industrySector || '');
                    if (setAccountingSystem) setAccountingSystem(company.accountingSystem || '');
                    if (setCompanySizeCategory) setCompanySizeCategory(company.companySizeCategory || 'DEFAULT');
                    if (setIndustrySectorCategory) setIndustrySectorCategory(company.industrySectorCategory || 'DEFAULT');
                    setShowCompanyDetailsModal(true);
                  }
                }}
                style={{
                  padding: '6px 12px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                }}
              >
                Edit Details
              </button>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
            <span style={{ fontWeight: '600', display: 'block', marginBottom: '4px' }}>Address:</span>
            {company?.addressStreet || company?.addressCity ? (
              <div style={{ color: '#1e293b' }}>
                {company?.addressStreet && <div>{company.addressStreet}</div>}
                <div>
                  {company?.addressCity && company.addressCity}
                  {company?.addressState && `, ${company.addressState}`}
                  {company?.addressZip && ` ${company.addressZip}`}
                </div>
                {company?.addressCountry && <div>{company.addressCountry}</div>}
              </div>
            ) : (
              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not set</span>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            <span style={{ fontWeight: '600' }}>Industry:</span>{' '}
            <span style={{ color: '#1e293b' }}>
              {industry ? `${industry.id} - ${industry.name}` : 'Not set'}
            </span>
          </div>
        </div>
        
        {/* Business Details Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          
          {/* Business Status */}
          <div>
            <label style={{ display: 'block', fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '8px' }}>
              BUSINESS STATUS
            </label>
            <select
              value={profile.businessStatus}
              onChange={(e) => updateProfile({ businessStatus: e.target.value })}
              style={{ 
                width: '100%',
                padding: '10px 12px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1', 
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="">Select status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>
          
          {/* Legal Structure */}
          <div>
            <label style={{ display: 'block', fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '8px' }}>
              LEGAL STRUCTURE
            </label>
            <input 
              type="text" 
              value={profile.legalStructure} 
              onChange={(e) => updateProfile({ legalStructure: e.target.value })}
              placeholder="e.g., C Corp, S Corp, LLC"
              style={{ 
                width: '100%',
                padding: '10px 12px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1', 
                fontSize: '14px'
              }}
            />
          </div>
          
          {/* Ownership */}
          <div>
            <label style={{ display: 'block', fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '8px' }}>
              OWNERSHIP
            </label>
            <input 
              type="text" 
              value={profile.ownership} 
              onChange={(e) => updateProfile({ ownership: e.target.value })}
              placeholder="Owner name(s)"
              style={{ 
                width: '100%',
                padding: '10px 12px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1', 
                fontSize: '14px'
              }}
            />
          </div>
          
          {/* Workforce */}
          <div>
            <label style={{ display: 'block', fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '8px' }}>
              WORKFORCE
            </label>
            <input 
              type="text" 
              value={profile.workforce} 
              onChange={(e) => updateProfile({ workforce: e.target.value })}
              placeholder="e.g., 3 FT, 1 owner"
              style={{ 
                width: '100%',
                padding: '10px 12px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1', 
                fontSize: '14px'
              }}
            />
          </div>
          
          {/* Key Advisors */}
          <div>
            <label style={{ display: 'block', fontWeight: '600', color: '#475569', fontSize: '13px', marginBottom: '8px' }}>
              KEY ADVISORS
            </label>
            <input 
              type="text" 
              value={profile.keyAdvisors} 
              onChange={(e) => updateProfile({ keyAdvisors: e.target.value })}
              placeholder="Advisor names"
              style={{ 
                width: '100%',
                padding: '10px 12px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1', 
                fontSize: '14px'
              }}
            />
          </div>
        </div>
        
        {/* Key Employees Section */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px' }}>KEY EMPLOYEES</label>
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
                <div key={index} style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                      Employee {index + 1}
                    </div>
                    <button
                      onClick={() => {
                        const newEmployees = profile.keyEmployees.filter((_: any, i: number) => i !== index);
                        updateProfile({ keyEmployees: newEmployees });
                      }}
                      style={{
                        padding: '4px 8px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                      title="Remove employee"
                    >
                      Remove
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={employee.name || ''}
                        onChange={(e) => {
                          const newEmployees = [...profile.keyEmployees];
                          newEmployees[index] = { ...newEmployees[index], name: e.target.value };
                          updateProfile({ keyEmployees: newEmployees });
                        }}
                        placeholder="Full name"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                        Title
                      </label>
                      <input
                        type="text"
                        value={employee.title || ''}
                        onChange={(e) => {
                          const newEmployees = [...profile.keyEmployees];
                          newEmployees[index] = { ...newEmployees[index], title: e.target.value };
                          updateProfile({ keyEmployees: newEmployees });
                        }}
                        placeholder="Job title"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                        Year
                      </label>
                      <input
                        type="text"
                        value={employee.yearEmployed || ''}
                        onChange={(e) => {
                          const newEmployees = [...profile.keyEmployees];
                          newEmployees[index] = { ...newEmployees[index], yearEmployed: e.target.value };
                          updateProfile({ keyEmployees: newEmployees });
                        }}
                        placeholder="2020"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', background: '#f8fafc', borderRadius: '8px' }}>
              No key employees added. Click "+ Add Employee" to add one.
            </div>
          )}
        </div>
        </div>

        {/* Container 2: Company Disclosures */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '4px 32px 32px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
              Company Disclosures
            </h2>
            <button
              className="no-print"
              onClick={() => window.print()}
              style={{ 
                padding: '8px 16px', 
                background: '#667eea', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                fontSize: '13px', 
                fontWeight: '600', 
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)',
                whiteSpace: 'nowrap'
              }}
            >
              🖨️ Print
            </button>
          </div>
        
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
