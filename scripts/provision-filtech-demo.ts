import { FILTECH_COMPANY_ID, provisionFiltechDemoData } from '../lib/demo-provisioning/filtech';
import prisma from '../lib/prisma';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const companyId = option('--company-id') || FILTECH_COMPANY_ID;
  const asOfText = option('--as-of');
  const asOf = asOfText ? new Date(`${asOfText}T00:00:00.000Z`) : undefined;
  if (asOf && Number.isNaN(asOf.getTime())) {
    throw new Error('--as-of must be an ISO calendar date, for example 2026-09-28.');
  }

  const result = await provisionFiltechDemoData({ companyId, asOf, months: 24 });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
