'use client';

import React from 'react';

interface AddCompanyModalProps {
  show: boolean;
  onClose: () => void;
  companyName: string;
  setCompanyName: (name: string) => void;
  affiliateCode: string;
  setAffiliateCode: (code: string) => void;
  onSave: () => void;
  isLoading?: boolean;
}

export default function AddCompanyModal({
  show,
  onClose,
  companyName,
  setCompanyName,
  affiliateCode,
  setAffiliateCode,
  onSave,
  isLoading,
}: AddCompanyModalProps) {
  if (!show) return null;

  const canSave = !!companyName.trim() && !isLoading;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1100,
      }}
      onClick={(e) => {
        // Click outside closes.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        }}
      >
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', margin: 0, marginBottom: '12px' }}>
          Add a Company
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
              Company Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter company name"
              disabled={!!isLoading}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
              }}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
              Affiliate Code (Optional)
            </label>
            <input
              type="text"
              value={affiliateCode}
              onChange={(e) => setAffiliateCode(e.target.value.toUpperCase())}
              placeholder="Enter affiliate code (optional)"
              disabled={!!isLoading}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                textTransform: 'uppercase',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          <button
            onClick={onClose}
            disabled={!!isLoading}
            style={{
              flex: 1,
              padding: '12px',
              background: '#f1f5f9',
              color: '#475569',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!canSave}
            style={{
              flex: 1,
              padding: '12px',
              background: canSave ? '#10b981' : '#94a3b8',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '700',
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

