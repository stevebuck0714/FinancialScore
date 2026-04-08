import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const cutoffIso = '2023-01-01T00:00:00.000Z';
const cutoffDigits = '20230101';

async function countSingle(sql: TemplateStringsArray, ...values: unknown[]): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(sql, ...values);
  return Number(rows[0]?.count || 0);
}

async function main() {
  const cutoffDate = new Date(cutoffIso);

  const rawBillCount = await countSingle`
    select count(*)::int as count
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
      and left(
        regexp_replace(coalesce(payload->>'InvDate', payload->>'DistDate', payload->>'date', ''), '[^0-9]', '', 'g'),
        8
      ) <> ''
      and left(
        regexp_replace(coalesce(payload->>'InvDate', payload->>'DistDate', payload->>'date', ''), '[^0-9]', '', 'g'),
        8
      ) < ${cutoffDigits}
  `;

  const rawPaymentCount = await countSingle`
    select count(*)::int as count
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and upper(coalesce("miProgram", '')) in ('SLAPPMTS', 'SLAPTRXP', 'SLAPTRXPS', 'SLAPTRANS', 'SLAPTRXS')
      and left(
        regexp_replace(
          coalesce(
            payload->>'paymentDate',
            payload->>'PYDT',
            payload->>'RGDT',
            payload->>'CheckDate',
            payload->>'CreateDate',
            payload->>'DistDate',
            payload->>'RecordDate',
            payload->>'InvDate',
            payload->>'date',
            ''
          ),
          '[^0-9]',
          '',
          'g'
        ),
        8
      ) <> ''
      and left(
        regexp_replace(
          coalesce(
            payload->>'paymentDate',
            payload->>'PYDT',
            payload->>'RGDT',
            payload->>'CheckDate',
            payload->>'CreateDate',
            payload->>'DistDate',
            payload->>'RecordDate',
            payload->>'InvDate',
            payload->>'date',
            ''
          ),
          '[^0-9]',
          '',
          'g'
        ),
        8
      ) < ${cutoffDigits}
  `;

  const openBillCount = await prisma.aPOpenBillSnapshot.count({
    where: {
      companyId,
      OR: [
        { billDate: { lt: cutoffDate } },
        { billDate: null, snapshotDate: { lt: cutoffDate } },
      ],
    },
  });

  const paymentFactCount = await prisma.aPPaymentFact.count({
    where: { companyId, paymentDate: { lt: cutoffDate } },
  });

  const agingCount = await prisma.aPAgingSnapshot.count({
    where: { companyId },
  });

  const deleted = await prisma.$transaction(async (tx) => {
    const deletedRawBills = await tx.$executeRaw`
      delete from "InforRawRecord"
      where "companyId" = ${companyId}
        and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
        and left(
          regexp_replace(coalesce(payload->>'InvDate', payload->>'DistDate', payload->>'date', ''), '[^0-9]', '', 'g'),
          8
        ) <> ''
        and left(
          regexp_replace(coalesce(payload->>'InvDate', payload->>'DistDate', payload->>'date', ''), '[^0-9]', '', 'g'),
          8
        ) < ${cutoffDigits}
    `;

    const deletedRawPayments = await tx.$executeRaw`
      delete from "InforRawRecord"
      where "companyId" = ${companyId}
        and upper(coalesce("miProgram", '')) in ('SLAPPMTS', 'SLAPTRXP', 'SLAPTRXPS', 'SLAPTRANS', 'SLAPTRXS')
        and left(
          regexp_replace(
            coalesce(
              payload->>'paymentDate',
              payload->>'PYDT',
              payload->>'RGDT',
              payload->>'CheckDate',
              payload->>'CreateDate',
              payload->>'DistDate',
              payload->>'RecordDate',
              payload->>'InvDate',
              payload->>'date',
              ''
            ),
            '[^0-9]',
            '',
            'g'
          ),
          8
        ) <> ''
        and left(
          regexp_replace(
            coalesce(
              payload->>'paymentDate',
              payload->>'PYDT',
              payload->>'RGDT',
              payload->>'CheckDate',
              payload->>'CreateDate',
              payload->>'DistDate',
              payload->>'RecordDate',
              payload->>'InvDate',
              payload->>'date',
              ''
            ),
            '[^0-9]',
            '',
            'g'
          ),
          8
        ) < ${cutoffDigits}
    `;

    const deletedOpenBills = await tx.aPOpenBillSnapshot.deleteMany({
      where: {
        companyId,
        OR: [
          { billDate: { lt: cutoffDate } },
          { billDate: null, snapshotDate: { lt: cutoffDate } },
        ],
      },
    });

    const deletedPaymentFacts = await tx.aPPaymentFact.deleteMany({
      where: { companyId, paymentDate: { lt: cutoffDate } },
    });

    // Clear AP aging snapshots so polluted aggregates cannot continue serving stale totals.
    const deletedAging = await tx.aPAgingSnapshot.deleteMany({
      where: { companyId },
    });

    return {
      deletedRawBills: Number(deletedRawBills || 0),
      deletedRawPayments: Number(deletedRawPayments || 0),
      deletedOpenBills: deletedOpenBills.count,
      deletedPaymentFacts: deletedPaymentFacts.count,
      deletedAging: deletedAging.count,
    };
  }, {
    maxWait: 120000,
    timeout: 120000,
  });

  console.log(
    JSON.stringify(
      {
        companyId,
        cutoffIso,
        counted: {
          rawBillCount,
          rawPaymentCount,
          openBillCount,
          paymentFactCount,
          agingCount,
        },
        deleted,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
