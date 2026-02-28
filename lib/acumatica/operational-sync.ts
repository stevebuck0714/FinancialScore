import { syncOperationalPayloadToSnapshots, type Frequency, type OperationalPayload } from '@/lib/operational-sync/payload-sync';

export type AcumaticaOperationalPayload = OperationalPayload;

export async function syncAcumaticaOperationalPayload(
  companyId: string,
  frequency: Frequency,
  payload: AcumaticaOperationalPayload
) {
  return syncOperationalPayloadToSnapshots(
    companyId,
    frequency,
    payload,
    'ACUMATICA',
    'operational_acumatica_payload'
  );
}
