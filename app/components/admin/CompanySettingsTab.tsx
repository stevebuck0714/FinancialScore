'use client';

import React, { useState, useEffect } from 'react';

interface LOBData {
  name: string;
  headcountPercentage: number;
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
          if (company.linesOfBusiness && Array.isArray(company.linesOfBusiness)) {
              // Convert from stored format to component format
              const loadedLOBs = company.linesOfBusiness.map((lob: any) => ({
                name: typeof lob === 'string' ? lob : (lob.name || ''),
                headcountPercentage: typeof lob === 'object' ? (lob.headcountPercentage || 0) : 0
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
              setLobs([{ name: '', headcountPercentage: 0 }]);
              setUserDefinedAllocations([]);
            }
          }
        }
      } catch (error) {
        console.error('Error loading LOB data:', error);
        setLobs([{ name: '', headcountPercentage: 0 }]);
      } finally {
        setIsLoading(false);
      }
    };

    if (selectedCompanyId) {
      loadLOBData();
    }
  }, [selectedCompanyId]);

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
      const newLOBs = [...lobs, { name: '', headcountPercentage: 0 }];
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

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      // Convert LOB objects to the format for storage
      const lobData = lobs
        .filter(lob => lob.name.trim() !== '')
        .map(lob => ({
          name: lob.name.trim(),
          headcountPercentage: lob.headcountPercentage || 0
        }));

      const filteredAllocations = userDefinedAllocations.filter(alloc => alloc.percentage > 0);

      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          linesOfBusiness: lobData,
          ...(filteredAllocations.length > 0 && { userDefinedAllocations: filteredAllocations })
        })
      });

      if (response.ok) {
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
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
          Company Settings
        </h1>
        <p style={{ fontSize: '16px', color: '#64748b' }}>
          Configure Lines of Business and allocation settings for {selectedCompany.name}
        </p>
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
          gridTemplateColumns: '2fr 1fr 50px',
          gap: '12px',
          marginBottom: '8px',
          paddingBottom: '8px',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Line of Business</div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Headcount %</div>
          <div></div>
        </div>

        {/* LOB Rows */}
        {lobs.map((lob, index) => (
          <div key={index} style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 50px',
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
          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
            <strong>Total Headcount Allocation:</strong> {totalHeadcountPercentage.toFixed(1)}%
          </div>
          {Math.abs(totalHeadcountPercentage - 100) > 0.1 && (
            <div style={{
              fontSize: '11px',
              color: Math.abs(totalHeadcountPercentage - 100) > 5 ? '#dc2626' : '#d97706'
            }}>
              ⚠️ Headcount percentages should total 100% for accurate allocation
            </div>
          )}
          {lobs.length === 5 && (
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
              Maximum of 5 lines of business reached
            </div>
          )}
        </div>
      </div>

      {/* User Defined Allocation Percentages Section */}
      {lobs.filter(lob => lob.name.trim() !== '').length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
            User Defined Allocation Percentages
          </h2>

          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
            Define custom allocation percentages for each line of business (used by the "User Defined" allocation method)
          </p>

          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gap: '12px',
            marginBottom: '8px',
            paddingBottom: '8px',
            borderBottom: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Line of Business</div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Allocation %</div>
          </div>

          {/* Allocation Rows */}
          {lobs.filter(lob => lob.name.trim() !== '').map((lob) => {
            const allocation = userDefinedAllocations.find(alloc => alloc.lobName === lob.name);
            return (
              <div key={lob.name} style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '12px',
                marginBottom: '8px',
                alignItems: 'center'
              }}>
                <div style={{ fontSize: '14px', color: '#1e293b' }}>
                  {lob.name}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={allocation?.percentage || ''}
                    onChange={(e) => updateUserDefinedAllocation(lob.name, parseFloat(e.target.value) || 0)}
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
              </div>
            );
          })}

          {/* Summary */}
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
              <strong>Total User Defined Allocation:</strong> {userDefinedAllocations.reduce((sum, alloc) => sum + (alloc.percentage || 0), 0).toFixed(1)}%
            </div>
            {Math.abs(userDefinedAllocations.reduce((sum, alloc) => sum + (alloc.percentage || 0), 0) - 100) > 0.1 && (
              <div style={{
                fontSize: '11px',
                color: Math.abs(userDefinedAllocations.reduce((sum, alloc) => sum + (alloc.percentage || 0), 0) - 100) > 5 ? '#dc2626' : '#d97706'
              }}>
                ⚠️ Percentages should total 100% for proper allocation
              </div>
            )}
          </div>
        </div>
      )}

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
