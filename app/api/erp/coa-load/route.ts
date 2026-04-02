import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { seedQuickBooksDesktopAccountMappings } from '@/lib/quickbooks-desktop/account-mapping-seed';
import { seedInforAccountMappings } from '@/lib/infor-m3/account-mapping-seed';
import { buildCsiMonthlyDataFromGlResponses } from '@/lib/infor-m3/csi-monthly-financial-builder';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ConnectorConfig = {
  enabled: boolean;
  platform: 'QUICKBOOKS' | 'INFOR_M3' | 'SAGE_INTACCT' | 'DYNAMICS365' | 'ACUMATICA';
  source: string;
  payloadMetadataKey: string;
  lastPushAtMetadataKey: string;
  lastPushFrequencyMetadataKey: string;
  seedLastRunAtMetadataKey?: string;
  seedSummaryMetadataKey?: string;
  seedSnapshotMetadataKey?: string;
  seedActiveIdsMetadataKey?: string;
};

type SlLedgersMonthlySqlRow = {
  monthDate: Date;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  txnRows: number;
};
const CSI_REBUILD_MAX_MONTHS = 36;

const ERP_COA_CONNECTORS: Record<string, ConnectorConfig> = {
  QUICKBOOKS_DESKTOP: {
    enabled: true,
    platform: 'QUICKBOOKS',
    source: 'quickbooks-desktop',
    payloadMetadataKey: 'quickbooksDesktopFinancialPayload',
    lastPushAtMetadataKey: 'quickbooksDesktopFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'quickbooksDesktopFinancialLastPushFrequency',
    seedLastRunAtMetadataKey: 'quickbooksDesktopAccountSeedLastRunAt',
    seedSummaryMetadataKey: 'quickbooksDesktopAccountSeedSummary',
    seedSnapshotMetadataKey: 'quickbooksDesktopAccountSeedSnapshot',
    seedActiveIdsMetadataKey: 'quickbooksDesktopActiveAccountIds',
  },
  INFOR_M3: {
    enabled: true,
    platform: 'INFOR_M3',
    source: 'infor-m3',
    payloadMetadataKey: 'inforM3FinancialPayload',
    lastPushAtMetadataKey: 'inforM3FinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'inforM3FinancialLastPushFrequency',
    seedLastRunAtMetadataKey: 'inforM3AccountSeedLastRunAt',
    seedSummaryMetadataKey: 'inforM3AccountSeedSummary',
    seedSnapshotMetadataKey: 'inforM3AccountSeedSnapshot',
    seedActiveIdsMetadataKey: 'inforM3ActiveAccountIds',
  },
  INFOR_CSI: {
    enabled: true,
    platform: 'INFOR_M3',
    source: 'infor-csi',
    payloadMetadataKey: 'inforCsiFinancialPayload',
    lastPushAtMetadataKey: 'inforCsiFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'inforCsiFinancialLastPushFrequency',
    seedLastRunAtMetadataKey: 'inforCsiAccountSeedLastRunAt',
    seedSummaryMetadataKey: 'inforCsiAccountSeedSummary',
    seedSnapshotMetadataKey: 'inforCsiAccountSeedSnapshot',
    seedActiveIdsMetadataKey: 'inforCsiActiveAccountIds',
  },
  ACUMATICA: {
    enabled: false,
    platform: 'ACUMATICA',
    source: 'acumatica',
    payloadMetadataKey: 'acumaticaFinancialPayload',
    lastPushAtMetadataKey: 'acumaticaFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'acumaticaFinancialLastPushFrequency',
  },
  DYNAMICS: {
    enabled: false,
    platform: 'DYNAMICS365',
    source: 'dynamics-365',
    payloadMetadataKey: 'dynamicsFinancialPayload',
    lastPushAtMetadataKey: 'dynamicsFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'dynamicsFinancialLastPushFrequency',
  },
  DYNAMICS365: {
    enabled: false,
    platform: 'DYNAMICS365',
    source: 'dynamics-365',
    payloadMetadataKey: 'dynamicsFinancialPayload',
    lastPushAtMetadataKey: 'dynamicsFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'dynamicsFinancialLastPushFrequency',
  },
  SAGE: {
    enabled: false,
    platform: 'SAGE_INTACCT',
    source: 'sage-intacct',
    payloadMetadataKey: 'sageIntacctFinancialPayload',
    lastPushAtMetadataKey: 'sageIntacctFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'sageIntacctFinancialLastPushFrequency',
  },
  SAGE_INTACCT: {
    enabled: false,
    platform: 'SAGE_INTACCT',
    source: 'sage-intacct',
    payloadMetadataKey: 'sageIntacctFinancialPayload',
    lastPushAtMetadataKey: 'sageIntacctFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'sageIntacctFinancialLastPushFrequency',
  },
};

