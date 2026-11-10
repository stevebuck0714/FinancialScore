import fs from 'node:fs';
import path from 'node:path';
import {
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const NAVY = '0F2A4A';
const TEAL = '0E7C86';
const GRAY = '475569';
const FONT = 'Calibri';
const BODY = 20;

function text(value: string, options: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({ text: value, font: FONT, size: options.size ?? BODY, bold: options.bold, color: options.color });
}

function paragraph(value: string, after = 100) {
  return new Paragraph({ spacing: { after, line: 264 }, children: [text(value)] });
}

function bullet(value: string) {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40, line: 252 }, children: [text(value)] });
}

function heading(value: string) {
  return new Paragraph({
    spacing: { before: 180, after: 70 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 2 } },
    children: [text(value, { bold: true, color: NAVY, size: 25 })],
  });
}

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };

function cell(value: string, header: boolean, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border },
    shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: NAVY } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ children: [text(value, { bold: header, color: header ? 'FFFFFF' : undefined, size: 18 })] })],
  });
}

function table(rows: string[][], widths: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, index) => new TableRow({ children: row.map((value, cellIndex) => cell(value, index === 0, widths[cellIndex])) })),
  });
}

const children: Array<Paragraph | Table> = [
  new Paragraph({ spacing: { after: 40 }, children: [text('Corelytics', { bold: true, color: NAVY, size: 38 })] }),
  new Paragraph({ spacing: { after: 160 }, children: [text('RealPage OneSite API Credential & Data Access Request', { bold: true, color: TEAL, size: 26 })] }),
  paragraph('Prepared for: Benns Grant Apartment Homes, LLC (BGAH)'),
  paragraph('Purpose: Establish a secure, read-only RealPage OneSite integration for Corelytics operational and financial reporting.'),

  heading('Request'),
  paragraph('Please work with BGAH’s RealPage representative and RealPage Exchange / AppPartner team to provision Corelytics for this integration. This request is for read-only access only. Corelytics will not create, update, or delete OneSite records.'),
  paragraph('RealPage determines the APIs and credential format available to each customer. Please confirm the enabled API families, endpoint paths, and fields for BGAH’s licensed OneSite products before credentials are issued.'),

  heading('RealPage Exchange Subscription & Scope'),
  table([
    ['Item', 'Requested confirmation'],
    ['Corelytics subscription', 'Each BGAH property in scope has subscribed to Corelytics through RealPage Exchange / AppPartner.'],
    ['Access level', 'Read-only access for the requested API families and properties. No write, delete, or administrative permissions.'],
    ['Property scope', 'The PMC ID and the Site ID / property ID for every BGAH property included in the integration.'],
    ['Enabled API families', 'Confirm the specific RealPage APIs licensed and enabled for BGAH, including any product-specific restrictions.'],
    ['Environment', 'Sandbox or test environment, if available, plus separately identified production access.'],
  ], [30, 70]),

  heading('Connection Credentials & Routing Details'),
  paragraph('Please provide the following through BGAH’s approved secure credential-sharing method. Do not send production passwords, license keys, or tokens in ordinary email.'),
  table([
    ['Item', 'What Corelytics needs'],
    ['RealPage API base URL', 'The HTTPS base URL / endpoint applicable to BGAH’s approved RealPage APIs.'],
    ['RPX service username and password', 'The RealPage-provisioned service credentials, where required by the approved API.'],
    ['License key', 'The license key or equivalent RealPage integration credential required by the approved API.'],
    ['PMC ID', 'BGAH’s property-management-company identifier used for routing, where required.'],
    ['Site IDs / property IDs', 'The complete list of property identifiers Corelytics may include in requests.'],
    ['Source system value', 'Confirm the required source-system value. RealPage documentation indicates OneSite may be the default for documented services when omitted.'],
    ['Authentication and headers', 'Required authentication method, request headers, scopes, IP allowlisting, or other network requirements.'],
    ['Test and production access', 'Separate sandbox/test and production URLs, credentials, and property identifiers, when available.'],
  ], [30, 70]),

  heading('Requested Operational Data'),
  paragraph('Please enable the applicable read-only API areas below, or identify the equivalent approved endpoints, products, and fields available to BGAH.'),
  table([
    ['Data domain', 'Requested content / relevant RealPage API area'],
    ['Property and Unit Setup', 'Property/site hierarchy, units, unit types, statuses, and available asset metadata. Relevant areas: Units; Assets.'],
    ['General Ledger', 'Chart of accounts, account balances, journal or transaction detail, and period activity. Relevant areas: General Ledger v2; Transactions.'],
    ['Accounts Payable', 'Vendors, bills, credits, payments, approval status, and due dates. Relevant area: Accounts Payable v2.'],
    ['Resident Receivables and Collections', 'Open charges, receipts, balances, aging, payment plans, collections, and legal activity. Relevant areas: Resident Management; Collections.'],
    ['Leasing and Occupancy', 'Lease dates, move-ins/outs, occupancy, rent roll, and scheduled charges. Relevant area: Resident Management.'],
    ['Pricing and Revenue', 'Market rents, specials, rent changes, and recommended pricing where licensed. Relevant areas: Pricing and Availability; Resident Management.'],
    ['Facilities and Work Orders', 'Work orders, preventive maintenance, inspections, assets, parts, and labor where licensed. Relevant area: Facilities.'],
    ['Budgets', 'Budget amounts by property, account, and period, if exposed for BGAH’s configuration. Please confirm availability with RealPage.'],
  ], [30, 70]),

  heading('API Documentation & Synchronization'),
  bullet('Current API documentation, OpenAPI / Swagger specification, or RealPage endpoint guide for the APIs approved for BGAH.'),
  bullet('Sample read-only requests and responses, including required parameters, pagination, response limits, and rate limits.'),
  bullet('Supported date, period, and updated-since filters for historical and recurring synchronization.'),
  bullet('Date/time format and timezone used by each response, and how date-only accounting periods are represented.'),
  bullet('Any available incremental-change feeds, webhooks, or transaction-change endpoints.'),
  bullet('Known data-retention limits, delayed posting behavior, and restrictions on historical data retrieval.'),

  heading('Security & Validation Contact'),
  paragraph('Please identify a BGAH business owner and RealPage technical contact who can confirm property scope, API enablement, and field mapping. Corelytics will validate one read-only response in the test environment, confirm the approved endpoint mapping, and obtain BGAH approval before an initial production synchronization.'),

  heading('Next Step'),
  paragraph('Once the above items are available, Corelytics will configure the connection, validate the approved read-only endpoints, map the available data domains, and confirm initial synchronization results with BGAH.'),
  new Paragraph({ spacing: { before: 160 }, children: [text('Thank you.', { color: GRAY, size: 18 })] }),
];

async function main() {
  const document = new Document({
    creator: 'Corelytics',
    title: 'BGAH RealPage OneSite API Credential & Data Access Request',
    description: 'Client-facing request for RealPage OneSite API credentials, property scope, and read-only operational data access',
    sections: [{ properties: { page: { margin: { top: 864, right: 1008, bottom: 864, left: 1008 } } }, children }],
  });
  const outPath = path.join(process.cwd(), 'docs', 'BGAH_RealPage_OneSite_API_Credential_and_Access_Request.docx');
  fs.writeFileSync(outPath, await Packer.toBuffer(document));
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
