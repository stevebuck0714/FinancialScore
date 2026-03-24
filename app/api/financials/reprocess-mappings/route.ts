import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { buildCsiMonthlyDataFromGlResponses } from '@/lib/infor-m3/csi-monthly-financial-builder';

export const dynamic = 'force-dynamic';

type FinancialImportMode = 'through' | 'only';

function normalizeFinancialImportMode(value: unknown): FinancialImportMode {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'only' ? 'only' : 'through';
}

function normalizeTargetMonth(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function hasMonthlyDataRows(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const rows = payload.monthlyData;
  return Array.isArray(rows) && rows.length > 0;
}

function resolveThroughMonthForRebuild(
  payload: Record<string, unknown> | null,
  requestedTargetMonth: string | null,
): string {
  const requested = String(requestedTargetMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(requested)) return requested;

  const metadata =
    payload?.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};
  const metadataThrough = String(metadata.throughMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(metadataThrough)) return metadataThrough;

  const rows = Array.isArray(payload?.monthlyData) ? (payload?.monthlyData as Array<Record<string, unknown>>) : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const monthDate = String(row?.monthDate || row?.month || row?.date || '').trim();
    if (/^\d{4}-\d{2}/.test(monthDate)) return monthDate.slice(0, 7);
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getThroughMonthWindow(throughMonth: string, maxMonths: number): { throughDate: Date; earliestDate: Date } | null {
  const throughDate = new Date(`${throughMonth}-01T00:00:00Z`);
  if (Number.isNaN(throughDate.getTime())) return null;
  const earliestDate = new Date(
    throughDate.getUTCFullYear(),
    throughDate.getUTCMonth() - (Math.max(1, maxMonths) - 1),
    1,
  );
  return { throughDate, earliestDate };
}

async function loadHistoricalCsiSlLedgersItems(
  companyId: string,
  throughMonth: string,
  maxMonths: number,
): Promise<Record<string, unknown>[]> {
  const window = getThroughMonthWindow(throughMonth, maxMonths);
  if (!window) return [];
  const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLLEDGERS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    ledger_rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT item
    FROM ledger_rows
    WHERE NULLIF(item->>'ControlYear','') IS NOT NULL
      AND NULLIF(item->>'ControlPeriod','') IS NOT NULL
      AND make_date(NULLIF(item->>'ControlYear','')::int, NULLIF(item->>'ControlPeriod','')::int, 1) >= ${window.earliestDate}
      AND make_date(NULLIF(item->>'ControlYear','')::int, NULLIF(item->>'ControlPeriod','')::int, 1) <= ${window.throughDate}
  `;
  const parsedRows = rows
    .map((row) => (row?.item && typeof row.item === 'object' && !Array.isArray(row.item) ? (row.item as Record<string, unknown>) : null))
    .filter((row): row is Record<string, unknown> => !!row);
  const deduped = new Map<string, Record<string, unknown>>();
  for (const row of parsedRows) {
    const keyParts = [
      String(row.RowPointer || row.rowPointer || '').trim(),
      String(row.Acct || row.account || '').trim(),
      String(row.ControlYear || row.controlYear || '').trim(),
      String(row.ControlPeriod || row.controlPeriod || '').trim(),
      String(row.TransNum || row.transNum || '').trim(),
      String(row.Voucher || row.voucher || '').trim(),
      String(row.VouchSeq || row.vouchSeq || '').trim(),
      String(row.DomAmount || row.domAmount || '').trim(),
      String(row.Ref || row.reference || '').trim(),
      String(row.RecordDate || row.recordDate || '').trim(),
      String(row.TransDate || row.transDate || '').trim(),
    ];
    const key = keyParts.join('|').toLowerCase();
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = body?.companyId;
    const targetMonth = normalizeTargetMonth(body?.targetMonth);
    const mode = normalizeFinancialImportMode(body?.mode);

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: String(companyId) },
      select: { accountingSystem: true },
    });

    const configuredPlatform = String(company?.accountingSystem || '').toUpperCase();

    if (!configuredPlatform) {
      return NextResponse.json(
        { error: 'Accounting system is not configured for this company profile.' },
        { status: 400 },
      );
    }

    if (configuredPlatform === 'CSV_FILE') {
      return NextResponse.json(
        { error: 'CSV workflows should use Process & Save Monthly Data, not API reprocess.' },
        { status: 400 },
      );
    }

    // Xero adapter is implemented today; other platforms can be added behind this unified endpoint.
    if (configuredPlatform === 'XERO') {
      const origin = new URL(request.url).origin;
      const xeroResponse = await fetch(`${origin}/api/xero/reprocess-mappings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({ companyId, targetMonth, mode }),
        cache: 'no-store',
      });
      const payload = await xeroResponse.json().catch(() => ({}));
      return NextResponse.json(payload, { status: xeroResponse.status });
    }

    if (configuredPlatform === 'QUICKBOOKS') {
      const latestFinancialRecord = await prisma.financialRecord.findFirst({
        where: { companyId: String(companyId) },
        orderBy: { createdAt: 'desc' },
        select: { uploadedByUserId: true },
      });

      const fallbackUser = await prisma.user.findFirst({
        where: { companyId: String(companyId) },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      const userId = latestFinancialRecord?.uploadedByUserId || fallbackUser?.id;
      if (!userId) {
        return NextResponse.json(
          { error: 'Unable to resolve a user for QuickBooks reprocess.' },
          { status: 400 },
        );
      }

      const origin = new URL(request.url).origin;
      const qboResponse = await fetch(`${origin}/api/quickbooks/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({ companyId, userId, targetMonth, mode }),
        cache: 'no-store',
      });
      const payload = await qboResponse.json().catch(() => ({}));
      return NextResponse.json(payload, { status: qboResponse.status });
    }

    if (configuredPlatform === 'INFOR_M3' || configuredPlatform === 'INFOR_CSI') {
      const isInforCsi = configuredPlatform === 'INFOR_CSI';
      const connection = await prisma.accountingConnection.findUnique({
        where: {
          companyId_platform: {
            companyId: String(companyId),
            platform: 'INFOR_M3',
          },
        },
        select: {
          connectionMetadata: true,
        },
      });

      const metadata =
        connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
          ? (connection.connectionMetadata as Record<string, unknown>)
          : {};
      const payloadMetadataKeyPrimary = isInforCsi ? 'inforCsiFinancialPayload' : 'inforM3FinancialPayload';
      const payloadMetadataKeyFallback = isInforCsi ? 'inforM3FinancialPayload' : 'inforCsiFinancialPayload';
      const payloadSource =
        metadata[payloadMetadataKeyPrimary] && typeof metadata[payloadMetadataKeyPrimary] === 'object'
          ? (metadata[payloadMetadataKeyPrimary] as Record<string, unknown>)
          : metadata[payloadMetadataKeyFallback] && typeof metadata[payloadMetadataKeyFallback] === 'object'
            ? (metadata[payloadMetadataKeyFallback] as Record<string, unknown>)
            : null;
      let financialPayload =
        payloadSource && typeof payloadSource === 'object'
          ? ({ ...payloadSource } as Record<string, unknown>)
          : null;

      if (!financialPayload) {
        return NextResponse.json(
          {
            success: false,
            error: isInforCsi
              ? 'No Infor CSI financial payload is available yet. Push financial payload first, then reprocess.'
              : 'No Infor M3 financial payload is available yet. Push financial payload first, then reprocess.',
          },
          { status: 400 },
        );
      }

      const glResponsesRaw = Array.isArray(financialPayload.glResponses) ? financialPayload.glResponses : [];
      if (glResponsesRaw.length > 0) {
        const throughMonthForBuild = resolveThroughMonthForRebuild(financialPayload, targetMonth);
        const historicalLedgers = await loadHistoricalCsiSlLedgersItems(String(companyId), throughMonthForBuild, 36);
        const glResponsesForBuild =
          historicalLedgers.length > 0
            ? (() => {
                const replaced = glResponsesRaw.map((entry) => {
                  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
                  const row = entry as Record<string, unknown>;
                  const program = String(row.miProgram || row.program || '').trim().toUpperCase();
                  if (program !== 'SLLEDGERS') return entry;
                  const response =
                    row.response && typeof row.response === 'object' && !Array.isArray(row.response)
                      ? ({ ...(row.response as Record<string, unknown>), Items: historicalLedgers } as Record<string, unknown>)
                      : ({ Items: historicalLedgers } as Record<string, unknown>);
                  return {
                    ...row,
                    response,
                  };
                });
                const hasLedgers = replaced.some((entry) => {
                  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
                  const row = entry as Record<string, unknown>;
                  const program = String(row.miProgram || row.program || '').trim().toUpperCase();
                  return program === 'SLLEDGERS';
                });
                if (hasLedgers) return replaced;
                return [
                  ...replaced,
                  {
                    module: 'GL',
                    miProgram: 'SLLEDGERS',
                    createdAt: new Date().toISOString(),
                    response: { Items: historicalLedgers },
                  },
                ];
              })()
            : glResponsesRaw;
        const mappings = await prisma.accountMapping.findMany({
          where: { companyId: String(companyId) },
          select: {
            qbAccount: true,
            qbAccountId: true,
            qbAccountCode: true,
            targetField: true,
          },
        });
        const built = buildCsiMonthlyDataFromGlResponses({
          glResponses: glResponsesForBuild,
          throughMonth: throughMonthForBuild,
          maxMonths: 36,
          accountMappings: mappings,
        });
        if (built.monthlyData.length > 0) {
          financialPayload = {
            ...financialPayload,
            monthlyData: built.monthlyData,
            metadata: {
              ...(financialPayload.metadata && typeof financialPayload.metadata === 'object' && !Array.isArray(financialPayload.metadata)
                ? (financialPayload.metadata as Record<string, unknown>)
                : {}),
              source: 'csi_gl_rollup_from_reprocess',
              generatedAt: new Date().toISOString(),
                throughMonth: throughMonthForBuild,
              buildStats: built.stats,
            },
          };
          await prisma.accountingConnection.updateMany({
            where: {
              companyId: String(companyId),
              platform: 'INFOR_M3',
            },
            data: {
              connectionMetadata: {
                ...metadata,
                [payloadMetadataKeyPrimary]: financialPayload,
              } as any,
              lastSyncAt: new Date(),
            },
          });
        }
      }

      const result = await ingestFinancialPayload({
        companyId: String(companyId),
        platform: 'INFOR_M3',
        source: isInforCsi ? 'infor-csi' : 'infor-m3',
        payload: financialPayload,
        syncType: 'reprocess_financial_payload',
        targetMonth: targetMonth || undefined,
        mode,
      });

      return NextResponse.json(
        {
          success: result.ok,
          message: result.ok
            ? (isInforCsi
              ? 'Infor CSI reprocess completed successfully.'
              : 'Infor M3 reprocess completed successfully.')
            : result.error || (isInforCsi ? 'Infor CSI reprocess failed.' : 'Infor M3 reprocess failed.'),
          ...result,
        },
        { status: result.status },
      );
    }

    if (configuredPlatform === 'QUICKBOOKS_DESKTOP') {
      const connection = await prisma.accountingConnection.findUnique({
        where: {
          companyId_platform: {
            companyId: String(companyId),
            platform: 'QUICKBOOKS',
          },
        },
        select: {
          connectionMetadata: true,
        },
      });

      const metadata =
        connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
          ? (connection.connectionMetadata as Record<string, unknown>)
          : {};
      const financialPayload =
        metadata.quickbooksDesktopFinancialPayload && typeof metadata.quickbooksDesktopFinancialPayload === 'object'
          ? (metadata.quickbooksDesktopFinancialPayload as Record<string, unknown>)
          : null;

      if (!financialPayload) {
        return NextResponse.json(
          {
            success: false,
            error:
              'No QuickBooks Desktop financial payload is available yet. Push financial payload from Desktop host first, then reprocess.',
          },
          { status: 400 },
        );
      }

      const result = await ingestFinancialPayload({
        companyId: String(companyId),
        platform: 'QUICKBOOKS',
        source: 'quickbooks-desktop',
        payload: financialPayload,
        syncType: 'reprocess_financial_payload',
        targetMonth: targetMonth || undefined,
        mode,
      });

      return NextResponse.json(
        {
          success: result.ok,
          message: result.ok
            ? 'QuickBooks Desktop reprocess completed successfully.'
            : result.error || 'QuickBooks Desktop reprocess failed.',
          ...result,
        },
        { status: result.status },
      );
    }

    if (configuredPlatform === 'SAGE_INTACCT' || configuredPlatform === 'SAGE') {
      const connection = await prisma.accountingConnection.findUnique({
        where: {
          companyId_platform: {
            companyId: String(companyId),
            platform: 'SAGE_INTACCT',
          },
        },
        select: {
          connectionMetadata: true,
        },
      });

      const metadata =
        connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
          ? (connection.connectionMetadata as Record<string, unknown>)
          : {};
      const financialPayload =
        metadata.sageIntacctFinancialPayload && typeof metadata.sageIntacctFinancialPayload === 'object'
          ? (metadata.sageIntacctFinancialPayload as Record<string, unknown>)
          : null;

      if (!financialPayload) {
        return NextResponse.json(
          {
            success: false,
            error:
              'No Sage financial payload is available yet. Push financial payload first, then reprocess.',
          },
          { status: 400 },
        );
      }

      const result = await ingestFinancialPayload({
        companyId: String(companyId),
        platform: 'SAGE_INTACCT',
        source: 'sage-intacct',
        payload: financialPayload,
        syncType: 'reprocess_financial_payload',
        targetMonth: targetMonth || undefined,
        mode,
      });

      return NextResponse.json(
        {
          success: result.ok,
          message: result.ok
            ? 'Sage reprocess completed successfully.'
            : result.error || 'Sage reprocess failed.',
          ...result,
        },
        { status: result.status },
      );
    }

    return NextResponse.json(
      {
        error: `Reprocess mappings adapter not yet implemented for ${configuredPlatform}.`,
      },
      { status: 501 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to reprocess mappings' },
      { status: 500 },
    );
  }
}

