import type { PulseAlertInput } from '@/lib/pulse-alerts';
import type { PulsePolicyValues } from '@/lib/company-pulse/policy';
import { formatEstDate } from '@/lib/time/eastern';
import {
  loadSavedForecastBasisModes,
  loadWorkingCapitalForecastBootstrap,
} from '@/lib/working-capital-forecast/bootstrap-data';
import {
  deriveForecastStateFromBootstrap,
  projectWorkingCapitalForecast,
  type ForecastBasisMode,
  type ForecastRow,
} from '@/lib/working-capital-forecast/engine';

const BASIS_LABELS: Record<ForecastBasisMode, string> = {
  accrual: 'Accrual basis',
  cash: 'Cash basis',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Week Ending" labels matching the 13-week page, anchored to the EST calendar day. */
function weekEndingLabels(count: number): string[] {
  const today = new Date(`${formatEstDate(new Date())}T12:00:00Z`);
  const day = today.getUTCDay();
  const daysBackToSaturday = day === 6 ? 0 : day + 1;
  const anchor = today.getTime() - daysBackToSaturday * DAY_MS;
  return Array.from({ length: count }, (_, idx) =>
    new Date(anchor + (idx * 7 + 6) * DAY_MS).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  );
}

function lowestRow(rows: ForecastRow[], pick: (row: ForecastRow) => number): ForecastRow {
  return rows.reduce((low, row) => (pick(row) < pick(low) ? row : low), rows[0]);
}

export async function buildCashForecastBufferAlerts(params: {
  companyId: string;
  policy: PulsePolicyValues;
  money: (value: number) => string;
  nowIso: string;
}): Promise<PulseAlertInput[]> {
  const { companyId, policy, money, nowIso } = params;
  const warningPct = Math.max(0, Number(policy['cash_forecast_buffer.warning_pct'] || 0));
  const basisModes = await loadSavedForecastBasisModes(companyId);
  const alerts: PulseAlertInput[] = [];

  for (const basisMode of basisModes) {
    // JSON round-trip so dates match the shape the page parses from the API.
    const bootstrap = JSON.parse(JSON.stringify(await loadWorkingCapitalForecastBootstrap(companyId, basisMode)));
    const state = deriveForecastStateFromBootstrap(bootstrap, { basisMode });
    if (!state.hasSavedSettings) continue;
    const rows = projectWorkingCapitalForecast(state);
    if (rows.length === 0) continue;

    const buffer = Math.max(0, state.inputs.minCashBuffer);
    const locLimit = Math.max(0, state.inputs.locLimit);
    const warningLevel = buffer * (1 + warningPct / 100);
    const flaggedRows = rows.filter((row) => row.unleveredEndingCash <= warningLevel);
    if (flaggedRows.length === 0) continue;

    const labels = weekEndingLabels(rows.length);
    const weekLabel = (row: ForecastRow) => `week ending ${labels[row.week - 1] || `W${row.week}`}`;
    const belowRows = rows.filter((row) => row.unleveredEndingCash < buffer);
    const shortRows = rows.filter((row) => row.endingCash < buffer - 0.5);
    const firstFlagged = flaggedRows[0];
    const lowestUnlevered = lowestRow(rows, (row) => row.unleveredEndingCash);
    const peakLoc = rows.reduce((max, row) => Math.max(max, row.endingLoc), 0);
    const basisLabel = BASIS_LABELS[basisMode];
    const itemLabel = `13-Week Cash Forecast (${basisLabel})`;
    const drillView = basisMode === 'accrual' ? 'operations-cash-forecast' : 'operations';
    const sourceTimestamp = state.lastSavedAt || nowIso;
    const formula =
      'Projected weekly ending cash before line of credit draws (13-week forecast engine) compared to the Minimum Cash Buffer';
    const threshold = `cash before LOC <= Minimum Cash Buffer ${money(buffer)} x (1 + ${warningPct}%) = ${money(warningLevel)}`;
    const dataRefs = ['WorkingCapitalForecastSettings', 'DailyFinancialSnapshot', 'ARAgingSnapshot', 'APAgingSnapshot', 'LoanInstrumentTerm'];

    if (shortRows.length > 0) {
      const firstShort = shortRows[0];
      const lowestEnding = lowestRow(rows, (row) => row.endingCash);
      const shortfall = buffer - lowestEnding.endingCash;
      const locText = locLimit > 0
        ? `The ${money(locLimit)} line of credit is fully drawn and cannot cover the gap`
        : 'There is no line of credit available to cover the gap';
      alerts.push({
        fingerprint: `cash-forecast-buffer:${basisMode}:critical`,
        source: 'open-critical',
        title: 'Forecast cash falls below minimum cash buffer',
        detail: `${basisLabel} 13-week forecast drops below the ${money(buffer)} Minimum Cash Buffer in ${weekLabel(firstShort)}. ${locText}; ending cash bottoms at ${money(lowestEnding.endingCash)} in ${weekLabel(lowestEnding)}, ${money(shortfall)} short.`,
        owner: 'Finance Owner',
        drillView,
        deltaText: `${shortRows.length} wk short`,
        updatedAt: sourceTimestamp,
        itemLabel,
        priorityScore: Math.min(100, Math.round(88 + shortRows.length)),
        bucket: 'attention',
        explainability: {
          triggerName: '13-Week Forecast Buffer Shortfall',
          formula,
          threshold: `ending cash after LOC draws < Minimum Cash Buffer ${money(buffer)}`,
          reasonNow: `${shortRows.length} of ${rows.length} weeks short after LOC; lowest ending cash ${money(lowestEnding.endingCash)}; LOC limit ${money(locLimit)}`,
          policySource: '13-Week Cash Forecast inputs',
          dataRefs,
          sourceTimestamp,
        },
      });
      continue;
    }

    if (belowRows.length > 0) {
      const firstBelow = belowRows[0];
      alerts.push({
        fingerprint: `cash-forecast-buffer:${basisMode}:below`,
        source: 'daily-change',
        title: 'Forecast cash needs line of credit to hold buffer',
        detail: `${basisLabel} 13-week forecast cash before line of credit draws falls below the ${money(buffer)} Minimum Cash Buffer in ${weekLabel(firstBelow)}, bottoming at ${money(lowestUnlevered.unleveredEndingCash)} in ${weekLabel(lowestUnlevered)}. The line of credit covers the gap; its balance peaks at ${money(peakLoc)} of the ${money(locLimit)} limit.`,
        owner: 'Finance Owner',
        drillView,
        deltaText: `${belowRows.length} wk below`,
        updatedAt: sourceTimestamp,
        itemLabel,
        priorityScore: Math.min(100, Math.round(76 + belowRows.length)),
        bucket: 'attention',
        explainability: {
          triggerName: '13-Week Forecast Below Buffer',
          formula,
          threshold: `cash before LOC < Minimum Cash Buffer ${money(buffer)}`,
          reasonNow: `${belowRows.length} of ${rows.length} weeks below buffer before LOC; lowest ${money(lowestUnlevered.unleveredEndingCash)}; peak LOC ${money(peakLoc)} of ${money(locLimit)}`,
          policySource: '13-Week Cash Forecast inputs',
          dataRefs,
          sourceTimestamp,
        },
      });
      continue;
    }

    alerts.push({
      fingerprint: `cash-forecast-buffer:${basisMode}:close`,
      source: 'daily-change',
      title: 'Forecast cash approaching minimum cash buffer',
      detail: `${basisLabel} 13-week forecast cash comes within ${warningPct}% of the ${money(buffer)} Minimum Cash Buffer starting ${weekLabel(firstFlagged)}, with a low of ${money(lowestUnlevered.unleveredEndingCash)} in ${weekLabel(lowestUnlevered)}.`,
      owner: 'Finance Owner',
      drillView,
      deltaText: `${flaggedRows.length} wk near`,
      updatedAt: sourceTimestamp,
      itemLabel,
      priorityScore: Math.min(100, Math.round(60 + flaggedRows.length)),
      bucket: 'monitoring',
      explainability: {
        triggerName: '13-Week Forecast Near Buffer',
        formula,
        threshold,
        reasonNow: `${flaggedRows.length} of ${rows.length} weeks within ${warningPct}% of buffer; lowest ${money(lowestUnlevered.unleveredEndingCash)}`,
        policySource: 'Company Pulse policy',
        dataRefs,
        sourceTimestamp,
      },
    });
  }

  return alerts;
}
