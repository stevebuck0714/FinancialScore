'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/billing/billingHelpers';

type CompanyRow = {
  id: string;
  name: string;
  consultantId?: string | null;
  affiliateCode?: string | null;
  referralPartnerConsultantId?: string | null;
  referralSetupFeePercentage?: number | null;
  referralRecurringFeePercentage?: number | null;
  commercialBillingMethod?: string | null;
  commercialPaymentStatus?: string | null;
  commercialInvoiceNumber?: string | null;
  commercialInvoiceDate?: string | null;
  commercialPaymentDate?: string | null;
  commercialNextDueDate?: string | null;
  commercialTermsNotes?: string | null;
  subscriptionMonthlyPrice?: number | null;
  subscriptionQuarterlyPrice?: number | null;
  subscriptionAnnualPrice?: number | null;
  subscriptionSetupFee?: number | null;
};

type ConsultantRow = {
  id: string;
  fullName?: string | null;
  companyName?: string | null;
  type?: string | null;
};

const billingMethodLabels: Record<string, string> = {
  usaepay: 'USAePay Gateway',
  quickbooks_invoice: 'QuickBooks Invoice',
  manual_external: 'Manual / External',
  no_platform_payment: 'No Platform Payment',
};

const paymentStatusLabels: Record<string, string> = {
  not_billed: 'Not Billed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  overdue: 'Overdue',
  waived: 'Waived',
  no_payment_required: 'No Payment Required',
  external_paid: 'External Paid',
};

function getConsultantName(consultantsById: Map<string, ConsultantRow>, consultantId?: string | null) {
  if (!consultantId) return 'None';
  const consultant = consultantsById.get(consultantId);
  return consultant?.companyName || consultant?.fullName || 'Unknown consultant';
}

