import { syncOperationalPayloadToSnapshots, type Frequency, type OperationalPayload } from '@/lib/operational-sync/payload-sync';

export type SageIntacctOperationalPayload = OperationalPayload;

export async function syncSageIntacctOperationalPayload(
  companyId: string,
  frequency: Frequency,
  payload: SageIntacctOperationalPayload
) {
  return syncOperationalPayloadToSnapshots(
    companyId,
    frequency,
    payload,
    'SAGE_INTACCT',
    'operational_sage_intacct_payload'
  );
}
