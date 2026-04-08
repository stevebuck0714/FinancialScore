import { PrismaClient } from '@prisma/client';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const token = 'business_identifier_code';

async function main() {
  const prisma = new PrismaClient();
  try {
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

    const raw = JSON.stringify(connection.connectionMetadata || {});
    console.log(
      JSON.stringify(
        {
          ok: true,
          connectionId: connection.id,
          containsToken: raw.includes(token),
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
