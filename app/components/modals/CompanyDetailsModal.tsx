'use client';

import React from 'react';
import { INDUSTRY_SECTORS, SECTOR_CATEGORIES } from '../../../data/industrySectors';
import { US_STATES } from '../../constants';
import { ACCOUNTING_SYSTEMS, COMPANY_SIZES, INDUSTRY_SECTORS as INDUSTRY_SECTOR_OPTIONS } from '../../../lib/constants/company-options';

interface CompanyDetailsModalProps {
  show: boolean;
  onClose: () => void;
  companyAddressStreet: string;
  setCompanyAddressStreet: (value: string) => void;
  companyAddressCity: string;
  setCompanyAddressCity: (value: string) => void;
  companyAddressState: string;
  setCompanyAddressState: (value: string) => void;
  companyAddressZip: string;
  setCompanyAddressZip: (value: string) => void;
  companyAddressCountry: string;
  setCompanyAddressCountry: (value: string) => void;
  companyIndustrySector: number | string;
  setCompanyIndustrySector: (value: number) => void;
  accountingSystem: string;
  setAccountingSystem: (value: string) => void;
  companySizeCategory: string;
  setCompanySizeCategory: (value: string) => void;
  industrySectorCategory: string;
  setIndustrySectorCategory: (value: string) => void;
  onSave: () => void;
}

export default function CompanyDetailsModal({
  show,
  onClose,
  companyAddressStreet,
  setCompanyAddressStreet,
  companyAddressCity,
  setCompanyAddressCity,
  companyAddressState,
  setCompanyAddressState,
  companyAddressZip,
  setCompanyAddressZip,
  companyAddressCountry,
  setCompanyAddressCountry,
  companyIndustrySector,
  setCompanyIndustrySector,
  accountingSystem,
  setAccountingSystem,
  companySizeCategory,
  setCompanySizeCategory,
  industrySectorCategory,
  setIndustrySectorCategory,
  onSave
}: CompanyDetailsModalProps) {
  if (!show) return null;
  const missingIndustryGroup = !companyIndustrySector;
  const missingIndustrySector = !industrySectorCategory;
  const missingAccountingSystem = !accountingSystem;
  const canSave = !missingIndustryGroup && !missingIndustrySector && !missingAccountingSystem;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '700px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Company Details</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Address</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input 
              type="text" 
              value={companyAddressStreet} 
              onChange={(e) => setCompanyAddressStreet(e.target.value)} 
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              placeholder="Street Address" 
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '12px' }}>
              <input 
                type="text" 
                value={companyAddressCity} 
                onChange={(e) => setCompanyAddressCity(e.target.value)} 
                style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                placeholder="City" 
              />
              <select 
                value={companyAddressState} 
                onChange={(e) => setCompanyAddressState(e.target.value)} 
                style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', cursor: 'pointer' }}
              >
                <option value="">State</option>
                {US_STATES.map(state => (
                  <option key={state.code} value={state.code}>{state.code}</option>
                ))}
              </select>
              <input 
                type="text" 
                value={companyAddressZip} 
                onChange={(e) => setCompanyAddressZip(e.target.value)} 
                style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                placeholder="ZIP" 
              />
            </div>
          </div>
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Company Details</h3>
          
          {/* Accounting System Dropdown */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
              Accounting System <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select 
              value={accountingSystem} 
              onChange={(e) => setAccountingSystem(e.target.value)} 
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', cursor: 'pointer' }}
            >
              {ACCOUNTING_SYSTEMS.map(system => (
                <option key={system.value} value={system.value}>{system.label}</option>
              ))}
            </select>
            {missingAccountingSystem && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>
                Accounting System is required.
              </div>
            )}
          </div>

          {/* Industry Sector (new dropdown for reporting) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
              Industry Sector (required for custom reporting) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select 
              value={industrySectorCategory} 
              onChange={(e) => setIndustrySectorCategory(e.target.value)} 
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', cursor: 'pointer' }}
            >
              {INDUSTRY_SECTOR_OPTIONS.map(sector => (
                <option key={sector.value} value={sector.value}>{sector.label}</option>
              ))}
            </select>
            {missingIndustrySector && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>
                Industry Sector is required.
              </div>
            )}
          </div>

          {/* Industry Group (existing Industry Sector) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
              Industry Group (required for peer benchmarking) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select 
              value={companyIndustrySector} 
              onChange={(e) => setCompanyIndustrySector(parseInt(e.target.value))} 
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', cursor: 'pointer' }}
            >
              <option value="">-- Select Industry --</option>
              {SECTOR_CATEGORIES.map(sector => (
                <optgroup key={sector.code} label={`${sector.code} - ${sector.name}`}>
                  {INDUSTRY_SECTORS
                    .filter(ind => ind.sectorCode === sector.code)
                    .map(industry => (
                      <option key={industry.id} value={industry.id}>
                        {industry.id} - {industry.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {companyIndustrySector && INDUSTRY_SECTORS.find(i => i.id === Number(companyIndustrySector)) && (
              <div style={{ marginTop: '8px', padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: '#0c4a6e', margin: 0 }}>
                  <strong>{INDUSTRY_SECTORS.find(i => i.id === Number(companyIndustrySector))?.name}</strong>
                  <br />
                  <span style={{ fontSize: '11px' }}>{INDUSTRY_SECTORS.find(i => i.id === Number(companyIndustrySector))?.description}</span>
                </p>
              </div>
            )}
            {missingIndustryGroup && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>
                Industry Group is required.
              </div>
            )}
          </div>

          {/* Company Size */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Company Size</label>
            <select 
              value={companySizeCategory} 
              onChange={(e) => setCompanySizeCategory(e.target.value)} 
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', cursor: 'pointer' }}
            >
              {COMPANY_SIZES.map(size => (
                <option key={size.value} value={size.value}>{size.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => canSave && onSave()}
            disabled={!canSave}
            style={{
              flex: 1,
              padding: '12px',
              background: canSave ? '#667eea' : '#94a3b8',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: canSave ? 'pointer' : 'not-allowed'
            }}
          >
            Save
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

