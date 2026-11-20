import type { MonthlyDataRow } from '@/app/types';

const numberValue = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export type CashFlowMetricRow = {
  month: string;
  operatingCashFlow: number;
  freeCashFlow: number;
  cashFlowMargin: number;
  daysCashOnHand: number;
  cashConversionRate: number | null;
  dio: number | null;
  dso: number | null;
  dpo: number | null;
  ccc: number | null;
};

/**
 * Provides the monthly Cash Flow Metrics shown in Financial Reporting and the
 * SDE/QoE Cash Flow Quality analysis. The period is the latest 12 months.
 */
export function buildCashFlowMetricSeries(monthly: MonthlyDataRow[]): CashFlowMetricRow[] {
  const recent = monthly.slice(-12);
  const ltmRevenue = recent.reduce((sum, month) => sum + numberValue(month.revenue), 0);
  const ltmCogs = recent.reduce((sum, month) => sum + numberValue(month.cogsTotal), 0);

  return recent.map((current, index) => {
    const previous =
      index === 0 && monthly.length > recent.length
        ? monthly[monthly.length - recent.length - 1]
        : index > 0
          ? recent[index - 1]
          : current;
    const revenue = numberValue(current.revenue);
    const cogs = numberValue(current.cogsTotal);
    const expense = numberValue(current.expense);
    const netIncome = revenue - cogs - expense;
    const depreciation = numberValue(current.depreciationAmortization);
    const changeInWorkingCapital = -(
      (numberValue(current.ar) - numberValue(previous.ar)) +
      (numberValue(current.retainageReceivables) - numberValue(previous.retainageReceivables)) +
      (numberValue(current.contractAssets) - numberValue(previous.contractAssets)) +
      (numberValue(current.inventory) - numberValue(previous.inventory)) -
      (numberValue(current.ap) - numberValue(previous.ap)) -
      (numberValue(current.contractLiabilities) - numberValue(previous.contractLiabilities))
    );
    const operatingCashFlow = netIncome + depreciation + changeInWorkingCapital;
    const currentFixedAssets =
      numberValue(current.fixedAssets) ||
      numberValue(current.constructionEquipment) + numberValue(current.officeEquipment) + numberValue(current.shopEquipment);
    const previousFixedAssets =
      numberValue(previous.fixedAssets) ||
      numberValue(previous.constructionEquipment) + numberValue(previous.officeEquipment) + numberValue(previous.shopEquipment);
    const capitalExpenditures = currentFixedAssets - previousFixedAssets + depreciation;
    const freeCashFlow = operatingCashFlow - Math.max(0, capitalExpenditures);
    const averageInventory = (numberValue(current.inventory) + numberValue(previous.inventory)) / 2;
    const averageAr = (numberValue(current.ar) + numberValue(previous.ar)) / 2;
    const averageAp = (numberValue(current.ap) + numberValue(previous.ap)) / 2;
    const inventoryTurnover = averageInventory > 0 ? ltmCogs / averageInventory : 0;
    const receivablesTurnover = averageAr > 0 ? ltmRevenue / averageAr : 0;
    const payablesTurnover = averageAp > 0 ? ltmCogs / averageAp : 0;
    const dio = inventoryTurnover > 0 ? 365 / inventoryTurnover : null;
    const dso = receivablesTurnover > 0 ? 365 / receivablesTurnover : null;
    const dpo = payablesTurnover > 0 ? 365 / payablesTurnover : null;

    return {
      month: String(current.month || ''),
      operatingCashFlow,
      freeCashFlow,
      cashFlowMargin: revenue > 0 ? (operatingCashFlow / revenue) * 100 : 0,
      daysCashOnHand: cogs + expense > 0 ? numberValue(current.cash) / ((cogs + expense) / 30) : 0,
      cashConversionRate: netIncome > 0 ? (operatingCashFlow / netIncome) * 100 : null,
      dio,
      dso,
      dpo,
      ccc: dio !== null && dso !== null && dpo !== null ? dio + dso - dpo : null,
    };
  });
}

export function buildCashFlowMetricInsights(rows: CashFlowMetricRow[]) {
  const average = (values: number[]) => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    totalOperatingCashFlow: rows.reduce((sum, row) => sum + row.operatingCashFlow, 0),
    totalFreeCashFlow: rows.reduce((sum, row) => sum + row.freeCashFlow, 0),
    averageCashFlowMargin: average(rows.map((row) => row.cashFlowMargin)),
  };
}
