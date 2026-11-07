import prisma from '@/lib/prisma';

const BENNS_GRANT_COMPANY_ID = 'cmvzrhzis0000kw08conjfsll';

type Correction = {
  key: string;
  appliesTo: (companyId: string) => boolean;
  /** Returns false when the ledger no longer looks as expected; nothing is recorded and the change is rolled back. */
  apply: (tx: any, companyId: string) => Promise<boolean>;
};

const CORRECTIONS: Correction[] = [
  {
    key: 'sponsor-group-label',
    appliesTo: () => true,
    apply: async (tx, companyId) => {
      await tx.$executeRawUnsafe(
        `UPDATE "RealEstateInvestor" SET "memberGroup"='SPONSOR GROUP', "updatedAt"=NOW() WHERE "companyId"=$1 AND upper("memberGroup")='SPONSER GROUP'`,
        companyId,
      );
      return true;
    },
  },
  {
    // The capital-account summary lists the 1% JRSEP bought from Vaserfirer as $118,737
    // of deemed capital and shows Vaserfirer's deemed capital after the sale; the
    // original import recorded the transfer at $0.
    key: 'bgah-vaserfirer-jrsep-transfer-2024-06-26',
    appliesTo: (companyId) => companyId === BENNS_GRANT_COMPANY_ID,
    apply: async (tx, companyId) => {
      const statements = [
        () => tx.$executeRawUnsafe(
          `UPDATE "RealEstateInvestorLedgerEntry" e SET "amount"=593685, "notes"='Deemed capital contribution before the 1% transfer to JRSEP, LLC on June 26, 2024', "updatedAt"=NOW()
           FROM "RealEstateInvestor" i WHERE i.id=e."investorId" AND e."companyId"=$1 AND i."legalName"='Igor A. Vaserfirer'
             AND e."entryType"='DEEMED_CONTRIBUTION' AND e."amount"=474948`,
          companyId,
        ),
        () => tx.$executeRawUnsafe(
          `UPDATE "RealEstateInvestorLedgerEntry" e SET "amount"=-118737, "updatedAt"=NOW()
           FROM "RealEstateInvestor" i WHERE i.id=e."investorId" AND e."companyId"=$1 AND i."legalName"='Igor A. Vaserfirer'
             AND e."entryType"='OWNERSHIP_TRANSFER_OUT' AND e."effectiveDate"='2024-06-26' AND e."amount"=0`,
          companyId,
        ),
        () => tx.$executeRawUnsafe(
          `UPDATE "RealEstateInvestorLedgerEntry" e SET "amount"=118737, "updatedAt"=NOW()
           FROM "RealEstateInvestor" i WHERE i.id=e."investorId" AND e."companyId"=$1 AND i."legalName"='JRSEP, LLC'
             AND e."entryType"='OWNERSHIP_TRANSFER_IN' AND e."effectiveDate"='2024-06-26' AND e."amount"=0`,
          companyId,
        ),
      ];
      for (const statement of statements) {
        if ((await statement()) !== 1) return false;
      }
      return true;
    },
  },
];

async function ensureCorrectionTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateDataCorrection" (
      "companyId" TEXT NOT NULL, "key" TEXT NOT NULL, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("companyId","key")
    )
  `);
}

class CorrectionSkipped extends Error {}

/** Applies each pending one-time investor ledger correction for the company exactly once. */
export async function applyInvestorLedgerCorrections(companyId: string) {
  const pending = CORRECTIONS.filter((correction) => correction.appliesTo(companyId));
  if (!pending.length) return;
  await ensureCorrectionTable();
  const done = new Set((await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    `SELECT "key" FROM "RealEstateDataCorrection" WHERE "companyId"=$1`, companyId,
  )).map((row) => row.key));
  for (const correction of pending.filter((item) => !done.has(item.key))) {
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.$executeRawUnsafe(
          `INSERT INTO "RealEstateDataCorrection" ("companyId","key") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          companyId, correction.key,
        );
        if (!claimed) return;
        if (!(await correction.apply(tx, companyId))) throw new CorrectionSkipped(correction.key);
      });
    } catch (error) {
      if (!(error instanceof CorrectionSkipped)) console.error('Investor ledger correction failed:', { companyId, key: correction.key, error });
    }
  }
}
