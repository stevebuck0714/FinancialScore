'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/billing/billingHelpers';

type CompanyRow = {
  id: string;
  name: string;
  consultantId?: string | null;
  selectedSubscriptionPlan?: string | null;
  affiliateCode?: string | null;
  referralPartnerId?: string | null;
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
  referralPartnerId?: string | null;
  referralSetupFeePercentage?: number | null;
  referralRecurringFeePercentage?: number | null;
};

type ReferralPartnerRow = {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  defaultSetupFeePercentage?: number | null;
  defaultRecurringFeePercentage?: number | null;
  paymentMethod?: string | null;
  taxId?: string | null;
  notes?: string | null;
  active?: boolean;
};

type SortKey =
  | 'company'
  | 'managedBy'
  | 'affiliateCode'
  | 'directReferralPartner'
  | 'consultantReferralPartner'
  | 'referralTerms'
  | 'billingMethod'
  | 'paymentStatus'
  | 'invoicePayment'
  | 'billingReminder'
  | 'customerPricing'
  | 'notes';

type SortDirection = 'asc' | 'desc';

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

const sortableHeaders: Array<{ key: SortKey; label: string; align?: 'left' | 'right' }> = [
  { key: 'company', label: 'Company' },
  { key: 'managedBy', label: 'Managed By' },
  { key: 'affiliateCode', label: 'Affiliate Code' },
  { key: 'directReferralPartner', label: 'Direct Referral Partner' },
  { key: 'consultantReferralPartner', label: 'Consultant Referral Partner' },
  { key: 'referralTerms', label: 'Referral Terms' },
  { key: 'billingMethod', label: 'Billing Method' },
  { key: 'paymentStatus', label: 'Payment Status' },
  { key: 'invoicePayment', label: 'Invoice / Payment' },
  { key: 'billingReminder', label: 'Billing Reminder' },
  { key: 'customerPricing', label: 'Customer Pricing', align: 'right' },
  { key: 'notes', label: 'Notes' },
];

function getConsultantName(consultantsById: Map<string, ConsultantRow>, consultantId?: string | null) {
  if (!consultantId) return 'None';
  const consultant = consultantsById.get(consultantId);
  return consultant?.companyName || consultant?.fullName || 'Unknown consultant';
}

