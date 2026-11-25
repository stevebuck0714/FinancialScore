import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess, type UserContext } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import { buildValuationSnapshot, resolveFiscalYearEnd } from '@/lib/business-valuation/snapshot';
import {
  ENGAGEMENT_OPTIONS,
  INDEPENDENCE_FIELDS,
  isBusinessValuationEnabled,
} from '@/lib/business-valuation/engagement';
import {
  APPRAISAL_ASSET_TYPES,
  INCLUDED_ASSET_KEYS,
  normalizeDealTerms,
  validateDealTerms,
} from '@/lib/business-valuation/deal-terms';
import { normalizeEarningsBase, validateEarningsBase, type EarningsBase } from '@/lib/business-valuation/earnings-base';
import { lookupMarketSalary } from '@/lib/business-valuation/bls';
import { normalizeIncomeApproach, validateIncomeApproach, type IncomeApproach } from '@/lib/business-valuation/income-approach';
import { fredRateOnOrBefore } from '@/lib/business-valuation/fred';
import { normalizeAssetApproach, validateAssetApproach, type AssetApproach } from '@/lib/business-valuation/asset-approach';
import { normalizeDiligence, validateDiligence, type Diligence } from '@/lib/business-valuation/diligence';
import { OUTLOOK_SECTIONS, normalizeOutlook, outlookTextChanged, validateOutlook, type Outlook } from '@/lib/business-valuation/outlook';
import { collectEconomicIndicators, resolveCompanyGeography } from '@/lib/business-valuation/economic-data';
import {
  ALL_ASSET_SIZES,
  assetSizeBand,
  industryCodeCandidates,
  normalizeBenchmarking,
  validateBenchmarking,
  type Benchmarking,
  type IndustryTable,
} from '@/lib/business-valuation/benchmarking';
import { completeFiscalYears } from '@/lib/business-valuation/earnings-base';
import { normalizeDebtService, validateDebtService, type DebtService } from '@/lib/business-valuation/debt-service';
import { computeIndications } from '@/lib/business-valuation/indications';
import {
  APPROACHES,
  computeReconciliation,
  normalizeReconciliation,
  reconciliationInputsChanged,
  validateReconciliation,
  type Reconciliation,
} from '@/lib/business-valuation/reconciliation';
import { formatEstDate } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const STAFF_ROLES = new Set(['SITEADMIN', 'CONSULTANT']);

const EDITABLE_TEXT_FIELDS = ['purpose', 'standardOfValue', 'premiseOfValue', 'ownershipBasis', 'transactionStructure', 'reportType'] as const;

