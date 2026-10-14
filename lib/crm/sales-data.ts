import { formatEstDate } from '@/lib/time/eastern';

export type CrmProvider = 'HUBSPOT' | 'HIGHLEVEL';

export type CrmRecord = {
  id: string;
  properties?: Record<string, string | null | undefined>;
  associations?: { companies?: { results?: Array<{ id: string }> } };
};

export type CrmActivityDetail = {
  id: string;
  type: string;
  subject: string;
  status: string;
  owner: string;
  timestamp: string | null;
  durationSeconds: number | null;
};

export type CrmOpportunityStatus = 'open' | 'won' | 'lost' | 'abandoned';

export type CrmOpportunity = {
  id: string;
  name: string;
  pipeline: string;
  stage: string;
  owner: string;
  value: number;
  status: CrmOpportunityStatus;
  source: string;
  companyName: string;
  /** EST calendar dates (YYYY-MM-DD). */
  createdDate: string | null;
  closedDate: string | null;
  lastStageChangeDate: string | null;
};

export function asAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/** EST calendar date of an ISO string or epoch-milliseconds value. */
export function crmEstDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : formatEstDate(date);
}

export function countRowsBy(rows: CrmRecord[], field: string, label: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = String(row.properties?.[field] || '').trim() || 'Unspecified';
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([value, count]) => ({ [label]: value, count }))
    .sort((a, b) => b.count - a.count);
}

export function activityMonth(timestamp: string | null | undefined): string {
  return crmEstDate(timestamp)?.slice(0, 7) || 'Unscheduled';
}

export function buildCrmReports(companies: CrmRecord[], contacts: CrmRecord[], activityDetails: CrmActivityDetail[]) {
  const activityRows: CrmRecord[] = activityDetails.map((activity) => ({
    id: activity.id,
    properties: { owner: activity.owner, status: activity.status, month: activityMonth(activity.timestamp) },
  }));
  const hasActivity = (row: CrmRecord) => Boolean(String(row.properties?.hs_last_sales_activity_timestamp || '').trim());
  const contactActivityCount = contacts.filter(hasActivity).length;
  const companyActivityCount = companies.filter(hasActivity).length;
  const companyLinks = (row: CrmRecord) => (Array.isArray(row.associations?.companies?.results) ? row.associations!.companies!.results!.length : 0);
  const contactsWithCompany = contacts.filter((row) => companyLinks(row) > 0).length;
  return {
    contactLifecycle: countRowsBy(contacts, 'lifecyclestage', 'lifecycle'),
    contactSource: countRowsBy(contacts, 'hs_analytics_source', 'source'),
    candidateRoles: countRowsBy(contacts, 'jobtitle', 'title'),
    companyIndustry: countRowsBy(companies, 'industry', 'industry'),
    companyLifecycle: countRowsBy(companies, 'lifecyclestage', 'lifecycle'),
    activityByOwner: countRowsBy(activityRows, 'owner', 'owner'),
    activityByStatus: countRowsBy(activityRows, 'status', 'status'),
    activityByMonth: countRowsBy(activityRows, 'month', 'period'),
    engagementCoverage: {
      contactsWithSalesActivity: contactActivityCount,
      contactsWithoutSalesActivity: contacts.length - contactActivityCount,
      companiesWithSalesActivity: companyActivityCount,
      companiesWithoutSalesActivity: companies.length - companyActivityCount,
    },
    candidateEmployerLinks: {
      candidatesWithEmployer: contactsWithCompany,
      candidatesWithoutEmployer: contacts.length - contactsWithCompany,
      employerLinks: contacts.reduce((total, row) => total + companyLinks(row), 0),
    },
  };
}

/** Stage, rep and monthly win/loss rollups shared by every CRM. */
export function summarizeOpportunities(opportunities: CrmOpportunity[]) {
  const stages = new Map<string, { stage: string; dealCount: number; pipelineValue: number }>();
  const reps = new Map<string, { owner: string; openDeals: number; openPipeline: number; wonDeals: number; wonRevenue: number }>();
  const monthly = new Map<string, { period: string; wonDeals: number; lostDeals: number; winRate: number }>();
  for (const opportunity of opportunities) {
    const stageRow = stages.get(opportunity.stage) || { stage: opportunity.stage, dealCount: 0, pipelineValue: 0 };
    stageRow.dealCount += 1;
    stageRow.pipelineValue += opportunity.value;
    stages.set(opportunity.stage, stageRow);
    const rep = reps.get(opportunity.owner) || { owner: opportunity.owner, openDeals: 0, openPipeline: 0, wonDeals: 0, wonRevenue: 0 };
    if (opportunity.status === 'open') {
      rep.openDeals += 1;
      rep.openPipeline += opportunity.value;
    }
    if (opportunity.status === 'won') {
      rep.wonDeals += 1;
      rep.wonRevenue += opportunity.value;
    }
    reps.set(opportunity.owner, rep);
    const period = opportunity.closedDate?.slice(0, 7);
    if (period && (opportunity.status === 'won' || opportunity.status === 'lost')) {
      const row = monthly.get(period) || { period, wonDeals: 0, lostDeals: 0, winRate: 0 };
      if (opportunity.status === 'won') row.wonDeals += 1;
      else row.lostDeals += 1;
      row.winRate = (row.wonDeals / (row.wonDeals + row.lostDeals)) * 100;
      monthly.set(period, row);
    }
  }
  const open = opportunities.filter((opportunity) => opportunity.status === 'open');
  const won = opportunities.filter((opportunity) => opportunity.status === 'won');
  return {
    summary: {
      totalDeals: opportunities.length,
      openDeals: open.length,
      openPipeline: open.reduce((sum, opportunity) => sum + opportunity.value, 0),
      wonDeals: won.length,
      wonRevenue: won.reduce((sum, opportunity) => sum + opportunity.value, 0),
    },
    stages: Array.from(stages.values()).sort((a, b) => b.pipelineValue - a.pipelineValue),
    reps: Array.from(reps.values()).sort((a, b) => b.openPipeline - a.openPipeline),
    winRateTrend: Array.from(monthly.values()).sort((a, b) => a.period.localeCompare(b.period)),
  };
}
