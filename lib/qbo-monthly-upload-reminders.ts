import prisma from '@/lib/prisma';
import { sendQboMonthlyUploadReminder } from '@/lib/email';

const REMINDER_ACTION = 'QBO_MONTHLY_UPLOAD_REMINDER_SENT';
const REMINDER_ENTITY_TYPE = 'QboMonthlyUploadReminder';
const QBO_ACCOUNTING_SYSTEMS = ['QUICKBOOKS', 'QBO', 'QUICKBOOKS_ONLINE'];

type ReminderResult = {
  companyId: string;
  companyName: string;
  targetMonth: string;
  notified: boolean;
  skipped?: boolean;
  reason?: string;
  recipients?: string[];
  error?: string;
};

type RunQboMonthlyUploadRemindersOptions = {
  now?: Date;
  companyId?: string;
  dryRun?: boolean;
  force?: boolean;
  resend?: boolean;
  uploadUrl?: string;
};

type RunQboMonthlyUploadRemindersResult = {
  ok: boolean;
  targetMonth: string;
  targetMonthLabel: string;
  reminderDay: number;
  dryRun: boolean;
  scannedCompanies: number;
  notifiedCompanies: number;
  skippedCompanies: number;
  failedCompanies: number;
  results: ReminderResult[];
};

function previousMonth(now: Date): { key: string; label: string; start: Date; end: Date } {
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const monthIndex = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return {
    key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    label: start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    start,
    end,
  };
}

function reminderMarker(companyId: string, targetMonth: string): string {
  return `${companyId}:${targetMonth}`;
}

function uniqueEmails(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

async function getCompanyAdminEmails(companyId: string): Promise<string[]> {
  const [legacyAdmins, membershipAdmins] = await Promise.all([
    prisma.user.findMany({
      where: {
        companyId,
        role: 'USER',
        userType: 'COMPANY',
        OR: [{ companyRole: 'admin' }, { isPrimaryContact: true }],
      },
      select: { email: true },
    }),
    prisma.userCompanyAccess.findMany({
      where: {
        companyId,
        companyRole: 'admin',
        user: {
          role: 'USER',
          userType: 'COMPANY',
        },
      },
      select: {
        user: {
          select: { email: true },
        },
      },
    }),
  ]);

  return uniqueEmails([
    ...legacyAdmins.map((user) => user.email),
    ...membershipAdmins.map((membership) => membership.user.email),
  ]);
}

async function hasMonthlyFinancial(companyId: string, start: Date, end: Date): Promise<boolean> {
  const row = await prisma.monthlyFinancial.findFirst({
    where: {
      companyId,
      monthDate: {
        gte: start,
        lt: end,
      },
    },
    select: { id: true },
  });
  return Boolean(row);
}

async function hasReminderAlreadySent(companyId: string, targetMonth: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: {
      action: REMINDER_ACTION,
      entityType: REMINDER_ENTITY_TYPE,
      entityId: reminderMarker(companyId, targetMonth),
    },
    select: { id: true },
  });
  return Boolean(row);
}

async function markReminderSent(params: {
  companyId: string;
  companyName: string;
  targetMonth: string;
  targetMonthLabel: string;
  recipients: string[];
}) {
  await prisma.auditLog.create({
    data: {
      userId: null,
      userEmail: 'qbo-monthly-upload-reminder-cron',
      action: REMINDER_ACTION,
      entityType: REMINDER_ENTITY_TYPE,
      entityId: reminderMarker(params.companyId, params.targetMonth),
      changes: {
        companyId: params.companyId,
        companyName: params.companyName,
        targetMonth: params.targetMonth,
        targetMonthLabel: params.targetMonthLabel,
        recipients: params.recipients,
      },
      ipAddress: 'cron',
      userAgent: 'qbo-monthly-upload-reminder-cron',
    },
  });
}

export async function runQboMonthlyUploadReminders(
  options: RunQboMonthlyUploadRemindersOptions = {},
): Promise<RunQboMonthlyUploadRemindersResult> {
  const now = options.now || new Date();
  const target = previousMonth(now);
  const reminderDay = Number(process.env.QBO_UPLOAD_REMINDER_DAY || 7);
  const safeReminderDay = Number.isFinite(reminderDay) && reminderDay >= 1 && reminderDay <= 28 ? Math.floor(reminderDay) : 7;
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const resend = Boolean(options.resend);

  if (!force && now.getUTCDate() < safeReminderDay) {
    return {
      ok: true,
      targetMonth: target.key,
      targetMonthLabel: target.label,
      reminderDay: safeReminderDay,
      dryRun,
      scannedCompanies: 0,
      notifiedCompanies: 0,
      skippedCompanies: 0,
      failedCompanies: 0,
      results: [],
    };
  }

  const companies = await prisma.company.findMany({
    where: {
      ...(options.companyId ? { id: options.companyId } : {}),
      accountingSystem: {
        in: QBO_ACCOUNTING_SYSTEMS,
      },
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const results: ReminderResult[] = [];

  for (const company of companies) {
    try {
      const hasData = await hasMonthlyFinancial(company.id, target.start, target.end);
      if (hasData) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          targetMonth: target.key,
          notified: false,
          skipped: true,
          reason: 'monthly_data_present',
        });
        continue;
      }

      if (!resend && (await hasReminderAlreadySent(company.id, target.key))) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          targetMonth: target.key,
          notified: false,
          skipped: true,
          reason: 'reminder_already_sent',
        });
        continue;
      }

      const recipients = await getCompanyAdminEmails(company.id);
      if (recipients.length === 0) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          targetMonth: target.key,
          notified: false,
          skipped: true,
          reason: 'no_company_admin_recipients',
        });
        continue;
      }

      if (dryRun) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          targetMonth: target.key,
          notified: false,
          skipped: true,
          reason: 'dry_run',
          recipients,
        });
        continue;
      }

      const sent = await sendQboMonthlyUploadReminder({
        recipients,
        companyName: company.name,
        companyId: company.id,
        missingMonthLabel: target.label,
        uploadUrl: options.uploadUrl,
      });

      if (!sent.success) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          targetMonth: target.key,
          notified: false,
          error: String((sent as any).reason || (sent as any).error?.message || (sent as any).error || 'Email send failed'),
          recipients,
        });
        continue;
      }

      await markReminderSent({
        companyId: company.id,
        companyName: company.name,
        targetMonth: target.key,
        targetMonthLabel: target.label,
        recipients,
      });

      results.push({
        companyId: company.id,
        companyName: company.name,
        targetMonth: target.key,
        notified: true,
        recipients,
      });
    } catch (error: any) {
      results.push({
        companyId: company.id,
        companyName: company.name,
        targetMonth: target.key,
        notified: false,
        error: String(error?.message || error).slice(0, 500),
      });
    }
  }

  const notifiedCompanies = results.filter((result) => result.notified).length;
  const failedCompanies = results.filter((result) => Boolean(result.error)).length;
  const skippedCompanies = results.filter((result) => result.skipped).length;

  return {
    ok: failedCompanies === 0,
    targetMonth: target.key,
    targetMonthLabel: target.label,
    reminderDay: safeReminderDay,
    dryRun,
    scannedCompanies: companies.length,
    notifiedCompanies,
    skippedCompanies,
    failedCompanies,
    results,
  };
}