function dateOnly(value: unknown): Date | null {
  const raw = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function text(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

const display = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

async function assertStaffAccess(companyId: string, action: 'READ' | 'UPDATE') {
  const context = await requireAuth();
  const deny = async (error: string, status: number) => {
    await auditForbiddenAccess('Business Valuation', companyId, action);
    return { context, response: NextResponse.json({ error }, { status }) };
  };
  if (!(await validateCompanyAccess(companyId))) return deny('Forbidden', 403);
  if (!STAFF_ROLES.has(context.role)) return deny('Only consultants and site admins can access Business Valuation', 403);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
  if (!isBusinessValuationEnabled(company?.userDefinedAllocations)) return deny('Business Valuation is disabled for this company', 403);
  return { context, response: null };
}

async function userName(context: UserContext) {
  const user = await prisma.user.findUnique({ where: { id: context.userId }, select: { name: true } });
  return user?.name || context.email;
}

async function loadIndustryTable(code: string | null, sizeBand: string): Promise<IndustryTable> {
  for (const candidate of industryCodeCandidates(code)) {
    const rows = await prisma.industryBenchmark.findMany({
      where: { industryId: candidate, assetSizeCategory: { in: Array.from(new Set([sizeBand, ALL_ASSET_SIZES])) } },
      select: { industryName: true, metricName: true, assetSizeCategory: true, fiveYearValue: true },
    });
    if (rows.length > 0) {
      return {
        industryId: candidate,
        industryName: rows[0].industryName,
        sizeBand,
        rows: rows.map(({ metricName, assetSizeCategory, fiveYearValue }) => ({ metricName, assetSizeCategory, fiveYearValue })),
      };
    }
  }
  return null;
}

/** Size band from total assets at the end of the latest complete fiscal year in the snapshot. */
function snapshotSizeBand(snapshotData: unknown): string {
  const latest = completeFiscalYears(snapshotData as Parameters<typeof completeFiscalYears>[0])[0];
  const totalAssets = Number(latest?.summary.balanceSheet?.totalAssets);
  return Number.isFinite(totalAssets) && totalAssets > 0 ? assetSizeBand(totalAssets) : ALL_ASSET_SIZES;
}

async function workspaceResponse(companyId: string, engagementId: string | null) {
  const [company, engagements, lenders, staff, fiscalYear, documents] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, addressStreet: true, addressCity: true, addressState: true, addressZip: true, industrySector: true, industrySectorCategory: true },
    }),
    prisma.businessValuationEngagement.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, valuationDate: true, lenderName: true, createdAt: true },
    }),
    prisma.qoeLender.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { isExternal: false, role: { in: ['SITEADMIN', 'CONSULTANT'] } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
    resolveFiscalYearEnd(companyId),
    prisma.dataRoomDocument.findMany({
      where: { companyId },
      select: { id: true, originalFileName: true, category: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);
  const selectedId = engagementId && engagements.some((e) => e.id === engagementId) ? engagementId : engagements[0]?.id || null;
  const engagement = selectedId
    ? await prisma.businessValuationEngagement.findUnique({
        where: { id: selectedId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, valuationDate: true, asOfMonth: true, fiscalYearEndMonth: true, createdByName: true, createdAt: true },
          },
          changes: { orderBy: { createdAt: 'desc' }, take: 50 },
          appraisals: { orderBy: { createdAt: 'asc' } },
        },
      })
    : null;
  const latestSnapshot = engagement?.snapshots[0]
    ? await prisma.businessValuationSnapshot.findUnique({ where: { id: engagement.snapshots[0].id }, select: { id: true, data: true } })
    : null;
  const benchmarking = engagement ? normalizeBenchmarking(engagement.benchmarking) : null;
  const companyIndustryCode = company?.industrySector ? String(company.industrySector) : null;
  const defaultSizeBand = snapshotSizeBand(latestSnapshot?.data);
  const industryTable = benchmarking
    ? await loadIndustryTable(benchmarking.industryCode || companyIndustryCode, benchmarking.sizeBand || defaultSizeBand)
    : null;
  return {
    companyId,
    companyName: company?.name || '',
    companyState: company?.addressState || null,
    companyProfile: {
      street: company?.addressStreet || null,
      city: company?.addressCity || null,
      state: company?.addressState || null,
      zip: company?.addressZip || null,
      sectorCategory: company?.industrySectorCategory || null,
    },
    benchmarkContext: { companyIndustryCode, defaultSizeBand, industryTable },
    engagements,
    engagement: engagement
      ? {
          ...engagement,
          dealTerms: normalizeDealTerms(engagement.dealTerms),
          earningsBase: normalizeEarningsBase(engagement.earningsBase),
          incomeApproach: normalizeIncomeApproach(engagement.incomeApproach),
          assetApproach: normalizeAssetApproach(engagement.assetApproach),
          diligence: normalizeDiligence(engagement.diligence),
          outlook: normalizeOutlook(engagement.outlook),
          benchmarking,
          debtService: normalizeDebtService(engagement.debtService),
          reconciliation: normalizeReconciliation(engagement.reconciliation),
        }
      : null,
    latestSnapshot,
    lenders,
    staff,
    fiscalYear,
    documents,
    options: ENGAGEMENT_OPTIONS,
  };
}

