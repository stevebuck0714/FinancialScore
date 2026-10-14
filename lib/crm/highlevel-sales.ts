import {
  fetchHighLevelAppointments,
  fetchHighLevelBusinesses,
  fetchHighLevelCalendars,
  fetchHighLevelContacts,
  fetchHighLevelOpportunities,
  fetchHighLevelPipelines,
  fetchHighLevelTasks,
  fetchHighLevelUsers,
  HIGHLEVEL_SOURCE_CODE,
  highLevelUserName,
  type HighLevelBusiness,
  type HighLevelCalendar,
  type HighLevelContact,
  type HighLevelCredentials,
  type HighLevelEvent,
  type HighLevelOpportunity,
  type HighLevelPipeline,
  type HighLevelTask,
  type HighLevelUser,
} from '@/lib/highlevel';
import { addEstCalendarDays, estMidnightUtc, formatEstDate, nextEstMidnightUtc } from '@/lib/time/eastern';
import {
  asAmount,
  buildCrmReports,
  crmEstDate,
  summarizeOpportunities,
  type CrmActivityDetail,
  type CrmOpportunity,
  type CrmOpportunityStatus,
  type CrmRecord,
} from './sales-data';

export const DEFAULT_HIGHLEVEL_DATA_DOMAINS = [
  { dataDomain: 'Opportunities & Pipelines', sourceObject: 'Opportunities, pipelines, stages, values, status, and lead source', enabled: true },
  { dataDomain: 'Contacts', sourceObject: 'Contacts, lead type, source, company name, and location', enabled: true },
  { dataDomain: 'Businesses / Companies', sourceObject: 'Business (company) records linked to contacts', enabled: true },
  { dataDomain: 'Appointments / Calendars', sourceObject: 'Calendar appointments and appointment status (showed, no-show, cancelled)', enabled: true },
  { dataDomain: 'Tasks', sourceObject: 'Contact follow-up tasks and completion status', enabled: true },
  { dataDomain: 'Users / Owners', sourceObject: 'Sub-account users and opportunity / appointment assignment', enabled: true },
  { dataDomain: 'Conversations', sourceObject: 'Calls, SMS, and email conversation history', enabled: false },
  { dataDomain: 'Payments / Invoices', sourceObject: 'Invoices, orders, and payment transactions', enabled: false },
  { dataDomain: 'Forms & Surveys', sourceObject: 'Form and survey submissions', enabled: false },
];

export type HighLevelRawData = {
  users: HighLevelUser[];
  pipelines: HighLevelPipeline[];
  opportunities: HighLevelOpportunity[];
  contacts: HighLevelContact[];
  businesses: HighLevelBusiness[];
  appointments: HighLevelEvent[];
  tasks: HighLevelTask[];
  errors: string[];
};

function domainChecker(connectionMetadata: unknown) {
  const metadata = connectionMetadata && typeof connectionMetadata === 'object' ? connectionMetadata as Record<string, any> : {};
  const configured = Array.isArray(metadata?.operationalSourceDataDomains?.[HIGHLEVEL_SOURCE_CODE])
    ? metadata.operationalSourceDataDomains[HIGHLEVEL_SOURCE_CODE]
    : [];
  return (name: string) => {
    const match = configured.find((domain: any) => domain?.dataDomain === name);
    if (match) return match.enabled !== false;
    return DEFAULT_HIGHLEVEL_DATA_DOMAINS.find((domain) => domain.dataDomain === name)?.enabled !== false;
  };
}

