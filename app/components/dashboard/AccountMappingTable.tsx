'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface AccountMapping {
  qbAccount: string;
  qbAccountClassification?: string;
  targetField: string;
  confidence?: string;
  lobAllocations?: { [lobName: string]: number };
  allocationMethod?: { type: 'manual' | 'average' | 'headcount' | 'revenue' };
}

interface AccountMappingTableProps {
  mappings: AccountMapping[];
  linesOfBusiness: string[];
  onMappingChange: (index: number, updates: Partial<AccountMapping>) => void;
}

export default function AccountMappingTable({
  mappings,
  linesOfBusiness,
  onMappingChange
}: AccountMappingTableProps) {

  const [collapsedSections, setCollapsedSections] = useState<{[key: string]: boolean}>({
    revenue: false,
    cogs: false,
    expense: false,
    asset: false,
    liability: false,
    equity: false
  });

  const [openTargetFieldDropdown, setOpenTargetFieldDropdown] = useState<number | null>(null);
  const [openAllocationMethodDropdown, setOpenAllocationMethodDropdown] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Set isClient to true on mount to avoid SSR issues with createPortal
  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // Group mappings by classification
  const groupedMappings = {
    revenue: mappings.filter(m => m.qbAccountClassification === 'Revenue'),
    cogs: mappings.filter(m => m.qbAccountClassification === 'Cost of Goods Sold'),
    expense: mappings.filter(m => m.qbAccountClassification === 'Expense'),
    asset: mappings.filter(m => m.qbAccountClassification === 'Asset'),
    liability: mappings.filter(m => m.qbAccountClassification === 'Liability'),
    equity: mappings.filter(m => m.qbAccountClassification === 'Equity')
  };

  const sections = [
    { key: 'revenue', title: 'Revenue', icon: '💰', color: '#10b981', bgColor: '#f0fdf4', statementType: 'income' },
    { key: 'cogs', title: 'Cost of Goods Sold', icon: '📦', color: '#f59e0b', bgColor: '#fffbeb', statementType: 'income' },
    { key: 'expense', title: 'Operating Expenses', icon: '💳', color: '#ef4444', bgColor: '#fef2f2', statementType: 'income' },
    { key: 'asset', title: 'Assets', icon: '🏦', color: '#3b82f6', bgColor: '#eff6ff', statementType: 'balance' },
    { key: 'liability', title: 'Liabilities', icon: '📊', color: '#8b5cf6', bgColor: '#faf5ff', statementType: 'balance' },
    { key: 'equity', title: 'Equity', icon: '💎', color: '#6366f1', bgColor: '#eef2ff', statementType: 'balance' }
  ];

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const targetFieldOptions = {
    revenue: [
      { value: 'revenue', label: 'Revenue' },
    ],
    cogs: [
      { value: 'cogsPayroll', label: 'COGS - Payroll' },
      { value: 'cogsOwnerPay', label: 'COGS - Owner Pay' },
      { value: 'cogsContractors', label: 'COGS - Contractors' },
      { value: 'cogsMaterials', label: 'COGS - Materials' },
      { value: 'cogsCommissions', label: 'COGS - Commissions' },
      { value: 'cogsOther', label: 'COGS - Other' },
    ],
    expense: [
      { value: 'payroll', label: 'Payroll' },
      { value: 'ownerBasePay', label: 'Owner Base Pay' },
      { value: 'benefits', label: 'Benefits' },
      { value: 'insurance', label: 'Insurance' },
      { value: 'professionalFees', label: 'Professional Fees' },
      { value: 'subcontractors', label: 'Subcontractors' },
      { value: 'rent', label: 'Rent' },
      { value: 'taxLicense', label: 'Tax & License' },
      { value: 'phoneComm', label: 'Phone & Comm' },
      { value: 'infrastructure', label: 'Infrastructure' },
      { value: 'autoTravel', label: 'Auto & Travel' },
      { value: 'salesExpense', label: 'Sales & Marketing' },
      { value: 'marketing', label: 'Marketing' },
      { value: 'trainingCert', label: 'Training & Cert' },
      { value: 'mealsEntertainment', label: 'Meals & Entertainment' },
      { value: 'interestExpense', label: 'Interest Expense' },
      { value: 'depreciationAmortization', label: 'Depreciation' },
      { value: 'otherExpense', label: 'Other Expense' },
    ],
    asset: [
      { value: 'cash', label: 'Cash' },
      { value: 'ar', label: 'A/R' },
      { value: 'inventory', label: 'Inventory' },
      { value: 'otherCA', label: 'Other Current Assets' },
      { value: 'fixedAssets', label: 'Fixed Assets' },
      { value: 'otherAssets', label: 'Other Assets' },
    ],
    liability: [
      { value: 'ap', label: 'A/P' },
      { value: 'otherCL', label: 'Other Current Liab' },
      { value: 'ltd', label: 'Long Term Debt' },
    ],
    equity: [
      { value: 'ownersCapital', label: "Owner's Capital" },
      { value: 'ownersDraw', label: "Owner's Draw" },
      { value: 'commonStock', label: 'Common Stock' },
      { value: 'preferredStock', label: 'Preferred Stock' },
      { value: 'retainedEarnings', label: 'Retained Earnings' },
      { value: 'additionalPaidInCapital', label: 'Add. Paid-In Capital' },
      { value: 'treasuryStock', label: 'Treasury Stock' },
    ]
  };

  const getFieldLabel = (value: string): string => {
    const allOptions = Object.values(targetFieldOptions).flat();
    const option = allOptions.find(opt => opt.value === value);
    return option ? option.label : value;
  };

  const getAllocationMethodLabel = (type: string): string => {
    switch (type) {
      case 'manual': return 'Manual';
      case 'average': return 'Average';
      case 'headcount': return 'Headcount %';
      case 'revenue': return 'Revenue %';
      default: return 'Manual';
    }
  };

  const renderMappingRow = (mapping: AccountMapping, sectionKey: string) => {
    const globalIdx = mappings.indexOf(mapping);
    const lobAllocations = mapping.lobAllocations || {};
    const total = Object.values(lobAllocations).reduce((sum: number, val: any) => sum + (val || 0), 0);
    const isOverAllocated = total > 100;
    const isUnderAllocated = total < 100 && total > 0;
    const activeLOBs = linesOfBusiness.filter(lob => lob.trim() !== '');

    return (
      <tr key={globalIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
        <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: '500', fontSize: '13px' }}>
          {mapping.qbAccount}
        </td>
        <td style={{ padding: '10px 12px', position: 'relative' }}>
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
        <td style={{ padding: '10px 12px', position: 'relative' }}>
          {/* Allocation Method Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setOpenAllocationMethodDropdown(openAllocationMethodDropdown === globalIdx ? null : globalIdx)}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '12px',
                background: '#ffffff',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ color: '#1e293b' }}>
                {mapping.allocationMethod?.type ? getAllocationMethodLabel(mapping.allocationMethod.type) : 'Manual'}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>{openAllocationMethodDropdown === globalIdx ? '▲' : '▼'}</span>
            </button>

            {openAllocationMethodDropdown === globalIdx && isClient && createPortal(
              <>
                {/* Backdrop */}
                <div
                  onClick={() => setOpenAllocationMethodDropdown(null)}
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
                  minWidth: '200px'
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: '600', color: '#374151' }}>
                    Allocation Method
                  </div>
                  {[
                    { value: 'manual', label: 'Manual Entry', desc: 'Enter percentages manually' },
                    { value: 'average', label: 'Average', desc: 'Equal split across LOBs' },
                    { value: 'headcount', label: 'Headcount %', desc: 'Uses company headcount split' },
                    // Revenue % only available for non-revenue fields
                    ...(sectionKey !== 'revenue' ? [{ value: 'revenue', label: 'Revenue %', desc: 'Uses calculated revenue split' }] : [])
                  ].map(method => (
                    <div
                      key={method.value}
                      onClick={() => {
                        onMappingChange(globalIdx, {
                          allocationMethod: { type: method.value as any }
                        });
                        setOpenAllocationMethodDropdown(null);
                      }}
                      style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        background: mapping.allocationMethod?.type === method.value ? '#dbeafe' : 'transparent',
                        borderBottom: '1px solid #f3f4f6'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f3f4f6'}
                      onMouseOut={(e) => e.currentTarget.style.background = mapping.allocationMethod?.type === method.value ? '#dbeafe' : 'transparent'}
                    >
                      <div style={{ fontWeight: '500', color: '#1e293b' }}>{method.label}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{method.desc}</div>
                    </div>
                  ))}
                </div>
              </>,
              document.body
            )}
          </div>
        </td>

        {/* LOB Allocation Columns */}
        {activeLOBs.length > 0 && (
          <>
            {activeLOBs.map((lob, lobIdx) => {
              const currentPercent = lobAllocations[lob] !== undefined ? lobAllocations[lob] : 0;
              
              return (
                <td key={lobIdx} style={{ 
                  padding: '8px 4px', 
                  borderLeft: lobIdx === 0 ? '2px solid #e2e8f0' : '1px solid #f1f5f9', 
                  borderRight: lobIdx === activeLOBs.length - 1 ? '2px solid #e2e8f0' : 'none', 
                  background: '#fafafa' 
                }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={currentPercent}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value) || 0;
                      const newAllocations = { ...lobAllocations, [lob]: newValue };
                      onMappingChange(globalIdx, { lobAllocations: newAllocations });
                    }}
                    style={{
                      width: '100%',
                      padding: '4px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '3px',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </td>
              );
            })}
            <td style={{ 
              padding: '8px', 
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
        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
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
      <div style={{ marginBottom: '24px', padding: '12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '8px' }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: '600', letterSpacing: '0.5px' }}>
          📈 INCOME STATEMENT
        </h3>
      </div>

      {sections.filter(s => s.statementType === 'income').map(section => {
        const sectionMappings = groupedMappings[section.key as keyof typeof groupedMappings];
        if (sectionMappings.length === 0) return null;
        
        const isCollapsed = collapsedSections[section.key];
        const activeLOBs = linesOfBusiness.filter(lob => lob.trim() !== '');

        return (
          <div key={section.key} style={{ marginBottom: '16px' }}>
            {/* Section Header */}
            <div 
              onClick={() => toggleSection(section.key)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '12px 16px', 
                background: section.bgColor,
                borderLeft: `4px solid ${section.color}`,
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: isCollapsed ? '0' : '8px',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#475569' }}>Account Name</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#475569' }}>→ Target Field</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#475569' }}>Allocation Method</th>
                      {activeLOBs.length > 0 && (
                        <>
                          {activeLOBs.map((lob, idx) => (
                            <th key={idx} style={{ textAlign: 'center', padding: '8px 4px', fontWeight: '600', color: '#7c3aed', fontSize: '11px', background: '#f5f3ff', borderLeft: idx === 0 ? '2px solid #e2e8f0' : '1px solid #f1f5f9', borderRight: idx === activeLOBs.length - 1 ? '2px solid #e2e8f0' : 'none' }}>
                              {lob} %
                            </th>
                          ))}
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: '600', color: '#475569', fontSize: '11px' }}>Total %</th>
                        </>
                      )}
                      <th style={{ textAlign: 'center', padding: '12px', fontWeight: '600', color: '#475569' }}>Confidence</th>
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
      <div style={{ marginBottom: '24px', marginTop: '32px', padding: '12px', background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)', borderRadius: '8px' }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: '600', letterSpacing: '0.5px' }}>
          📊 BALANCE SHEET
        </h3>
      </div>

      {sections.filter(s => s.statementType === 'balance').map(section => {
        const sectionMappings = groupedMappings[section.key as keyof typeof groupedMappings];
        if (sectionMappings.length === 0) return null;
        
        const isCollapsed = collapsedSections[section.key];
        const activeLOBs = linesOfBusiness.filter(lob => lob.trim() !== '');

        return (
          <div key={section.key} style={{ marginBottom: '16px' }}>
            {/* Section Header */}
            <div 
              onClick={() => toggleSection(section.key)}
              style={{ 
                display: 'flex', 
                alignments: 'center', 
                justifyContent: 'space-between',
                padding: '12px 16px', 
                background: section.bgColor,
                borderLeft: `4px solid ${section.color}`,
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: isCollapsed ? '0' : '8px',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#475569' }}>Account Name</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#475569' }}>→ Target Field</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#475569' }}>Allocation Method</th>
                      {activeLOBs.length > 0 && (
                        <>
                          {activeLOBs.map((lob, idx) => (
                            <th key={idx} style={{ textAlign: 'center', padding: '8px 4px', fontWeight: '600', color: '#7c3aed', fontSize: '11px', background: '#f5f3ff', borderLeft: idx === 0 ? '2px solid #e2e8f0' : '1px solid #f1f5f9', borderRight: idx === activeLOBs.length - 1 ? '2px solid #e2e8f0' : 'none' }}>
                              {lob} %
                            </th>
                          ))}
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: '600', color: '#475569', fontSize: '11px' }}>Total %</th>
                        </>
                      )}
                      <th style={{ textAlign: 'center', padding: '12px', fontWeight: '600', color: '#475569' }}>Confidence</th>
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

