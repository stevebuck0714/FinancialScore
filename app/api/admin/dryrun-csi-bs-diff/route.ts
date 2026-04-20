import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildCsiMonthlyDataFromGlResponses } from '@/lib/infor-m3/csi-monthly-financial-builder';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/admin/dryrun-csi-bs-diff?companyId=...&secret=...
 *   (or pass the secret via the `x-cron-secret` header)
 *
 * READ-ONLY diagnostic. For an Infor CSI/M3 company, runs the patched
 * `buildCsiMonthlyDataFromGlResponses` in-process against the same inputs the
 * production reprocess uses, then compares the rebuilt monthly BS rows to:
 *   - the current persisted MonthlyFinancial rows (the buggy state)
 *   - the DailyFinancialSnapshot EOM rows (the trusted Ops view)
 *
 * Used to decide whether the casing-bug fix alone (Phase 1) is sufficient
 * to align Data Review with Daily Financials, or whether Phase 2 (deriving
 * BS lines from DailyFinancialSnapshot) is also needed.
 *
 * AUDIT INVARIANT: This route MUST NOT mutate any data. It uses only Prisma
 * `findUnique`, `findFirst`, `findMany`, and `$queryRaw` SELECT statements.
 * Greppable check: if you see any of `prisma.*\.(create|update|upsert|delete|
 * createMany|updateMany|deleteMany|executeRaw)` in this file, that is a bug.
 *
 * Delete this file once Phase 1/Phase 2 has been validated and shipped.
 */

type JsonRecord = Record<string, unknown>;

const COMPARISON_FIELDS = [
  'cash',
  'ar',
  'inventory',
  'otherCA',
  'fixedAssets',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
  'otherCL',
  'ltd',
  'totalLiab',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
] as const;

function checkSecret(request: NextRequest, querySecret: string | null): boolean {
  const expected = process.env.CRON_SECRET || 'dev-secret-change-me';
  const header = String(request.headers.get('x-cron-secret') || '').trim();
  const provided = (querySecret && String(querySecret).trim()) || header;
  return Boolean(provided && provided === expected);
}

function normalizeTargetMonth(value: unknown): string | null {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

function resolveThroughMonth(payload: JsonRecord | null, requested: string): string {
  if (normalizeTargetMonth(requested)) return requested;
  const metadata =
    payload?.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as JsonRecord)
      : {};
  const m = normalizeTargetMonth(metadata.throughMonth);
  if (m) return m;
  const rows = Array.isArray(payload?.monthlyData) ? (payload?.monthlyData as JsonRecord[]) : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const value = String(rows[i]?.monthDate || rows[i]?.month || rows[i]?.date || '').trim();
    const match = value.match(/^(\d{4}-\d{2})/);
    if (match) return match[1];
  }
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dedupeLedgerRows(rows: Array<{ item: unknown }>): JsonRecord[] {
  const parsed = rows
    .map((row) => (row?.item && typeof row.item === 'object' && !Array.isArray(row.item) ? (row.item as JsonRecord) : null))
    .filter((row): row is JsonRecord => Boolean(row));
  const deduped = new Map<string, JsonRecord>();
  for (const row of parsed) {
    const ptr = String(row.RowPointer || row.rowPointer || '').trim().toLowerCase();
    if (ptr) {
      const k = `ptr:${ptr}`;
      if (!deduped.has(k)) deduped.set(k, row);
      continue;
    }
    const fb = [
      String(row.Acct || row.account || '').trim(),
      String(row.ControlYear || row.controlYear || '').trim(),
      String(row.ControlPeriod || row.controlPeriod || '').trim(),
      String(row.TransNum || row.transNum || '').trim(),
      String(row.Voucher || row.voucher || '').trim(),
      String(row.VouchSeq || row.vouchSeq || '').trim(),
      String(row.Ref || row.reference || '').trim(),
      String(row.TransDate || row.transDate || '').trim(),
      String(row.RecordDate || row.recordDate || '').trim(),
      String(row.DomAmount || row.domAmount || '').trim(),
    ].map((x) => x.toLowerCase()).join('|');
    const k = `fb:${fb}`;
    if (!deduped.has(k)) deduped.set(k, row);
  }
  return Array.from(deduped.values());
}

