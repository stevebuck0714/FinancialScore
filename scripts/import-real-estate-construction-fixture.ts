/**
 * Dev-only loader for the Benn's Grant Virginia Housing construction draws.
 * Usage:
 *   npx tsx scripts/import-real-estate-construction-fixture.ts --company "BGAH Demo" \
 *     --dir "C:\Users\steve\Dropbox\New Corelytics\CUSTOMERS\Benns Grant\Construction Draw Request" [--reset-assets]
 *
 * Draw amounts come from the signed Owner's Applications for Disbursement (most are
 * scans, so they are recorded here). Budget lines come from the draw 30 form workbook,
 * and invoices from each draw workbook's Invoice Coversheet. Existing fixed assets are
 * kept unless --reset-assets is passed, so in-service dates and lives entered in the app survive a reload.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';
import prisma from '../lib/prisma';
import { ensureRealEstateConstructionTables } from '../lib/real-estate/construction-tables';

const PROJECT_COST = 57_526_892;

type Draw = { sequence: number; label: string; date: string | null; equity?: number; loan?: number; retainage?: number; ld?: number; source: string; notes?: string };

const DRAWS: Draw[] = [
  { sequence: 1, label: 'Draw 1 (Closing)', date: '2022-06-07', equity: 5_181_832.0, source: 'Benns Grant - Initial Owner_s App for Disbursement 6.6.22.pdf', notes: 'Equity includes the $3,180,000 land contribution.' },
  { sequence: 2, label: 'Draw 2', date: '2022-09-27', equity: 369_996.82, retainage: 40_060.22, source: 'Benns Grant - 2nd Owner_s App for Disbursement.2022.09.27.pdf' },
  { sequence: 3, label: 'Draw 3', date: '2022-11-09', equity: 516_866.15, retainage: 52_443.62, source: 'VHApp3wReceipts.Fully Executed.2022.11.09.pdf' },
  { sequence: 4, label: 'Draw 4', date: '2022-12-04', equity: 824_580.35, retainage: 89_211.08, source: 'Benn_sGrant.Application.4.FINAL.pdf' },
  { sequence: 5, label: 'Draw 5', date: '2022-12-08', equity: 1_336_183.48, retainage: 145_945.98, source: 'Owners App for Disbursement No.5.FINAL.pdf' },
  { sequence: 6, label: 'Draw 6', date: '2022-12-20', equity: 2_253_128.4, retainage: 250_212.6, source: 'Owners App for Disbursement No.6.FINAL.version2.pdf' },
  { sequence: 7, label: 'Draw 7', date: '2023-01-25', equity: 54_304.8, loan: 3_241_540.12, retainage: 364_479.18, source: 'Owners App 7.FINAL.01.pdf', notes: 'Equity fully funded; loan funding begins.' },
  { sequence: 8, label: 'Draw 8', date: '2023-02-16', loan: 2_821_976.78, retainage: 311_477.15, source: 'Owners App for Disbursement No.8.FullyExecuted.2023.02.16.pdf' },
  { sequence: 9, label: 'Draw 9', date: '2023-03-15', loan: 17_904.87, source: 'PayApp9.FINAL.pdf', notes: 'Interest and soft costs only; construction resubmitted as Draw 10.' },
  { sequence: 10, label: 'Draw 10', date: '2023-03-29', loan: 3_140_561.75, retainage: 347_106.37, source: 'Owners App #10.Construction & Int Only.2023.03.29.SignedIAV.pdf' },
  { sequence: 11, label: 'Draw 11', date: '2023-04-19', loan: 2_909_536.3, retainage: 318_269.14, source: 'PayApp11.FINAL.Signed.JRS.BGDLLC.2023.04.19.pdf' },
  { sequence: 12, label: 'Draw 12', date: '2023-06-01', loan: 1_846_577.68, retainage: 190_995.93, source: 'VH Owners App #12.Final.2023.06.01.Signed JRS.pdf' },
  { sequence: 13, label: 'Draw 13', date: '2023-07-07', loan: 2_739_157.52, retainage: 55_366.98, source: 'VH Owners App #13wInterest.Final.2023.007.07.Signed JRS.pdf', notes: 'Retainage reaches its $2,165,568.25 cap.' },
  { sequence: 14, label: 'Draw 14', date: null, loan: 2_244_607.64, source: 'VH Owners App #14.Final.pdf' },
  { sequence: 15, label: 'Draw 15', date: null, loan: 2_257_168.11, source: 'PayApp15.BennsGrant.Signed.pdf', notes: 'Includes updated interest of $1,228.17 over the signed application.' },
  { sequence: 16, label: 'Draw 16', date: '2023-09-14', loan: 1_871_557.77, source: 'OwnersApp16forDisbursement.BennsGrant.Signed.2023.09.14.pdf' },
  { sequence: 17, label: 'Draw 17', date: '2023-10-16', loan: 1_795_859.74, source: 'OwnersApp17forDisbursement.BennsGrant.Signed.2023.10.16.pdf' },
  { sequence: 18, label: 'Draw 18', date: '2023-11-07', loan: 2_230_627.23, source: 'OwnersApp18forDisbursement.BennsGrant.Signed.2023.11.07.pdf' },
  { sequence: 19, label: 'Draw 19', date: '2023-12-15', loan: 5_194_527.57, source: 'Owners app for Disbursement #19.FINAL.pdf' },
  { sequence: 20, label: 'Draw 20', date: '2024-01-24', loan: 143_781.65, source: 'App20.Interest Only.2024.01.24.pdf', notes: 'Interest only; remaining items resubmitted.' },
  { sequence: 21, label: 'Draw 21', date: '2024-02-02', source: 'Owners app for Disbursement #21.FINAL.Signed.JRS.2024.02.02.pdf', notes: 'Not funded; resubmitted as Draw 22.' },
  { sequence: 22, label: 'Draw 22', date: '2024-02-12', loan: 1_467_588.92, ld: 272_860.61, source: 'PayApp22.Corrected.SignedJRS.2024.02.12.pdf', notes: 'Liquidated damages withholding begins ($12,993.41 a day from Dec 11, 2023).' },
  { sequence: 23, label: 'Draw 23', date: null, loan: 1_312_649.65, ld: 402_795.71, source: 'PayApp23.Signed.pdf' },
  { sequence: 24, label: 'Draw 24', date: '2024-04-16', loan: 857_831.52, ld: 376_808.89, source: 'OAD24.Final.SignedIAV.04.16.24.pdf', notes: 'Loan restructured into permanent, interest reserve, and conversion-taxable tranches.' },
  { sequence: 25, label: 'Draw 25', date: '2024-04-30', loan: 479_100.95, ld: 402_795.71, source: 'OAD#25.Final.Signed.IAV.2024.04.30.pdf' },
  { sequence: 26, label: 'Draw 26', date: '2024-05-22', loan: 677_984.29, ld: 389_802.3, source: 'OAD 26.FINAL.pdf' },
  { sequence: 27, label: 'Draw 27', date: null, loan: 1_049_818.11, ld: 402_795.71, source: 'Owners app for Disbursement 27.pdf' },
  { sequence: 28, label: 'Draw 28', date: '2024-07-31', loan: 376_277.06, ld: 389_802.3, source: 'OAD 28.Final.SignedIAV.07.31.24.pdf' },
  { sequence: 29, label: 'Draw 29', date: '2024-09-11', loan: 499_285.75, ld: 402_795.71, source: 'OAD 29.REVISED.Final.SignedIAV.09.11.24.pdf' },
  { sequence: 30, label: 'Draw 30 (Interest)', date: '2024-10-24', source: 'OAD#30 Interest Only 10.24.24 Signed IAV.pdf', notes: 'Interest-only request of $467,550.50. The final draw shows no escrow funding after Draw 29, so it is treated as not funded by the loan.' },
  { sequence: 31, label: 'Draw 30 (Req 26 & 27)', date: '2025-04-29', ld: 451_180.16, source: 'OAD#30 Req 26 & 27.SignedIAV.2025.04.29.pdf', notes: 'Contractor Requisitions 26 and 27 withheld in full as liquidated damages (no waiver).' },
  { sequence: 32, label: 'Final Draw', date: '2025-07-21', loan: 5_648_510.77, ld: -3_300_000, source: 'Final Draw - Benn_s Grant 7.21.25 - signed.pdf', notes: 'Releases $3.3M of withheld liquidated damages plus $2,348,510.77 of remaining costs; retainage release is not itemized.' },
];

const FUNDING_STAGES: Array<{ stage: string; sequence: number; sources: Array<[string, number]> }> = [
  { stage: 'At closing (Jun 2022)', sequence: 1, sources: [['Virginia Housing loan', 46_990_000], ['Member equity', 10_536_892]] },
  { stage: 'Draw 8 (Feb 2023)', sequence: 8, sources: [['Virginia Housing loan', 45_890_000], ['Taxable interest reserve', 1_100_000], ['Member equity', 10_536_892]] },
  { stage: 'Draw 24 (Apr 2024)', sequence: 24, sources: [['Virginia Housing loan', 36_803_734.42], ['Taxable interest reserve', 597_457.13], ['Withheld per agreement (liquidated damages)', 675_657.32], ['Construction escrow - conversion taxable', 8_913_151.13], ['Member equity', 10_536_892]] },
  { stage: 'Final draw (Jul 2025)', sequence: 32, sources: [['Virginia Housing loan', 36_803_734.42], ['Taxable interest reserve', 597_457.13], ['Withheld per agreement (liquidated damages)', 3_300_000], ['Construction escrow - conversion taxable', 6_288_808.45], ['Member equity', 10_536_892]] },
];

const INVOICE_WORKBOOKS: Record<number, string> = {
  1: 'Draw App 1 (Closing)/Benns Grant - Initial Owner_s App for Disbursement 6.6.22.xlsx',
  2: 'Draw App 2 Req 1/Draw 2 Owners app for Disbursement 2022.07.28.xlsm',
  3: 'Draw App 3 Req 2/Owners app for Disbursement App3.Draft.10.05.22.xlsm',
  4: 'Draw App 4 Req 3/Application.Draft.2022.11.14.xlsm',
  5: 'Draw App 5 Req 4/Owners App for Disbursement No.5.Draft.12.07.22.xlsm',
  6: 'Draw App 6 Req 5/Owners App for Disbursement No.6.Draft.12.20.22.xlsm',
  7: 'Draw App 7 Req 6/Owners App for Disbursement No.7.Draft.2023.01.25.xlsm',
  8: 'Draw App 8 Req 7/Owners app for Disbursement 8 w interest.2023.02.16.xlsm',
  9: 'Draw App 9 Req 8/Owners app for Disbursement #9 Draft no construction.xlsm',
  10: 'Draw App 10 Req 8/Owners App #10 Form.xlsm',
  11: 'Draw App 11 Req 9/Owners app for Disbursement 11.Draft.xlsm',
  12: 'Draw App 12 Req 10/Owners app for Disbursement #12.Draft w June interest.xlsm',
  13: 'Draw App 13 Req 11/Owners app for Disbursement 13. Draft.xlsm',
  14: 'Draw App 14 Req 12/Owners app for Disbursement #14.Draft.xlsm',
  15: 'Draw App 15 Req 13/Owners app for Disbursement 15.Draft w updated int.xlsm',
  16: 'Draw App 16 Req 14/Owners app for Disbursement #16.Draft.xlsm',
  17: 'Draw App 17 Req 15/Owners App #17.Draft.xlsm',
  18: 'Draw App 18 Req 16/Owners app for Disbursement #18 Draft.xlsm',
  19: 'Draw App 19 Req 17/Owners app for Disbursement #19 DRAFT.xlsm',
  20: 'Draw App 20 Req 18/Owners app for Disbursement 20.IntOnly.xlsm',
  22: 'Draw App 22 Req 18/Owners App for Disbursement 22.Draft.xlsm',
  23: 'Draw App 23 Req 19/Owners app for Disbursement 23.Draft.xlsm',
  24: 'Draw App 24 Req 20/OAD24.Draft.xlsm',
  25: 'Draw App 25 Req 21/OAD #25 Draft.xlsm',
  26: 'Draw App 26 Req 22/Owners app for Disbursement 26 Draft no APSLA.xlsm',
  27: 'Draw App 27 Req 23/Owners app for Disbursement 27 DRAFT.xlsm',
  28: 'Draw App 28 Req 24/OAD 28 Draft.xlsm',
  29: 'Draw App 29 Req 25/OAD 29 Draft.xlsm',
};
const BUDGET_WORKBOOK = { file: 'Draw App 30 Req 26/OA #30 Form.xlsm', asOfSequence: 29 };

// Contractor schedule of values (Requisition 26): trade subtotal and the shorter-life trades inside Structures.
const SOV = { tradeSubtotal: 40_361_219, structures: 34_629_882, landImprovements: 5_731_337, equipmentAndFurnishings: 935_274 + 1_534_465 };

function costClassFor(name: string) {
  const n = name.toLowerCase();
  if (/land acquisition/.test(n)) return 'land';
  if (/construction budget|contingency|change order|liquidated/.test(n)) return 'hard';
  if (/fixtures|furniture/.test(n)) return 'ffe';
  if (/vhda|title|mortgage banker|letter of credit|appraisal|market study/.test(n)) return 'loan';
  if (/marketing|organizational|accounting/.test(n)) return 'expense';
  return 'soft';
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : '';
}

const num = (value: unknown) => (typeof value === 'number' ? value : Number(String(value ?? '').replace(/[$,\s]/g, '')) || 0);
const cents = (value: number) => Math.round(value * 100) / 100;
const excelDate = (value: unknown) => {
  if (typeof value !== 'number' || value < 30000 || value > 60000) return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : null;
};

function readBudgetLines(file: string) {
  const workbook = XLSX.readFile(file);
  const sheet = workbook.Sheets['Application for Disbursement'];
  if (!sheet) throw new Error(`${path.basename(file)}: no "Application for Disbursement" sheet.`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: true });
  const header = rows.findIndex((row) => row?.some((cell) => /remaining/i.test(String(cell ?? ''))));
  const budgetCol = rows[header].findIndex((cell) => /revised/i.test(String(cell ?? '')));
  const remainingCol = rows[header].findIndex((cell) => /remaining/i.test(String(cell ?? '')));
  return rows.slice(header + 1)
    .filter((row) => typeof row?.[0] === 'number' && String(row?.[1] ?? '').trim())
    .map((row) => ({ lineNumber: Number(row[0]), name: String(row[1]).trim(), revisedBudget: cents(num(row[budgetCol])), remainingAfter: cents(num(row[remainingCol])) }))
    .filter((line) => line.revisedBudget || line.remainingAfter);
}

function readInvoices(file: string) {
  const workbook = XLSX.readFile(file);
  const sheetName = workbook.SheetNames.find((name) => /invoice cover/i.test(name));
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, blankrows: false, raw: true });
  const headerIndex = rows.findIndex((row) => row?.some((cell) => /vendor name/i.test(String(cell ?? ''))));
  if (headerIndex < 1) return [];
  const header = rows[headerIndex].map((cell) => String(cell ?? ''));
  const col = {
    vendor: header.findIndex((cell) => /vendor/i.test(cell)),
    date: header.findIndex((cell) => /^date/i.test(cell)),
    invoice: header.findIndex((cell) => /invoice/i.test(cell)),
    debt: header.findIndex((cell) => /^debt/i.test(cell)),
    equity: header.findIndex((cell) => /^equity/i.test(cell)),
  };
  const invoices: Array<{ budgetLine: string; vendor: string; invoiceDate: string | null; invoiceNumber: string | null; debt: number; equity: number }> = [];
  let category = '';
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row) continue;
    const first = String(row[0] ?? '').trim();
    if (first && !/^total/i.test(first)) { category = first; continue; }
    if (/^total/i.test(first) || !category || /^select$/i.test(category)) continue;
    const vendor = String(row[col.vendor] ?? '').trim();
    const debt = cents(num(row[col.debt]));
    const equity = cents(num(row[col.equity]));
    if (!vendor || (!debt && !equity)) continue;
    invoices.push({ budgetLine: category, vendor, invoiceDate: excelDate(row[col.date]), invoiceNumber: String(row[col.invoice] ?? '').trim() || null, debt, equity });
  }
  return invoices;
}

function buildFixedAssets(lines: Array<{ name: string; revisedBudget: number; costClass: string }>) {
  const total = (costClass: string) => cents(lines.filter((line) => line.costClass === costClass).reduce((sum, line) => sum + line.revisedBudget, 0));
  const hard = total('hard');
  const soft = total('soft');
  const shares = {
    building: (SOV.structures - SOV.equipmentAndFurnishings) / SOV.tradeSubtotal,
    land_improvements: SOV.landImprovements / SOV.tradeSubtotal,
    equipment: SOV.equipmentAndFurnishings / SOV.tradeSubtotal,
  };
  const equipment = cents((hard + soft) * shares.equipment);
  const landImprovements = cents((hard + soft) * shares.land_improvements);
  const building = cents(hard + soft - equipment - landImprovements);
  const basis = 'Hard and capitalized soft costs split by the contractor schedule of values (Requisition 26).';
  return [
    { name: 'Land', assetClass: 'land', cost: total('land'), life: null, basis: 'Land Acquisition budget line (contributed land, lender value).' },
    { name: 'Buildings', assetClass: 'building', cost: building, life: 40, basis },
    { name: 'Land improvements (site work)', assetClass: 'land_improvements', cost: landImprovements, life: 15, basis },
    { name: 'Equipment and furnishings (contract)', assetClass: 'equipment', cost: equipment, life: 7, basis },
    { name: 'Furniture, fixtures and equipment', assetClass: 'ffe', cost: total('ffe'), life: 7, basis: 'Fixtures, Furniture & Equipment budget line.' },
  ];
}

async function main() {
  const companyName = arg('--company');
  const dir = arg('--dir');
  if (!companyName || !dir) throw new Error('Pass --company "BGAH Demo" and --dir "<Construction Draw Request folder>".');
  const companies = await prisma.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "Company" WHERE "name" = $1', companyName);
  if (companies.length !== 1) throw new Error(`Expected exactly one company named "${companyName}", found ${companies.length}.`);
  const companyId = companies[0].id;

  const budgetUsed = cents(DRAWS.reduce((sum, draw) => sum + (draw.equity || 0) + (draw.loan || 0) + (draw.retainage || 0), 0));
  if (Math.abs(budgetUsed - PROJECT_COST) > 0.005) throw new Error(`Draws use ${budgetUsed}, expected ${PROJECT_COST}.`);
  for (const stage of FUNDING_STAGES) {
    const stageTotal = cents(stage.sources.reduce((sum, [, amount]) => sum + amount, 0));
    if (Math.abs(stageTotal - PROJECT_COST) > 0.005) throw new Error(`${stage.stage} sources total ${stageTotal}, expected ${PROJECT_COST}.`);
  }

  const lines = readBudgetLines(path.join(dir, BUDGET_WORKBOOK.file)).map((line) => ({ ...line, costClass: costClassFor(line.name) }));
  const budgetTotal = cents(lines.reduce((sum, line) => sum + line.revisedBudget, 0));
  if (Math.abs(budgetTotal - PROJECT_COST) > 0.005) throw new Error(`Budget lines total ${budgetTotal}, expected ${PROJECT_COST}.`);

  const invoices = Object.entries(INVOICE_WORKBOOKS).flatMap(([sequence, file]) =>
    readInvoices(path.join(dir, file)).map((invoice) => ({ ...invoice, drawSequence: Number(sequence), sourceFileName: path.basename(file) })));

  await ensureRealEstateConstructionTables();
  const existingAssets = await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT COUNT(*)::int AS count FROM "RealEstateFixedAsset" WHERE "companyId"=$1', companyId);
  const seedAssets = process.argv.includes('--reset-assets') || !existingAssets[0]?.count;
  const assets = seedAssets ? buildFixedAssets(lines) : [];

  await prisma.$transaction([
    prisma.$executeRawUnsafe('DELETE FROM "RealEstateConstructionDraw" WHERE "companyId"=$1', companyId),
    prisma.$executeRawUnsafe('DELETE FROM "RealEstateConstructionBudgetLine" WHERE "companyId"=$1', companyId),
    prisma.$executeRawUnsafe('DELETE FROM "RealEstateConstructionInvoice" WHERE "companyId"=$1', companyId),
    prisma.$executeRawUnsafe('DELETE FROM "RealEstateFundingSource" WHERE "companyId"=$1', companyId),
    ...(seedAssets ? [prisma.$executeRawUnsafe('DELETE FROM "RealEstateFixedAsset" WHERE "companyId"=$1', companyId)] : []),
    ...DRAWS.map((draw) => prisma.$executeRawUnsafe(
      `INSERT INTO "RealEstateConstructionDraw" ("id","companyId","sequence","label","drawDate","equityFunded","loanFunded","retainageHeld","liquidatedDamages","sourceDocument","notes","updatedAt")
       VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP)`,
      randomUUID(), companyId, draw.sequence, draw.label, draw.date, draw.equity || 0, draw.loan || 0, draw.retainage || 0, draw.ld || 0, draw.source, draw.notes || null,
    )),
    ...lines.map((line) => prisma.$executeRawUnsafe(
      `INSERT INTO "RealEstateConstructionBudgetLine" ("id","companyId","lineNumber","name","revisedBudget","remainingAfter","asOfSequence","costClass","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)`,
      randomUUID(), companyId, line.lineNumber, line.name, line.revisedBudget, line.remainingAfter, BUDGET_WORKBOOK.asOfSequence, line.costClass,
    )),
    ...invoices.map((invoice) => prisma.$executeRawUnsafe(
      `INSERT INTO "RealEstateConstructionInvoice" ("id","companyId","drawSequence","budgetLine","vendor","invoiceDate","invoiceNumber","debtAmount","equityAmount","sourceFileName","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,CURRENT_TIMESTAMP)`,
      randomUUID(), companyId, invoice.drawSequence, invoice.budgetLine, invoice.vendor, invoice.invoiceDate, invoice.invoiceNumber, invoice.debt, invoice.equity, invoice.sourceFileName,
    )),
    ...FUNDING_STAGES.flatMap((stage) => stage.sources.map(([sourceName, amount], index) => prisma.$executeRawUnsafe(
      `INSERT INTO "RealEstateFundingSource" ("id","companyId","stage","effectiveSequence","sourceName","amount","sortOrder","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
      randomUUID(), companyId, stage.stage, stage.sequence, sourceName, amount, index,
    ))),
    ...assets.map((asset, index) => prisma.$executeRawUnsafe(
      `INSERT INTO "RealEstateFixedAsset" ("id","companyId","name","assetClass","cost","inServiceDate","usefulLifeYears","basis","sortOrder","updatedAt")
       VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,CURRENT_TIMESTAMP)`,
      randomUUID(), companyId, asset.name, asset.assetClass, asset.cost, asset.life, asset.basis, index + 1,
    )),
  ]);
  console.log(`Loaded ${DRAWS.length} draws, ${lines.length} budget lines, ${invoices.length} invoices, ${FUNDING_STAGES.length} funding stages${seedAssets ? `, ${assets.length} fixed assets` : ' (fixed assets kept)'} into ${companyName}.`);
  if (seedAssets) assets.forEach((asset) => console.log(`  ${asset.name.padEnd(40)} ${asset.cost.toFixed(2).padStart(15)}`));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
