'use client';

import React, { useState, useEffect } from 'react';
import { ACCOUNTING_SYSTEMS } from '@/lib/constants/company-options';

interface LOBData {
  name: string;
  headcountPercentage: number;
  customPercentage: number;
}

interface UserDefinedAllocation {
  lobName: string;
  percentage: number;
}

interface CompanySettingsTabProps {
  selectedCompanyId: string;
  companies: any[];
  onLOBChange: (lobs: LOBData[]) => void;
  initialLOBs: LOBData[];
}

interface AccountingProgram {
  module: string;
  miProgram: string;
  transactions: string[];
  cono: string;
  divi: string;
  enabled: boolean;
}

export default function CompanySettingsTab({
  selectedCompanyId,
  companies,
  onLOBChange,
  initialLOBs
}: CompanySettingsTabProps) {
  const [lobs, setLobs] = useState<LOBData[]>([]);
  const [userDefinedAllocations, setUserDefinedAllocations] = useState<UserDefinedAllocation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [companyAccountingSystem, setCompanyAccountingSystem] = useState('');
  const [accountingPrograms, setAccountingPrograms] = useState<AccountingProgram[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programsMessage, setProgramsMessage] = useState<string | null>(null);

  // Load LOB data from company record
  useEffect(() => {
  const loadLOBData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/companies?companyId=${selectedCompanyId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.companies && data.companies.length > 0) {
          const company = data.companies[0];
          setCompanyAccountingSystem(String(company.accountingSystem || ''));
          if (company.linesOfBusiness && Array.isArray(company.linesOfBusiness)) {
              // Convert from stored format to component format
              const loadedLOBs = company.linesOfBusiness.map((lob: any) => ({
                name: typeof lob === 'string' ? lob : (lob.name || ''),
                headcountPercentage: typeof lob === 'object' ? (lob.headcountPercentage || 0) : 0,
                customPercentage: typeof lob === 'object' ? (lob.customPercentage || 0) : 0
              }));
              setLobs(loadedLOBs);

              // Load user defined allocations (if available)
              if (company.userDefinedAllocations && Array.isArray(company.userDefinedAllocations)) {
                setUserDefinedAllocations(company.userDefinedAllocations);
              } else {
                // Initialize with empty allocations for each LOB
                const initialAllocations = loadedLOBs
                  .filter(lob => lob.name.trim() !== '')
                  .map(lob => ({ lobName: lob.name, percentage: 0 }));
                setUserDefinedAllocations(initialAllocations);
              }
            } else {
              // No LOBs defined yet, start with empty state
              setLobs([{ name: '', headcountPercentage: 0, customPercentage: 0 }]);
              setUserDefinedAllocations([]);
            }
          }
        }
      } catch (error) {
        console.error('Error loading LOB data:', error);
        setLobs([{ name: '', headcountPercentage: 0, customPercentage: 0 }]);
      } finally {
        setIsLoading(false);
      }
    };

    if (selectedCompanyId) {
      loadLOBData();
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (selectedCompany?.accountingSystem && !companyAccountingSystem) {
      setCompanyAccountingSystem(String(selectedCompany.accountingSystem));
    }
  }, [selectedCompany?.accountingSystem, companyAccountingSystem]);

  useEffect(() => {
    const loadPrograms = async () => {
      if (companyAccountingSystem !== 'INFOR_M3' || !selectedCompanyId) return;
      setProgramsLoading(true);
      setProgramsMessage(null);
      try {
        const response = await fetch(`/api/infor-m3/programs?companyId=${selectedCompanyId}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) {
          throw new Error(data?.details || data?.error || 'Failed to load accounting programs');
        }
        const rows: AccountingProgram[] = Array.isArray(data.programs) ? data.programs : [];
        setAccountingPrograms(
          rows.map((row: any) => ({
            module: String(row?.module || ''),
            miProgram: String(row?.miProgram || ''),
            transactions: Array.isArray(row?.transactions) ? row.transactions.map((t: any) => String(t || '').trim()).filter(Boolean) : [],
            cono: String(row?.cono || ''),
            divi: String(row?.divi || ''),
            enabled: row?.enabled !== false,
          }))
        );
      } catch (error: any) {
        setProgramsMessage(`Error loading accounting programs: ${error?.message || 'Unknown error'}`);
      } finally {
        setProgramsLoading(false);
      }
    };
    loadPrograms();
  }, [companyAccountingSystem, selectedCompanyId]);

  const updateProgram = (index: number, updates: Partial<AccountingProgram>) => {
    setAccountingPrograms((prev) => prev.map((row, i) => (i === index ? { ...row, ...updates } : row)));
  };

  const selectedCompany = companies && Array.isArray(companies) ? companies.find(c => c.id === selectedCompanyId) : null;

  const updateLOB = (index: number, field: keyof LOBData, value: string | number) => {
    const updated = [...lobs];
    const oldName = updated[index].name;
    updated[index] = { ...updated[index], [field]: value };
    setLobs(updated);
    onLOBChange(updated);

    // If the name changed, update user defined allocations
    if (field === 'name' && oldName !== value) {
      const updatedAllocations = userDefinedAllocations.map(alloc =>
        alloc.lobName === oldName ? { ...alloc, lobName: value as string } : alloc
      );
      setUserDefinedAllocations(updatedAllocations);
    }
  };

  const addLOB = () => {
    if (lobs.length < 5) {
      const newLOBs = [...lobs, { name: '', headcountPercentage: 0, customPercentage: 0 }];
      setLobs(newLOBs);
      onLOBChange(newLOBs);
    }
  };

  const removeLOB = (index: number) => {
    if (lobs.length > 1) {
      const newLOBs = lobs.filter((_, i) => i !== index);
      setLobs(newLOBs);
      onLOBChange(newLOBs);

      // Also update user defined allocations to remove the deleted LOB
      const removedLOBName = lobs[index].name;
      const updatedAllocations = userDefinedAllocations.filter(alloc => alloc.lobName !== removedLOBName);
      setUserDefinedAllocations(updatedAllocations);
    }
  };

  const updateUserDefinedAllocation = (lobName: string, percentage: number) => {
    const updated = [...userDefinedAllocations];
    const existingIndex = updated.findIndex(alloc => alloc.lobName === lobName);

    if (existingIndex >= 0) {
      updated[existingIndex] = { ...updated[existingIndex], percentage };
    } else {
      updated.push({ lobName, percentage });
    }

    setUserDefinedAllocations(updated);
  };

  const totalHeadcountPercentage = lobs.reduce((sum, lob) => sum + (lob.headcountPercentage || 0), 0);
  const totalCustomPercentage = lobs.reduce((sum, lob) => sum + (lob.customPercentage || 0), 0);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      // Convert LOB objects to the format for storage
      const lobData = lobs
        .filter(lob => lob.name.trim() !== '')
        .map(lob => ({
          name: lob.name.trim(),
          headcountPercentage: lob.headcountPercentage || 0,
          customPercentage: lob.customPercentage || 0
        }));

      const filteredAllocations = userDefinedAllocations.filter(alloc => alloc.percentage > 0);

      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          linesOfBusiness: lobData,
          accountingSystem: companyAccountingSystem || null,
          // ...(filteredAllocations.length > 0 && { userDefinedAllocations: filteredAllocations }) // Temporarily disabled - column doesn't exist in production DB
        })
      });

      if (response.ok) {
        if (companyAccountingSystem === 'INFOR_M3' && accountingPrograms.length > 0) {
          // The endpoint enforces full required fields only for enabled rows.
          // Auto-disable incomplete rows to prevent save failure while keeping data visible/editable.
          const normalizedPrograms = accountingPrograms.map((row) => ({
            ...row,
            enabled: row.enabled && row.transactions.length > 0 && String(row.divi || '').trim().length > 0,
          }));
          const programsResponse = await fetch('/api/infor-m3/programs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              programs: normalizedPrograms,
            }),
          });
          const programsBody = await programsResponse.json().catch(() => ({}));
          if (!programsResponse.ok || !programsBody?.ok) {
            throw new Error(programsBody?.details || programsBody?.error || 'Failed to save accounting programs');
          }
        }

        // Update parent component's LOB state
        const lobNames = lobData.map(lob => lob.name);
        onLOBChange(lobData);

        alert('Company settings saved successfully!');
      } else {
        // Log the response for debugging
        const errorText = await response.text();
        console.error('API Error Response:', response.status, errorText);
        throw new Error(`Failed to save settings: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('Error saving company settings:', error);
      alert('Failed to save company settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!companies || !Array.isArray(companies)) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#64748b' }}>Loading companies...</div>
      </div>
    );
  }

  if (!selectedCompany) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#64748b' }}>Please select a company to manage settings</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#64748b' }}>Loading company settings...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#64748b' }}>
          Configure accounting and Lines of Business settings for {selectedCompany.name}
        </p>
      </div>

      {/* Accounting System Section */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
          {companyAccountingSystem === 'INFOR_M3' ? 'CSI Accounting Integration' : 'Accounting Integration'}
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          Select the accounting system{companyAccountingSystem === 'INFOR_M3' ? ' and manage CSI accounting programs' : ''} for this company.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '10px 12px', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            Accounting System
          </div>
          <select
            value={companyAccountingSystem}
            onChange={(e) => setCompanyAccountingSystem(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            {ACCOUNTING_SYSTEMS.map((system) => (
              <option key={system.value} value={system.value}>
                {system.label}
              </option>
            ))}
          </select>
        </div>

        {companyAccountingSystem === 'INFOR_M3' && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
              CSI Accounting Programs
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
              These programs drive the Infor Syteline CSI pull configuration for this company.
            </div>
            {programsLoading ? (
              <div style={{ fontSize: '12px', color: '#64748b' }}>Loading accounting programs...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Enabled</th>
                      <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                      <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>MI Program</th>
                      <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Transactions (comma-separated)</th>
                      <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>CONO</th>
                      <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>DIVI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountingPrograms.map((row, index) => (
                      <tr key={`${row.module}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(e) => updateProgram(index, { enabled: e.target.checked })}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>{row.module}</td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={row.miProgram}
                            onChange={(e) => updateProgram(index, { miProgram: e.target.value })}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={row.transactions.join(', ')}
                            onChange={(e) =>
                              updateProgram(index, {
                                transactions: e.target.value
                                  .split(',')
                                  .map((v) => v.trim())
                                  .filter(Boolean),
                              })
                            }
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={row.cono}
                            onChange={(e) => updateProgram(index, { cono: e.target.value })}
                            style={{ width: '90px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={row.divi}
                            onChange={(e) => updateProgram(index, { divi: e.target.value })}
                            style={{ width: '90px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {programsMessage && (
              <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '12px' }}>
                {programsMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lines of Business Section */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b' }}>
            Lines of Business
          </h2>
          {lobs.length < 5 && (
            <button
              onClick={addLOB}
              style={{
                padding: '6px 12px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Add LOB
            </button>
          )}
        </div>

        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          Define your lines of business and their estimated headcount percentages for allocation
        </p>

        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 50px',
          gap: '12px',
          marginBottom: '8px',
          paddingBottom: '8px',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Line of Business</div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Headcount %</div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Custom %</div>
          <div></div>
        </div>

        {/* LOB Rows */}
        {lobs.map((lob, index) => (
          <div key={index} style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 50px',
            gap: '12px',
            marginBottom: '8px',
            alignItems: 'center'
          }}>
            <input
              type="text"
              value={lob.name}
              onChange={(e) => updateLOB(index, 'name', e.target.value)}
              placeholder={`e.g., Consulting, Products, Services`}
              style={{
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '13px'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={lob.headcountPercentage || ''}
                onChange={(e) => updateLOB(index, 'headcountPercentage', parseFloat(e.target.value) || 0)}
                placeholder="0.0"
                style={{
                  padding: '8px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '13px',
                  width: '100%'
                }}
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>%</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={lob.customPercentage || ''}
                onChange={(e) => updateLOB(index, 'customPercentage', parseFloat(e.target.value) || 0)}
                placeholder="0.0"
                style={{
                  padding: '8px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '13px',
                  width: '100%'
                }}
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>%</span>
            </div>

            <button
              onClick={() => removeLOB(index)}
              disabled={lobs.length <= 1}
              style={{
                padding: '6px',
                background: lobs.length <= 1 ? '#f1f5f9' : '#ef4444',
                color: lobs.length <= 1 ? '#94a3b8' : 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: lobs.length <= 1 ? 'not-allowed' : 'pointer',
                fontSize: '12px'
              }}
              title="Remove LOB"
            >
              ×
            </button>
          </div>
        ))}

        {/* Summary */}
        <div style={{
          marginTop: '16px',
          padding: '12px',
          background: '#f8fafc',
          borderRadius: '6px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
            <strong>Total Headcount Allocation:</strong> {totalHeadcountPercentage.toFixed(1)}%
          </div>
          {Math.abs(totalHeadcountPercentage - 100) > 0.1 && (
            <div style={{
              fontSize: '11px',
              color: Math.abs(totalHeadcountPercentage - 100) > 5 ? '#dc2626' : '#d97706',
              marginBottom: '8px'
            }}>
              ⚠️ Headcount percentages should total 100% for accurate allocation
            </div>
          )}

          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
            <strong>Total Custom Allocation:</strong> {totalCustomPercentage.toFixed(1)}%
          </div>
          {Math.abs(totalCustomPercentage - 100) > 0.1 && (
            <div style={{
              fontSize: '11px',
              color: Math.abs(totalCustomPercentage - 100) > 5 ? '#dc2626' : '#d97706',
              marginBottom: '8px'
            }}>
              ⚠️ Custom percentages should total 100% for accurate allocation
            </div>
          )}

          {lobs.length === 5 && (
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              Maximum of 5 lines of business reached
            </div>
          )}
        </div>
      </div>


      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={saveSettings}
          disabled={isSaving}
          style={{
            padding: '12px 24px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.6 : 1
          }}
        >
          {isSaving ? '💾 Saving...' : '✅ Save Settings'}
        </button>
      </div>
    </div>
  );
}
