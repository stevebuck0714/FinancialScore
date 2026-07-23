'use client';

import React from 'react';
import { INDUSTRY_SECTORS } from '../../../data/industrySectors';
import { profilesApi, companiesApi, ApiError } from '@/lib/api-client';
import { ACCOUNTING_SYSTEMS, COMPANY_SIZES, INDUSTRY_SECTORS as INDUSTRY_SECTOR_OPTIONS } from '../../../lib/constants/company-options';
import { US_STATES } from '../../constants';
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
  onCompanyUpdated?: (company: Company) => void;
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

type DisclosureStatus = 'NONE' | 'YES';
type DisclosureValue = string | { status?: string; notes?: string };

const DISCLOSURE_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'bankruptcies', label: 'Bankruptcies' },
  { key: 'liens', label: 'Liens or Judgements (business, equipment)' },
  { key: 'contracts', label: 'Material Contract Covenants (e.g. on loans)' },
  { key: 'lawsuits', label: 'Lawsuits (as plaintiff a/o defendant)' },
  { key: 'mostFavoredNation', label: 'Most Favored Nation on contracts' },
  { key: 'equityControl', label: 'Equity Control (who/how many needed)' },
  { key: 'rightOfFirstRefusal', label: 'Right of First Refusal on sale' },
  { key: 'shareholderProtections', label: 'Shareholder Protections (i.e. blocking/approvals)' },
  { key: 'changeInControl', label: 'Change-in-Control triggers (i.e. with customers and/or suppliers)' },
  { key: 'regulatoryApprovals', label: 'Regulatory Approvals (local/State/Federal)' },
  { key: 'auditedFinancials', label: 'Audited Financial Statements' },
];

function normalizeDisclosureValue(raw: DisclosureValue | undefined): { status: DisclosureStatus; notes: string } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      status: String(raw.status || '').trim().toUpperCase() === 'YES' ? 'YES' : 'NONE',
      notes: typeof raw.notes === 'string' ? raw.notes : '',
    };
  }

  const value = typeof raw === 'string' ? raw.trim() : '';
  const normalized = value.toUpperCase();
  if (!value || normalized === 'NONE' || normalized === 'NO') {
    return { status: 'NONE', notes: '' };
  }
  if (normalized === 'YES') {
    return { status: 'YES', notes: '' };
  }
  return { status: 'YES', notes: value };
}