/** Reads every enabled HighLevel domain. Optional domains that fail are reported, not thrown. */
export async function fetchHighLevelRawData(
  credentials: HighLevelCredentials,
  connectionMetadata: unknown,
  window: { startDate: string; endDate: string }
): Promise<HighLevelRawData> {
  const enabled = domainChecker(connectionMetadata);
  const errors: string[] = [];
  const optional = async <T,>(label: string, run: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await run();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : 'request failed'}`);
      return [];
    }
  };
  const [users, pipelines, opportunities, contacts, businesses] = await Promise.all([
    enabled('Users / Owners') ? optional('Users', () => fetchHighLevelUsers(credentials)) : Promise.resolve([] as HighLevelUser[]),
    enabled('Opportunities & Pipelines') ? optional('Pipelines', () => fetchHighLevelPipelines(credentials)) : Promise.resolve([] as HighLevelPipeline[]),
    enabled('Opportunities & Pipelines') ? fetchHighLevelOpportunities(credentials) : Promise.resolve([] as HighLevelOpportunity[]),
    enabled('Contacts') ? fetchHighLevelContacts(credentials) : Promise.resolve([] as HighLevelContact[]),
    enabled('Businesses / Companies') ? optional('Businesses', () => fetchHighLevelBusinesses(credentials)) : Promise.resolve([] as HighLevelBusiness[]),
  ]);
  const calendars = enabled('Appointments / Calendars')
    ? await optional<HighLevelCalendar>('Calendars', () => fetchHighLevelCalendars(credentials))
    : [];
  const appointments = calendars.length
    ? await optional('Appointments', () =>
        fetchHighLevelAppointments(credentials, calendars, estMidnightUtc(window.startDate).getTime(), nextEstMidnightUtc(window.endDate).getTime()))
    : [];
  const tasks = enabled('Tasks') ? await optional('Tasks', () => fetchHighLevelTasks(credentials)) : [];
  return { users, pipelines, opportunities, contacts, businesses, appointments, tasks, errors };
}

export function normalizeHighLevelStatus(value: unknown): CrmOpportunityStatus {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'won' || status === 'lost' || status === 'abandoned') return status;
  return 'open';
}

export function highLevelLookups(raw: Pick<HighLevelRawData, 'users' | 'pipelines'>) {
  const userName = new Map(raw.users.map((user) => [String(user.id), highLevelUserName(user)]));
  const pipelineName = new Map(raw.pipelines.map((pipeline) => [String(pipeline.id), String(pipeline.name || pipeline.id)]));
  const stageName = new Map(raw.pipelines.flatMap((pipeline) => (pipeline.stages || []).map((stage) => [String(stage.id), String(stage.name || stage.id)] as [string, string])));
  return {
    owner: (id: unknown) => userName.get(String(id || '')) || 'Unassigned',
    pipeline: (id: unknown) => pipelineName.get(String(id || '')) || 'Pipeline',
    stage: (id: unknown) => stageName.get(String(id || '')) || 'Unspecified',
  };
}

export function normalizeHighLevelOpportunities(raw: Pick<HighLevelRawData, 'users' | 'pipelines' | 'opportunities'>): CrmOpportunity[] {
  const lookup = highLevelLookups(raw);
  return raw.opportunities.map((opportunity) => {
    const status = normalizeHighLevelStatus(opportunity.status);
    return {
      id: opportunity.id,
      name: String(opportunity.name || opportunity.contact?.name || opportunity.id),
      pipeline: lookup.pipeline(opportunity.pipelineId),
      stage: lookup.stage(opportunity.pipelineStageId),
      owner: lookup.owner(opportunity.assignedTo),
      value: asAmount(opportunity.monetaryValue),
      status,
      source: String(opportunity.source || '').trim() || 'Unspecified',
      companyName: String(opportunity.contact?.companyName || '').trim(),
      createdDate: crmEstDate(opportunity.createdAt),
      closedDate: status === 'open' ? null : crmEstDate(opportunity.lastStatusChangeAt || opportunity.updatedAt),
      lastStageChangeDate: crmEstDate(opportunity.lastStageChangeAt || opportunity.updatedAt || opportunity.createdAt),
    };
  });
}

function titleCase(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function highLevelActivityDetails(raw: Pick<HighLevelRawData, 'users' | 'pipelines' | 'appointments' | 'tasks'>): Array<CrmActivityDetail & { contactId: string | null }> {
  const lookup = highLevelLookups(raw);
  const appointments = raw.appointments.map((event) => {
    const start = event.startTime ? new Date(event.startTime).getTime() : NaN;
    const end = event.endTime ? new Date(event.endTime).getTime() : NaN;
    return {
      id: `appointment-${event.id}`,
      type: 'Appointment',
      subject: String(event.title || '—'),
      status: event.appointmentStatus ? titleCase(String(event.appointmentStatus)) : '—',
      owner: lookup.owner(event.assignedUserId),
      timestamp: event.startTime || null,
      durationSeconds: Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 1000) : null,
      contactId: event.contactId || null,
    };
  });
  const tasks = raw.tasks.map((task, index) => ({
    id: `task-${task.id || task._id || index}`,
    type: 'Task',
    subject: String(task.title || '—'),
    status: task.completed ? 'Completed' : 'Open',
    owner: lookup.owner(task.assignedTo),
    timestamp: task.dueDate || null,
    durationSeconds: null,
    contactId: task.contactId || null,
  }));
  return [...appointments, ...tasks];
}

/** Default read window: Initial Sync Start Date (or one year back) through 90 days ahead, EST. */
export function highLevelSalesWindow(connectionMetadata: unknown): { startDate: string; endDate: string } {
  const metadata = connectionMetadata && typeof connectionMetadata === 'object' ? connectionMetadata as Record<string, any> : {};
  const today = formatEstDate();
  const configured = String(metadata?.highLevelSettings?.initialSyncStartDate || '').trim();
  const oneYearBack = addEstCalendarDays(today, -365);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(configured) && configured > oneYearBack ? configured : oneYearBack;
  return { startDate, endDate: addEstCalendarDays(today, 90) };
}

/** HighLevel CRM read for the Sales tab, in the shared CRM sales payload shape. */
export async function loadHighLevelSalesData(credentials: HighLevelCredentials, connectionMetadata: unknown) {
  const raw = await fetchHighLevelRawData(credentials, connectionMetadata, highLevelSalesWindow(connectionMetadata));
  const opportunities = normalizeHighLevelOpportunities(raw);
  const activityDetails = highLevelActivityDetails(raw);

  const lastActivityByContact = new Map<string, string>();
  for (const activity of activityDetails) {
    if (!activity.contactId || !activity.timestamp) continue;
    const previous = lastActivityByContact.get(activity.contactId);
    if (!previous || activity.timestamp > previous) lastActivityByContact.set(activity.contactId, activity.timestamp);
  }

  const companyIdByName = new Map<string, string>();
  const companyRecords: CrmRecord[] = raw.businesses.map((business) => {
    const name = String(business.name || '').trim();
    if (name) companyIdByName.set(name.toLowerCase(), business.id);
    return {
      id: business.id,
      properties: { name: name || null, industry: business.industry || null, lifecyclestage: null, type: null, createdate: business.createdAt || null, hs_last_sales_activity_timestamp: null },
    };
  });
  for (const contact of raw.contacts) {
    const name = String(contact.companyName || '').trim();
    if (!name || companyIdByName.has(name.toLowerCase()) || (contact.businessId && raw.businesses.some((business) => business.id === contact.businessId))) continue;
    const id = `company-name:${name.toLowerCase()}`;
    companyIdByName.set(name.toLowerCase(), id);
    companyRecords.push({ id, properties: { name, industry: null, lifecyclestage: null, type: null, createdate: null, hs_last_sales_activity_timestamp: null } });
  }
  const companyById = new Map(companyRecords.map((record) => [record.id, record]));

  const contactRecords: CrmRecord[] = raw.contacts.map((contact) => {
    const companyId = contact.businessId && companyById.has(contact.businessId)
      ? contact.businessId
      : companyIdByName.get(String(contact.companyName || '').trim().toLowerCase());
    const lastActivity = lastActivityByContact.get(contact.id) || null;
    if (companyId && lastActivity) {
      const company = companyById.get(companyId);
      const current = company?.properties?.hs_last_sales_activity_timestamp;
      if (company?.properties && (!current || lastActivity > current)) company.properties.hs_last_sales_activity_timestamp = lastActivity;
    }
    return {
      id: contact.id,
      properties: {
        firstname: contact.firstName || null,
        lastname: contact.lastName || (contact.firstName ? null : contact.contactName || null),
        email: contact.email || null,
        phone: contact.phone || null,
        mobilephone: null,
        jobtitle: null,
        city: contact.city || null,
        state: contact.state || null,
        country: contact.country || null,
        lifecyclestage: contact.type || null,
        hs_analytics_source: contact.source || null,
        createdate: contact.dateAdded || null,
        hs_last_sales_activity_timestamp: lastActivity,
      },
      associations: { companies: { results: companyId ? [{ id: companyId }] : [] } },
    };
  });

  const activityRows: CrmActivityDetail[] = activityDetails.map(({ contactId: _contactId, ...activity }) => activity);
  const activityCounts = activityRows.reduce<Record<string, number>>((acc, activity) => {
    const key = activity.type.toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const rollups = summarizeOpportunities(opportunities);

  return {
    ok: true,
    provider: 'HIGHLEVEL' as const,
    providerLabel: 'HighLevel',
    summary: { ...rollups.summary, activityCount: activityRows.length, asOf: new Date().toISOString() },
    stages: rollups.stages,
    reps: rollups.reps,
    winRateTrend: rollups.winRateTrend,
    activities: Object.entries(activityCounts).map(([type, count]) => ({ type, count })),
    activityDetails: activityRows,
    opportunities,
    companies: { records: companyRecords, enabled: true, error: null },
    contacts: { records: contactRecords, enabled: true, error: null },
    crmReports: buildCrmReports(companyRecords, contactRecords, activityRows),
    warnings: raw.errors,
  };
}
