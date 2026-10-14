import { HIGHLEVEL_LABEL, HIGHLEVEL_SOURCE_CODE, highLevelCredentialsFromConnection } from '@/lib/highlevel';
import { fetchHighLevelRawData, highLevelLookups, normalizeHighLevelOpportunities } from '@/lib/crm/highlevel-sales';
import { crmEstDate } from '@/lib/crm/sales-data';
import type { OperationalDatasetSchema, OperationalSourceAdapter, OperationalSourceOutput } from '../types';
import { FULL_WINDOW, readConnectionMetadata } from './common';

const DATASETS: OperationalDatasetSchema[] = [
  {
    key: 'highlevel.opportunities',
    label: 'HighLevel opportunities',
    description:
      'Current HighLevel opportunity list (point in time, refreshed each sync). One row per opportunity with pipeline, stage, owner (sales rep), value, status and lead source. Sum value where isOpen = "true" for open pipeline; filter isWon = "true" and closeDate for won revenue in a period.',
    grain: 'point_in_time',
    dimensions: [
      { name: 'opportunityId' }, { name: 'opportunityName' }, { name: 'pipeline' }, { name: 'stage' },
      { name: 'owner', description: 'Sales rep assigned to the opportunity' },
      { name: 'status', description: 'open, won, lost or abandoned' },
      { name: 'isOpen' }, { name: 'isWon' }, { name: 'isLost' },
      { name: 'leadSource' },
      { name: 'createDate', description: 'YYYY-MM-DD' }, { name: 'closeDate', description: 'YYYY-MM-DD, won/lost date' },
      { name: 'closeMonth', description: 'YYYY-MM' }, { name: 'lastStageChangeDate', description: 'YYYY-MM-DD' },
    ],
    measures: [{ name: 'value' }, { name: 'opportunityCount', description: 'Always 1; sum to count opportunities' }],
  },
  {
    key: 'highlevel.contacts',
    label: 'HighLevel contacts',
    description:
      'Current HighLevel contacts, point in time, without names or contact details. One row per contact with contact type (lead / customer), lead source and location.',
    grain: 'point_in_time',
    dimensions: [
      { name: 'contactRecordId' }, { name: 'contactType' }, { name: 'leadSource' }, { name: 'state' }, { name: 'country' },
      { name: 'createDate', description: 'YYYY-MM-DD' }, { name: 'createMonth', description: 'YYYY-MM' }, { name: 'hasCompany' },
    ],
    measures: [{ name: 'contactCount', description: 'Always 1; sum to count contacts' }],
  },
  {
    key: 'highlevel.appointments',
    label: 'HighLevel appointments',
    description: 'Calendar appointments dated by appointment start (EST). One row per appointment with status (confirmed, showed, no-show, cancelled) and assigned rep.',
    grain: 'flow',
    dimensions: [{ name: 'appointmentId' }, { name: 'status' }, { name: 'owner' }],
    measures: [{ name: 'appointmentCount', description: 'Always 1' }, { name: 'durationMinutes' }],
  },
];

const flag = (value: boolean) => (value ? 'true' : 'false');

async function syncHighLevel({ companyId, window }: { companyId: string; window: { startDate: string; endDate: string } }): Promise<OperationalSourceOutput> {
  const { connection } = await readConnectionMetadata(companyId, 'HIGHLEVEL', HIGHLEVEL_SOURCE_CODE);
  const credentials = connection?.status === 'ACTIVE' ? highLevelCredentialsFromConnection(connection) : null;
  if (!credentials) throw new Error('HighLevel is not connected for this company.');
  const asOf = window.endDate;
  const raw = await fetchHighLevelRawData(credentials, connection?.connectionMetadata, window);
  const lookup = highLevelLookups(raw);

  const opportunityRows = normalizeHighLevelOpportunities(raw).map((opportunity) => ({
    date: asOf,
    externalId: `opportunity|${opportunity.id}`,
    dimensions: {
      opportunityId: opportunity.id, opportunityName: opportunity.name, pipeline: opportunity.pipeline, stage: opportunity.stage,
      owner: opportunity.owner, status: opportunity.status,
      isOpen: flag(opportunity.status === 'open'), isWon: flag(opportunity.status === 'won'), isLost: flag(opportunity.status === 'lost'),
      leadSource: opportunity.source, createDate: opportunity.createdDate, closeDate: opportunity.closedDate,
      closeMonth: opportunity.closedDate ? opportunity.closedDate.slice(0, 7) : null, lastStageChangeDate: opportunity.lastStageChangeDate,
    },
    measures: { value: opportunity.value, opportunityCount: 1 },
  }));
  const contactRows = raw.contacts.map((contact) => {
    const createDate = crmEstDate(contact.dateAdded);
    return {
      date: asOf,
      externalId: `contact|${contact.id}`,
      dimensions: {
        contactRecordId: contact.id, contactType: contact.type || null, leadSource: contact.source || null,
        state: contact.state || null, country: contact.country || null, createDate, createMonth: createDate ? createDate.slice(0, 7) : null,
        hasCompany: flag(Boolean(String(contact.companyName || contact.businessId || '').trim())),
      },
      measures: { contactCount: 1 },
    };
  });
  const appointmentRows = raw.appointments.flatMap((event) => {
    const date = crmEstDate(event.startTime);
    if (!date || date < window.startDate || date > window.endDate) return [];
    const start = event.startTime ? new Date(event.startTime).getTime() : NaN;
    const end = event.endTime ? new Date(event.endTime).getTime() : NaN;
    return [{
      date,
      externalId: `appointment|${event.id}`,
      dimensions: { appointmentId: event.id, status: event.appointmentStatus || null, owner: lookup.owner(event.assignedUserId) },
      measures: {
        appointmentCount: 1,
        durationMinutes: Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 600) / 100 : null,
      },
    }];
  });

  return {
    'highlevel.opportunities': { rows: opportunityRows, replaceWindow: true, window: FULL_WINDOW },
    'highlevel.contacts': { rows: contactRows, replaceWindow: true, window: FULL_WINDOW },
    'highlevel.appointments': { rows: appointmentRows, replaceWindow: true, window },
  };
}

export const HIGHLEVEL_ADAPTER: OperationalSourceAdapter = {
  sourceCode: HIGHLEVEL_SOURCE_CODE,
  provider: 'HIGHLEVEL',
  label: HIGHLEVEL_LABEL,
  datasetPrefix: 'highlevel',
  history: 'range',
  historyNote:
    'Appointments are pulled for the full date range. Opportunities and contacts are the current list (with their create and close dates); HighLevel does not expose past pipeline snapshots.',
  defaultHistoryDays: 365 * 3,
  datasets: DATASETS,
  sync: syncHighLevel,
};
