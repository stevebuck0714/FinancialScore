/**
 * Seeds the reviewed tax-return facts used by the preliminary Benns Grant
 * Tax-to-Book Reconciliation report.
 *
 * Usage:
 *   npx tsx scripts/import-benns-grant-tax-reconciliation.ts --company-id <id>
 *   npx tsx scripts/import-benns-grant-tax-reconciliation.ts --company-id <id> --production true
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { enforceDatabaseSecurity, validateDatabaseConnection } from '../lib/db-security';
import { ensureRealEstateTaxReconciliationTables } from '../lib/real-estate/tax-reconciliation-tables';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();
const SOURCE_ROOT = 'Tax Returns';
const COMPANY_ID = 'cmvzrhzis0000kw08conjfsll';

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

type ReturnFact = {
  taxYear: number;
  sourceDocument: string;
  sourceReference: string;
  coverageStatus: 'PRE_SERVICE' | 'PARTIAL';
  notes: string;
};

type DepreciationFact = {
  taxYear: number;
  assetReference: string;
  taxTreatment: 'DEPRECIATION' | 'AMORTIZATION';
  taxBasis: number;
  placedInServiceDate?: string;
  recoveryPeriodYears: number;
  convention: string;
  method: string;
  deduction: number;
  sourceReference: string;
  notes: string;
};

const RETURNS: ReturnFact[] = [
  {
    taxYear: 2022,
    sourceDocument: `${SOURCE_ROOT}/BGAH 2022 Tax Return.NoSSNs.NoK1s.pdf`,
    sourceReference: 'Form 1065 Schedule L',
    coverageStatus: 'PRE_SERVICE',
    notes: 'No Form 4562 or detailed depreciation schedule was attached. The return supports pre-service/capitalized project context only.',
  },
  {
    taxYear: 2023,
    sourceDocument: `${SOURCE_ROOT}/BGAH 2023 Tax Return.NoSSNs.NoK1s.pdf`,
    sourceReference: 'Form 4562, page 1',
    coverageStatus: 'PARTIAL',
    notes: 'Current-year Form 4562 assets are recorded below. Prior-year MACRS deductions remain aggregated and unmatched.',
  },
  {
    taxYear: 2024,
    sourceDocument: `${SOURCE_ROOT}/BGAH 2024 Tax Return.NoSSNs.NoK1s.pdf`,
    sourceReference: 'Form 4562, pages 1–2',
    coverageStatus: 'PARTIAL',
    notes: 'Current-year Form 4562 assets and loan-fee amortization are recorded below. Prior-year MACRS deductions remain aggregated and unmatched.',
  },
  {
    taxYear: 2025,
    sourceDocument: `${SOURCE_ROOT}/BGAH 2025 Tax Return.NoSSNs.NoK1s.pdf`,
    sourceReference: 'Form 4562, pages 1–3',
    coverageStatus: 'PARTIAL',
    notes: 'Client copy reviewed; confirm final filing status with the CPA before using as final support.',
  },
];

const RECORDS: DepreciationFact[] = [
  {
    taxYear: 2023, assetReference: '2023 5-year property (unmatched)', taxTreatment: 'DEPRECIATION',
    taxBasis: 158_544, recoveryPeriodYears: 5, convention: 'MQ', method: '200DB', deduction: 7_927,
    sourceReference: '2023 Form 4562, Part III, Section B', notes: 'Verified from filed return; exact book asset linkage unavailable.',
  },
  {
    taxYear: 2023, assetReference: '2023 15-year property (unmatched)', taxTreatment: 'DEPRECIATION',
    taxBasis: 128_571, recoveryPeriodYears: 15, convention: 'MQ', method: 'S/L', deduction: 1_607,
    sourceReference: '2023 Form 4562, Part III, Section B', notes: 'Verified from filed return; exact book asset linkage unavailable.',
  },
  {
    taxYear: 2024, assetReference: '2024 5-year property (unmatched)', taxTreatment: 'DEPRECIATION',
    taxBasis: 2_009_479, recoveryPeriodYears: 5, convention: 'HY', method: '200DB', deduction: 401_896,
    sourceReference: '2024 Form 4562, Part III, Section B', notes: 'Verified from filed return; exact book asset linkage unavailable.',
  },
  {
    taxYear: 2024, assetReference: '2024 15-year property (unmatched)', taxTreatment: 'DEPRECIATION',
    taxBasis: 1_960_182, recoveryPeriodYears: 15, convention: 'HY', method: 'S/L', deduction: 98_009,
    sourceReference: '2024 Form 4562, Part III, Section B', notes: 'Verified from filed return; exact book asset linkage unavailable.',
  },
  {
    taxYear: 2024, assetReference: 'Loan fees', taxTreatment: 'AMORTIZATION',
    taxBasis: 964_434, placedInServiceDate: '2024-01-01', recoveryPeriodYears: 35, convention: 'Monthly', method: '420 months', deduction: 27_555,
    sourceReference: '2024 Form 4562, Part VI', notes: 'Verified from filed return.',
  },
  {
    taxYear: 2025, assetReference: '2025 5-year property (unmatched)', taxTreatment: 'DEPRECIATION',
    taxBasis: 33_507, recoveryPeriodYears: 5, convention: 'HY', method: '200DB', deduction: 6_701,
    sourceReference: '2025 Form 4562, Part III, Section B', notes: 'Verified from client copy; confirm filing status.',
  },
  {
    taxYear: 2025, assetReference: '2025 15-year property (unmatched)', taxTreatment: 'DEPRECIATION',
    taxBasis: 20_476, recoveryPeriodYears: 15, convention: 'HY', method: '150DB', deduction: 1_024,
    sourceReference: '2025 Form 4562, Part III, Section B', notes: 'Verified from client copy; confirm filing status.',
  },
  {
    taxYear: 2025, assetReference: 'Loan fees', taxTreatment: 'AMORTIZATION',
    taxBasis: 964_434, placedInServiceDate: '2024-01-01', recoveryPeriodYears: 35, convention: 'Monthly', method: '420 months', deduction: 27_555,
    sourceReference: '2025 Form 4562, Part VI', notes: 'Continuation of the 2024 verified loan-fee amortization schedule.',
  },
];

async function main() {
  const companyId = argument('--company-id') || COMPANY_ID;
  enforceDatabaseSecurity();
  const db = validateDatabaseConnection();
  if (db.isProduction && argument('--production') !== 'true') {
    throw new Error('Production import requires --production true and an explicit --company-id.');
  }
  if (db.isProduction && !argument('--company-id')) {
    throw new Error('Production import requires an explicit --company-id.');
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
  if (!company) throw new Error(`Company "${companyId}" was not found.`);
  await ensureRealEstateTaxReconciliationTables();

  const returnIds = new Map<number, string>();
  for (const fact of RETURNS) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "RealEstateTaxReturn" ("id","companyId","taxYear","filingStatus","sourceDocument","sourceReference","coverageStatus","notes","updatedAt")
       VALUES ($1,$2,$3,'UNVERIFIED',$4,$5,$6,$7,NOW())
       ON CONFLICT ("companyId","taxYear") DO UPDATE SET
         "sourceDocument"=EXCLUDED."sourceDocument", "sourceReference"=EXCLUDED."sourceReference",
         "coverageStatus"=EXCLUDED."coverageStatus", "notes"=EXCLUDED."notes", "updatedAt"=NOW()
       RETURNING "id"`,
      randomUUID(), companyId, fact.taxYear, fact.sourceDocument, fact.sourceReference, fact.coverageStatus, fact.notes,
    );
    returnIds.set(fact.taxYear, rows[0].id);
  }

  for (const record of RECORDS) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RealEstateTaxDepreciationRecord"
        ("id","companyId","taxYear","taxReturnId","assetReference","taxTreatment","taxBasis","placedInServiceDate","recoveryPeriodYears","convention","method","deduction","sourceReference","confidence","matchStatus","notes","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13,'VERIFIED_RETURN','UNMATCHED',$14,NOW())
       ON CONFLICT ("companyId","taxYear","assetReference","taxTreatment") DO UPDATE SET
         "taxReturnId"=EXCLUDED."taxReturnId", "taxBasis"=EXCLUDED."taxBasis", "placedInServiceDate"=EXCLUDED."placedInServiceDate",
         "recoveryPeriodYears"=EXCLUDED."recoveryPeriodYears", "convention"=EXCLUDED."convention", "method"=EXCLUDED."method",
         "deduction"=EXCLUDED."deduction", "sourceReference"=EXCLUDED."sourceReference", "confidence"=EXCLUDED."confidence",
         "matchStatus"=EXCLUDED."matchStatus", "notes"=EXCLUDED."notes", "updatedAt"=NOW()`,
      randomUUID(), companyId, record.taxYear, returnIds.get(record.taxYear) || null, record.assetReference, record.taxTreatment,
      record.taxBasis, record.placedInServiceDate || null, record.recoveryPeriodYears, record.convention, record.method,
      record.deduction, record.sourceReference, record.notes,
    );
  }
  console.log(JSON.stringify({ database: db.label, company, taxReturns: RETURNS.length, depreciationRecords: RECORDS.length }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