async function loadHistoricalCsiLedgerItems(companyId: string): Promise<{ items: JsonRecord[]; program: string }> {
  for (const program of ['SLGLTRANS', 'SLLEDGERS'] as const) {
    const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
      WITH logs AS (
        SELECT l."errorDetails"->'response'->'Items' AS items
        FROM "ApiSyncLog" l
        WHERE l."companyId" = ${companyId}
          AND l.platform = 'INFOR_M3'
          AND l.status = 'success'
          AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = ${program}
          AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ),
      ledger_rows AS (
        SELECT x.value AS item FROM logs CROSS JOIN LATERAL jsonb_array_elements(items) x
      )
      SELECT item FROM ledger_rows
    `;
    if (rows.length > 0) return { items: dedupeLedgerRows(rows), program };
  }
  return { items: [], program: 'NONE' };
}

async function loadCsiLedgerRowsFromFact(
  companyId: string,
  throughMonth: string,
  maxMonths: number,
): Promise<JsonRecord[]> {
  // Mirrors loadHistoricalCsiLedgerFacts() in app/api/financials/reprocess-mappings/route.ts
  // — same column projection and same row shape, so the builder sees identical
  // input to what the live reprocess produces when it falls through to FACT.
  const [year, month] = throughMonth.split('-').map((x) => Number(x));
  const through = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const earliest = new Date(Date.UTC(year, month - 1 - (maxMonths - 1), 1));
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      transDate: Date;
      accountId: string;
      accountName: string | null;
      signedAmount: number;
      debitAmount: number | null;
      creditAmount: number | null;
      sourceProgram: string | null;
      drCr: string | null;
      transNum: string | null;
      ref: string | null;
      description: string | null;
    }>
  >`
    SELECT
      id,
      "transDate",
      "accountId",
      "accountName",
      "signedAmount",
      "debitAmount",
      "creditAmount",
      "sourceProgram",
      "drCr",
      "transNum",
      ref,
      description
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND "transDate" >= ${earliest}
      AND "transDate" <= ${through}
    ORDER BY "transDate" ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((row: any) => {
    const d = row?.transDate ? new Date(row.transDate) : null;
    const controlYear = d && !Number.isNaN(d.getTime()) ? d.getUTCFullYear() : null;
    const controlPeriod = d && !Number.isNaN(d.getTime()) ? d.getUTCMonth() + 1 : null;
    return {
      RowPointer: String(row?.id || ''),
      TransDate: d ? d.toISOString() : null,
      ControlYear: controlYear,
      ControlPeriod: controlPeriod,
      Acct: String(row?.accountId || ''),
      Description: String(row?.accountName || row?.description || ''),
      SignedAmount: Number(row?.signedAmount || 0),
      DomAmount: Number(row?.signedAmount || 0),
      Debit: Number(row?.debitAmount || 0),
      Credit: Number(row?.creditAmount || 0),
      DrCr: String(row?.drCr || ''),
      TransNum: String(row?.transNum || ''),
      Ref: String(row?.ref || ''),
      __miProgram: String(row?.sourceProgram || 'GLTRANSACTIONFACT').trim().toUpperCase(),
    } as Record<string, unknown>;
  });
}

async function summarizeFactLedger(
  companyId: string,
  throughMonth: string,
  maxMonths: number,
): Promise<{ totalCount: number; bySourceProgram: Record<string, number>; minDate: string | null; maxDate: string | null }> {
  const [year, month] = throughMonth.split('-').map((x) => Number(x));
  const through = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const earliest = new Date(Date.UTC(year, month - 1 - (maxMonths - 1), 1));
  const counts = await prisma.$queryRaw<Array<{ sourceProgram: string | null; cnt: bigint }>>`
    SELECT COALESCE("sourceProgram", '<null>') AS "sourceProgram", COUNT(*)::bigint AS cnt
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND "transDate" >= ${earliest}
      AND "transDate" <= ${through}
    GROUP BY "sourceProgram"
  `;
  const bounds = await prisma.$queryRaw<Array<{ minDate: Date | null; maxDate: Date | null; total: bigint }>>`
    SELECT MIN("transDate") AS "minDate", MAX("transDate") AS "maxDate", COUNT(*)::bigint AS total
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND "transDate" >= ${earliest}
      AND "transDate" <= ${through}
  `;
  const bySourceProgram: Record<string, number> = {};
  for (const row of counts) bySourceProgram[String(row.sourceProgram || '<null>')] = Number(row.cnt);
  const b = bounds[0] || { minDate: null, maxDate: null, total: 0n };
  return {
    totalCount: Number(b.total || 0n),
    bySourceProgram,
    minDate: b.minDate ? new Date(b.minDate as any).toISOString() : null,
    maxDate: b.maxDate ? new Date(b.maxDate as any).toISOString() : null,
  };
}

function summarizeGlResponses(glResponsesRaw: JsonRecord[]): {
  total: number;
  byProgram: Record<string, { entries: number; itemsTotal: number }>;
  sample: Array<Record<string, unknown>>;
} {
  const byProgram: Record<string, { entries: number; itemsTotal: number }> = {};
  for (const entry of glResponsesRaw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      const k = '<not-an-object>';
      byProgram[k] = byProgram[k] || { entries: 0, itemsTotal: 0 };
      byProgram[k].entries += 1;
      continue;
    }
    const e = entry as JsonRecord;
    const program = String(e.miProgram || e.program || '').trim().toUpperCase() || '<no-program>';
    const response = e.response && typeof e.response === 'object' && !Array.isArray(e.response) ? (e.response as JsonRecord) : null;
    const items = response && Array.isArray(response.Items) ? (response.Items as unknown[]) : [];
    byProgram[program] = byProgram[program] || { entries: 0, itemsTotal: 0 };
    byProgram[program].entries += 1;
    byProgram[program].itemsTotal += items.length;
  }
  const sample: Array<Record<string, unknown>> = [];
  for (const entry of glResponsesRaw.slice(0, 5)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      sample.push({ kind: typeof entry });
      continue;
    }
    const e = entry as JsonRecord;
    const response = e.response && typeof e.response === 'object' && !Array.isArray(e.response) ? (e.response as JsonRecord) : null;
    const items = response && Array.isArray(response.Items) ? (response.Items as unknown[]) : [];
    const firstItem = items[0] && typeof items[0] === 'object' && !Array.isArray(items[0]) ? Object.keys(items[0] as JsonRecord).slice(0, 20) : null;
    sample.push({
      module: e.module ?? null,
      miProgram: e.miProgram ?? null,
      program: e.program ?? null,
      createdAt: e.createdAt ?? null,
      topLevelKeys: Object.keys(e).slice(0, 20),
      responseKeys: response ? Object.keys(response).slice(0, 20) : null,
      itemsCount: items.length,
      firstItemKeys: firstItem,
    });
  }
  return { total: glResponsesRaw.length, byProgram, sample };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const stage = { current: 'init' };
  try {
    return await runDryRun(request, stage);
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        stage: stage.current,
        error: 'route_threw',
        message: err?.message || String(err),
        stack: err?.stack ? String(err.stack).split('\n').slice(0, 8) : undefined,
      },
      { status: 500 },
    );
  }
}