function hasCustomerPricing(company: CompanyRow) {
  return (
    Number(company.subscriptionSetupFee || 0) > 0 ||
    Number(company.subscriptionMonthlyPrice || 0) > 0 ||
    Number(company.subscriptionQuarterlyPrice || 0) > 0 ||
    Number(company.subscriptionAnnualPrice || 0) > 0
  );
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getBillingReminder(company: CompanyRow) {
  const billingMethod = company.commercialBillingMethod || 'usaepay';
  const paymentStatus = company.commercialPaymentStatus || 'not_billed';
  const isInvoiceManaged = billingMethod === 'quickbooks_invoice' || billingMethod === 'manual_external';
  if (!isInvoiceManaged || !hasCustomerPricing(company)) {
    return { label: 'No reminder', tone: 'neutral' as const, priority: 0 };
  }

  if (!company.commercialInvoiceDate) {
    return { label: 'Missing invoice date', tone: 'warning' as const, priority: 3 };
  }
  if (!company.commercialNextDueDate) {
    return { label: 'Missing next due date', tone: 'warning' as const, priority: 3 };
  }

  const nextDueDate = parseDateOnly(company.commercialNextDueDate);
  if (!nextDueDate) return { label: 'Invalid next due date', tone: 'warning' as const, priority: 3 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  nextDueDate.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.ceil((nextDueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const terminalStatuses = new Set(['paid', 'waived', 'no_payment_required', 'external_paid']);

  if (daysUntilDue <= 0 && !terminalStatuses.has(paymentStatus)) {
    return { label: 'Past due - admin report only', tone: 'danger' as const, priority: 4 };
  }
  if (daysUntilDue <= 30) {
    return { label: `Due in ${Math.max(daysUntilDue, 0)} days`, tone: 'warning' as const, priority: 2 };
  }
  return { label: `Next due ${formatDate(company.commercialNextDueDate)}`, tone: 'ok' as const, priority: 1 };
}

export default function CommercialTermsTab() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [consultants, setConsultants] = useState<ConsultantRow[]>([]);
  const [selectedConsultantId, setSelectedConsultantId] = useState('all');
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const consultantsById = useMemo(
    () => new Map(consultants.map((consultant) => [consultant.id, consultant])),
    [consultants]
  );
  const consultantFilterOptions = useMemo(
    () =>
      consultants
        .filter((consultant) => consultant.type !== 'business')
        .sort((a, b) =>
          (a.companyName || a.fullName || '').localeCompare(
            b.companyName || b.fullName || '',
            undefined,
            { sensitivity: 'base' }
          )
        ),
    [consultants]
  );
  const filteredCompanies = useMemo(() => {
    if (selectedConsultantId === 'all') return companies;
    if (selectedConsultantId === 'none') {
      return companies.filter((company) => !company.consultantId && !company.referralPartnerConsultantId);
    }
    return companies.filter(
      (company) =>
        company.consultantId === selectedConsultantId ||
        company.referralPartnerConsultantId === selectedConsultantId
    );
  }, [companies, selectedConsultantId]);
  const reminderSummary = useMemo(() => {
    return companies.reduce(
      (summary, company) => {
        const reminder = getBillingReminder(company);
        if (reminder.label.startsWith('Past due')) summary.pastDue += 1;
        if (reminder.label.startsWith('Due in')) summary.dueSoon += 1;
        if (reminder.label === 'Missing invoice date') summary.missingInvoiceDate += 1;
        if (reminder.label === 'Missing next due date') summary.missingNextDueDate += 1;
        return summary;
      },
      { pastDue: 0, dueSoon: 0, missingInvoiceDate: 0, missingNextDueDate: 0 }
    );
  }, [companies]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [companiesResponse, consultantsResponse] = await Promise.all([
        fetch('/api/companies'),
        fetch('/api/consultants'),
      ]);

      if (!companiesResponse.ok) throw new Error('Failed to load companies');
      if (!consultantsResponse.ok) throw new Error('Failed to load consultants');

      const companiesData = await companiesResponse.json();
      const consultantsData = await consultantsResponse.json();
      setCompanies(Array.isArray(companiesData?.companies) ? companiesData.companies : []);
      setConsultants(Array.isArray(consultantsData?.consultants) ? consultantsData.consultants : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load commercial terms');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const deleteCompany = async (company: CompanyRow) => {
    const typedName = window.prompt(`Type "${company.name}" to permanently delete this company and all related data.`);
    if (typedName !== company.name) {
      if (typedName !== null) window.alert('Company name did not match. Delete cancelled.');
      return;
    }

    try {
      setDeletingCompanyId(company.id);
      const response = await fetch(`/api/companies/${company.id}`, {
        method: 'DELETE',
        headers: {
          'x-confirm-delete': 'true',
        },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result?.error || 'Failed to delete company');
      }

      setCompanies((prev) => prev.filter((item) => item.id !== company.id));
    } catch (err: any) {
      window.alert(err.message || 'Failed to delete company');
    } finally {
      setDeletingCompanyId(null);
    }
  };

  if (isLoading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading commercial terms...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '20px', background: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>
        Error loading commercial terms: {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: '0 0 6px 0' }}>
              Consultant Accounts & Payment Terms
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Tracks affiliate-code accounts, referral partner accounts, billing method, payment status, and consultant compensation percentages.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                Consultant
              </label>
              <select
                value={selectedConsultantId}
                onChange={(event) => setSelectedConsultantId(event.target.value)}
                style={{ minWidth: '260px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: 'white' }}
              >
                <option value="all">All consultants and companies</option>
                <option value="none">No consultant assigned</option>
                {consultantFilterOptions.map((consultant) => (
                  <option key={consultant.id} value={consultant.id}>
                    {consultant.companyName || consultant.fullName}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Showing {filteredCompanies.length} of {companies.length}
              </div>
            </div>
            <button
              onClick={loadData}
              style={{ padding: '8px 14px', background: '#f3f4f6', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: 700 }}>Past Due</div>
          <div style={{ fontSize: '24px', color: '#7f1d1d', fontWeight: 800 }}>{reminderSummary.pastDue}</div>
        </div>
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', color: '#92400e', fontWeight: 700 }}>Due In 30 Days</div>
          <div style={{ fontSize: '24px', color: '#78350f', fontWeight: 800 }}>{reminderSummary.dueSoon}</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>Missing Invoice Date</div>
          <div style={{ fontSize: '24px', color: '#1e293b', fontWeight: 800 }}>{reminderSummary.missingInvoiceDate}</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>Missing Next Due Date</div>
          <div style={{ fontSize: '24px', color: '#1e293b', fontWeight: 800 }}>{reminderSummary.missingNextDueDate}</div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1440px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Company</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Managed By</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Affiliate Code</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Referral Partner</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Referral Terms</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Billing Method</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Payment Status</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Invoice / Payment</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Billing Reminder</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', color: '#64748b' }}>Customer Pricing</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Notes</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCompanies.map((company) => {
              const reminder = getBillingReminder(company);
              const reminderStyle = reminder.tone === 'danger'
                ? { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }
                : reminder.tone === 'warning'
                  ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
                  : reminder.tone === 'ok'
                    ? { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }
                    : { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' };
              return (
              <tr key={company.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px', fontSize: '13px', color: '#1e293b', fontWeight: 700 }}>{company.name}</td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>{getConsultantName(consultantsById, company.consultantId)}</td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>{company.affiliateCode || 'None'}</td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>{getConsultantName(consultantsById, company.referralPartnerConsultantId)}</td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  <div>Setup: {company.referralSetupFeePercentage ?? 0}%</div>
                  <div>Recurring: {company.referralRecurringFeePercentage ?? 0}%</div>
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  {billingMethodLabels[company.commercialBillingMethod || 'usaepay'] || 'USAePay Gateway'}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  {paymentStatusLabels[company.commercialPaymentStatus || 'not_billed'] || 'Not Billed'}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  <div>{company.commercialInvoiceNumber || 'No reference'}</div>
                  {company.commercialInvoiceDate && <div style={{ fontSize: '12px', color: '#64748b' }}>Invoice: {formatDate(company.commercialInvoiceDate)}</div>}
                  {company.commercialPaymentDate && <div style={{ fontSize: '12px', color: '#64748b' }}>Paid: {formatDate(company.commercialPaymentDate)}</div>}
                  {company.commercialNextDueDate && <div style={{ fontSize: '12px', color: '#64748b' }}>Next due: {formatDate(company.commercialNextDueDate)}</div>}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  <span style={{ ...reminderStyle, display: 'inline-block', padding: '4px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                    {reminder.label}
                  </span>
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569', textAlign: 'right' }}>
                  <div>Setup {formatCurrency(company.subscriptionSetupFee || 0)}</div>
                  <div>M {formatCurrency(company.subscriptionMonthlyPrice || 0)} / Q {formatCurrency(company.subscriptionQuarterlyPrice || 0)} / A {formatCurrency(company.subscriptionAnnualPrice || 0)}</div>
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569', maxWidth: '260px' }}>
                  {company.commercialTermsNotes || ''}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  <button
                    onClick={() => deleteCompany(company)}
                    disabled={deletingCompanyId === company.id}
                    style={{
                      padding: '6px 10px',
                      background: deletingCompanyId === company.id ? '#fca5a5' : '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: deletingCompanyId === company.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {deletingCompanyId === company.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
              );
            })}
            {filteredCompanies.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>No companies found for this consultant filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
