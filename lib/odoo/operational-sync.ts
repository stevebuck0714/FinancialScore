import { syncOperationalPayloadToSnapshots, type Frequency, type OperationalPayload } from '@/lib/operational-sync/payload-sync';

export type OdooOperationalPayload = OperationalPayload;

export async function syncOdooOperationalPayload(
  companyId: string,
  frequency: Frequency,
  payload: OdooOperationalPayload
) {
  return syncOperationalPayloadToSnapshots(
    companyId,
    frequency,
    payload,
    'ODOO',
    'operational_odoo_payload'
  );
}
