import { syncOperationalPayloadToSnapshots, type Frequency, type OperationalPayload } from '@/lib/operational-sync/payload-sync';

export type DynamicsOperationalPayload = OperationalPayload;

export async function syncDynamicsOperationalPayload(
  companyId: string,
  frequency: Frequency,
  payload: DynamicsOperationalPayload
) {
  return syncOperationalPayloadToSnapshots(
    companyId,
    frequency,
    payload,
    'DYNAMICS365',
    'operational_dynamics_payload'
  );
}
