'use client';

import React, { useMemo, useState } from 'react';
import { ACCOUNTING_SYSTEMS } from '@/lib/constants/company-options';

type UpgradeRequestModalProps = {
  show: boolean;
  onClose: () => void;
  companyId?: string;
  defaultCompanyName?: string;
  defaultContactName?: string;
  defaultContactEmail?: string;
};

const annualRevenueOptions = [
  { value: 'UNDER_5M', label: 'Under $5M' },
  { value: '5M_TO_10M', label: '$5M - $10M' },
  { value: '10M_TO_25M', label: '$10M - $25M' },
  { value: '25M_TO_50M', label: '$25M - $50M' },
  { value: 'OVER_50M', label: '$50M+' },
] as const;

const primaryGoalOptions = [
  { value: 'CASH_FLOW_VISIBILITY', label: 'Cash Flow Visibility' },
  { value: 'WORKING_CAPITAL_IMPROVEMENT', label: 'Working Capital Improvement' },
  { value: 'PROFITABILITY_ANALYSIS', label: 'Profitability Analysis' },
  { value: 'PREPARING_FOR_SALE_OR_FINANCING', label: 'Preparing for Sale / Financing' },
  { value: 'GENERAL_FINANCIAL_REPORTING', label: 'General Financial Reporting' },
  { value: 'OTHER', label: 'Other' },
] as const;

