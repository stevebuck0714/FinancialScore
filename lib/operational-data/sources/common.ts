import prisma from '@/lib/prisma';
import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';
import { formatEstDate } from '@/lib/time/eastern';

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export async function readConnectionMetadata(companyId: string, provider: string, sourceCode: string) {
  const connection = await getOperationalSystemConnection(companyId, provider, sourceCode);
  return { connection, metadata: asRecord(connection?.connectionMetadata) };
}

/** EST calendar date of an ISO instant, or today when missing. */
export function estDateOf(value: unknown): string {
  const parsed = typeof value === 'string' || value instanceof Date ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? formatEstDate(parsed) : formatEstDate();
}

export async function getCompanySectorCategory(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { industrySectorCategory: true } });
  return resolveCompanyIndustrySectorCategory(company);
}

/** Deterministic per-company random numbers, so mock data is stable between refreshes. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FULL_WINDOW = { startDate: '1900-01-01', endDate: '2999-12-31' };
