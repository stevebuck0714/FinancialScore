import 'dotenv/config';
import prisma from '../lib/prisma';
import { loadProductYtdGapDataset } from '../lib/operations/product-ytd-gap';

const COMPANY_ID = process.argv[2] || 'cmmcp278j0002kz0439rlixdj';
const YEAR = Number(process.argv[3] || 2026);

const money = (value: number) => Number(value || 0).toFixed(0).padStart(13);

async function main() {
  const dataset = await loadProductYtdGapDataset({ companyId: COMPANY_ID, year: YEAR });
  console.log(
    `year=${dataset.year} dataThru=${dataset.dataThru} through=${dataset.throughMonthLabel} (month ${dataset.throughMonth}, ${dataset.monthsElapsed} months) priceCount=${dataset.priceCount}`
  );
  const { totals } = dataset;
  console.log(
    `TOTALS forecast=${money(totals.forecast)} adjusted=${money(totals.adjusted)} actual=${money(totals.actual)}`
  );
  console.log(
    `GOALS  baseline=${money(totals.goals.baseline ?? 0)} growth=${money(totals.goals.growth ?? 0)} stretch=${money(totals.goals.stretch ?? 0)}`
  );
  console.log(`groups=${dataset.groups.length} lines=${dataset.groups.reduce((sum, g) => sum + g.lines.length, 0)}`);

  const top = dataset.groups.slice().sort((a, b) => b.actual - a.actual).slice(0, 5);
  console.log('\ntop 5 groups by YTD actual');
  for (const group of top) {
    console.log(
      `  ${group.label.padEnd(28).slice(0, 28)} forecast=${money(group.forecast)} adj=${money(group.adjusted)} actual=${money(group.actual)} lines=${group.lines.length}`
    );
  }

  const sumGroups = dataset.groups.reduce((sum, g) => sum + g.actual, 0);
  const sumLines = dataset.groups.reduce(
    (sum, g) => sum + g.lines.reduce((inner, line) => inner + line.actual, 0),
    0
  );
  console.log(`\nreconcile actual: totals=${money(totals.actual)} groups=${money(sumGroups)} lines=${money(sumLines)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
