import prisma from '../lib/prisma';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';

function normalize(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function shouldForceDisable(row: any): boolean {
  const miProgram = normalize(row?.miProgram);
  const endpoint = normalize(row?.endpointPath);
  const isSLAptrxps = miProgram === 'SLAPTRXPS' || endpoint.includes('/SLAPTRXPS');
  const isSLAptrxBadFamily =
    miProgram === 'SLAPTRX' ||
    miProgram === 'SLAPTRXS' ||
    endpoint.includes('/SLAPTRX?') ||
    endpoint.endsWith('/SLAPTRX') ||
    endpoint.includes('/SLAPTRXS');
  return isSLAptrxBadFamily && !isSLAptrxps;
}

function removeBadProperties(endpointPath: string): string {
  const raw = String(endpointPath || '');
  if (!raw.includes('?')) return raw;
  const [base, query] = raw.split('?');
  const params = new URLSearchParams(query);
  const properties = String(params.get('properties') || '').trim();
  if (!properties) return raw;
  const filtered = properties
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => token.toLowerCase() !== 'amtpaid' && token.toLowerCase() !== 'distdate');
  params.set('properties', filtered.join(','));
  return `${base}?${params.toString()}`;
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

  for (const [system, rowsRaw] of Object.entries(bySystem)) {
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
    nextBySystem[system] = rows.map((row: any) => {
      const next = { ...row };
      if (shouldForceDisable(next) && next.enabled !== false) {
        next.enabled = false;
        changed += 1;
      }
      const cleanedEndpoint = removeBadProperties(String(next.endpointPath || ''));
      if (cleanedEndpoint !== String(next.endpointPath || '')) {
        next.endpointPath = cleanedEndpoint;
        changed += 1;
      }
      return next;
    });
  }

  const nextMetadata = {
    ...metadata,
    accountingProgramsBySystem: nextBySystem,
    accountingPrograms: Object.values(nextBySystem).flat(),
  };
  await prisma.accountingConnection.update({
    where: { id: connection.id },
    data: { connectionMetadata: nextMetadata as any },
  });

  const apRows = Object.values(nextBySystem)
    .flat()
    .filter((row: any) => String(row?.module || '').trim().toLowerCase() === 'ap')
    .map((row: any) => ({
      miProgram: row.miProgram || null,
      enabled: row.enabled !== false,
      endpointPath: row.endpointPath || null,
    }));

  console.log(JSON.stringify({ ok: true, changed, apRows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
