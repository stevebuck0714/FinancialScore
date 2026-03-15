'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { getTargetFieldOptions } from '@/lib/constants/sector-target-fields';

interface AccountMapping {
  qbAccount: string;
  qbAccountClassification?: string;
  targetField: string;
  confidence?: string;
  lobAllocations?: { [lobName: string]: number };
  allocationMethod?: string;
  sourceStatus?: 'mapped' | 'new' | 'changed' | 'inactive';
}

interface LOBData {
  name: string;
  headcountPercentage: number;
}

interface AccountMappingTableProps {
  mappings: AccountMapping[];
  linesOfBusiness: LOBData[];
  userDefinedAllocations?: { lobName: string; percentage: number }[];
  industrySectorCategory?: string | null;
  showOnlyActionable?: boolean;
  onMappingChange: (index: number, updates: Partial<AccountMapping>) => void;
}

export default function AccountMappingTable({
  mappings,
  linesOfBusiness,
  userDefinedAllocations = [],
  industrySectorCategory,
  showOnlyActionable = false,
  onMappingChange
}: AccountMappingTableProps) {

  const [collapsedSections, setCollapsedSections] = useState<{[key: string]: boolean}>({
    revenue: false,
    cogs: false,
    expense: false,
    nonOperating: false,
    asset: false,
    liability: false,
    equity: false
  });

  const [openTargetFieldDropdown, setOpenTargetFieldDropdown] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Set isClient to true on mount to avoid SSR issues with createPortal
  React.useEffect(() => {
    setIsClient(true);
  }, []);

  const normalizeClassification = (
    value?: string,
    accountName?: string,
    targetField?: string
  ): 'revenue' | 'cogs' | 'expense' | 'nonOperating' | 'asset' | 'liability' | 'equity' | 'other' => {
    const normalizedTarget = (targetField || '').trim().toLowerCase();
    if (normalizedTarget && normalizedTarget !== 'unmapped') {
      if (normalizedTarget === 'nonoperatingincome' || normalizedTarget === 'nonoperatingexpense') return 'nonOperating';
      if (normalizedTarget === 'revenue' || normalizedTarget === 'otherrevenue' || normalizedTarget.startsWith('rev_')) return 'revenue';
      if (
        normalizedTarget === 'cogstotal' ||
        normalizedTarget === 'costofgoodssold' ||
        normalizedTarget.startsWith('cogs_') ||
        normalizedTarget.startsWith('cogs')
      ) return 'cogs';
      if (
        [
          'payroll',
          'ownerbasepay',
          'ownersretirement',
          'benefits',
          'insurance',
          'professionalfees',
          'subcontractors',
          'rent',
          'taxlicense',
          'stateincometaxes',
          'federalincometaxes',
          'phonecomm',
          'infrastructure',
          'autotravel',
          'salesexpense',
          'marketing',
          'trainingcert',
          'mealsentertainment',
          'interestexpense',
          'depreciationamortization',
          'otherexpense',
          'expense',
          'operatingexpensetotal',
        ].includes(normalizedTarget)
      ) return 'expense';
      if (['cash', 'ar', 'inventory', 'otherca', 'tca', 'fixedassets', 'otherassets', 'totalassets'].includes(normalizedTarget)) return 'asset';
      if (['ap', 'loc', 'othercl', 'tcl', 'ltd', 'totalliab'].includes(normalizedTarget)) return 'liability';
      if (
        [
          'ownerscapital',
          'ownersdraw',
          'commonstock',
          'preferredstock',
          'retainedearnings',
          'additionalpaidincapital',
          'treasurystock',
          'totalequity',
          'totallande',
        ].includes(normalizedTarget)
      ) return 'equity';
    }

    const normalized = (value || '').trim().toLowerCase();
    const normalizedAccountName = (accountName || '').trim().toLowerCase();
    const compact = normalized.replace(/[\s_-]+/g, '');
    const compactAccountName = normalizedAccountName.replace(/[\s_-]+/g, '');
    const accountCodeMatch = normalizedAccountName.match(/^\s*(\d{4,})/);
    const accountCode = accountCodeMatch ? Number(accountCodeMatch[1]) : NaN;
    const isLikelyNonOperatingCode = Number.isFinite(accountCode) && accountCode >= 9000 && accountCode < 10000;
    const isNonOperatingLabel =
      normalized.includes('non-operating') ||
      normalized.includes('non operating') ||
      normalized.includes('other income') ||
      normalized.includes('other expense') ||
      compact.includes('nonoperating') ||
      compact.includes('otherincome') ||
      compact.includes('otherexpense') ||
      normalizedAccountName.includes('non-operating') ||
      normalizedAccountName.includes('non operating') ||
      normalizedAccountName.includes('other income') ||
      normalizedAccountName.includes('other expense') ||
      compactAccountName.includes('nonoperating') ||
      compactAccountName.includes('otherincome') ||
      compactAccountName.includes('otherexpense');
    if (isLikelyNonOperatingCode || isNonOperatingLabel) return 'nonOperating';
    if (!normalized) return 'other';
    if (normalized === 'revenue' || normalized === 'income' || normalized.includes('revenue') || normalized.includes('income')) {
      return 'revenue';
    }
    if (
      normalized === 'cost of goods sold' ||
      normalized === 'costofgoodssold' ||
      normalized === 'cogs' ||
      normalized.includes('cost of goods sold') ||
      normalized.includes('cogs')
    ) {
      return 'cogs';
    }
    if (
      normalized === 'bank' ||
      normalized === 'accountsreceivable' ||
      normalized === 'accounts receivable' ||
      normalized === 'othercurrentasset' ||
      normalized === 'other current asset' ||
      normalized === 'fixedasset' ||
      normalized === 'fixed asset' ||
      normalized === 'otherasset' ||
      normalized === 'other asset' ||
      compact === 'bank' ||
      compact === 'accountsreceivable' ||
      compact === 'othercurrentasset' ||
      compact === 'fixedasset' ||
      compact === 'otherasset'
    ) {
      return 'asset';
    }
    if (
      normalized === 'accountspayable' ||
      normalized === 'accounts payable' ||
      normalized === 'creditcard' ||
      normalized === 'credit card' ||
      normalized === 'othercurrentliability' ||
      normalized === 'other current liability' ||
      normalized === 'longtermliability' ||
      normalized === 'long term liability' ||
      compact === 'accountspayable' ||
      compact === 'creditcard' ||
      compact === 'othercurrentliability' ||
      compact === 'longtermliability'
    ) {
      return 'liability';
    }
    // Handle common accounting-system equity labels that do not explicitly include "equity".
    if (
      normalized === 'retained earnings' ||
      normalized === 'retainedearnings' ||
      normalized === 'opening balance equity' ||
      normalized === 'openingbalanceequity' ||
      normalized === "owner's capital" ||
      normalized === 'owners capital' ||
      normalized === 'ownerscapital' ||
      normalized === "owner's draw" ||
      normalized === 'owners draw' ||
      normalized === 'ownersdraw' ||
      normalized === 'net assets' ||
      normalized === 'netassets' ||
      compact.includes('retainedearnings') ||
      compact.includes('openingbalanceequity') ||
      compact.includes('ownerscapital') ||
      compact.includes('ownersdraw') ||
      compact.includes('netassets')
    ) {
      return 'equity';
    }
    if (normalized === 'expense' || normalized.includes('expense')) return 'expense';
    if (normalized === 'asset' || normalized.includes('asset')) return 'asset';
    if (normalized === 'liability' || normalized.includes('liabil')) return 'liability';
    if (normalized === 'equity' || normalized.includes('equity')) return 'equity';
    return 'other';
  };

  const isActionable = (mapping: AccountMapping): boolean => {
    if (!showOnlyActionable) return true;
    const target = (mapping.targetField || '').trim().toLowerCase();
    const isUnmapped = !target || target === 'unmapped';
    return isUnmapped || mapping.sourceStatus === 'new' || mapping.sourceStatus === 'changed';
  };

  const getGroupingClassification = (mapping: AccountMapping) => {
    // Group by source account type first so accounts stay in their native section
    // (e.g. equity accounts always render under Equity).
    const sourceClassification = normalizeClassification(
      mapping.qbAccountClassification,
      mapping.qbAccount,
      undefined,
    );
    if (sourceClassification !== 'other') return sourceClassification;
    return normalizeClassification(
      mapping.qbAccountClassification,
      mapping.qbAccount,
      mapping.targetField,
    );
  };

  // Group mappings by normalized classification
  const groupedMappings = {
    revenue: mappings.filter(m => getGroupingClassification(m) === 'revenue' && isActionable(m)),
    cogs: mappings.filter(m => getGroupingClassification(m) === 'cogs' && isActionable(m)),
    expense: mappings.filter(m => getGroupingClassification(m) === 'expense' && isActionable(m)),
    nonOperating: mappings.filter(m => getGroupingClassification(m) === 'nonOperating' && isActionable(m)),
    asset: mappings.filter(m => getGroupingClassification(m) === 'asset' && isActionable(m)),
    liability: mappings.filter(m => getGroupingClassification(m) === 'liability' && isActionable(m)),
    equity: mappings.filter(m => getGroupingClassification(m) === 'equity' && isActionable(m))
  };

  const sections = [
    { key: 'revenue', title: 'Revenue', icon: '💰', color: '#10b981', bgColor: '#f0fdf4', statementType: 'income' },
    { key: 'cogs', title: 'Cost of Goods Sold', icon: '📦', color: '#f59e0b', bgColor: '#fffbeb', statementType: 'income' },
    { key: 'expense', title: 'Operating Expenses', icon: '💳', color: '#ef4444', bgColor: '#fef2f2', statementType: 'income' },
    { key: 'nonOperating', title: 'Non-Operating Income & Expense', icon: '🏷️', color: '#7c3aed', bgColor: '#f5f3ff', statementType: 'income' },
    { key: 'asset', title: 'Assets', icon: '🏦', color: '#3b82f6', bgColor: '#eff6ff', statementType: 'balance' },
    { key: 'liability', title: 'Liabilities', icon: '📊', color: '#8b5cf6', bgColor: '#faf5ff', statementType: 'balance' },
    { key: 'equity', title: 'Equity', icon: '💎', color: '#6366f1', bgColor: '#eef2ff', statementType: 'balance' }
  ];

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const targetFieldOptions = getTargetFieldOptions(industrySectorCategory || undefined);

  const getFieldLabel = (value: string): string => {
    const allOptions = Object.values(targetFieldOptions).flat();
    const option = allOptions.find(opt => opt.value === value);
    return option ? option.label : value;
  };

  const renderMappingRow = (mapping: AccountMapping, sectionKey: string) => {
    const globalIdx = mappings.indexOf(mapping);
    const lobAllocations = mapping.lobAllocations || {};
    const total = Math.round(Object.values(lobAllocations).reduce((sum: number, val: any) => sum + (val || 0), 0));
    const isOverAllocated = total > 100;
    const isUnderAllocated = total < 100 && total > 0;
    const activeLOBs = linesOfBusiness.filter(lob => lob && lob.name && lob.name.trim() !== '');

    return (
      <tr key={globalIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
        <td style={{ padding: '8px 10px', color: '#1e293b', fontWeight: '500', fontSize: '13px' }}>
          {mapping.qbAccount}
          {mapping.sourceStatus && mapping.sourceStatus !== 'mapped' && (
            <span
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                background:
                  mapping.sourceStatus === 'new'
                    ? '#dcfce7'
                    : mapping.sourceStatus === 'changed'
                      ? '#fef3c7'
                      : '#fee2e2',
                color:
                  mapping.sourceStatus === 'new'
                    ? '#166534'
                    : mapping.sourceStatus === 'changed'
                      ? '#92400e'
                      : '#991b1b',
              }}
            >
              {mapping.sourceStatus}
            </span>
          )}
        </td>
        <td style={{ padding: '8px 10px', position: 'relative' }}>
          {/* Target Field Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setOpenTargetFieldDropdown(openTargetFieldDropdown === globalIdx ? null : globalIdx)}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '13px',
                background: mapping.targetField ? '#f0fdf4' : '#fef3c7',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ color: mapping.targetField ? '#1e293b' : '#94a3b8' }}>
                {mapping.targetField ? getFieldLabel(mapping.targetField) : '-- Select Field --'}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>{openTargetFieldDropdown === globalIdx ? '▲' : '▼'}</span>
            </button>
            
            {openTargetFieldDropdown === globalIdx && isClient && createPortal(
              <>
                {/* Backdrop */}
                <div
                  onClick={() => setOpenTargetFieldDropdown(null)}
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }}
                />
                {/* Dropdown */}
                <div style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 9999,
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                  minWidth: '250px',
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: '600', color: '#374151' }}>
                    Select Target Field
                  </div>
                  {targetFieldOptions[sectionKey as keyof typeof targetFieldOptions]?.map(opt => (
                    <div
                      key={opt.value}
                      onClick={() => {
                        onMappingChange(globalIdx, { targetField: opt.value });
                        setOpenTargetFieldDropdown(null);
                      }}
                      style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#1e293b',
                        background: mapping.targetField === opt.value ? '#dbeafe' : 'transparent',
                        borderBottom: '1px solid #f3f4f6'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseOut={(e) => e.currentTarget.style.background = mapping.targetField === opt.value ? '#dbeafe' : 'transparent'}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </>,
              document.body
            )}
          </div>
        </td>

        {/* Allocation Method Dropdown */}
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          <select
            value={mapping.allocationMethod || 'manual'}
            onChange={(e) => {
              const newMethod = e.target.value;
              let updates: Partial<AccountMapping> = { allocationMethod: newMethod };

              // Auto-apply allocations based on method
              if (newMethod === 'headcount' && linesOfBusiness.length > 0) {
                // Apply headcount-based allocations
                const headcountAllocations: { [lobName: string]: number } = {};
                linesOfBusiness.forEach((lob) => {
                  if (lob.name && lob.name.trim() !== '') {
                    headcountAllocations[lob.name] = lob.headcountPercentage || 0;
                  }
                });
                updates.lobAllocations = headcountAllocations;
              } else if (newMethod === 'custom' && linesOfBusiness.length > 0) {
                // Apply custom-based allocations
                const customAllocations: { [lobName: string]: number } = {};
                linesOfBusiness.forEach((lob) => {
                  if (lob.name && lob.name.trim() !== '') {
                    customAllocations[lob.name] = lob.customPercentage || 0;
                  }
                });
                updates.lobAllocations = customAllocations;
              } else if (newMethod === 'equal') {
                // Apply equal distribution across all LOBs
                const equalAllocations: { [lobName: string]: number } = {};
                const activeLOBs = linesOfBusiness.filter(lob => lob.name && lob.name.trim() !== '');
                const equalPercent = activeLOBs.length > 0 ? Math.round((100 / activeLOBs.length) * 10) / 10 : 0;
                activeLOBs.forEach((lob) => {
                  equalAllocations[lob.name] = equalPercent;
                });
                updates.lobAllocations = equalAllocations;
              }

              onMappingChange(globalIdx, updates);
            }}
            style={{
              width: '120px',
              padding: '6px 8px',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '12px',
              background: 'white'
            }}
          >
            <option value="manual">Manual Entry</option>
            <option value="headcount">Headcount Based</option>
            <option value="custom">Custom %</option>
            <option value="equal">Equal Distribution</option>
          </select>
        </td>

        {/* LOB Allocation Columns */}
        {activeLOBs.length > 0 && (
          <>
            {activeLOBs.map((lob, lobIdx) => {
              const currentPercent = lobAllocations[lob.name] !== undefined ? lobAllocations[lob.name] : 0;
              const isHeadcountBased = mapping.allocationMethod === 'headcount';
              const isCustomBased = mapping.allocationMethod === 'custom';
              const headcountValue = lob.headcountPercentage || 0;
              const customValue = lob.customPercentage || 0;
              const displayValue = isHeadcountBased ? headcountValue : isCustomBased ? customValue : currentPercent;

              return (
                <td key={lobIdx} style={{
                  padding: '6px 4px',
                  borderLeft: lobIdx === 0 ? '2px solid #e2e8f0' : '1px solid #f1f5f9',
                  borderRight: lobIdx === activeLOBs.length - 1 ? '2px solid #e2e8f0' : 'none',
                  background: '#fafafa'
                }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={displayValue}
                    disabled={isHeadcountBased || isCustomBased}
                    onChange={(e) => {
                      if (isHeadcountBased || isCustomBased) return; // Don't allow changes when headcount-based or custom-based
                      const newValue = parseInt(e.target.value) || 0;
                      const newAllocations = { ...lobAllocations, [lob.name]: newValue };
                      onMappingChange(globalIdx, { lobAllocations: newAllocations });
                    }}
                    style={{
                      width: '100%',
                      padding: '4px',
                      border: (isHeadcountBased || isCustomBased) ? '1px solid #d1d5db' : '1px solid #cbd5e1',
                      borderRadius: '3px',
                      fontSize: '12px',
                      textAlign: 'center',
                      background: (isHeadcountBased || isCustomBased) ? '#f9fafb' : 'white',
                      color: (isHeadcountBased || isCustomBased) ? '#6b7280' : '#1e293b'
                    }}
                  />
                </td>
              );
            })}
            <td style={{ 
              padding: '6px', 
              textAlign: 'center', 
              fontWeight: '600', 
              fontSize: '12px',
              color: isOverAllocated ? '#dc2626' : isUnderAllocated ? '#f59e0b' : total === 100 ? '#10b981' : '#64748b',
              background: isOverAllocated ? '#fef2f2' : isUnderAllocated ? '#fffbeb' : total === 100 ? '#f0fdf4' : 'transparent'
            }}>
              {total}%
            </td>
          </>
        )}
        
        {/* Confidence */}
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          <span style={{
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '600',
            background: mapping.confidence === 'high' ? '#dcfce7' : mapping.confidence === 'medium' ? '#fef3c7' : '#fee2e2',
            color: mapping.confidence === 'high' ? '#166534' : mapping.confidence === 'medium' ? '#92400e' : '#991b1b'
          }}>
            {mapping.confidence || 'low'}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div>
      {/* Income Statement Sections */}
      <div style={{ marginBottom: '12px', padding: '8px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '8px' }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: '600', letterSpacing: '0.5px' }}>
          📈 INCOME STATEMENT
        </h3>
      </div>

      {sections.filter(s => s.statementType === 'income').map(section => {
        const sectionMappings = groupedMappings[section.key as keyof typeof groupedMappings];
        if (sectionMappings.length === 0) return null;
        
        const isCollapsed = collapsedSections[section.key];
        const activeLOBs = linesOfBusiness.filter(lob => lob && lob.name && lob.name.trim() !== '');

        return (
          <div key={section.key} style={{ marginBottom: '12px' }}>
            {/* Section Header */}
            <div 
              onClick={() => toggleSection(section.key)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px 12px', 
                background: section.bgColor,
                borderLeft: `4px solid ${section.color}`,
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: isCollapsed ? '0' : '6px',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{section.icon}</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: section.color }}>
                  {section.title}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', background: 'white', padding: '2px 8px', borderRadius: '12px' }}>
                  {sectionMappings.length} {sectionMappings.length === 1 ? 'account' : 'accounts'}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
                {isCollapsed ? '▼' : '▲'}
              </span>
            </div>

            {/* Section Content */}
            {!isCollapsed && (
              <div style={{ marginLeft: '20px', marginTop: '8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#475569' }}>Account Name</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#475569' }}>→ Target Field</th>
                      <th style={{ textAlign: 'center', padding: '8px', fontWeight: '600', color: '#475569' }}>Allocation Method</th>
                      {activeLOBs.length > 0 && (
                        <>
                          {activeLOBs.map((lob, idx) => (
                            <th key={idx} style={{ textAlign: 'center', padding: '8px 4px', fontWeight: '600', color: '#7c3aed', fontSize: '11px', background: '#f5f3ff', borderLeft: idx === 0 ? '2px solid #e2e8f0' : '1px solid #f1f5f9', borderRight: idx === activeLOBs.length - 1 ? '2px solid #e2e8f0' : 'none' }}>
                              {lob.name} %
                            </th>
                          ))}
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: '600', color: '#475569', fontSize: '11px' }}>Total %</th>
                        </>
                      )}
                      <th style={{ textAlign: 'center', padding: '8px', fontWeight: '600', color: '#475569' }}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionMappings.map(mapping => renderMappingRow(mapping, section.key))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Balance Sheet Sections */}
      <div style={{ marginBottom: '12px', marginTop: '16px', padding: '8px', background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)', borderRadius: '8px' }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: '600', letterSpacing: '0.5px' }}>
          📊 BALANCE SHEET
        </h3>
      </div>

      {sections.filter(s => s.statementType === 'balance').map(section => {
        const sectionMappings = groupedMappings[section.key as keyof typeof groupedMappings];
        if (sectionMappings.length === 0) return null;
        
        const isCollapsed = collapsedSections[section.key];
        const activeLOBs = linesOfBusiness.filter(lob => lob && lob.name && lob.name.trim() !== '');

        return (
          <div key={section.key} style={{ marginBottom: '12px' }}>
            {/* Section Header */}
            <div 
              onClick={() => toggleSection(section.key)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px 12px', 
                background: section.bgColor,
                borderLeft: `4px solid ${section.color}`,
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: isCollapsed ? '0' : '6px',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{section.icon}</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: section.color }}>
                  {section.title}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', background: 'white', padding: '2px 8px', borderRadius: '12px' }}>
                  {sectionMappings.length} {sectionMappings.length === 1 ? 'account' : 'accounts'}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
                {isCollapsed ? '▼' : '▲'}
              </span>
            </div>

            {/* Section Content */}
            {!isCollapsed && (
              <div style={{ marginLeft: '20px', marginTop: '8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#475569' }}>Account Name</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#475569' }}>→ Target Field</th>
                      <th style={{ textAlign: 'center', padding: '8px', fontWeight: '600', color: '#475569' }}>Allocation Method</th>
                      {activeLOBs.length > 0 && (
                        <>
                          {activeLOBs.map((lob, idx) => (
                            <th key={idx} style={{ textAlign: 'center', padding: '8px 4px', fontWeight: '600', color: '#7c3aed', fontSize: '11px', background: '#f5f3ff', borderLeft: idx === 0 ? '2px solid #e2e8f0' : '1px solid #f1f5f9', borderRight: idx === activeLOBs.length - 1 ? '2px solid #e2e8f0' : 'none' }}>
                              {lob.name} %
                            </th>
                          ))}
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: '600', color: '#475569', fontSize: '11px' }}>Total %</th>
                        </>
                      )}
                      <th style={{ textAlign: 'center', padding: '8px', fontWeight: '600', color: '#475569' }}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionMappings.map(mapping => renderMappingRow(mapping, section.key))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

