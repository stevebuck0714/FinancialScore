import prisma from '../lib/prisma';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';

function cleanEndpointPath(path: string): string {
  try {
    const [base, query = ''] = String(path || '').split('?');
    const params = new URLSearchParams(query);
    const propertiesRaw = params.get('properties');
    if (!propertiesRaw) return path;
    const props = propertiesRaw
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    const baseUpper = base.toUpperCase();
    const filtered = props.filter((prop) => {
      if (baseUpper.includes('/SLAPPMTS') && prop.toLowerCase() === 'distdate') return false;
      if (baseUpper.includes('/SLAPTRXS') && prop.toLowerCase() === 'amtpaid') return false;
      return true;
    });
    params.set('properties', filtered.join(','));
    return `${base}?${params.toString()}`;
  } catch {
    return path;
  }
}

function patchProgramRows(rows: any[]): { nextRows: any[]; changed: number } {
  let changed = 0;
  const nextRows = rows.map((row) => {
    const next = { ...row };
    const endpointPath = String(next.endpointPath || '');
    const endpointUpper = endpointPath.toUpperCase();
    if (endpointUpper.includes('/SLAPTRX?') || endpointUpper.endsWith('/SLAPTRX')) {
      // This IDO is not available in this tenant; keep it disabled so it cannot fail runs.
      if (next.enabled !== false) {
        next.enabled = false;
        changed += 1;
      }
    }
    if (endpointUpper.includes('/SLAPTRXS') || endpointUpper.includes('/SLAPPMTS')) {
      const cleaned = cleanEndpointPath(endpointPath);
      if (cleaned !== endpointPath) {
        next.endpointPath = cleaned;
        changed += 1;
      }
    }
    return next;
  });
  return { nextRows, changed };
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
    const patched = patchProgramRows(rows);
    nextBySystem[system] = patched.nextRows;
    changed += patched.changed;
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

  const apRows = Object.values(nextBySystem)
    .flat()
    .filter((row: any) => String(row?.module || '').toLowerCase() === 'ap')
    .map((row: any) => ({
      miProgram: row.miProgram,
      enabled: row.enabled !== false,
      endpointPath: row.endpointPath,
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
