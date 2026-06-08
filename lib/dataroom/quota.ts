import prisma from '@/lib/prisma';

export const DATAROOM_COMPANY_QUOTA_BYTES = Math.max(
  1,
  Number(process.env.DATAROOM_COMPANY_QUOTA_BYTES || 5 * 1024 * 1024 * 1024), // 5 GB default
);
export const DATAROOM_WARN_THRESHOLD = 0.8;
export const DATAROOM_CRITICAL_THRESHOLD = 0.95;

export type DataRoomQuotaCheck = {
  ok: boolean;
  usedBytes: number;
  projectedUsedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
};

export async function getCompanyDataRoomUsage(companyId: string): Promise<number> {
  const agg = await prisma.dataRoomDocument.aggregate({
    where: { companyId },
    _sum: { sizeBytes: true },
  });
  return Number(agg?._sum?.sizeBytes || 0);
}

export async function ensureCompanyWithinDataRoomQuota(params: {
  companyId: string;
  incomingSizeBytes: number;
  incomingBlobUrl?: string | null;
}): Promise<DataRoomQuotaCheck> {
  const { companyId } = params;
  const incomingSizeBytes = Math.max(0, Number(params.incomingSizeBytes || 0));
  const incomingBlobUrl = String(params.incomingBlobUrl || '').trim();

  const [usedBytes, existingBlobDoc] = await Promise.all([
    getCompanyDataRoomUsage(companyId),
    incomingBlobUrl
      ? prisma.dataRoomDocument.findUnique({
          where: { blobUrl: incomingBlobUrl },
          select: { id: true, companyId: true, sizeBytes: true },
        })
      : Promise.resolve(null),
  ]);

  let projectedUsedBytes = usedBytes;
  if (!existingBlobDoc) {
    projectedUsedBytes += incomingSizeBytes;
  } else if (existingBlobDoc.companyId === companyId) {
    const existingSize = Math.max(0, Number(existingBlobDoc.sizeBytes || 0));
    projectedUsedBytes += Math.max(0, incomingSizeBytes - existingSize);
  } else {
    // Defensive: treat cross-company blob reassignment as a full add for quota safety.
    projectedUsedBytes += incomingSizeBytes;
  }

  const remainingBytes = DATAROOM_COMPANY_QUOTA_BYTES - projectedUsedBytes;
  return {
    ok: projectedUsedBytes <= DATAROOM_COMPANY_QUOTA_BYTES,
    usedBytes,
    projectedUsedBytes,
    quotaBytes: DATAROOM_COMPANY_QUOTA_BYTES,
    remainingBytes,
  };
}

export function getUsageLevel(usedBytes: number, quotaBytes: number): 'ok' | 'warning' | 'critical' {
  const ratio = quotaBytes > 0 ? usedBytes / quotaBytes : 0;
  if (ratio >= DATAROOM_CRITICAL_THRESHOLD) return 'critical';
  if (ratio >= DATAROOM_WARN_THRESHOLD) return 'warning';
  return 'ok';
}