function getReferralPartnerName(referralPartnersById: Map<string, ReferralPartnerRow>, referralPartnerId?: string | null) {
  if (!referralPartnerId) return 'None';
  return referralPartnersById.get(referralPartnerId)?.name || 'Unknown referral partner';
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
  const dateOnlyMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getBillingIntervalMonths(company: CompanyRow) {
  const selectedPlan = company.selectedSubscriptionPlan?.toLowerCase();
  if (selectedPlan === 'monthly') return 1;
  if (selectedPlan === 'quarterly') return 3;
  if (selectedPlan === 'annual') return 12;

  if (Number(company.subscriptionQuarterlyPrice || 0) > 0) return 3;
  if (Number(company.subscriptionAnnualPrice || 0) > 0) return 12;
  if (Number(company.subscriptionMonthlyPrice || 0) > 0) return 1;
  return null;
}

function addCalendarMonths(date: Date, monthsToAdd: number) {
  const targetMonth = date.getMonth() + monthsToAdd;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return new Date(targetYear, normalizedMonth, Math.min(date.getDate(), daysInTargetMonth));
}

function getNextScheduledInvoiceDate(company: CompanyRow) {
  const invoiceDate = parseDateOnly(company.commercialInvoiceDate);
  const intervalMonths = getBillingIntervalMonths(company);
  if (!invoiceDate || !intervalMonths) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let nextDueDate = addCalendarMonths(invoiceDate, intervalMonths);

  while (nextDueDate <= today) {
    nextDueDate = addCalendarMonths(nextDueDate, intervalMonths);
  }

  return nextDueDate;
}

function getDaysUntilDue(nextDueDate: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const normalizedNextDueDate = new Date(nextDueDate);
  normalizedNextDueDate.setHours(0, 0, 0, 0);
  return Math.ceil((normalizedNextDueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function getEffectiveReferralAttribution(
  company: CompanyRow,
  consultantsById: Map<string, ConsultantRow>,
  referralPartnersById: Map<string, ReferralPartnerRow>
) {
  const consultant = company.consultantId ? consultantsById.get(company.consultantId) : null;

  if (company.referralPartnerId) {
    const referralPartner = referralPartnersById.get(company.referralPartnerId);
    return {
      name: getReferralPartnerName(referralPartnersById, company.referralPartnerId),
      source: 'Direct company referral',
      setupPercentage: Number(company.referralSetupFeePercentage ?? referralPartner?.defaultSetupFeePercentage ?? 0),
      recurringPercentage: Number(company.referralRecurringFeePercentage ?? referralPartner?.defaultRecurringFeePercentage ?? 0),
    };
  }

  if (consultant?.referralPartnerId) {
    const referralPartner = referralPartnersById.get(consultant.referralPartnerId);
    return {
      name: getReferralPartnerName(referralPartnersById, consultant.referralPartnerId),
      source: 'Inherited from consultant',
      setupPercentage: Number(consultant.referralSetupFeePercentage ?? referralPartner?.defaultSetupFeePercentage ?? 0),
      recurringPercentage: Number(consultant.referralRecurringFeePercentage ?? referralPartner?.defaultRecurringFeePercentage ?? 0),
    };
  }

  if (company.referralPartnerConsultantId) {
    return {
      name: getConsultantName(consultantsById, company.referralPartnerConsultantId),
      source: 'Legacy consultant referral',
      setupPercentage: Number(company.referralSetupFeePercentage || 0),
      recurringPercentage: Number(company.referralRecurringFeePercentage || 0),
    };
  }

  return {
    name: 'None',
    source: 'No referral partner',
    setupPercentage: 0,
    recurringPercentage: 0,
  };
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

  const nextDueDate = getNextScheduledInvoiceDate(company) || parseDateOnly(company.commercialNextDueDate);
  if (!nextDueDate) return { label: 'Missing billing cadence', tone: 'warning' as const, priority: 3 };

  const daysUntilDue = getDaysUntilDue(nextDueDate);
  const terminalStatuses = new Set(['paid', 'waived', 'no_payment_required', 'external_paid']);

  if (daysUntilDue <= 0 && !terminalStatuses.has(paymentStatus)) {
    return { label: 'Past due - admin report only', tone: 'danger' as const, priority: 4 };
  }
  if (daysUntilDue <= 30) {
    return { label: `Due in ${Math.max(daysUntilDue, 0)} days`, tone: 'warning' as const, priority: 2 };
  }
  return { label: `Next due ${formatDate(nextDueDate)}`, tone: 'ok' as const, priority: 1 };
}

function getSortValue(
  company: CompanyRow,
  key: SortKey,
  consultantsById: Map<string, ConsultantRow>,
  referralPartnersById: Map<string, ReferralPartnerRow>
) {
  const consultant = company.consultantId ? consultantsById.get(company.consultantId) : null;
  const attribution = getEffectiveReferralAttribution(company, consultantsById, referralPartnersById);

  switch (key) {
    case 'company':
      return company.name || '';
    case 'managedBy':
      return getConsultantName(consultantsById, company.consultantId);
    case 'affiliateCode':
      return company.affiliateCode || 'None';
    case 'directReferralPartner':
      return company.referralPartnerId
        ? getReferralPartnerName(referralPartnersById, company.referralPartnerId)
        : getConsultantName(consultantsById, company.referralPartnerConsultantId);
    case 'consultantReferralPartner':
      return getReferralPartnerName(referralPartnersById, consultant?.referralPartnerId);
    case 'referralTerms':
      return attribution.setupPercentage * 1000 + attribution.recurringPercentage;
    case 'billingMethod':
      return billingMethodLabels[company.commercialBillingMethod || 'usaepay'] || 'USAePay Gateway';
    case 'paymentStatus':
      return paymentStatusLabels[company.commercialPaymentStatus || 'not_billed'] || 'Not Billed';
    case 'invoicePayment':
      return parseDateOnly(company.commercialInvoiceDate)?.getTime() || company.commercialInvoiceNumber || '';
    case 'billingReminder': {
      const reminder = getBillingReminder(company);
      const nextDueDate = getNextScheduledInvoiceDate(company) || parseDateOnly(company.commercialNextDueDate);
      return reminder.priority * 10000000000000 + (nextDueDate?.getTime() || 0);
    }
    case 'customerPricing':
      return Number(company.subscriptionSetupFee || 0) +
        Number(company.subscriptionMonthlyPrice || 0) +
        Number(company.subscriptionQuarterlyPrice || 0) +
        Number(company.subscriptionAnnualPrice || 0);
    case 'notes':
      return company.commercialTermsNotes || '';
    default:
      return '';
  }
}

function compareSortValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export default function CommercialTermsTab() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [consultants, setConsultants] = useState<ConsultantRow[]>([]);
  const [referralPartners, setReferralPartners] = useState<ReferralPartnerRow[]>([]);
  const [selectedConsultantId, setSelectedConsultantId] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('company');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const consultantsById = useMemo(
    () => new Map(consultants.map((consultant) => [consultant.id, consultant])),
    [consultants]
  );
  const referralPartnersById = useMemo(
    () => new Map(referralPartners.map((referralPartner) => [referralPartner.id, referralPartner])),
    [referralPartners]
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
      return companies.filter((company) => !company.consultantId);
    }
    return companies.filter((company) => company.consultantId === selectedConsultantId);
  }, [companies, selectedConsultantId]);
  const sortedCompanies = useMemo(() => {
    return [...filteredCompanies].sort((a, b) => {
      const comparison = compareSortValues(
        getSortValue(a, sortKey, consultantsById, referralPartnersById),
        getSortValue(b, sortKey, consultantsById, referralPartnersById)
      );
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [consultantsById, filteredCompanies, referralPartnersById, sortDirection, sortKey]);
  const reminderSummary = useMemo(() => {
    return companies.reduce(
      (summary, company) => {
        const reminder = getBillingReminder(company);
        if (reminder.label.startsWith('Past due')) summary.pastDue += 1;
        if (reminder.label.startsWith('Due in')) summary.dueSoon += 1;
        if (reminder.label === 'Missing invoice date') summary.missingInvoiceDate += 1;
        if (reminder.label === 'Missing billing cadence') summary.missingBillingCadence += 1;
        return summary;
      },
      { pastDue: 0, dueSoon: 0, missingInvoiceDate: 0, missingBillingCadence: 0 }
    );
  }, [companies]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [companiesResponse, consultantsResponse, referralPartnersResponse] = await Promise.all([
        fetch('/api/companies'),
        fetch('/api/consultants'),
        fetch('/api/referral-partners'),
      ]);

      if (!companiesResponse.ok) throw new Error('Failed to load companies');
      if (!consultantsResponse.ok) throw new Error('Failed to load consultants');
      if (!referralPartnersResponse.ok) throw new Error('Failed to load referral partners');

      const companiesData = await companiesResponse.json();
      const consultantsData = await consultantsResponse.json();
      const referralPartnersData = await referralPartnersResponse.json();
      setCompanies(Array.isArray(companiesData?.companies) ? companiesData.companies : []);
      setConsultants(Array.isArray(consultantsData?.consultants) ? consultantsData.consultants : []);
      setReferralPartners(Array.isArray(referralPartnersData?.referralPartners) ? referralPartnersData.referralPartners : []);
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
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>Missing Billing Cadence</div>
          <div style={{ fontSize: '24px', color: '#1e293b', fontWeight: 800 }}>{reminderSummary.missingBillingCadence}</div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1580px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {sortableHeaders.map((header) => (
                <th
                  key={header.key}
                  aria-sort={sortKey === header.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  style={{ padding: '12px', textAlign: header.align || 'left', fontSize: '12px', color: '#64748b' }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(header.key)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      justifyContent: header.align === 'right' ? 'flex-end' : 'flex-start',
                      width: '100%',
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: '#64748b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: header.align || 'left',
                    }}
                  >
                    <span>{header.label}</span>
                    <span style={{ color: sortKey === header.key ? '#1e293b' : '#cbd5e1' }}>
                      {sortKey === header.key ? (sortDirection === 'asc' ? '^' : 'v') : '-'}
                    </span>
                  </button>
                </th>
              ))}
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCompanies.map((company) => {
              const reminder = getBillingReminder(company);
              const consultant = company.consultantId ? consultantsById.get(company.consultantId) : null;
              const attribution = getEffectiveReferralAttribution(company, consultantsById, referralPartnersById);
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
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  <div>{company.referralPartnerId ? getReferralPartnerName(referralPartnersById, company.referralPartnerId) : 'None'}</div>
                  {company.referralPartnerConsultantId && !company.referralPartnerId && (
                    <div style={{ fontSize: '12px', color: '#92400e' }}>
                      Legacy: {getConsultantName(consultantsById, company.referralPartnerConsultantId)}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  <div>{getReferralPartnerName(referralPartnersById, consultant?.referralPartnerId)}</div>
                  {consultant?.referralPartnerId && (
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Inherited by managed companies</div>
                  )}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  <div>Effective: {attribution.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{attribution.source}</div>
                  <div>Setup: {attribution.setupPercentage}%</div>
                  <div>Recurring: {attribution.recurringPercentage}%</div>
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  {billingMethodLabels[company.commercialBillingMethod || 'usaepay'] || 'USAePay Gateway'}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  {paymentStatusLabels[company.commercialPaymentStatus || 'not_billed'] || 'Not Billed'}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                  <div>{company.commercialInvoiceNumber || 'No reference'}</div>
                  {company.commercialInvoiceDate && <div style={{ fontSize: '12px', color: '#64748b' }}>Invoice: {formatDate(parseDateOnly(company.commercialInvoiceDate) || company.commercialInvoiceDate)}</div>}
                  {company.commercialPaymentDate && <div style={{ fontSize: '12px', color: '#64748b' }}>Paid: {formatDate(parseDateOnly(company.commercialPaymentDate) || company.commercialPaymentDate)}</div>}
                  {(() => {
                    const scheduledNextDueDate = getNextScheduledInvoiceDate(company);
                    const storedNextDueDate = parseDateOnly(company.commercialNextDueDate);
                    const nextDueDate = scheduledNextDueDate || storedNextDueDate;
                    return nextDueDate ? (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Next due: {formatDate(nextDueDate)}
                      </div>
                    ) : null;
                  })()}
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
            {sortedCompanies.length === 0 && (
              <tr>
                <td colSpan={13} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>No companies found for this consultant filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
