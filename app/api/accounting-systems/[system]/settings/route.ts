/**
 * Generic settings + programs API for any registry-native accounting system.
 *
 *   GET  /api/accounting-systems/{system}/settings?companyId=...
 *   POST /api/accounting-systems/{system}/settings
 *
 * Looks up the plugin in lib/accounting-systems/registry.ts, sanitizes input
 * with the plugin's own normalizers, and persists to AccountingConnection.
 *
 * Storage shape (per company, per platform):
 *   AccountingConnection.connectionMetadata = {
 *     settings: { ...plugin-specific },
 *     programs: [ ...plugin-specific ],
 *     sharedSchedule: { syncFrequency, syncTime, initialSyncStartDate, incrementalSync },
 *     lastUpdatedAt: ISO,
 *   }
 *
 * Legacy per-system metadata keys (e.g. sageIntacctSettings) are NOT touched —
 * each legacy system keeps its own dedicated route until it migrates.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getAccountingSystemModule } from '@/lib/accounting-systems/registry';
import {
  DEFAULT_SHARED_SYNC_SCHEDULE,
  type SharedSyncSchedule,
} from '@/lib/accounting-systems/types';

export const dynamic = 'force-dynamic';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSchedule(value: unknown): SharedSyncSchedule {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const freq = asString(src.syncFrequency);
  const inc = asString(src.incrementalSync).toUpperCase();
  return {
    syncFrequency: freq === 'daily' || freq === 'weekly' || freq === 'monthly' ? freq : '',
    syncTime: asString(src.syncTime) || DEFAULT_SHARED_SYNC_SCHEDULE.syncTime,
    initialSyncStartDate: asString(src.initialSyncStartDate),
    incrementalSync: inc === 'NO' ? 'NO' : inc === 'YES' ? 'YES' : '',
  };
}

function pickMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type RouteContext = { params: Promise<{ system: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { system } = await context.params;
    const plugin = getAccountingSystemModule(system);
    if (!plugin) {
      return NextResponse.json({ ok: false, error: `Unknown accounting system: ${system}` }, { status: 404 });
    }

    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (getAccountingSystemModule(company.accountingSystem)?.key !== plugin.key) {
      return NextResponse.json(
        { ok: false, error: `Settings for ${plugin.label} are only available when the company's accounting system is ${plugin.key}.` },
        { status: 400 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: plugin.platform } },
      select: {
        status: true,
        syncFrequency: true,
        lastSyncAt: true,
        errorMessage: true,
        connectionMetadata: true,
      },
    });

    const metadata = pickMetadata(connection?.connectionMetadata);
    const settings = plugin.sanitizeSettings(metadata.settings ?? plugin.defaultSettings);
    const programs = plugin.sanitizePrograms(metadata.programs ?? plugin.defaultPrograms);
    const schedule = sanitizeSchedule({
      syncFrequency: typeof connection?.syncFrequency === 'string' ? connection.syncFrequency : DEFAULT_SHARED_SYNC_SCHEDULE.syncFrequency,
      ...(pickMetadata(metadata.sharedSchedule)),
    });

    return NextResponse.json({
      ok: true,
      companyId,
      system: plugin.key,
      label: plugin.label,
      status: connection?.status || 'NOT_CONNECTED',
      lastSyncAt: connection?.lastSyncAt || null,
      errorMessage: connection?.errorMessage || null,
      settings,
      programs,
      schedule,
    });
  } catch (error: unknown) {
    const e = error as { message?: string };
    const message = e?.message || 'Failed to load accounting system settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { system } = await context.params;
    const plugin = getAccountingSystemModule(system);
    if (!plugin) {
      return NextResponse.json({ ok: false, error: `Unknown accounting system: ${system}` }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (getAccountingSystemModule(company.accountingSystem)?.key !== plugin.key) {
      return NextResponse.json(
        { ok: false, error: `Settings for ${plugin.label} are only available when the company's accounting system is ${plugin.key}.` },
        { status: 400 }
      );
    }

    const settings = plugin.sanitizeSettings(body.settings ?? plugin.defaultSettings);
    const programs = plugin.sanitizePrograms(body.programs ?? plugin.defaultPrograms);
    const schedule = sanitizeSchedule(body.schedule ?? DEFAULT_SHARED_SYNC_SCHEDULE);

    const existing = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: plugin.platform } },
      select: { status: true, platformVersion: true, connectionMetadata: true },
    });

    const existingMetadata = pickMetadata(existing?.connectionMetadata);
    const mergedMetadata = {
      ...existingMetadata,
      settings,
      programs,
      sharedSchedule: schedule,
      operationalPullTime: schedule.syncTime || '08:00',
      operationalScheduleUpdatedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    const scheduleFrequency = schedule.syncFrequency || 'daily';
    const platformVersionTag = existing?.platformVersion || `${plugin.key.toLowerCase()}-1.0`;

    await prisma.accountingConnection.upsert({
      where: { companyId_platform: { companyId, platform: plugin.platform } },
      update: {
        connectionMetadata: mergedMetadata,
        platformVersion: platformVersionTag,
        status: existing?.status || 'INACTIVE',
        autoSync: true,
        syncFrequency: scheduleFrequency,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: plugin.platform,
        status: 'INACTIVE',
        platformVersion: platformVersionTag,
        autoSync: true,
        syncFrequency: scheduleFrequency,
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      system: plugin.key,
      message: `${plugin.label} settings saved.`,
    });
  } catch (error: unknown) {
    const e = error as { message?: string };
    const message = e?.message || 'Failed to save accounting system settings';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
