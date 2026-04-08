import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const row = await prisma.accountingConnection.findFirst({
    where: {
      companyId,
      platform: 'INFOR_M3',
    },
    select: {
      id: true,
      companyId: true,
      connectionMetadata: true,
    },
  });

  if (!row) {
    console.log(JSON.stringify({ found: false }, null, 2));
    return;
  }

  const metadata = (row.connectionMetadata && typeof row.connectionMetadata === 'object'
    ? row.connectionMetadata
    : {}) as Record<string, unknown>;

  const accountingPrograms = Array.isArray(metadata.accountingPrograms)
    ? metadata.accountingPrograms
    : [];

  const accountingProgramsBySystem =
    metadata.accountingProgramsBySystem && typeof metadata.accountingProgramsBySystem === 'object'
      ? (metadata.accountingProgramsBySystem as Record<string, unknown>)
      : {};

  const flattenPrograms = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).flatMap((item) => flattenPrograms(item));
    }
    return [];
  };

  const allPrograms = [...accountingPrograms, ...flattenPrograms(accountingProgramsBySystem)];
  const slvchhdrsPrograms = allPrograms.filter((program) => {
    if (!program || typeof program !== 'object') return false;
    return String((program as Record<string, unknown>).miProgram || '').trim().toUpperCase() === 'SLVCHHDRS';
  });

  console.log(
    JSON.stringify(
      {
        found: true,
        id: row.id,
        companyId: row.companyId,
        slvchhdrsPrograms,
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
