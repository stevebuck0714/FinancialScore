import { COGENT_RATE_CARD_LABEL, COGENT_RATE_CARD_SOURCE_CODE } from '@/lib/operational/cogent-rate-card';
import { APR_SGP_GMPA_LABEL, APR_SGP_GMPA_SOURCE_CODE } from '@/lib/operational/apr-sgp-gmpa';
import { payloadToOutput } from '../payload';
import type { OperationalRecordInput, OperationalSourceAdapter } from '../types';
import { FULL_WINDOW, asRecord, estDateOf, readConnectionMetadata } from './common';

/**
 * Spreadsheet sources with a dedicated parser that keeps the parsed workbook on the
 * connection. Their `sync` stores the latest parsed upload; the upload routes call it too.
 */
export const COGENT_RATE_CARD_ADAPTER: OperationalSourceAdapter = {
  sourceCode: COGENT_RATE_CARD_SOURCE_CODE,
  provider: 'SPREADSHEET_UPLOAD',
  label: COGENT_RATE_CARD_LABEL,
  datasetPrefix: 'cogent_rate_card',
  history: 'file',
  historyNote: 'Bill rates come from the latest uploaded rate card; each rate year in the file is kept.',
  datasets: [
    {
      key: 'cogent_rate_card.bill_rates',
      label: 'Client bill rate card',
      description:
        'Client bill rates by year, market and bill rate level from the uploaded rate card. Rows are dated January 1 of the rate year; use asOfDate = YYYY-12-31 to read a given year\'s rates.',
      grain: 'point_in_time',
      dimensions: [
        { name: 'clientName' }, { name: 'market' }, { name: 'billRateLevel' }, { name: 'normalizedBillRateLevel' }, { name: 'year' },
      ],
      measures: [{ name: 'billRate', description: 'Hourly bill rate' }],
    },
  ],
  async sync({ companyId }) {
    const { metadata } = await readConnectionMetadata(companyId, 'SPREADSHEET_UPLOAD', COGENT_RATE_CARD_SOURCE_CODE);
    const parsed = asRecord(metadata.cogentRateCardParsedWorkbook);
    const rows: OperationalRecordInput[] = (Array.isArray(parsed.rows) ? parsed.rows : []).flatMap((raw) => {
      const row = asRecord(raw);
      const year = Number(row.year);
      if (!Number.isInteger(year) || year < 1900) return [];
      return [{
        date: `${year}-01-01`,
        externalId: [year, row.clientName, row.market, row.normalizedBillRateLevel || row.billRateLevel].join('|'),
        dimensions: {
          clientName: String(row.clientName || ''), market: String(row.market || ''), billRateLevel: String(row.billRateLevel || ''),
          normalizedBillRateLevel: String(row.normalizedBillRateLevel || ''), year: String(year),
        },
        measures: { billRate: Number(row.billRate) },
      }];
    });
    if (!rows.length) return {};
    return { 'cogent_rate_card.bill_rates': { rows, replaceWindow: true, window: FULL_WINDOW } };
  },
};

export const APR_SGP_GMPA_ADAPTER: OperationalSourceAdapter = {
  sourceCode: APR_SGP_GMPA_SOURCE_CODE,
  provider: 'SPREADSHEET_UPLOAD',
  label: APR_SGP_GMPA_LABEL,
  datasetPrefix: 'apr_sgp',
  history: 'file',
  historyNote: 'Pricing comes from the uploaded SGP/GMPA workbook, dated by its upload; earlier uploads stay as earlier snapshots.',
  datasets: [],
  dynamicDatasets: true,
  async sync({ companyId }) {
    const { metadata } = await readConnectionMetadata(companyId, 'SPREADSHEET_UPLOAD', APR_SGP_GMPA_SOURCE_CODE);
    const parsed = asRecord(metadata.aprSgpGmpaParsedWorkbook);
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    if (!rows.length) return {};
    return payloadToOutput(
      { itemPricing: rows },
      {
        prefix: 'apr_sgp',
        sourceLabel: APR_SGP_GMPA_LABEL,
        asOf: estDateOf(parsed.parsedAt),
        replace: 'range',
        sections: {
          itemPricing: {
            label: 'Item pricing, cost, duty, freight and margin (SGP / GMPA)',
            description:
              'Per item and customer: projected price, cost, tariff, duty, freight and margin from the uploaded SGP/GMPA workbook, as of the upload date (point in time).',
            dateField: null,
          },
        },
      },
    );
  },
};