export default function UpgradeRequestModal({
  show,
  onClose,
  companyId,
  defaultCompanyName,
  defaultContactName,
  defaultContactEmail,
}: UpgradeRequestModalProps) {
  const [primaryContactName, setPrimaryContactName] = useState(defaultContactName || '');
  const [emailAddress, setEmailAddress] = useState(defaultContactEmail || '');
  const [companyName, setCompanyName] = useState(defaultCompanyName || '');
  const [accountingSystemUsed, setAccountingSystemUsed] = useState('');
  const [accountingSystemOther, setAccountingSystemOther] = useState('');
  const [annualRevenue, setAnnualRevenue] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const accountingSystemLabel = useMemo(() => {
    if (!accountingSystemUsed) return '';
    if (accountingSystemUsed === 'OTHER') {
      return accountingSystemOther.trim() ? `Other - ${accountingSystemOther.trim()}` : 'Other';
    }
    return ACCOUNTING_SYSTEMS.find((item) => item.value === accountingSystemUsed)?.label || accountingSystemUsed;
  }, [accountingSystemUsed, accountingSystemOther]);

  const annualRevenueLabel = useMemo(
    () => annualRevenueOptions.find((item) => item.value === annualRevenue)?.label || annualRevenue,
    [annualRevenue]
  );

  const primaryGoalLabel = useMemo(
    () => primaryGoalOptions.find((item) => item.value === primaryGoal)?.label || primaryGoal || 'Not specified',
    [primaryGoal]
  );

  React.useEffect(() => {
    if (!show) return;
    setPrimaryContactName(defaultContactName || '');
    setEmailAddress(defaultContactEmail || '');
    setCompanyName(defaultCompanyName || '');
    setAccountingSystemUsed('');
    setAccountingSystemOther('');
    setAnnualRevenue('');
    setPrimaryGoal('');
    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(false);
  }, [show, defaultContactName, defaultContactEmail, defaultCompanyName]);

  if (!show) return null;

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedContactName = primaryContactName.trim();
    const trimmedEmail = emailAddress.trim();
    const trimmedCompanyName = companyName.trim();
    const trimmedSystem = accountingSystemUsed.trim();
    const trimmedOther = accountingSystemOther.trim();
    const trimmedRevenue = annualRevenue.trim();

    if (!trimmedContactName || !trimmedEmail || !trimmedCompanyName || !trimmedSystem || !trimmedRevenue) {
      setErrorMessage('Please complete all required fields.');
      return;
    }
    if (trimmedSystem === 'OTHER' && !trimmedOther) {
      setErrorMessage('Please enter your accounting system in the Other field.');
      return;
    }

    setIsSubmitting(true);
    try {
      const description = [
        "You're one step away from unlocking your full financial performance view.",
        '',
        'Complete the form below and our team will discuss the onboarding process, pricing an walk you through how to activate your live environment.',
        '',
        'Contact Information',
        `Primary Contact Name: ${trimmedContactName}`,
        `Email Address: ${trimmedEmail}`,
        `Company Name: ${trimmedCompanyName}`,
        '',
        'Company Details',
        `Accounting System Used: ${accountingSystemLabel}`,
        `Approximate Annual Revenue: ${annualRevenueLabel}`,
        `Primary Goal: ${primaryGoalLabel}`,
        '',
        'A Corelytics specialist will contact you within 1 business day to help you get started.',
      ].join('\n');

      const response = await fetch('/api/support-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `Demo Upgrade Request - ${trimmedCompanyName}`,
          category: 'Demo Upgrade',
          priority: 'High',
          description,
          contactName: trimmedContactName,
          contactEmail: trimmedEmail,
          companyName: trimmedCompanyName,
          pageModule: 'Upgrade Popup Form',
          companyId: companyId || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to submit upgrade request right now.');
      }

      setSuccessMessage('Submitted successfully. A Corelytics specialist will contact you within 1 business day.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit upgrade request right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={isSubmitting ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: 'rgba(15, 23, 42, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(1100px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '14px',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '24px', fontWeight: 800 }}>
              You're one step away from unlocking your full financial performance view.
            </h2>
            <p style={{ margin: '8px 0 0 0', color: '#475569', fontSize: '14px', lineHeight: 1.6 }}>
              Complete the form below and our team will discuss the onboarding process, pricing an walk you through how to activate your live environment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#64748b',
              fontSize: '28px',
              lineHeight: 1,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={submitForm} style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Contact Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Primary Contact Name
              <input
                required
                value={primaryContactName}
                onChange={(event) => setPrimaryContactName(event.target.value)}
                type="text"
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }}
              />
            </label>
            <label style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Email Address
              <input
                required
                value={emailAddress}
                onChange={(event) => setEmailAddress(event.target.value)}
                type="email"
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }}
              />
            </label>
            <label style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Company Name
              <input
                required
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                type="text"
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }}
              />
            </label>
          </div>

          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Company Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
            <label style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Accounting System Used
              <select
                required
                value={accountingSystemUsed}
                onChange={(event) => setAccountingSystemUsed(event.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }}
              >
                <option value="">Select Accounting System</option>
                {ACCOUNTING_SYSTEMS.filter((item) => item.value).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Other Accounting System
              <input
                value={accountingSystemOther}
                onChange={(event) => setAccountingSystemOther(event.target.value)}
                type="text"
                disabled={accountingSystemUsed !== 'OTHER'}
                placeholder="Enter system"
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '10px',
                  background: accountingSystemUsed === 'OTHER' ? '#ffffff' : '#f8fafc',
                }}
              />
            </label>
            <label style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Approximate Annual Revenue
              <select
                required
                value={annualRevenue}
                onChange={(event) => setAnnualRevenue(event.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }}
              >
                <option value="">Select Revenue Range</option>
                {annualRevenueOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginTop: '12px' }}>
            <label style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Primary Goal (optional)
              <select
                value={primaryGoal}
                onChange={(event) => setPrimaryGoal(event.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }}
              >
                <option value="">Select Goal</option>
                {primaryGoalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p style={{ margin: '14px 0 0 0', fontSize: '13px', color: '#334155' }}>
            A Corelytics specialist will contact you within 1 business day to help you get started
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#64748b' }}>
            Your information is secure and will only be used to set up your Corelytics environment.
          </p>
          {errorMessage && (
            <div style={{ marginTop: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '10px', fontSize: '13px' }}>
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div style={{ marginTop: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '8px', padding: '10px', fontSize: '13px' }}>
              {successMessage}
            </div>
          )}

          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
