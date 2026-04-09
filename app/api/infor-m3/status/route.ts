import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestedCompanyId } from '@/lib/infor-m3/route-guards';
import { requireSiteAdmin } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const requestedCompanyId = getRequestedCompanyId(request);
    if (!requestedCompanyId) {
      return NextResponse.json(
        { error: 'companyId is required.' },
        { status: 400 }
      );
    }
    await requireSiteAdmin();
    const companyId = requestedCompanyId;

    // Performance: fetch only small fields needed by status UI.
    const rows = await prisma.$queryRaw<
      Array<{
        status: string | null;
        tenantId: string | null;
        platformVersion: string | null;
        errorMessage: string | null;
        lastSyncAt: Date | null;
        autoSync: boolean | null;
        syncFrequency: string | null;
        updatedAt: Date | null;
        autoSyncTime: string | null;
        autoSyncWindowDays: string | null;
        inforManualDisconnect: string | null;
      }>
    >`
      SELECT
        status,
        "tenantId",
        "platformVersion",
        "errorMessage",
        "lastSyncAt",
        "autoSync",
        "syncFrequency",
        "updatedAt",
        "connectionMetadata"->>'operationalPullTime' AS "autoSyncTime",
        "connectionMetadata"->>'operationalAutoSyncWindowDays' AS "autoSyncWindowDays",
        "connectionMetadata"->>'inforManualDisconnect' AS "inforManualDisconnect"
      FROM "AccountingConnection"
      WHERE "companyId" = ${companyId}
        AND platform = 'INFOR_M3'
      LIMIT 1
    `;
    const connection = rows[0];

    if (!connection) {
      return NextResponse.json({
        connected: false,
        status: 'NOT_CONNECTED',
        companyId,
      });
    }

    const manuallyDisconnected =
      String(connection.inforManualDisconnect || '').trim().toLowerCase() === 'true';

    return NextResponse.json({
      connected: connection.status === 'ACTIVE' && !manuallyDisconnected,
      companyId,
      manuallyDisconnected,
      autoSyncTime: connection.autoSyncTime || null,
      ...connection,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to check Infor M3 status',
        details: message,
      },
      { status }
    );
  }
}