function errorResponse(error: unknown, fallback: string) {
  const message = String((error as Error)?.message || error);
  if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  console.error(`${fallback}:`, error);
  return NextResponse.json({ error: fallback, detail: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    const access = await assertStaffAccess(companyId, 'READ');
    if (access.response) return access.response;
    const engagementId = text(request.nextUrl.searchParams.get('engagementId'));
    return NextResponse.json(await withPrismaReconnectRetry(() => workspaceResponse(companyId, engagementId), 'business-valuation.GET'));
  } catch (error) {
    return errorResponse(error, 'Failed to load Business Valuation');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const companyId = String(body?.companyId || '').trim();
    const action = String(body?.action || '').trim();
    if (!companyId || !action) return NextResponse.json({ error: 'companyId and action are required' }, { status: 400 });
    const access = await assertStaffAccess(companyId, 'UPDATE');
    if (access.response) return access.response;
    const { context } = access;

    if (action === 'create-engagement') {
      const created = await prisma.businessValuationEngagement.create({ data: { companyId, createdByUserId: context.userId } });
      return NextResponse.json(await workspaceResponse(companyId, created.id));
    }

    const engagementId = String(body?.engagementId || '');
    const engagement = await prisma.businessValuationEngagement.findFirst({ where: { id: engagementId, companyId } });
    if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
    if (engagement.status === 'FINAL') return NextResponse.json({ error: 'This engagement is final and can no longer be changed' }, { status: 400 });
    const actorName = await userName(context);

    if (action === 'update-engagement') {
      const data: Record<string, unknown> = {};
      for (const field of EDITABLE_TEXT_FIELDS) {
        if (body?.[field] === undefined) continue;
        const allowed = ENGAGEMENT_OPTIONS[field].map((option) => option.value) as string[];
        const next = String(body[field]);
        if (!allowed.includes(next)) return NextResponse.json({ error: `Invalid value for ${field}` }, { status: 400 });
        data[field] = next;
      }
      if (body?.interestPercent !== undefined) {
        const pct = Number(body.interestPercent);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return NextResponse.json({ error: 'Interest valued must be between 0 and 100%' }, { status: 400 });
        data.interestPercent = pct;
      }
      if (body?.valuationDate !== undefined) data.valuationDate = dateOnly(body.valuationDate);
      if (body?.lenderId !== undefined) {
        const lenderId = text(body.lenderId);
        const lender = lenderId ? await prisma.qoeLender.findUnique({ where: { id: lenderId }, select: { id: true, name: true } }) : null;
        if (lenderId && !lender) return NextResponse.json({ error: 'Select a valid lender' }, { status: 400 });
        data.lenderId = lender?.id || null;
        data.lenderName = lender?.name || null;
      }
      for (const [idField, nameField] of [['appraiserUserId', 'appraiserName'], ['reviewerUserId', 'reviewerName']] as const) {
        if (body?.[idField] === undefined) continue;
        const userId = text(body[idField]);
        const user = userId
          ? await prisma.user.findFirst({ where: { id: userId, isExternal: false, role: { in: ['SITEADMIN', 'CONSULTANT'] } }, select: { id: true, name: true } })
          : null;
        if (userId && !user) return NextResponse.json({ error: 'Select a valid Corelytics staff member' }, { status: 400 });
        data[idField] = user?.id || null;
        data[nameField] = user?.name || null;
      }
      if (data.appraiserUserId !== undefined || data.reviewerUserId !== undefined) {
        const appraiser = data.appraiserUserId !== undefined ? data.appraiserUserId : engagement.appraiserUserId;
        const reviewer = data.reviewerUserId !== undefined ? data.reviewerUserId : engagement.reviewerUserId;
        if (appraiser && reviewer && appraiser === reviewer) return NextResponse.json({ error: 'The reviewer must be a different person from the appraiser' }, { status: 400 });
      }
      for (const field of INDEPENDENCE_FIELDS) {
        if (body?.[field] !== undefined) data[field] = Boolean(body[field]);
      }
      if (body?.priorServicesNote !== undefined) data.priorServicesNote = text(body.priorServicesNote);
      const independenceChanged = [...INDEPENDENCE_FIELDS, 'priorServicesNote'].some(
        (field) => field in data && display(data[field]) !== display((engagement as Record<string, unknown>)[field]),
      );
      if (independenceChanged) {
        data.independenceConfirmedAt = null;
        data.independenceConfirmedByUserId = null;
      }

      const changes = Object.entries(data)
        .filter(([field]) => !['lenderId', 'appraiserUserId', 'reviewerUserId', 'independenceConfirmedAt', 'independenceConfirmedByUserId'].includes(field))
        .map(([field, next]) => ({ field, oldValue: display((engagement as Record<string, unknown>)[field]), newValue: display(next) }))
        .filter((change) => change.oldValue !== change.newValue);
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'confirm-independence') {
      const missing = INDEPENDENCE_FIELDS.filter((field) => !engagement[field]);
      if (missing.length > 0) return NextResponse.json({ error: 'Every independence statement must be checked before confirming' }, { status: 400 });
      if (!engagement.priorServicesNote) {
        return NextResponse.json({ error: 'Describe any prior or current Corelytics services for this company (or enter "None")' }, { status: 400 });
      }
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({
          where: { id: engagement.id },
          data: { independenceConfirmedAt: new Date(), independenceConfirmedByUserId: context.userId },
        }),
        prisma.businessValuationChange.create({
          data: { engagementId: engagement.id, field: 'independenceConfirmed', oldValue: null, newValue: 'Confirmed', userId: context.userId, userName: actorName },
        }),
      ]);
    } else if (action === 'create-snapshot') {
      if (!engagement.valuationDate) return NextResponse.json({ error: 'Set the valuation date before freezing data' }, { status: 400 });
      if (!engagement.independenceConfirmedAt) return NextResponse.json({ error: 'Confirm independence before freezing data' }, { status: 400 });
      const valuationDate = engagement.valuationDate.toISOString().slice(0, 10);
      const result = await buildValuationSnapshot({ companyId, valuationDate, request });
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
      await prisma.$transaction([
        prisma.businessValuationSnapshot.create({
          data: {
            engagementId: engagement.id,
            valuationDate: engagement.valuationDate,
            asOfMonth: result.data.asOfMonth,
            fiscalYearEndMonth: result.data.fiscalYear.endMonth,
            data: JSON.parse(JSON.stringify(result.data)),
            createdByUserId: context.userId,
            createdByName: actorName,
          },
        }),
        prisma.businessValuationChange.create({
          data: { engagementId: engagement.id, field: 'snapshot', oldValue: null, newValue: `Frozen as of ${result.data.asOfMonth}`, userId: context.userId, userName: actorName },
        }),
      ]);
    } else if (action === 'update-deal-terms') {
      const current = normalizeDealTerms(engagement.dealTerms);
      const incoming = body?.dealTerms && typeof body.dealTerms === 'object' ? (body.dealTerms as Record<string, unknown>) : {};
      const next = normalizeDealTerms({
        ...current,
        ...incoming,
        included: { ...current.included, ...((incoming.included as Record<string, unknown>) || {}) },
      });
      const invalid = validateDealTerms(next);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      if (next.dealDocumentId) {
        const document = await prisma.dataRoomDocument.findFirst({ where: { id: next.dealDocumentId, companyId }, select: { id: true } });
        if (!document) return NextResponse.json({ error: 'Select a document from this company\'s data room' }, { status: 400 });
      }
      const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
      for (const key of INCLUDED_ASSET_KEYS) {
        if (current.included[key] !== next.included[key]) {
          changes.push({ field: `deal.included.${key}`, oldValue: current.included[key] ? 'Included' : 'Excluded', newValue: next.included[key] ? 'Included' : 'Excluded' });
        }
      }
      for (const key of Object.keys(next) as Array<keyof typeof next>) {
        if (key === 'included') continue;
        const before = display(current[key]);
        const after = display(next[key]);
        if (before !== after) changes.push({ field: `deal.${key}`, oldValue: before, newValue: after });
      }
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { dealTerms: next } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'update-earnings-base' || action === 'lookup-owner-salary') {
      const current = normalizeEarningsBase(engagement.earningsBase);
      const incoming = body?.earningsBase && typeof body.earningsBase === 'object' ? (body.earningsBase as Record<string, unknown>) : {};
      let next: EarningsBase = normalizeEarningsBase({ ...current, ...incoming });
      if (action === 'lookup-owner-salary') {
        const company = await prisma.company.findUnique({ where: { id: companyId }, select: { addressState: true } });
        try {
          const result = await lookupMarketSalary({
            occupationCode: next.ownerOccupationCode,
            statistic: next.ownerMarketStatistic,
            area: next.ownerMarketArea,
            companyState: company?.addressState || null,
          });
          next = {
            ...next,
            ownerMarketSalary: result.value,
            ownerMarketSource: result.fellBackToNational ? `${result.source} (no state figure published)` : result.source,
          };
        } catch (error) {
          return NextResponse.json({ error: `BLS lookup failed: ${String((error as Error)?.message || error)}` }, { status: 502 });
        }
      }
      const invalid = validateEarningsBase(next);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const summarize = (base: EarningsBase, key: keyof EarningsBase) => {
        if (key === 'normalizations') return base.normalizations.length ? base.normalizations.map((item) => `${item.label}: ${item.amount}`).join('; ') : null;
        if (key === 'weights') return Object.keys(base.weights).length ? Object.entries(base.weights).map(([period, weight]) => `${period}=${weight}`).join(', ') : null;
        return display(base[key]);
      };
      const changes = (Object.keys(next) as Array<keyof EarningsBase>)
        .map((key) => ({ field: `earnings.${key}`, oldValue: summarize(current, key), newValue: summarize(next, key) }))
        .filter((change) => change.oldValue !== change.newValue);
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { earningsBase: JSON.parse(JSON.stringify(next)) } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'update-income-approach' || action === 'lookup-risk-free' || action === 'lookup-inflation') {
      const current = normalizeIncomeApproach(engagement.incomeApproach);
      const incoming = body?.incomeApproach && typeof body.incomeApproach === 'object' ? (body.incomeApproach as Record<string, unknown>) : {};
      let next: IncomeApproach = normalizeIncomeApproach({ ...current, ...incoming });
      if (action !== 'update-income-approach') {
        if (!engagement.valuationDate) return NextResponse.json({ error: 'Set the valuation date on the Engagement tab first' }, { status: 400 });
        const asOf = engagement.valuationDate.toISOString().slice(0, 10);
        try {
          if (action === 'lookup-risk-free') {
            const rate = await fredRateOnOrBefore('riskFree', asOf);
            next = { ...next, riskFreeRatePct: rate.value, riskFreeAsOf: rate.date, riskFreeSource: rate.source };
          } else {
            const rate = await fredRateOnOrBefore('inflation', asOf);
            next = { ...next, longTermGrowthPct: rate.value, growthSource: `${rate.source} (expected inflation)` };
          }
        } catch (error) {
          return NextResponse.json({ error: `FRED lookup failed: ${String((error as Error)?.message || error)}` }, { status: 502 });
        }
      }
      const invalid = validateIncomeApproach(next);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const summarize = (income: IncomeApproach, key: keyof IncomeApproach) =>
        key === 'riskFactors'
          ? income.riskFactors.filter((factor) => factor.premiumPct !== 0).map((factor) => `${factor.label}: ${factor.premiumPct}%`).join('; ') || null
          : display(income[key]);
      const changes = (Object.keys(next) as Array<keyof IncomeApproach>)
        .map((key) => ({ field: `income.${key}`, oldValue: summarize(current, key), newValue: summarize(next, key) }))
        .filter((change) => change.oldValue !== change.newValue);
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { incomeApproach: JSON.parse(JSON.stringify(next)) } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'update-asset-approach') {
      const current = normalizeAssetApproach(engagement.assetApproach);
      const incoming = body?.assetApproach && typeof body.assetApproach === 'object' ? (body.assetApproach as Record<string, unknown>) : {};
      const next: AssetApproach = normalizeAssetApproach({ ...current, ...incoming });
      const invalid = validateAssetApproach(next);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const summarize = (asset: AssetApproach, key: keyof AssetApproach) => {
        if (key === 'adjustments') {
          return Object.entries(asset.adjustments).filter(([, item]) => item?.amount).map(([line, item]) => `${line}: ${item?.amount}`).join('; ') || null;
        }
        if (key === 'intangibles') return asset.intangibles.map((item) => `${item.label}: ${item.amount}`).join('; ') || null;
        return display(asset[key]);
      };
      const changes = (Object.keys(next) as Array<keyof AssetApproach>)
        .map((key) => ({ field: `asset.${key}`, oldValue: summarize(current, key), newValue: summarize(next, key) }))
        .filter((change) => change.oldValue !== change.newValue);
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { assetApproach: JSON.parse(JSON.stringify(next)) } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'update-diligence') {
      const current = normalizeDiligence(engagement.diligence);
      const incoming = body?.diligence && typeof body.diligence === 'object' ? (body.diligence as Record<string, unknown>) : {};
      const next: Diligence = normalizeDiligence({
        ...current,
        ...incoming,
        responses: { ...current.responses, ...((incoming.responses as Record<string, unknown>) || {}) },
      });
      const invalid = validateDiligence(next);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const documentIds = [...next.reliedOnDocumentIds, ...(next.repLetterDocumentId ? [next.repLetterDocumentId] : [])];
      if (documentIds.length > 0) {
        const found = await prisma.dataRoomDocument.count({ where: { companyId, id: { in: Array.from(new Set(documentIds)) } } });
        if (found !== new Set(documentIds).size) return NextResponse.json({ error: 'Select documents from this company\'s data room' }, { status: 400 });
      }
      const summarize = (diligence: Diligence, key: keyof Diligence) => {
        if (key === 'responses') return null;
        if (key === 'reliedOnDocumentIds') return diligence.reliedOnDocumentIds.length ? `${diligence.reliedOnDocumentIds.length} document(s)` : null;
        return display(diligence[key]);
      };
      const changes = (Object.keys(next) as Array<keyof Diligence>)
        .map((key) => ({ field: `diligence.${key}`, oldValue: summarize(current, key), newValue: summarize(next, key) }))
        .filter((change) => change.oldValue !== change.newValue);
      const changedTopics = Object.keys({ ...current.responses, ...next.responses }).filter(
        (topic) => current.responses[topic as keyof Diligence['responses']] !== next.responses[topic as keyof Diligence['responses']],
      );
      if (changedTopics.length > 0) changes.push({ field: 'diligence.responses', oldValue: null, newValue: `Updated: ${changedTopics.join(', ')}` });
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { diligence: JSON.parse(JSON.stringify(next)) } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'update-outlook') {
      const current = normalizeOutlook(engagement.outlook);
      const incoming = body?.outlook && typeof body.outlook === 'object' ? (body.outlook as Record<string, unknown>) : {};
      const incomingPublished = (incoming.published as Record<string, Record<string, unknown>>) || {};
      const published: Record<string, object> = { ...current.published };
      for (const [key, entry] of Object.entries(incomingPublished)) published[key] = { ...(published[key] || {}), ...entry };
      const edited: Outlook = normalizeOutlook({
        ...current,
        ...Object.fromEntries(OUTLOOK_SECTIONS.filter((section) => section.key in incoming).map((section) => [section.key, incoming[section.key]])),
        published,
      });
      const invalid = validateOutlook(edited);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const withdrawApproval = Boolean(current.approvedAt) && outlookTextChanged(current, edited);
      const next: Outlook = withdrawApproval ? { ...edited, approvedAt: null, approvedByName: null } : edited;
      const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
      for (const section of OUTLOOK_SECTIONS) {
        if ((current[section.key] || '') !== (next[section.key] || '')) changes.push({ field: `outlook.${section.key}`, oldValue: null, newValue: next[section.key] ? 'Edited' : 'Cleared' });
      }
      const changedPublished = Object.keys(incomingPublished).filter(
        (key) => JSON.stringify(current.published[key as keyof Outlook['published']] || null) !== JSON.stringify(next.published[key as keyof Outlook['published']] || null),
      );
      if (changedPublished.length > 0) changes.push({ field: 'outlook.published', oldValue: null, newValue: `Updated: ${changedPublished.join(', ')}` });
      if (withdrawApproval) changes.push({ field: 'outlook.approved', oldValue: 'Approved', newValue: 'Withdrawn after edits' });
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { outlook: JSON.parse(JSON.stringify(next)) } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'refresh-economic-indicators') {
      if (!engagement.valuationDate) return NextResponse.json({ error: 'Set the valuation date on the Engagement tab first' }, { status: 400 });
      const asOf = engagement.valuationDate.toISOString().slice(0, 10);
      const current = normalizeOutlook(engagement.outlook);
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, addressStreet: true, addressCity: true, addressState: true, addressZip: true, industrySector: true, industrySectorCategory: true },
      });
      if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      const benchmarking = normalizeBenchmarking(engagement.benchmarking);
      const industry = await loadIndustryTable(benchmarking.industryCode || (company.industrySector ? String(company.industrySector) : null), ALL_ASSET_SIZES);
      const geography = await resolveCompanyGeography({ street: company.addressStreet, city: company.addressCity, state: company.addressState, zip: company.addressZip });
      const result = await collectEconomicIndicators({
        geography,
        asOf,
        today: formatEstDate(),
        companyName: company.name,
        industryName: industry?.industryName || null,
        industrySectorCategory: company.industrySectorCategory,
        location: [company.addressCity, company.addressState].filter(Boolean).join(', '),
      });
      const next: Outlook = {
        ...current,
        geography,
        indicators: result.indicators,
        indicatorsAsOf: asOf,
        indicatorsFetchedAt: new Date().toISOString(),
        indicatorNotes: result.notes,
        approvedAt: null,
        approvedByName: null,
      };
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { outlook: JSON.parse(JSON.stringify(next)) } }),
        prisma.businessValuationChange.create({
          data: { engagementId: engagement.id, field: 'outlook.indicators', oldValue: current.indicatorsAsOf, newValue: `${result.indicators.length} indicators as of ${asOf}`, userId: context.userId, userName: actorName },
        }),
        ...(current.approvedAt
          ? [prisma.businessValuationChange.create({ data: { engagementId: engagement.id, field: 'outlook.approved', oldValue: 'Approved', newValue: 'Withdrawn after indicator refresh', userId: context.userId, userName: actorName } })]
          : []),
      ]);
    } else if (action === 'approve-outlook') {
      const current = normalizeOutlook(engagement.outlook);
      if (OUTLOOK_SECTIONS.some((section) => !current[section.key])) return NextResponse.json({ error: 'Save all three outlook sections before approving' }, { status: 400 });
      if (current.indicators.length === 0) return NextResponse.json({ error: 'Refresh the economic indicators before approving' }, { status: 400 });
      const next: Outlook = { ...current, approvedAt: new Date().toISOString(), approvedByName: actorName };
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { outlook: JSON.parse(JSON.stringify(next)) } }),
        prisma.businessValuationChange.create({ data: { engagementId: engagement.id, field: 'outlook.approved', oldValue: null, newValue: 'Approved', userId: context.userId, userName: actorName } }),
      ]);
    } else if (action === 'update-benchmarking') {
      const current = normalizeBenchmarking(engagement.benchmarking);
      const incoming = body?.benchmarking && typeof body.benchmarking === 'object' ? (body.benchmarking as Record<string, unknown>) : {};
      const next: Benchmarking = normalizeBenchmarking({
        ...current,
        ...incoming,
        rmaValues: { ...current.rmaValues, ...((incoming.rmaValues as Record<string, unknown>) || {}) },
      });
      const invalid = validateBenchmarking(next);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const summarize = (item: Benchmarking, key: keyof Benchmarking) =>
        key === 'rmaValues' ? Object.entries(item.rmaValues).map(([metric, value]) => `${metric}=${value}`).join('; ') || null : display(item[key]);
      const changes = (Object.keys(next) as Array<keyof Benchmarking>)
        .map((key) => ({ field: `benchmark.${key}`, oldValue: summarize(current, key), newValue: summarize(next, key) }))
        .filter((change) => change.oldValue !== change.newValue);
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { benchmarking: JSON.parse(JSON.stringify(next)) } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'update-debt-service') {
      const current = normalizeDebtService(engagement.debtService);
      const incoming = body?.debtService && typeof body.debtService === 'object' ? (body.debtService as Record<string, unknown>) : {};
      const incomingLoans = (incoming.existingLoans as Record<string, Record<string, unknown>>) || {};
      const existingLoans: Record<string, object> = { ...current.existingLoans };
      for (const [key, choice] of Object.entries(incomingLoans)) existingLoans[key] = { ...(existingLoans[key] || {}), ...choice };
      const next: DebtService = normalizeDebtService({ ...current, ...incoming, existingLoans });
      const invalid = validateDebtService(next);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const summarize = (item: DebtService, key: keyof DebtService) =>
        key === 'existingLoans'
          ? Object.entries(item.existingLoans)
              .map(([loan, choice]) => `${loan}: ${choice.stays === null ? 'default' : choice.stays ? 'stays' : 'paid off'}${choice.annualPayment !== null ? `, ${choice.annualPayment}/yr` : ''}`)
              .join('; ') || null
          : display(item[key]);
      const changes = (Object.keys(next) as Array<keyof DebtService>)
        .map((key) => ({ field: `debt.${key}`, oldValue: summarize(current, key), newValue: summarize(next, key) }))
        .filter((change) => change.oldValue !== change.newValue);
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { debtService: JSON.parse(JSON.stringify(next)) } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'update-reconciliation') {
      const current = normalizeReconciliation(engagement.reconciliation);
      const incoming = body?.reconciliation && typeof body.reconciliation === 'object' ? (body.reconciliation as Record<string, unknown>) : {};
      const edited: Reconciliation = normalizeReconciliation({
        ...current,
        ...incoming,
        weights: { ...current.weights, ...((incoming.weights as Record<string, unknown>) || {}) },
        reasons: { ...current.reasons, ...((incoming.reasons as Record<string, unknown>) || {}) },
      });
      const invalid = validateReconciliation(edited);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const withdraw = Boolean(current.concludedAt) && reconciliationInputsChanged(current, edited);
      const next: Reconciliation = withdraw ? { ...edited, concludedAt: null, concludedByName: null, concludedValue: null } : edited;
      const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
      for (const approach of APPROACHES) {
        const before = current.weights[approach.key];
        const after = next.weights[approach.key];
        if (before !== after) changes.push({ field: `reconciliation.weight.${approach.key}`, oldValue: display(before), newValue: display(after) });
        if ((current.reasons[approach.key] || '') !== (next.reasons[approach.key] || '')) changes.push({ field: `reconciliation.reason.${approach.key}`, oldValue: null, newValue: next.reasons[approach.key] ? 'Edited' : 'Cleared' });
      }
      if (current.roundingIncrement !== next.roundingIncrement) changes.push({ field: 'reconciliation.roundingIncrement', oldValue: display(current.roundingIncrement), newValue: display(next.roundingIncrement) });
      if ((current.conclusionNote || '') !== (next.conclusionNote || '')) changes.push({ field: 'reconciliation.conclusionNote', oldValue: null, newValue: next.conclusionNote ? 'Edited' : 'Cleared' });
      if (withdraw) changes.push({ field: 'reconciliation.concluded', oldValue: display(current.concludedValue), newValue: 'Withdrawn after edits' });
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { reconciliation: JSON.parse(JSON.stringify(next)) } }),
        ...changes.map((change) =>
          prisma.businessValuationChange.create({ data: { engagementId: engagement.id, ...change, userId: context.userId, userName: actorName } }),
        ),
      ]);
    } else if (action === 'conclude-value') {
      const current = normalizeReconciliation(engagement.reconciliation);
      const [latestSnapshot, appraisals, company] = await Promise.all([
        prisma.businessValuationSnapshot.findFirst({ where: { engagementId: engagement.id }, orderBy: { createdAt: 'desc' }, select: { data: true } }),
        prisma.businessValuationAppraisal.findMany({ where: { engagementId: engagement.id } }),
        prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
      ]);
      if (!latestSnapshot) return NextResponse.json({ error: 'Freeze data on the Data Snapshot tab first' }, { status: 400 });
      const snapshotData = latestSnapshot.data as any;
      const indications = computeIndications({ ...engagement, appraisals: appraisals as unknown as Array<Record<string, unknown>> }, snapshotData);
      const result = computeReconciliation(current, indications, {
        companyName: company?.name || '',
        valuationDateLabel: engagement.valuationDate ? engagement.valuationDate.toISOString().slice(0, 10) : null,
        standardOfValue: engagement.standardOfValue,
        premiseOfValue: engagement.premiseOfValue,
        ownershipBasis: engagement.ownershipBasis,
        transactionStructure: engagement.transactionStructure,
        interestPercent: engagement.interestPercent,
        balanceSheet: snapshotData?.trailingTwelveMonths?.balanceSheet || null,
        formatMoney: (amount) => `$${Math.round(amount).toLocaleString('en-US')}`,
      });
      if (result.blockers.length > 0 || result.concludedValue === null) {
        return NextResponse.json({ error: result.blockers[0] || 'The weights do not produce a value' }, { status: 400 });
      }
      const next: Reconciliation = { ...current, concludedAt: new Date().toISOString(), concludedByName: actorName, concludedValue: result.concludedValue };
      await prisma.$transaction([
        prisma.businessValuationEngagement.update({ where: { id: engagement.id }, data: { reconciliation: JSON.parse(JSON.stringify(next)) } }),
        prisma.businessValuationChange.create({
          data: { engagementId: engagement.id, field: 'reconciliation.concluded', oldValue: display(current.concludedValue), newValue: String(result.concludedValue), userId: context.userId, userName: actorName },
        }),
      ]);
    } else if (action === 'save-appraisal') {
      const assetType = String(body?.assetType || '');
      if (!APPRAISAL_ASSET_TYPES.some((type) => type.value === assetType)) return NextResponse.json({ error: 'Select the appraised asset type' }, { status: 400 });
      const value = Number(String(body?.value ?? '').replace(/[$,\s]/g, ''));
      if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: 'Enter the appraised value' }, { status: 400 });
      const documentId = text(body?.documentId);
      if (documentId && !(await prisma.dataRoomDocument.findFirst({ where: { id: documentId, companyId }, select: { id: true } }))) {
        return NextResponse.json({ error: 'Select a document from this company\'s data room' }, { status: 400 });
      }
      const data = {
        assetType,
        appraiserFirm: text(body?.appraiserFirm),
        effectiveDate: dateOnly(body?.effectiveDate),
        value,
        includedInDeal: body?.includedInDeal !== false,
        documentId,
        notes: text(body?.notes),
      };
      const appraisalId = text(body?.appraisalId);
      const existing = appraisalId ? await prisma.businessValuationAppraisal.findFirst({ where: { id: appraisalId, engagementId: engagement.id } }) : null;
      if (appraisalId && !existing) return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 });
      const label = `${assetType === 'REAL_ESTATE' ? 'Real estate' : 'Equipment'} appraisal`;
      await prisma.$transaction([
        existing
          ? prisma.businessValuationAppraisal.update({ where: { id: existing.id }, data })
          : prisma.businessValuationAppraisal.create({ data: { ...data, engagementId: engagement.id } }),
        prisma.businessValuationChange.create({
          data: {
            engagementId: engagement.id,
            field: 'appraisal',
            oldValue: existing ? `${label}: ${existing.value}` : null,
            newValue: `${label}: ${value}${data.includedInDeal ? '' : ' (not in deal)'}`,
            userId: context.userId,
            userName: actorName,
          },
        }),
      ]);
    } else if (action === 'delete-appraisal') {
      const existing = await prisma.businessValuationAppraisal.findFirst({ where: { id: String(body?.appraisalId || ''), engagementId: engagement.id } });
      if (!existing) return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 });
      await prisma.$transaction([
        prisma.businessValuationAppraisal.delete({ where: { id: existing.id } }),
        prisma.businessValuationChange.create({
          data: { engagementId: engagement.id, field: 'appraisal', oldValue: `${existing.assetType === 'REAL_ESTATE' ? 'Real estate' : 'Equipment'} appraisal: ${existing.value}`, newValue: 'Removed', userId: context.userId, userName: actorName },
        }),
      ]);
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json(await workspaceResponse(companyId, engagement.id));
  } catch (error) {
    return errorResponse(error, 'Failed to update Business Valuation');
  }
}
