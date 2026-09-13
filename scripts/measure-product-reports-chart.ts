import 'dotenv/config';
import prisma from '../lib/prisma';
import { buildProductReportDataVersion } from '../lib/operations/product-report-cache';
import {
  loadProductGoalUpdate,
  loadRevenueDataset,
} from '../lib/operations/product-revenue-actual-db';

const COMPANY_ID = process.argv[2] || 'cmmcp278j0002kz0439rlixdj';
const YEAR = Number(process.argv[3] || 2026);

async function time<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await run();
  console.log(`${label}: ${Date.now() - started} ms`);
  return result;
}

async function main() {
  await time('dataVersion fingerprint (cold)', () => buildProductReportDataVersion(COMPANY_ID));
  await time('dataVersion fingerprint (again)', () => buildProductReportDataVersion(COMPANY_ID));

  const goals = await time('loadProductGoalUpdate', () =>
    loadProductGoalUpdate({ companyId: COMPANY_ID, year: YEAR })
  );
  console.log(`  monthlyRevenueGoals rows=${goals.monthlyRevenueGoals.length}`);

  const dataset = await time('loadRevenueDataset', () =>
    loadRevenueDataset({ companyId: COMPANY_ID, year: YEAR, customerId: '', customerName: '' })
  );
  const payloadBytes = Buffer.byteLength(JSON.stringify(dataset), 'utf8');
  const rowCount = Array.isArray((dataset as { rows?: unknown[] }).rows)
    ? (dataset as { rows: unknown[] }).rows.length
    : 0;
  console.log(`  dataset rows=${rowCount} payload=${(payloadBytes / 1024).toFixed(1)} KB`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
