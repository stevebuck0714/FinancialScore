/**
 * Derives non-PII apartment metrics from the imported SLN monthly statements.
 * Existing VHDA workbook metrics are retained as the authoritative source.
 *
 * Usage:
 *   npx tsx scripts/derive-benns-grant-operating-metrics.ts --company "BGAH Demo"
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { enforceDatabaseSecurity, validateDatabaseConnection } from '../lib/db-security';

dotenv.config({ path: '.env.local' });
const prisma = new PrismaClient();

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};
const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  const companyName = argument('--company');
  const companyId = argument('--company-id');
  if (!companyName && !companyId) throw new Error('Pass --company-id for the target company, or an exact --company name.');
  enforceDatabaseSecurity();
  const db = validateDatabaseConnection();
  if (db.isProduction && (argument('--production') !== 'true' || !companyId)) {
    throw new Error('Production derivation requires --production true and an explicit --company-id.');
  }
  const company = await prisma.company.findFirst({ where: companyId ? { id: companyId } : { name: companyName }, select: { id: true, name: true } });
  if (!company) throw new Error(companyId ? `Company ID "${companyId}" was not found.` : `Company "${companyName}" was not found.`);

  const lines = await prisma.$queryRawUnsafe<Array<{ periodEnd: string; reportType: string; accountCode: string; accountName: string; amount: number; sourceFileName: string | null }>>(
    `SELECT "periodEnd"::text AS "periodEnd","reportType","accountCode","accountName","amount"::float AS "amount","sourceFileName"
     FROM "RealEstateFinancialLine"
     WHERE "companyId"=$1 AND "sourceEntity"='SLN' AND "reportType" IN ('ACTIVITY','BALANCE')`,
    company.id,
  );
  const byPeriod = new Map<string, typeof lines>();
  lines.forEach((line) => {
    const period = line.periodEnd.slice(0, 10);
    byPeriod.set(period, [...(byPeriod.get(period) || []), line]);
  });

  let inserted = 0;
  for (const [periodEnd, periodLines] of byPeriod) {
    const values = (test: (name: string) => boolean, reportType: string, absolute = false) => {
      const matches = periodLines.filter((line) => line.reportType === reportType && test(normalize(line.accountName)));
      // Numeric account codes are the approved 2026 ledger. Historical
      // synthetic IDs are retained only when no approved code exists.
      const approved = matches.filter((line) => !String(line.accountCode).startsWith('sln_'));
      return (approved.length ? approved : matches).reduce((sum, line) => sum + (absolute ? Math.abs(Number(line.amount)) : Number(line.amount)), 0);
    };
    const grossPotential = values((name) => name === 'grosspotentialrent', 'ACTIVITY');
    const vacancy = values((name) => name === 'lessvacancies', 'ACTIVITY', true);
    const concessions = values((name) => name === 'modelsemployeeconcessio' || name === 'modelsemployeeconcession' || name === 'onetimerentconcession', 'ACTIVITY', true);
    const tenantAr = values((name) => name === 'accountsreceivablerentprepaidrent', 'BALANCE', true);
    const tradePayables = values((name) => name === 'acctpayableoperating' || name === 'accountpayableother', 'BALANCE', true);
    const source = `Derived from SLN financial statements for ${periodEnd}`;
    const metrics = [
      ['rental_income_potential', grossPotential],
      ['vacancy_loss', vacancy],
      ['concessions', concessions],
      ['tenant_accounts_receivable', tenantAr],
      ['trade_payables', tradePayables],
    ].filter(([, value]) => Number(value) !== 0);
    for (const [metric, value] of metrics) {
      const result = await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateOperationalMetric" ("id","companyId","periodEnd","metric","value","unit","sourceReference","updatedAt")
         VALUES ($1,$2,$3::date,$4,$5,'USD',$6,NOW())
         ON CONFLICT ("companyId","periodEnd","metric") DO UPDATE SET
           "value"=EXCLUDED."value","unit"=EXCLUDED."unit","sourceReference"=EXCLUDED."sourceReference","updatedAt"=NOW()
         WHERE "RealEstateOperationalMetric"."sourceReference" LIKE 'Derived from SLN financial statements%'`,
        randomUUID(), company.id, periodEnd, metric, value, source,
      );
      inserted += Number(result);
    }
  }
  console.log(JSON.stringify({ company: company.name, periods: byPeriod.size, derivedMetricsInserted: inserted }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
