/**
 * Set / verify the CSI `site` (and `mongooseConfig`) on the INFOR_M3
 * AccountingConnection metadata so the nightly auto-sync queue can scope
 * IDO calls correctly.
 *
 * Without this, runOperationalSyncForConnection (lib/operational-sync/runner.ts)
 * enqueues a business_day_backfill with no site, every chunk 400s with
 * "CSI operational sync requires site.", and the run sits "running" with
 * Chunks=0 / Records=0.
 *
 * Usage:
 *   npx tsx tmp/set-csi-site-metadata.ts <companyId> [site] [mongooseConfig]
 *   npx tsx tmp/set-csi-site-metadata.ts cmmnwyofv000fqhp4z8lebbny LYN APR_PRD_LYN
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companyId = (process.argv[2] || '').trim();
  const site = (process.argv[3] || 'LYN').trim();
  const mongooseConfig = (process.argv[4] || 'APR_PRD_LYN').trim();
  if (!companyId) {
    throw new Error(
      'Usage: npx tsx tmp/set-csi-site-metadata.ts <companyId> [site=LYN] [mongooseConfig=APR_PRD_LYN]'
    );
  }

  console.log('DB:', (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0] || '(unknown)');
  console.log('companyId      :', companyId);
  console.log('site           :', site);
  console.log('mongooseConfig :', mongooseConfig);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, accountingSystem: true },
  });
  if (!company) throw new Error(`Company not found: ${companyId}`);
  console.log('company        :', company.name, `(${company.accountingSystem})`);

  const connection = await prisma.accountingConnection.findFirst({
    where: { companyId, platform: 'INFOR_M3' as any },
    select: { id: true, connectionMetadata: true },
  });
  if (!connection) {
    throw new Error(`No INFOR_M3 AccountingConnection for ${companyId}.`);
  }

  const existing =
    connection.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
      ? (connection.connectionMetadata as Record<string, unknown>)
      : {};

  console.log('\nbefore:');
  console.log('  site           =', existing.site ?? '(unset)');
  console.log('  inforSite      =', existing.inforSite ?? '(unset)');
  console.log('  defaultSite    =', existing.defaultSite ?? '(unset)');
  console.log('  mongooseConfig =', existing.mongooseConfig ?? existing.inforMongooseConfig ?? '(unset)');

  const next = {
    ...existing,
    site,
    inforSite: site,
    defaultSite: site,
    mongooseConfig,
    inforMongooseConfig: mongooseConfig,
  };

  await prisma.accountingConnection.update({
    where: { id: connection.id },
    data: { connectionMetadata: next as any },
  });

  const after = await prisma.accountingConnection.findUnique({
    where: { id: connection.id },
    select: { connectionMetadata: true },
  });
  const md = (after?.connectionMetadata || {}) as Record<string, unknown>;
  console.log('\nafter:');
  console.log('  site           =', md.site);
  console.log('  inforSite      =', md.inforSite);
  console.log('  defaultSite    =', md.defaultSite);
  console.log('  mongooseConfig =', md.mongooseConfig);

  console.log('\nDONE. Next /api/cron/sync-operational-data tick will enqueue runs with site baked into every chunk payload.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
