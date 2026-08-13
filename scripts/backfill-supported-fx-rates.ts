import prisma from '../lib/prisma';
import { backfillAllSupportedRates } from '../lib/fx/sync';

async function main() {
  const existing = await prisma.fxRate.groupBy({
    by: ['fromCurrency', 'toCurrency'],
    _count: { _all: true },
    _min: { rateDate: true },
    _max: { rateDate: true },
  }).catch(async (error: any) => {
    console.error('FxRate table query failed:', error?.message || error);
    return [];
  });

  console.log('Existing pairs:', existing.length);
  for (const row of existing) {
    console.log(
      `${row.fromCurrency}->${row.toCurrency} count=${row._count._all} min=${row._min.rateDate?.toISOString().slice(0, 10)} max=${row._max.rateDate?.toISOString().slice(0, 10)}`
    );
  }

  const result = await backfillAllSupportedRates();
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