function normalizeThroughMonth(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizePayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)) {
    return raw.payload as Record<string, unknown>;
  }
  return raw;
}

async function loadPayloadFromConnectionMetadataPath(
  companyId: string,
  platform: 'QUICKBOOKS' | 'INFOR_M3' | 'SAGE_INTACCT' | 'DYNAMICS365' | 'ACUMATICA',
  payloadMetadataKey: string,
): Promise<Record<string, unknown> | null> {
  const key = String(payloadMetadataKey || '').trim();
  try {
    let rows: Array<{ payload: unknown }> = [];
    if (key === 'inforCsiFinancialPayload') {
      rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
        SELECT "connectionMetadata"->'inforCsiFinancialPayload' AS payload
        FROM "AccountingConnection"
        WHERE "companyId" = ${companyId}
          AND platform = CAST(${platform} AS "AccountingPlatform")
        LIMIT 1
      `;
    } else if (key === 'inforM3FinancialPayload') {
      rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
        SELECT "connectionMetadata"->'inforM3FinancialPayload' AS payload
        FROM "AccountingConnection"
        WHERE "companyId" = ${companyId}
          AND platform = CAST(${platform} AS "AccountingPlatform")
        LIMIT 1
      `;
    } else if (key === 'quickbooksDesktopFinancialPayload') {
      rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
        SELECT "connectionMetadata"->'quickbooksDesktopFinancialPayload' AS payload
        FROM "AccountingConnection"
        WHERE "companyId" = ${companyId}
          AND platform = CAST(${platform} AS "AccountingPlatform")
        LIMIT 1
      `;
    } else if (key === 'sageIntacctFinancialPayload') {
      rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
        SELECT "connectionMetadata"->'sageIntacctFinancialPayload' AS payload
        FROM "AccountingConnection"
        WHERE "companyId" = ${companyId}
          AND platform = CAST(${platform} AS "AccountingPlatform")
        LIMIT 1
      `;
    } else if (key === 'dynamicsFinancialPayload') {
      rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
        SELECT "connectionMetadata"->'dynamicsFinancialPayload' AS payload
        FROM "AccountingConnection"
        WHERE "companyId" = ${companyId}
          AND platform = CAST(${platform} AS "AccountingPlatform")
        LIMIT 1
      `;
    } else if (key === 'acumaticaFinancialPayload') {
      rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
        SELECT "connectionMetadata"->'acumaticaFinancialPayload' AS payload
        FROM "AccountingConnection"
        WHERE "companyId" = ${companyId}
          AND platform = CAST(${platform} AS "AccountingPlatform")
        LIMIT 1
      `;
    } else {
      rows = [];
    }
    const raw = rows[0]?.payload;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return normalizePayload(raw as Record<string, unknown>);
    }
  } catch (error) {
    console.warn('[ERP COA] payload path query failed; falling back to metadata read', {
      companyId,
      platform,
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const row = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform,
      },
    },
    select: { connectionMetadata: true },
  });
  const metadata =
    row?.connectionMetadata &&
    typeof row.connectionMetadata === 'object' &&
    !Array.isArray(row.connectionMetadata)
      ? (row.connectionMetadata as Record<string, unknown>)
      : {};
  return normalizePayload(metadata[key]);
}

function inferInforSystemFromPrograms(programs: unknown[]): 'INFOR_M3' | 'INFOR_CSI' {
  for (const raw of programs) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const endpointPath = String(row.endpointPath || '').toLowerCase();
    const miProgram = String(row.miProgram || '').trim().toUpperCase();
    if (endpointPath.includes('/csi/') || miProgram.startsWith('SL')) {
      return 'INFOR_CSI';
    }
  }
  return 'INFOR_M3';
}

