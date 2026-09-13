import 'dotenv/config';
import prisma from '../lib/prisma';
import { loadRevenueDataset } from '../lib/operations/product-revenue-actual-db';

const COMPANY_ID = process.argv[2] || 'cmmcp278j0002kz0439rlixdj';
const YEAR = Number(process.argv[3] || 2026);

async function main() {
  const dataset = (await loadRevenueDataset({
    companyId: COMPANY_ID,
    year: YEAR,
    customerId: '',
    customerName: '',
  })) as { dataThru?: string | null; totals?: { months?: Record<string, Record<string, number>> } };

  console.log(`year=${YEAR} dataThru=${dataset.dataThru ?? 'null'}`);
  const months = dataset.totals?.months || {};
  console.log('month  estimated        adjusted         ytd');
  for (let month = 1; month <= 12; month += 1) {
    const bucket = months[String(month)] || {};
    const cell = (value: unknown) => Number(value || 0).toFixed(0).padStart(14);
    console.log(`${String(month).padStart(5)}${cell(bucket.estimated)}${cell(bucket.adjusted)}${cell(bucket.ytd)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