async function runDryRun(request: NextRequest, stage: { current: string }): Promise<NextResponse> {
  stage.current = 'auth';
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (!checkSecret(request, querySecret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  stage.current = 'parse_query';
  const companyIdParam = String(url.searchParams.get('companyId') || '').trim();
  const companyNameParam = String(url.searchParams.get('companyName') || '').trim();
  const throughMonthParam = String(url.searchParams.get('throughMonth') || '').trim();
  const maxMonths = Math.max(1, Math.min(60, Number(url.searchParams.get('maxMonths') || '36')));
  const tailMonths = Math.max(1, Math.min(36, Number(url.searchParams.get('tailMonths') || '6')));
  const forceFactLedger = String(url.searchParams.get('forceFactLedger') || '').trim().toLowerCase() === 'true';

  stage.current = 'resolve_company';
  let companyId = companyIdParam;
  if (!companyId && companyNameParam) {
    const matches = await prisma.company.findMany({
      where: { name: { contains: companyNameParam, mode: 'insensitive' } },
      select: { id: true, name: true, accountingSystem: true },
      take: 5,
    });
    if (matches.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'company_not_found', companyName: companyNameParam },
        { status: 404 },
      );
    }
    if (matches.length > 1) {
      return NextResponse.json(
        {
          ok: false,
          error: 'company_name_ambiguous',
          matches: matches.map((m) => ({ id: m.id, name: m.name, system: m.accountingSystem })),
        },
        { status: 400 },
      );
    }
    companyId = matches[0].id;
  }
  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: 'missing_company', message: 'Provide ?companyId= or ?companyName=' },
      { status: 400 },
    );
  }

  stage.current = 'load_company';
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, accountingSystem: true },
  });
  if (!company) {
    return NextResponse.json(
      { ok: false, error: 'company_not_found', companyId },
      { status: 404 },
    );
  }
  const platform = String(company.accountingSystem || '').toUpperCase();
  if (!platform.includes('INFOR')) {
    return NextResponse.json(
      {
        ok: false,
        error: 'not_infor',
        companyId,
        companyName: company.name,
        accountingSystem: platform || null,
      },
      { status: 400 },
    );
  }

  stage.current = 'load_payload';
  const connection = await prisma.accountingConnection.findUnique({
    where: { companyId_platform: { companyId, platform: 'INFOR_M3' } },
    select: { connectionMetadata: true },
  });
  const metadata =
    connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
      ? (connection.connectionMetadata as JsonRecord)
      : {};
  const isCsi = platform.includes('CSI');
  const payloadPrimary = isCsi ? 'inforCsiFinancialPayload' : 'inforM3FinancialPayload';
  const payloadFallback = isCsi ? 'inforM3FinancialPayload' : 'inforCsiFinancialPayload';
  const payload =
    metadata[payloadPrimary] && typeof metadata[payloadPrimary] === 'object'
      ? (metadata[payloadPrimary] as JsonRecord)
      : metadata[payloadFallback] && typeof metadata[payloadFallback] === 'object'
      ? (metadata[payloadFallback] as JsonRecord)
      : null;
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: 'no_payload', companyId, companyName: company.name },
      { status: 400 },
    );
  }

  stage.current = 'resolve_through_month';
  const throughMonth = resolveThroughMonth(payload, throughMonthParam);

  stage.current = 'load_ledgers';
  let ledgerSource: JsonRecord[] = [];
  let ledgerProgram = 'SLGLTRANS';
  let ledgerSourceLabel = 'none';
  if (forceFactLedger) {
    ledgerSource = await loadCsiLedgerRowsFromFact(companyId, throughMonth, maxMonths);
    ledgerSourceLabel = 'GLTransactionFact_forced';
  } else {
    const historical = await loadHistoricalCsiLedgerItems(companyId);
    if (historical.items.length > 0) {
      ledgerSource = historical.items;
      ledgerProgram = historical.program;
      ledgerSourceLabel = `apiSyncLog:${historical.program}`;
    } else {
      ledgerSource = await loadCsiLedgerRowsFromFact(companyId, throughMonth, maxMonths);
      ledgerSourceLabel = 'GLTransactionFact_fallback';
    }
  }

  stage.current = 'build_gl_responses';
  const glResponsesRaw = Array.isArray(payload.glResponses) ? (payload.glResponses as JsonRecord[]) : [];
  const glResponsesSummary = summarizeGlResponses(glResponsesRaw);
  const nonLedgers = glResponsesRaw.filter((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true;
    const program = String((entry as JsonRecord).miProgram || (entry as JsonRecord).program || '').trim().toUpperCase();
    return program !== 'SLLEDGERS' && program !== 'SLGLTRANS';
  });

  stage.current = 'summarize_fact_ledger';
  const factSummary = await summarizeFactLedger(companyId, throughMonth, maxMonths).catch((err) => ({
    error: err?.message || String(err),
    totalCount: 0,
    bySourceProgram: {} as Record<string, number>,
    minDate: null as string | null,
    maxDate: null as string | null,
  }));
  const glResponsesForBuild =
    ledgerSource.length > 0
      ? [
          ...nonLedgers,
          {
            module: 'GL',
            miProgram: ledgerProgram,
            createdAt: new Date().toISOString(),
            response: { Items: ledgerSource },
          },
        ]
      : glResponsesRaw;

  stage.current = 'load_mappings';
  const mappings = await prisma.accountMapping.findMany({
    where: { companyId },
    select: { accountName: true, accountId: true, accountCode: true, targetField: true },
  });

  stage.current = 'build';
  const built = buildCsiMonthlyDataFromGlResponses({
    glResponses: glResponsesForBuild as unknown[],
    throughMonth,
    maxMonths,
    accountMappings: mappings,
  });

  stage.current = 'load_current_monthly';
  const currentRecord = await prisma.financialRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: { monthlyData: { orderBy: { monthDate: 'asc' } } },
  });
  const currentByMonth = new Map<string, any>();
  if (currentRecord) {
    for (const row of currentRecord.monthlyData as any[]) {
      const d = new Date(row.monthDate);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      currentByMonth.set(key, row);
    }
  }

  stage.current = 'load_daily_snapshots';
  const dailyDelegate = (prisma as any).dailyFinancialSnapshot;
  const dailySnapshots: any[] = dailyDelegate
    ? await dailyDelegate.findMany({
        where: { companyId, frequency: 'daily' },
        orderBy: { snapshotDate: 'asc' },
      })
    : [];
  const dailyByMonth = new Map<string, any>();
  for (const snap of dailySnapshots) {
    const d = new Date(snap.snapshotDate);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const existing = dailyByMonth.get(key);
    if (!existing || new Date(existing.snapshotDate).getTime() < d.getTime()) {
      dailyByMonth.set(key, snap);
    }
  }

  stage.current = 'build_diff';
  const builtRows = built.monthlyData as Array<Record<string, unknown>>;
  const fullDiff: Array<{
    month: string;
    fields: Array<{
      field: string;
      newValue: number;
      currentValue: number | null;
      opsValue: number | null;
      newMinusOps: number | null;
      currentMinusOps: number | null;
    }>;
  }> = [];
  for (const row of builtRows) {
    const month = String(row.month || '');
    const cur = currentByMonth.get(month) || null;
    const ops = dailyByMonth.get(month) || null;
    const fields = COMPARISON_FIELDS.map((f) => {
      const newV = Number((row as any)[f] || 0);
      const curV = cur ? Number((cur as any)[f] || 0) : null;
      const opsV = ops ? Number((ops as any)[f] || 0) : null;
      return {
        field: f,
        newValue: newV,
        currentValue: curV,
        opsValue: opsV,
        newMinusOps: opsV !== null ? Number((newV - opsV).toFixed(2)) : null,
        currentMinusOps: curV !== null && opsV !== null ? Number((curV - opsV).toFixed(2)) : null,
      };
    });
    fullDiff.push({ month, fields });
  }

  stage.current = 'recommendation';
  const recentMonths = builtRows.slice(-tailMonths).map((r) => String(r.month || ''));
  let measured = 0;
  let totalAbsRel = 0;
  for (const m of recentMonths) {
    const ops = dailyByMonth.get(m);
    const builtRow = builtRows.find((r) => String(r.month || '') === m);
    if (!ops || !builtRow) continue;
    const opsTA = Math.abs(Number((ops as any).totalAssets || 0));
    const newTA = Math.abs(Number((builtRow as any).totalAssets || 0));
    if (opsTA < 1) continue;
    measured += 1;
    totalAbsRel += Math.abs(newTA - opsTA) / opsTA;
  }
  const avgRelGap = measured > 0 ? totalAbsRel / measured : null;
  let verdict: 'phase1_sufficient' | 'phase1_close' | 'phase2_needed' | 'inconclusive';
  let recommendation: string;
  if (avgRelGap === null) {
    verdict = 'inconclusive';
    recommendation = 'No comparable OPS months in the last tail window — verdict inconclusive.';
  } else if (avgRelGap < 0.02) {
    verdict = 'phase1_sufficient';
    recommendation = 'Phase 1 (casing fix) alone looks SUFFICIENT. Proceed to Phase 0 backup + live reprocess for this company.';
  } else if (avgRelGap < 0.1) {
    verdict = 'phase1_close';
    recommendation = 'Phase 1 closes most of the gap but a small residual remains. Inspect per-month diff before promoting; Phase 2 may still be worthwhile longer-term.';
  } else {
    verdict = 'phase2_needed';
    recommendation = 'Phase 1 is NOT sufficient on its own — gap is structural. Proceed to Phase 2 (derive BS lines from DailyFinancialSnapshot) before any live reprocess.';
  }

  stage.current = 'respond';
  return NextResponse.json({
    ok: true,
    company: { id: company.id, name: company.name, platform },
    inputs: {
      throughMonth,
      maxMonths,
      tailMonths,
      forceFactLedger,
      mappingCount: mappings.length,
      ledgerRowCount: ledgerSource.length,
      ledgerSource: ledgerSourceLabel,
      currentFinancialRecordId: currentRecord?.id || null,
      currentMonthlyRowCount: currentRecord?.monthlyData?.length || 0,
      dailySnapshotCount: dailySnapshots.length,
    },
    builtStats: built.stats,
    monthsBuilt: builtRows.map((r) => String(r.month || '')),
    payloadDiagnostics: {
      connectionMetadataKeys: Object.keys(metadata).slice(0, 50),
      payloadKeyPicked: payload === metadata[payloadPrimary] ? payloadPrimary : payloadFallback,
      payloadKeys: Object.keys(payload).slice(0, 50),
      glResponses: {
        total: glResponsesSummary.total,
        nonLedgerCount: nonLedgers.length,
        byProgram: glResponsesSummary.byProgram,
        sample: glResponsesSummary.sample,
      },
      factLedger: factSummary,
    },
    summary: {
      measuredMonths: measured,
      avgRelGapTotalAssets: avgRelGap,
      verdict,
      recommendation,
    },
    perMonthDiff: fullDiff,
  });
}