function inferInforSystemFromConnectionMetadata(metadata: Record<string, unknown>): 'INFOR_M3' | 'INFOR_CSI' {
  const bySystemRaw = metadata.accountingProgramsBySystem;
  if (bySystemRaw && typeof bySystemRaw === 'object' && !Array.isArray(bySystemRaw)) {
    const bySystem = bySystemRaw as Record<string, unknown>;
    if (Array.isArray(bySystem.INFOR_CSI) && bySystem.INFOR_CSI.length > 0) {
      return 'INFOR_CSI';
    }
    if (Array.isArray(bySystem.INFOR_M3) && bySystem.INFOR_M3.length > 0) {
      return inferInforSystemFromPrograms(bySystem.INFOR_M3);
    }
  }
  if (Array.isArray(metadata.accountingPrograms) && metadata.accountingPrograms.length > 0) {
    return inferInforSystemFromPrograms(metadata.accountingPrograms);
  }
  return 'INFOR_M3';
}

function hasMonthlyDataRows(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const rows = payload.monthlyData;
  return Array.isArray(rows) && rows.length > 0;
}

function hasProgramGlResponse(payload: Record<string, unknown> | null, program: 'SLCHARTS' | 'SLLEDGERS'): boolean {
  if (!payload) return false;
  const glResponses = Array.isArray(payload.glResponses) ? payload.glResponses : [];
  for (const entry of glResponses) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const value = String(row.miProgram || row.program || '').trim().toUpperCase();
    if (value === program) return true;
  }
  return false;
}

const CSI_GLSUMMARY_PROGRAMS = new Set([
  'GLACCTPERIODBALANCES',
  'SLGLACCTPERIODBALANCES',
  'GLACCOUNTBALANCES',
  'GLLEDGERPERIODS',
  'SLGLLEDGERPERIODS',
  'LEDGERBALANCES',
]);

function hasAnyLedgerGlResponse(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const glResponses = Array.isArray(payload.glResponses) ? payload.glResponses : [];
  for (const entry of glResponses) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const value = String(row.miProgram || row.program || '').trim().toUpperCase();
    if (value === 'SLLEDGERS' || CSI_GLSUMMARY_PROGRAMS.has(value)) {
      return true;
    }
  }
  return false;
}

async function recoverPayloadFromLatestOperationalGlSync(companyId: string): Promise<Record<string, unknown> | null> {
  const logs = await prisma.apiSyncLog.findMany({
    where: {
      companyId,
      platform: 'INFOR_M3',
      syncType: {
        in: ['operational_other_CSI_LOAD', 'operational_gl_CSI_LOAD'],
      },
      status: 'success',
    },
    orderBy: { createdAt: 'desc' },
    // Keep this bounded to avoid pulling large CSI GL payload history into memory.
    take: 12,
    select: { errorDetails: true, createdAt: true },
  });

  const glResponses: unknown[] = [];
  let hasCharts = false;
  let hasLedgers = false;
  let hasSummary = false;
  for (const log of logs) {
    const details =
      log.errorDetails && typeof log.errorDetails === 'object' && !Array.isArray(log.errorDetails)
        ? (log.errorDetails as Record<string, unknown>)
        : null;
    if (!details) continue;
    const moduleName = String(details.module || '').trim().toUpperCase();
    const program = String(details.miProgram || '').trim().toUpperCase();
    if (moduleName !== 'GL') continue;
    if (program !== 'SLCHARTS' && program !== 'SLLEDGERS' && !CSI_GLSUMMARY_PROGRAMS.has(program)) continue;
    if (details.response) {
      glResponses.push({
        module: moduleName,
        miProgram: program,
        response: details.response,
        createdAt: log.createdAt.toISOString(),
      });
      if (program === 'SLCHARTS') hasCharts = true;
      if (program === 'SLLEDGERS') hasLedgers = true;
      if (CSI_GLSUMMARY_PROGRAMS.has(program)) hasSummary = true;
      if (hasCharts && (hasLedgers || hasSummary)) break;
    }
  }

  if (glResponses.length === 0) return null;
  return {
    source: 'operational_gl_sync_fallback',
    recoveredAt: new Date().toISOString(),
    glResponses,
  };
}