function createDefaultDisclosures(): Record<string, { status: DisclosureStatus; notes: string }> {
  return Object.fromEntries(
    DISCLOSURE_ITEMS.map((item) => [item.key, { status: 'NONE' as DisclosureStatus, notes: '' }])
  );
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
  onCompanyUpdated,
}: ProfileTabProps) {
  // State for LOB management
  const [linesOfBusiness, setLinesOfBusiness] = React.useState<string[]>(['', '', '', '', '']);
  const [headcountAllocations, setHeadcountAllocations] = React.useState<{ [lobName: string]: number }>({});
  const [userDefinedAllocations, setUserDefinedAllocations] = React.useState<{ lobName: string; percentage: number }[]>([]);
  const [companyIndustryGroup, setCompanyIndustryGroup] = React.useState<number | ''>('');
  const [companyAccountingSystem, setCompanyAccountingSystem] = React.useState('');
  const [companySize, setCompanySize] = React.useState('DEFAULT');
  const [companyIndustrySectorCode, setCompanyIndustrySectorCode] = React.useState('');
  const [companyAddressStreet, setCompanyAddressStreet] = React.useState('');
  const [companyAddressCity, setCompanyAddressCity] = React.useState('');
  const [companyAddressState, setCompanyAddressState] = React.useState('');
  const [companyAddressZip, setCompanyAddressZip] = React.useState('');
  const [companyAddressCountry, setCompanyAddressCountry] = React.useState('USA');

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

  React.useEffect(() => {
    setCompanyIndustryGroup(company?.industrySector || '');
    setCompanyAccountingSystem(company?.accountingSystem || '');
    setCompanySize(company?.companySizeCategory || 'DEFAULT');
    setCompanyIndustrySectorCode(company?.industrySectorCategory || '');
    setCompanyAddressStreet(company?.addressStreet || '');
    setCompanyAddressCity(company?.addressCity || '');
    setCompanyAddressState(company?.addressState || '');
    setCompanyAddressZip(company?.addressZip || '');
    setCompanyAddressCountry(company?.addressCountry || 'USA');
  }, [
    company?.industrySector,
    company?.accountingSystem,
    company?.companySizeCategory,
    company?.industrySectorCategory,
    company?.addressStreet,
    company?.addressCity,
    company?.addressState,
    company?.addressZip,
    company?.addressCountry,
  ]);

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
      aiResearchSearchName: '',
      aiResearchAliases: [],
      aiResearchExcludedNames: [],
      aiResearchIdentityAnchors: [],
      industryBriefProductFocus: '',
      industryBriefBrands: [],
      industryBriefCustomerChannels: '',
      industryBriefCompetitors: '',
      industryBriefLocalMarketEvents: '',
      industryBriefKnownOpportunities: '',
      disclosures: createDefaultDisclosures()
    };
  }
  
  // Ensure keyEmployees exists
  if (!profile.keyEmployees) {
    profile.keyEmployees = [];
  }
  if (!profile.aiResearchAliases) {
    profile.aiResearchAliases = [];
  }
  if (!profile.aiResearchExcludedNames) {
    profile.aiResearchExcludedNames = [];
  }
  if (!profile.aiResearchIdentityAnchors) {
    profile.aiResearchIdentityAnchors = [];
  }
  if (!profile.industryBriefBrands) {
    profile.industryBriefBrands = [];
  }
  if (!profile.disclosures) {
    profile.disclosures = createDefaultDisclosures();
  }

  const updateProfile = (updates: Partial<CompanyProfile>) => {
    const updatedProfiles = companyProfiles.filter(p => p.companyId !== selectedCompanyId);
    updatedProfiles.push({ ...profile!, ...updates });
    setCompanyProfiles(updatedProfiles);
  };

  const updateDisclosure = (key: string, updates: Partial<{ status: DisclosureStatus; notes: string }>) => {
    const current = normalizeDisclosureValue((profile!.disclosures as Record<string, DisclosureValue>)[key]);
    updateProfile({
      disclosures: {
        ...profile!.disclosures,
        [key]: {
          ...current,
          ...updates,
        },
      },
    });
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
  const industry = INDUSTRY_SECTORS.find(i => i.id === companyIndustryGroup);

  const handleSaveProfile = async () => {
    if (!companyAccountingSystem) {
      alert('Please select an Accounting System before saving.');
      return;
    }
    if (!companyIndustrySectorCode) {
      alert('Please select an Industry Sector before saving.');
      return;
    }
    if (!companyIndustryGroup) {
      alert('Please select an Industry Group before saving.');
      return;
    }
    setIsLoading(true);
    try {
      const companyUpdatePayload: any = {
        addressStreet: companyAddressStreet || '',
        addressCity: companyAddressCity || '',
        addressState: companyAddressState || '',
        addressZip: companyAddressZip || '',
        addressCountry: companyAddressCountry || '',
        accountingSystem: companyAccountingSystem,
        companySizeCategory: companySize || null,
        industrySectorCategory: companyIndustrySectorCode || null,
        industrySector: Number(companyIndustryGroup)
      };

      const [, companyUpdateResult] = await Promise.all([
        profilesApi.save(selectedCompanyId, profile!),
        companiesApi.update(selectedCompanyId, companyUpdatePayload)
      ]);
      if (companyUpdateResult?.company) {
        onCompanyUpdated?.(companyUpdateResult.company as Company);
      }
      alert('Profile saved successfully!');
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Failed to save profile');
    } finally {
      setIsLoading(false);
    }
  };
  
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
            size: portrait;
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
              Company Profile
            </h2>
            <button
              className="no-print"
              onClick={handleSaveProfile}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                background: isLoading ? '#94a3b8' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                whiteSpace: 'nowrap',
                opacity: isLoading ? 0.8 : 1
              }}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        
        {/* Company Header Info */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{company?.name}</h3>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '10px 12px', alignItems: 'center', fontSize: '13px', color: '#64748b', marginBottom: '10px' }}>
            <div>
              <span style={{ fontWeight: '600' }}>Address Street:</span>
            </div>
            <div>
              <input
                type="text"
                value={companyAddressStreet}
                onChange={(e) => setCompanyAddressStreet(e.target.value)}
                placeholder="Street Address"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>
            <div>
              <span style={{ fontWeight: '600' }}>City:</span>
            </div>
            <div>
              <input
                type="text"
                value={companyAddressCity}
                onChange={(e) => setCompanyAddressCity(e.target.value)}
                placeholder="City"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>
            <div>
              <span style={{ fontWeight: '600' }}>State / ZIP:</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <select
                value={companyAddressState}
                onChange={(e) => setCompanyAddressState(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white' }}
              >
                <option value="">State</option>
                {US_STATES.filter(s => s.code !== '').map(state => (
                  <option key={state.code} value={state.code}>{state.code} - {state.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={companyAddressZip}
                onChange={(e) => setCompanyAddressZip(e.target.value)}
                placeholder="ZIP"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>
            <div>
              <span style={{ fontWeight: '600' }}>Country:</span>
            </div>
            <div>
              <input
                type="text"
                value={companyAddressCountry}
                onChange={(e) => setCompanyAddressCountry(e.target.value)}
                placeholder="Country"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '10px 12px', alignItems: 'center', fontSize: '13px', color: '#64748b' }}>
            <div>
              <span style={{ fontWeight: '600' }}>
                Accounting System: <span style={{ color: '#ef4444' }}>*</span>
              </span>
            </div>
            <div>
              <select
                value={companyAccountingSystem}
                onChange={(e) => setCompanyAccountingSystem(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', cursor: 'pointer' }}
              >
                {ACCOUNTING_SYSTEMS.map(system => (
                  <option key={system.value} value={system.value}>{system.label}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={{ fontWeight: '600' }}>Company Size:</span>
            </div>
            <div>
              <select
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', cursor: 'pointer' }}
              >
                {COMPANY_SIZES.map(size => (
                  <option key={size.value} value={size.value}>{size.label}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={{ fontWeight: '600' }}>Industry Sector: <span style={{ color: '#ef4444' }}>*</span></span>
            </div>
            <div>
              <select
                value={companyIndustrySectorCode}
                onChange={(e) => setCompanyIndustrySectorCode(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', cursor: 'pointer' }}
              >
                {INDUSTRY_SECTOR_OPTIONS.map(sector => (
                  <option key={sector.value} value={sector.value}>{sector.label}</option>
                ))}
              </select>
            </div>
            <div style={{ alignSelf: 'start', paddingTop: '8px' }}>
              <span style={{ fontWeight: '600' }}>Industry Group: <span style={{ color: '#ef4444' }}>*</span></span>
            </div>
            <div>
              <select
                value={companyIndustryGroup}
                onChange={(e) => setCompanyIndustryGroup(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', cursor: 'pointer' }}
              >
                <option value="">-- Select Industry Group --</option>
                {INDUSTRY_SECTORS.map(industryOption => (
                  <option key={industryOption.id} value={industryOption.id}>
                    {industryOption.id} - {industryOption.name}
                  </option>
                ))}
              </select>
              {companyIndustryGroup && industry && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#475569' }}>
                  {industry.description}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Business Details Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
          {/* Business Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'center' }}>
            <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'center' }}>
            <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'center' }}>
            <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'center' }}>
            <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'center' }}>
            <label style={{ fontWeight: '600', color: '#475569', fontSize: '13px' }}>
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
              No key employees added. Click &quot;+ Add Employee&quot; to add one.
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
              onClick={handleSaveProfile}
              disabled={isLoading}
              style={{ 
                padding: '8px 16px', 
                background: isLoading ? '#94a3b8' : '#10b981',
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                fontSize: '13px', 
                fontWeight: '700',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                whiteSpace: 'nowrap',
                opacity: isLoading ? 0.8 : 1
              }}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div style={{ margin: '-8px 0 18px 0', padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#1e40af', fontSize: '13px', lineHeight: 1.5 }}>
            If you answer YES to any questions add relevant notes and then upload relevant documents to the legal section of the Data Room.
          </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', gap: '12px', alignItems: 'start' }}>
          <div style={{ fontWeight: '600', color: '#475569' }}>DISCLOSURE</div>
          <div style={{ fontWeight: '600', color: '#475569' }}>STATUS</div>

          {DISCLOSURE_ITEMS.map((item) => {
            const disclosure = normalizeDisclosureValue((profile!.disclosures as Record<string, DisclosureValue>)[item.key]);
            return (
              <React.Fragment key={item.key}>
                <div style={{ fontSize: '14px', color: '#1e293b', paddingTop: '8px' }}>{item.label}</div>
                <select
                  value={disclosure.status}
                  onChange={(e) => updateDisclosure(item.key, { status: e.target.value as DisclosureStatus })}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: 'white' }}
                >
                  <option value="NONE">NONE</option>
                  <option value="YES">YES</option>
                </select>
                {disclosure.status === 'YES' ? (
                  <div style={{ gridColumn: '1 / -1', marginTop: '-4px', marginBottom: '4px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                      Notes for {item.label}
                    </label>
                    <textarea
                      value={disclosure.notes}
                      onChange={(e) => updateDisclosure(item.key, { notes: e.target.value })}
                      placeholder="Add relevant details, sources, dates, parties, or document references."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px',
                        resize: 'vertical',
                        minHeight: '76px',
                      }}
                    />
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
        </div>
      
      </div>

      <div className="no-print" style={{ textAlign: 'center', padding: '24px' }}>
        <button
          onClick={handleSaveProfile}
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
