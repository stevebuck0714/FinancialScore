import { ISOLVED_PEOPLE_CLOUD_LABEL, ISOLVED_PEOPLE_CLOUD_SOURCE_CODE } from '@/lib/operational/isolved-people-cloud';
import {
  buildIsolvedHiringMockPayload,
  buildIsolvedLaborSchedulingMockPayload,
  buildIsolvedPayrollMockPayload,
} from '@/lib/operational/isolved-people-cloud-mock';
import { buildIsolvedBureauOpsPayload } from '@/lib/operational/isolved-bureau-ops-mock';
import { payloadToOutput } from '../payload';
import type { OperationalSourceAdapter } from '../types';

const HR_SENSITIVE_KEYS = ['name', 'id', 'employeeId', 'applicantId', 'applicationId', 'personId'];

/** No live iSolved API connector exists yet; mock data is stored until one is added (add `sync`). */
export const ISOLVED_ADAPTER: OperationalSourceAdapter = {
  sourceCode: ISOLVED_PEOPLE_CLOUD_SOURCE_CODE,
  provider: 'ISOLVED',
  label: ISOLVED_PEOPLE_CLOUD_LABEL,
  datasetPrefix: 'isolved',
  history: 'none',
  historyNote: 'No iSolved live API connection exists yet; only sample data is stored.',
  datasets: [],
  dynamicDatasets: true,
  async mock({ companyId, window }) {
    return payloadToOutput(
      {
        payroll: buildIsolvedPayrollMockPayload(companyId),
        laborScheduling: buildIsolvedLaborSchedulingMockPayload(companyId),
        hiring: buildIsolvedHiringMockPayload(companyId),
        bureauOps: buildIsolvedBureauOpsPayload(companyId),
      },
      { prefix: 'isolved', sourceLabel: ISOLVED_PEOPLE_CLOUD_LABEL, asOf: window.endDate, replace: 'all', extraSensitiveKeys: HR_SENSITIVE_KEYS },
    );
  },
};
