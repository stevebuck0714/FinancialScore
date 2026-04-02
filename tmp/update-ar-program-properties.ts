import prisma from '../lib/prisma';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';

const SLARTRANS_ENDPOINT =
  '/APR_PRD/CSI/IDORequestService/ido/load/SLArtrans?recordCap=1000&properties=CustNum,DerCustName,UbCustName,InvNum,ApplyToInvNum,DerApplyToInvNum,InvDate,DueDate,RecordDate,Type,CurrCode,Amount,DerPaymentCheckAmount,UbPayment,UbOpening';

const SLCUSTDRFTS_ENDPOINT =
  '/APR_PRD/CSI/IDORequestService/ido/load/SLCustdrfts?recordCap=1000&properties=CustNum,CoNum,InvNum,InvDate,RecordDate,Stat,Amount,DerArtranAmount,DerArtranDiscAmount,DerCredit,DerDebit,DerDate,DiscountAmount,PaymentDueDate,ReceiptDate,CadCurrCode';

function norm(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

async function main() {
  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: {
      id: true,
      connectionMetadata: true,
    },
  });
  if (!connection) {
    console.log(JSON.stringify({ ok: false, error: 'connection not found' }, null, 2));
    return;
  }

  const metadata = (connection.connectionMetadata || {}) as Record<string, any>;
  const bySystem = metadata.accountingProgramsBySystem || {};
  const nextBySystem: Record<string, any[]> = {};
  let changed = 0;

  for (const [system, rawRows] of Object.entries(bySystem)) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    nextBySystem[system] = rows.map((row: any) => {
      const next = { ...row };
      const miProgram = norm(next.miProgram);
      if (miProgram === 'SLARTRANS') {
        if (next.enabled !== true) {
          next.enabled = true;
          changed += 1;
        }
        if (String(next.endpointPath || '') !== SLARTRANS_ENDPOINT) {
          next.endpointPath = SLARTRANS_ENDPOINT;
          changed += 1;
        }
      }
      if (miProgram === 'SLCUSTDRFTS') {
        if (next.enabled !== true) {
          next.enabled = true;
          changed += 1;
        }
        if (String(next.endpointPath || '') !== SLCUSTDRFTS_ENDPOINT) {
          next.endpointPath = SLCUSTDRFTS_ENDPOINT;
          changed += 1;
        }
      }
      return next;
    });
  }

  if (changed > 0) {
    const nextMetadata = {
      ...metadata,
      accountingProgramsBySystem: nextBySystem,
      accountingPrograms: Object.values(nextBySystem).flat(),
    };
    await prisma.accountingConnection.update({
      where: { id: connection.id },
      data: { connectionMetadata: nextMetadata as any },
    });
  }

  const arRows = Object.entries(nextBySystem).flatMap(([system, rows]) =>
    (Array.isArray(rows) ? rows : [])
      .filter((row: any) => {
        const miProgram = norm(row?.miProgram);
        return miProgram === 'SLARTRANS' || miProgram === 'SLCUSTDRFTS';
      })
      .map((row: any) => ({
        system,
        module: row.module,
        miProgram: row.miProgram,
        enabled: row.enabled !== false,
        endpointPath: row.endpointPath,
      }))
  );

  console.log(JSON.stringify({ ok: true, changed, arRows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
