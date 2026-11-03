/**
 * Crosswalks historical SLN report accounts to the approved April–September
 * 2026 SLN chart without overwriting the original source account code/name.
 *
 * Usage:
 *   npx tsx scripts/crosswalk-benns-grant-sln-accounts.ts --company "BGAH Demo"
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { enforceDatabaseSecurity, validateDatabaseConnection } from '../lib/db-security';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();
const aliases: Record<string, string> = {
  projectoperatingacct: 'operatingcheckingaccount',
  mmisecuritydeposits: 'mmisecuritydeposits',
  acctpayableoperating: 'acctpayableoperating',
  accountpayableother: 'accountpayableother',
  acctpayablesecuritydep: 'acctpayablesecuritydep',
  accountsreceivablerentprepaidrent: 'accountsreceivablerentprepaidrent',
  retaxescacctmortgco: 'retaxescacctmortgco',
  insuranceescrowmortgco: 'insuranceescrowmortgco',
  capitalimprovements: 'capitalimprovements',
  mortgagepayable: 'mortgagepayable',
};

const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

async function main() {
  const companyName = argument('--company');
  if (!companyName) throw new Error('Pass --company "BGAH Demo".');
  enforceDatabaseSecurity();
  if (validateDatabaseConnection().isProduction) throw new Error('Development-only crosswalk.');
  const company = await prisma.company.findFirst({ where: { name: companyName }, select: { id: true, name: true } });
  if (!company) throw new Error(`Company "${companyName}" was not found.`);

  const canonicalRows = await prisma.$queryRawUnsafe<Array<{ accountCode: string; accountName: string }>>(
    `SELECT DISTINCT "accountCode","accountName" FROM "RealEstateFinancialLine"
     WHERE "companyId"=$1 AND "sourceEntity"='SLN' AND "reportType"='BALANCE'
       AND "periodEnd">='2026-04-01'::date AND "accountCode" !~ '^sln_'`,
    company.id,
  );
  const canonicalByName = new Map(canonicalRows.map((row) => [normalize(row.accountName), row.accountCode]));
  const historical = await prisma.$queryRawUnsafe<Array<{ accountCode: string; accountName: string }>>(
    `SELECT DISTINCT "accountCode","accountName" FROM "RealEstateFinancialLine"
     WHERE "companyId"=$1 AND "sourceEntity"='SLN' AND "reportType"='BALANCE' AND "accountCode" ~ '^sln_'`,
    company.id,
  );

  let mapped = 0;
  const unmatched: string[] = [];
  for (const row of historical) {
    const sourceName = normalize(row.accountName);
    const canonicalName = aliases[sourceName] || sourceName;
    const canonicalCode = canonicalByName.get(canonicalName);
    if (!canonicalCode) {
      unmatched.push(row.accountName);
      continue;
    }
    const changed = await prisma.$executeRawUnsafe(
      `UPDATE "RealEstateFinancialLine" SET "canonicalAccountCode"=$1,"updatedAt"=NOW()
       WHERE "companyId"=$2 AND "sourceEntity"='SLN' AND "reportType"='BALANCE' AND "accountCode"=$3`,
      canonicalCode, company.id, row.accountCode,
    );
    mapped += Number(changed);
  }
  console.log(JSON.stringify({
    company: company.name,
    canonicalAccounts: canonicalRows.length,
    historicalAccounts: historical.length,
    mappedRows: mapped,
    unmatchedAccounts: [...new Set(unmatched)].sort(),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