async function buildCsiMonthlyDataFromSlLedgersLogs(params: {
  companyId: string;
  throughMonth: string;
  maxMonths: number;
}): Promise<{ monthlyData: Record<string, unknown>[]; stats: { monthsBuilt: number; sourceRows: number } }> {
  const throughDate = new Date(`${params.throughMonth}-01T00:00:00Z`);
  if (Number.isNaN(throughDate.getTime())) return { monthlyData: [], stats: { monthsBuilt: 0, sourceRows: 0 } };
  const earliestDate = new Date(throughDate.getUTCFullYear(), throughDate.getUTCMonth() - (params.maxMonths - 1), 1);

  const rows = await prisma.$queryRaw<SlLedgersMonthlySqlRow[]>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${params.companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLLEDGERS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    ledger_rows AS (
      SELECT x.value AS r
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    ),
    normalized AS (
      SELECT
        make_date(NULLIF(r->>'ControlYear','')::int, NULLIF(r->>'ControlPeriod','')::int, 1) AS month_date,
        COALESCE(
          NULLIF(r->>'DerDomAmountDebit','')::numeric,
          CASE
            WHEN COALESCE(NULLIF(r->>'DomAmount','')::numeric, 0) > 0
              THEN COALESCE(NULLIF(r->>'DomAmount','')::numeric, 0)
            ELSE 0
          END
        ) AS debit_amt,
        COALESCE(
          NULLIF(r->>'DerDomAmountCredit','')::numeric,
          CASE
            WHEN COALESCE(NULLIF(r->>'DomAmount','')::numeric, 0) < 0
              THEN ABS(COALESCE(NULLIF(r->>'DomAmount','')::numeric, 0))
            ELSE 0
          END
        ) AS credit_amt,
        COALESCE(NULLIF(r->>'DomAmount','')::numeric, 0) AS net_amt
      FROM ledger_rows
      WHERE NULLIF(r->>'ControlYear','') IS NOT NULL
        AND NULLIF(r->>'ControlPeriod','') IS NOT NULL
    )
    SELECT
      month_date AS "monthDate",
      SUM(debit_amt)::float8 AS "totalDebit",
      SUM(credit_amt)::float8 AS "totalCredit",
      SUM(net_amt)::float8 AS "netMovement",
      COUNT(*)::int AS "txnRows"
    FROM normalized
    WHERE month_date >= ${earliestDate}
      AND month_date <= ${throughDate}
    GROUP BY month_date
    ORDER BY month_date ASC
  `;

  const monthlyData = rows.map((row) => {
    const monthDate = new Date(row.monthDate);
    const month = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const totalDebit = Number(row.totalDebit || 0);
    const totalCredit = Number(row.totalCredit || 0);
    const netMovement = Number(row.netMovement || 0);
    return {
      monthDate: monthDate.toISOString(),
      date: monthDate.toISOString(),
      month,
      // Conservative fallback values to make ingestion deterministic.
      // More granular classification should come from chart mappings.
      revenue: Math.abs(netMovement),
      expense: 0,
      cogsTotal: 0,
      totalAssets: 0,
      totalLiab: 0,
      totalEquity: 0,
      totalLAndE: 0,
      revenueBreakdown: { slledgersNetMovement: netMovement },
      expenseBreakdown: {},
      cogsBreakdown: {},
      lobBreakdowns: {
        slledgers: {
          totalDebit,
          totalCredit,
          netMovement,
          txnRows: Number(row.txnRows || 0),
        },
      },
    };
  });

  return {
    monthlyData,
    stats: {
      monthsBuilt: monthlyData.length,
      sourceRows: rows.reduce((acc, row) => acc + Number(row.txnRows || 0), 0),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const requestStartedAt = Date.now();
    const phaseStartedAt = Date.now();
    const timings: Record<string, number> = {};
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    const throughMonth = normalizeThroughMonth(body.throughMonth);
    const payloadFromRequest = normalizePayload(body.payload);
    timings.parseRequestMs = Date.now() - phaseStartedAt;
    console.log('[ERP COA] POST started', {
      companyId,
      throughMonth,
      hasPayloadFromRequest: Boolean(payloadFromRequest),
    });

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }
    if (!throughMonth) {
      return NextResponse.json({ ok: false, error: 'throughMonth (YYYY-MM) is required' }, { status: 400 });
    }

    try {
      const accessStartedAt = Date.now();
      await requireCompanyAccess(companyId);
      timings.accessCheckMs = Date.now() - accessStartedAt;
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }
    console.log('[ERP COA] Access check passed', {
      companyId,
      elapsedMs: Date.now() - requestStartedAt,
    });

    const connectorResolveStartedAt = Date.now();
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }

    let accountingSystem = String(company.accountingSystem || '').toUpperCase();
    let connector = ERP_COA_CONNECTORS[accountingSystem];
    if (!connector && accountingSystem === 'CSV_FILE') {
      const inforConnection = await prisma.accountingConnection.findUnique({
        where: {
          companyId_platform: {
            companyId,
            platform: 'INFOR_M3',
          },
        },
        select: { connectionMetadata: true },
      });
      const inforMetadata =
        inforConnection?.connectionMetadata &&
        typeof inforConnection.connectionMetadata === 'object' &&
        !Array.isArray(inforConnection.connectionMetadata)
          ? (inforConnection.connectionMetadata as Record<string, unknown>)
          : null;
      if (inforMetadata) {
        accountingSystem = inferInforSystemFromConnectionMetadata(inforMetadata);
        connector = ERP_COA_CONNECTORS[accountingSystem];
        if (connector) {
          await prisma.company.update({
            where: { id: companyId },
            data: { accountingSystem },
          });
        }
      }
    }
    if (!connector) {
      return NextResponse.json(
        { ok: false, error: `ERP COA load is not available for accounting system ${accountingSystem || 'UNKNOWN'}.` },
        { status: 409 }
      );
    }
    if (!connector.enabled) {
      return NextResponse.json(
        {
          ok: false,
          error: `${accountingSystem} ERP COA load wiring is reserved for a future release.`,
          supportedToday: ['QUICKBOOKS_DESKTOP', 'INFOR_M3', 'INFOR_CSI'],
        },
        { status: 501 }
      );
    }
    timings.connectorResolveMs = Date.now() - connectorResolveStartedAt;
    console.log('[ERP COA] Connector resolved', {
      companyId,
      accountingSystem,
      connectorPlatform: connector.platform,
      connectorSource: connector.source,
      elapsedMs: Date.now() - requestStartedAt,
    });

    const existingConnection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: connector.platform,
        },
      },
      select: {
        status: true,
        platformVersion: true,
      },
    });
    let existingMetadataCache: Record<string, unknown> | null = null;
    async function loadExistingMetadata(): Promise<Record<string, unknown>> {
      if (existingMetadataCache) return existingMetadataCache;
      const row = await prisma.accountingConnection.findUnique({
        where: {
          companyId_platform: {
            companyId,
            platform: connector.platform,
          },
        },
        select: { connectionMetadata: true },
      });
      existingMetadataCache =
        row?.connectionMetadata &&
        typeof row.connectionMetadata === 'object' &&
        !Array.isArray(row.connectionMetadata)
          ? (row.connectionMetadata as Record<string, unknown>)
          : {};
      return existingMetadataCache;
    }

    const payloadResolveStartedAt = Date.now();
    const payloadFromMetadata = await loadPayloadFromConnectionMetadataPath(
      companyId,
      connector.platform,
      connector.payloadMetadataKey,
    );
    const legacyPayloadMetadataKey =
      accountingSystem === 'INFOR_CSI'
        ? 'inforCsiCoaPayload'
        : accountingSystem === 'INFOR_M3'
          ? 'inforM3CoaPayload'
          : null;
    const payloadFromLegacyMetadata =
      !payloadFromMetadata && legacyPayloadMetadataKey
        ? await loadPayloadFromConnectionMetadataPath(
            companyId,
            connector.platform,
            legacyPayloadMetadataKey,
          )
        : null;
    let payloadFromOperationalGlSync: Record<string, unknown> | null = null;
    let payload = payloadFromRequest || payloadFromMetadata || payloadFromLegacyMetadata;

    const isInforCsiOrM3 = accountingSystem === 'INFOR_M3' || accountingSystem === 'INFOR_CSI';
    const shouldAttemptOperationalGlFallback =
      isInforCsiOrM3 &&
      (
        !payload ||
        !hasMonthlyDataRows(payload)
      );
    // CSI/M3 fallback recovery can be expensive because it scans recent sync logs.
    // Run it when payload is missing OR clearly incomplete for GL monthly build.
    if (shouldAttemptOperationalGlFallback) {
      payloadFromOperationalGlSync = await recoverPayloadFromLatestOperationalGlSync(companyId);
      if (!payload) {
        payload = payloadFromOperationalGlSync;
      }
    }
    console.log('[ERP COA] Payload resolved', {
      source: payloadFromRequest
        ? 'request'
        : payloadFromMetadata
          ? 'connection_metadata'
          : payloadFromLegacyMetadata
            ? 'legacy_connection_metadata'
          : payloadFromOperationalGlSync
            ? 'operational_gl_sync_fallback'
            : 'none',
      hasMonthlyDataRows: hasMonthlyDataRows(payload),
      elapsedMs: Date.now() - requestStartedAt,
    });
    if (
      isInforCsiOrM3 &&
      payload &&
      !hasMonthlyDataRows(payload) &&
      payloadFromOperationalGlSync
    ) {
      const fallbackGlResponses = Array.isArray(payloadFromOperationalGlSync.glResponses)
        ? payloadFromOperationalGlSync.glResponses
        : [];
      if (fallbackGlResponses.length > 0) {
      payload = {
        ...payload,
        // Replace stale metadata snapshots with the freshest operational GL payload.
        glResponses: fallbackGlResponses,
        metadata: {
          ...(payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
            ? (payload.metadata as Record<string, unknown>)
            : {}),
          glFallbackMergedAt: new Date().toISOString(),
          glFallbackSource: 'operational_gl_sync_fallback',
          glFallbackReplace: true,
        },
      };
      }
    }
    if (!payload) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No COA payload found. Upload COA JSON now or ensure an integration payload was previously saved for this company.',
        },
        { status: 400 }
      );
    }
    timings.payloadResolveMs = Date.now() - payloadResolveStartedAt;

    const syntheticBuildStartedAt = Date.now();
    let syntheticMonthlyBuild:
      | {
          chartRows: number;
          ledgerRows: number;
          monthsBuilt: number;
        }
      | null = null;
    if (
      payload &&
      !hasMonthlyDataRows(payload) &&
      (accountingSystem === 'INFOR_M3' || accountingSystem === 'INFOR_CSI')
    ) {
      const glResponsesRaw = Array.isArray(payload.glResponses) ? payload.glResponses : [];
      if (glResponsesRaw.length > 0) {
        const built = buildCsiMonthlyDataFromGlResponses({
          glResponses: glResponsesRaw,
          throughMonth,
          maxMonths: CSI_REBUILD_MAX_MONTHS,
        });
        if (built.monthlyData.length > 0) {
          payload = {
            ...payload,
            monthlyData: built.monthlyData,
            metadata: {
              ...(payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
                ? (payload.metadata as Record<string, unknown>)
                : {}),
              source: 'csi_gl_rollup_from_slcharts_slledgers',
              preferredLedgerSource: 'summary_gl_if_available_else_slledgers',
              generatedAt: new Date().toISOString(),
              throughMonth,
              buildStats: built.stats,
            },
          };
        }
        syntheticMonthlyBuild = built.stats;
      }
    }
    if (
      payload &&
      !hasMonthlyDataRows(payload) &&
      (accountingSystem === 'INFOR_M3' || accountingSystem === 'INFOR_CSI')
    ) {
      const sqlFallback = await buildCsiMonthlyDataFromSlLedgersLogs({
        companyId,
        throughMonth,
        maxMonths: CSI_REBUILD_MAX_MONTHS,
      });
      if (sqlFallback.monthlyData.length > 0) {
        payload = {
          ...payload,
          monthlyData: sqlFallback.monthlyData,
          metadata: {
            ...(payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
              ? (payload.metadata as Record<string, unknown>)
              : {}),
            source: 'csi_slledgers_sql_rollup_fallback',
            generatedAt: new Date().toISOString(),
            throughMonth,
            buildStats: sqlFallback.stats,
          },
        };
        syntheticMonthlyBuild = {
          chartRows: 0,
          ledgerRows: sqlFallback.stats.sourceRows,
          monthsBuilt: sqlFallback.stats.monthsBuilt,
        };
      }
    }
    timings.syntheticBuildMs = Date.now() - syntheticBuildStartedAt;

    const mappingSeedStartedAt = Date.now();
    let seedSummary:
      | {
          extracted: number;
          created: number;
          updated: number;
          unchanged: number;
          inactive: number;
          newAccounts: string[];
          changedAccounts: string[];
          inactiveAccounts: string[];
          activeAccountIds: string[];
          accountSnapshot: Array<{
            accountId: string;
            accountName: string;
            accountCode: string | null;
            classification: string | null;
          }>;
        }
      | null = null;

    if (accountingSystem === 'QUICKBOOKS_DESKTOP') {
      seedSummary = await seedQuickBooksDesktopAccountMappings(companyId, payload);
    } else if (accountingSystem === 'INFOR_M3' || accountingSystem === 'INFOR_CSI') {
      seedSummary = await seedInforAccountMappings(companyId, payload);
    }
    timings.mappingSeedMs = Date.now() - mappingSeedStartedAt;
    console.log('[ERP COA] Account mapping seed complete', {
      accountingSystem,
      extracted: seedSummary?.extracted ?? 0,
      created: seedSummary?.created ?? 0,
      updated: seedSummary?.updated ?? 0,
      unchanged: seedSummary?.unchanged ?? 0,
      elapsedMs: Date.now() - requestStartedAt,
    });

    const payloadCameFromExistingMetadata = Boolean(payloadFromMetadata) && !payloadFromRequest && !payloadFromOperationalGlSync;
    const payloadMetadataNeedsWrite = !payloadCameFromExistingMetadata;

    const mappingChanged = Boolean(
      seedSummary &&
      (seedSummary.created > 0 || seedSummary.updated > 0 || seedSummary.inactive > 0)
    );
    const canIngestFinancials = hasMonthlyDataRows(payload);

    // Fast path for reruns with unchanged metadata payload and unchanged mappings.
    // Skip expensive metadata upsert + ingestion when this request would be a no-op.
    if (payloadCameFromExistingMetadata && !mappingChanged) {
      timings.metadataUpsertMs = 0;
      timings.ingestionMs = 0;
      timings.totalMs = Date.now() - requestStartedAt;
      const ingestResult = {
        ok: true as const,
        status: 200,
        recordsImported: 0,
        monthsTouched: [] as string[],
        latestMonthWarnings: [] as unknown[],
        ingestionSkipped: true,
        ingestionSkipReason:
          'No-op COA rerun: payload and mappings unchanged.',
      };
      console.log('[ERP COA] Fast-path no-op return', {
        companyId,
        accountingSystem,
        elapsedMs: Date.now() - requestStartedAt,
        timings,
      });
      return NextResponse.json(
        {
          ok: ingestResult.ok,
          companyId,
          companyName: company.name,
          accountingSystem,
          throughMonth,
          mode: 'through',
          maxMonths: CSI_REBUILD_MAX_MONTHS,
          syntheticMonthlyBuild,
          accountMappingSeed: seedSummary,
          timings,
          ...ingestResult,
        },
        { status: ingestResult.status }
      );
    }

    // Rewriting very large CSI payload JSON on every rerun can take minutes.
    // Only rewrite metadata blob when payload source changed or mapping snapshot changed.
    const shouldRewriteConnectionMetadata = payloadMetadataNeedsWrite || mappingChanged;
    const existingMetadata = shouldRewriteConnectionMetadata ? await loadExistingMetadata() : {};

    const nextMetadata: Record<string, unknown> = {
      ...(shouldRewriteConnectionMetadata ? existingMetadata : {}),
      ...(payloadMetadataNeedsWrite
        ? {
            [connector.payloadMetadataKey]: payload,
            [connector.lastPushAtMetadataKey]: new Date().toISOString(),
            [connector.lastPushFrequencyMetadataKey]: 'monthly',
          }
        : {}),
    };
    if (seedSummary) {
      if (connector.seedLastRunAtMetadataKey) nextMetadata[connector.seedLastRunAtMetadataKey] = new Date().toISOString();
      if (connector.seedSummaryMetadataKey) {
        nextMetadata[connector.seedSummaryMetadataKey] = {
          extracted: seedSummary.extracted,
          created: seedSummary.created,
          updated: seedSummary.updated,
          unchanged: seedSummary.unchanged,
          inactive: seedSummary.inactive,
        };
      }
      if (connector.seedSnapshotMetadataKey) nextMetadata[connector.seedSnapshotMetadataKey] = seedSummary.accountSnapshot;
      if (connector.seedActiveIdsMetadataKey) nextMetadata[connector.seedActiveIdsMetadataKey] = seedSummary.activeAccountIds;
    }

    const metadataUpsertStartedAt = Date.now();
    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: connector.platform,
        },
      },
      update: {
        status: existingConnection?.status || 'ACTIVE',
        platformVersion: existingConnection?.platformVersion || `${connector.source}-1.0`,
        errorMessage: null,
        lastSyncAt: new Date(),
        ...(shouldRewriteConnectionMetadata ? { connectionMetadata: nextMetadata as any } : {}),
      },
      create: {
        companyId,
        platform: connector.platform,
        status: 'ACTIVE',
        platformVersion: `${connector.source}-1.0`,
        autoSync: true,
        syncFrequency: 'monthly',
        connectionMetadata: {
          ...existingMetadata,
          ...(payloadMetadataNeedsWrite
            ? {
                [connector.payloadMetadataKey]: payload,
                [connector.lastPushAtMetadataKey]: new Date().toISOString(),
                [connector.lastPushFrequencyMetadataKey]: 'monthly',
              }
            : {}),
          ...(seedSummary
            ? {
                ...(connector.seedLastRunAtMetadataKey
                  ? { [connector.seedLastRunAtMetadataKey]: new Date().toISOString() }
                  : {}),
                ...(connector.seedSummaryMetadataKey
                  ? {
                      [connector.seedSummaryMetadataKey]: {
                        extracted: seedSummary.extracted,
                        created: seedSummary.created,
                        updated: seedSummary.updated,
                        unchanged: seedSummary.unchanged,
                        inactive: seedSummary.inactive,
                      },
                    }
                  : {}),
                ...(connector.seedSnapshotMetadataKey
                  ? { [connector.seedSnapshotMetadataKey]: seedSummary.accountSnapshot }
                  : {}),
                ...(connector.seedActiveIdsMetadataKey
                  ? { [connector.seedActiveIdsMetadataKey]: seedSummary.activeAccountIds }
                  : {}),
              }
            : {}),
        } as any,
      },
    });
    timings.metadataUpsertMs = Date.now() - metadataUpsertStartedAt;
    console.log('[ERP COA] Connection metadata upsert complete', {
      companyId,
      elapsedMs: Date.now() - requestStartedAt,
    });

    const ingestionStartedAt = Date.now();
    let ingestResult: any;
    if (canIngestFinancials) {
      try {
        ingestResult = await ingestFinancialPayload({
          companyId,
          platform: connector.platform,
          source: connector.source,
          payload,
          syncType: 'coa_load',
          targetMonth: throughMonth,
          mode: 'through',
          maxMonths: CSI_REBUILD_MAX_MONTHS,
        });
      } catch (ingestError) {
        const ingestMessage = ingestError instanceof Error ? ingestError.message : String(ingestError);
        console.error('[ERP COA] Financial ingestion failed after successful seed', { ingestMessage });
        ingestResult = {
          ok: true as const,
          status: 200,
          recordsImported: 0,
          monthsTouched: [] as string[],
          latestMonthWarnings: [] as unknown[],
          ingestionSkipped: true,
          partialSuccess: true,
          ingestionSkipReason:
            'Account mappings refreshed, but monthly financial ingestion failed. Reprocess monthly data separately if needed.',
          ingestionError: ingestMessage,
        };
      }
    } else {
      ingestResult = {
        ok: true as const,
        status: 200,
        recordsImported: 0,
        monthsTouched: [] as string[],
        latestMonthWarnings: [] as unknown[],
        ingestionSkipped: true,
        ingestionSkipReason:
          'COA payload loaded for mapping seed, but monthlyData rows were not present for financial snapshot ingestion.',
      };
    }
    if (!ingestResult?.ok && seedSummary) {
      ingestResult = {
        ...ingestResult,
        ok: true,
        status: 200,
        partialSuccess: true,
        ingestionSkipReason:
          'Account mappings refreshed, but monthly financial ingestion reported errors. Reprocess monthly data separately if needed.',
      };
    }
    timings.ingestionMs = Date.now() - ingestionStartedAt;
    timings.totalMs = Date.now() - requestStartedAt;
    console.log('[ERP COA] Financial ingestion complete', {
      canIngestFinancials,
      recordsImported: ingestResult.recordsImported ?? 0,
      ingestionSkipped: Boolean((ingestResult as any).ingestionSkipped),
      elapsedMs: Date.now() - requestStartedAt,
      timings,
    });

    return NextResponse.json(
      {
        ok: ingestResult.ok,
        companyId,
        companyName: company.name,
        accountingSystem,
        throughMonth,
        mode: 'through',
        maxMonths: CSI_REBUILD_MAX_MONTHS,
        syntheticMonthlyBuild,
        accountMappingSeed: seedSummary,
        timings,
        ...ingestResult,
      },
      { status: ingestResult.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ERP COA] POST failed', { message });
    return NextResponse.json({ ok: false, error: 'Failed to load ERP COA data', details: message }, { status: 500 });
  }
}
