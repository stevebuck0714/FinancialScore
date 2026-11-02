import dotenv from 'dotenv';
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { enforceDatabaseSecurity, validateDatabaseConnection } from '../lib/db-security';

dotenv.config({ path: '.env.local' });

const sourceCompanyId = process.argv[2];
const targetCompanyId = process.argv[3] || 'cmvzrhzis0000kw08conjfsll';
const outputPath =
  'C:/Users/steve/Dropbox/New Corelytics/CUSTOMERS/Benns Grant/benns-grant-dev-data-inventory.json';

if (!sourceCompanyId) {
  throw new Error('Usage: npx tsx scripts/inventory-company-data.ts <dev-company-id> [prod-company-id]');
}

enforceDatabaseSecurity();
const dbInfo = validateDatabaseConnection();
if (dbInfo.isProduction) {
  throw new Error('This inventory must run against development, never production.');
}

const prisma = new PrismaClient();

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function redactConfiguration(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactConfiguration);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      if (/password|secret|token|credential|api.?key/i.test(key)) return [key, '[redacted]'];
      return [key, redactConfiguration(child)];
    }),
  );
}

async function main() {
  const company = await prisma.company.findUnique({
    where: { id: sourceCompanyId },
    select: {
      id: true,
      name: true,
      accountingSystem: true,
      industrySector: true,
      industrySectorCategory: true,
      hasRealOperationalData: true,
      realDataActivatedAt: true,
      userDefinedAllocations: true,
    },
  });

  if (!company) throw new Error(`Development company ${sourceCompanyId} was not found.`);

  const tables = await prisma.$queryRawUnsafe<Array<{ tableName: string }>>(`
    SELECT DISTINCT table_name AS "tableName"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'companyId'
    ORDER BY table_name
  `);

  const counts: Array<{ table: string; count: number; error?: string }> = [];
  for (const { tableName } of tables) {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        `SELECT COUNT(*)::int AS "count" FROM ${quoteIdentifier(tableName)} WHERE "companyId" = $1`,
        sourceCompanyId,
      );
      counts.push({ table: tableName, count: Number(rows[0]?.count || 0) });
    } catch (error) {
      counts.push({
        table: tableName,
        count: 0,
        error: error instanceof Error ? error.message : 'Unable to count table',
      });
    }
  }

  const nonzeroTables = counts.filter((entry) => entry.count > 0);
  const inventory = {
    generatedAt: new Date().toISOString(),
    source: {
      environment: dbInfo.label,
      companyId: sourceCompanyId,
      company: {
        ...company,
        userDefinedAllocations: redactConfiguration(company.userDefinedAllocations),
      },
    },
    target: {
      environment: 'PRODUCTION',
      companyId: targetCompanyId,
    },
    summary: {
      companyScopedTables: counts.length,
      nonzeroCompanyScopedTables: nonzeroTables.length,
      totalCompanyScopedRows: nonzeroTables.reduce((total, entry) => total + entry.count, 0),
    },
    tables: counts,
    transferPolicy: {
      include: 'All company-scoped business data after row-level validation and companyId remapping.',
      exclude: [
        'Company identity row',
        'User credentials, MFA, sessions, and audit/usage records',
        'Accounting connection credentials, connector sessions, sync jobs, and queue state',
      ],
      note: 'Documents and blobs require a separate object-storage manifest because the database rows alone do not move the underlying file objects.',
    },
  };

  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify({
      outputPath,
      sourceCompany: company.name,
      sourceCompanyId,
      companyScopedTables: counts.length,
      nonzeroCompanyScopedTables: nonzeroTables.length,
      totalCompanyScopedRows: inventory.summary.totalCompanyScopedRows,
      nonzeroTables,
    }, null, 2),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
