import prisma from '../lib/prisma';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

function parseCsiDate(value: unknown): Date | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const csi = text.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (csi) {
    const d = new Date(
      Date.UTC(
        Number(csi[1]),
        Number(csi[2]) - 1,
        Number(csi[3]),
        Number(csi[4]),
        Number(csi[5]),
        Number(csi[6]),
      ),
    );
    if (Number.isFinite(d.getTime())) return d;
  }
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const d = new Date(Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3])));
    if (Number.isFinite(d.getTime())) return d;
  }
  const iso = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isFinite(iso.getTime())) return iso;
  return null;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${COMPANY_ID}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLGLTRANS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    )
    SELECT x.value AS item
    FROM logs
    CROSS JOIN LATERAL jsonb_array_elements(items) x
  `;

  const counts = new Map<string, number>();
  let total = 0;
  let withDate = 0;
  let marchRows = 0;
  const marchSamples: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    total += 1;
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const d = parseCsiDate(item.TransDate ?? item.transDate);
    if (!d) continue;
    withDate += 1;
    const m = monthKey(d);
    counts.set(m, (counts.get(m) || 0) + 1);
    if (m === '2026-03') {
      marchRows += 1;
      if (marchSamples.length < 5) {
        marchSamples.push({
          Acct: item.Acct ?? item.acct ?? null,
          Site: item.Site ?? item.site ?? null,
          TransDate: item.TransDate ?? item.transDate ?? null,
          RecordDate: item.RecordDate ?? item.recordDate ?? null,
          DomAmount: item.DomAmount ?? item.domAmount ?? null,
          DrCr: item.DrCr ?? item.drCr ?? null,
          Ref: item.Ref ?? item.ref ?? null,
        });
      }
    }
  }

  const byMonth = Array.from(counts.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, count]) => ({ month, count }));

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        totalRows: total,
        rowsWithTransDate: withDate,
        byMonth,
        marchRows,
        marchSamples,
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
