import {
  __test_only__applyMappedAmount as applyMappedAmount,
  __test_only__initMonthRow as initMonthRow,
} from '../lib/infor-m3/csi-monthly-financial-builder';

function assertClose(label: string, actual: number, expected: number): void {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function main(): void {
  const bucket = initMonthRow('2026-04');

  applyMappedAmount(bucket, 'rev_contract_program_revenue', 0, 1316577.66, 0);
  applyMappedAmount(bucket, 'rev_contract_program_revenue', 0, -12.6, 0);
  applyMappedAmount(bucket, 'cogs_tariffs', 107315.35, 0, 0);
  applyMappedAmount(bucket, 'cogs_other_cogs', -3250, 0, 0);
  applyMappedAmount(bucket, 'otherExpense', -100, 0, 0);

  assertClose('revenue', bucket.revenue, 1316565.06);
  assertClose('revenueBreakdown', Number(bucket.revenueBreakdown.rev_contract_program_revenue || 0), 1316565.06);
  assertClose('cogsTotal', bucket.cogsTotal, 104065.35);
  assertClose('tariffs breakdown', Number(bucket.cogsBreakdown.cogs_tariffs || 0), 107315.35);
  assertClose('other cogs breakdown', Number(bucket.cogsBreakdown.cogs_other_cogs || 0), -3250);
  assertClose('expense', bucket.expense, -100);
  assertClose('otherExpense', bucket.otherExpense, -100);

  // eslint-disable-next-line no-console
  console.log('CSI mapped P&L sign regression passed');
}

main();
