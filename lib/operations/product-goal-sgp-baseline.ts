import { SGP_BASELINE_GOAL_YEAR, type SgpBaselineGoals } from '@/lib/operations/product-goal-update';
import { loadRevenueDataset } from '@/lib/operations/product-revenue-actual-db';
import { FORECAST_MONTHS, monthQty } from '@/lib/operations/product-revenue-forecast';
import { getActiveSgpBudgetLock } from '@/lib/operations/product-sgp-budget-lock';

/**
 * Monthly SGP units and dollars (SGP volume x SGP price), summed over every line, for
 * the Baseline goal year. Months are only returned while that year's SGP
 * budget is signed off, since the Baseline must not move with draft SGP.
 */
export async function loadSgpBaselineGoals(companyId: string): Promise<SgpBaselineGoals> {
  const year = SGP_BASELINE_GOAL_YEAR;
  const lock = await getActiveSgpBudgetLock(companyId, year);
  if (!lock) return { year, locked: false, months: null, volumeMonths: null };
  const dataset = await loadRevenueDataset({ companyId, year, includeAllLines: true });
  const months = FORECAST_MONTHS.map((month) =>
    dataset.lines.reduce((sum, line) => sum + monthQty(line.sgpForecastEstimated, month), 0)
  );
  const volumeMonths = FORECAST_MONTHS.map((month) =>
    dataset.lines.reduce((sum, line) => sum + monthQty(line.sgpForecastQty, month), 0)
  );
  return { year, locked: true, months, volumeMonths };
}
