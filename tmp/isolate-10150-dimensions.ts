import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

const COMPANY_ID = 'cmmnwyofv000fqhp4z8lebbny';
const ACCOUNT = '10150';
const SITE = 'LYN';
const FROM = new Date(Date.UTC(2026, 1, 28, 0, 0, 0, 0)); // 2/28
const TO = new Date(Date.UTC(2026, 2, 31, 23, 59, 59, 999)); // 3/31

function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const byConoDivi = await prisma.$queryRaw<Array<{ cono: string | null; divi: string | null; cnt: number; amt: number }>>`
    SELECT
      NULLIF(TRIM(COALESCE(cono,'')),'') AS cono,
      NULLIF(TRIM(COALESCE(divi,'')),'') AS divi,
      COUNT(*)::int AS cnt,
      SUM("signedAmount")::double precision AS amt
    FROM "GLTransactionFact"
    WHERE "companyId" = ${COMPANY_ID}
      AND TRIM("accountId") = ${ACCOUNT}
      AND COALESCE(site,'') = ${SITE}
      AND "transDate" >= ${FROM}
      AND "transDate" <= ${TO}
    GROUP BY 1,2
    ORDER BY ABS(SUM("signedAmount")) DESC
  `;

  const bySourceProgram = await prisma.$queryRaw<Array<{ sourceProgram: string | null; cnt: number; amt: number }>>`
    SELECT
      NULLIF(TRIM(COALESCE("sourceProgram",'')),'') AS "sourceProgram",
      COUNT(*)::int AS cnt,
      SUM("signedAmount")::double precision AS amt
    FROM "GLTransactionFact"
    WHERE "companyId" = ${COMPANY_ID}
      AND TRIM("accountId") = ${ACCOUNT}
      AND COALESCE(site,'') = ${SITE}
      AND "transDate" >= ${FROM}
      AND "transDate" <= ${TO}
    GROUP BY 1
    ORDER BY ABS(SUM("signedAmount")) DESC
  `;

  const byRefPrefix = await prisma.$queryRaw<Array<{ refPrefix: string; cnt: number; amt: number }>>`
    SELECT
      CASE
        WHEN ref IS NULL OR TRIM(ref) = '' THEN '(blank)'
        ELSE SPLIT_PART(TRIM(ref), ' ', 1)
      END AS "refPrefix",
      COUNT(*)::int AS cnt,
      SUM("signedAmount")::double precision AS amt
    FROM "GLTransactionFact"
    WHERE "companyId" = ${COMPANY_ID}
      AND TRIM("accountId") = ${ACCOUNT}
      AND COALESCE(site,'') = ${SITE}
      AND "transDate" >= ${FROM}
      AND "transDate" <= ${TO}
    GROUP BY 1
    ORDER BY ABS(SUM("signedAmount")) DESC
    LIMIT 50
  `;

  const byDescriptionTag = await prisma.$queryRaw<Array<{ tag: string; cnt: number; amt: number }>>`
    SELECT
      CASE
        WHEN description ILIKE '%LOC%' THEN 'LOC'
        WHEN description ILIKE '%APV%' THEN 'APV'
        WHEN description ILIKE '%APP%' THEN 'APP'
        WHEN description ILIKE '%ARP%' THEN 'ARP'
        WHEN description ILIKE '%PAYROLL%' THEN 'PAYROLL'
        ELSE 'OTHER'
      END AS tag,
      COUNT(*)::int AS cnt,
      SUM("signedAmount")::double precision AS amt
    FROM "GLTransactionFact"
    WHERE "companyId" = ${COMPANY_ID}
      AND TRIM("accountId") = ${ACCOUNT}
      AND COALESCE(site,'') = ${SITE}
      AND "transDate" >= ${FROM}
      AND "transDate" <= ${TO}
    GROUP BY 1
    ORDER BY ABS(SUM("signedAmount")) DESC
  `;

  const outDir = path.join(process.cwd(), 'exports');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, '10150-dimension-isolation-2026-03.csv');

  const lines: string[] = [];
  lines.push('section,key1,key2,count,amount');
  for (const r of byConoDivi) lines.push(['cono_divi', r.cono || '(null)', r.divi || '(null)', r.cnt, r.amt].map(esc).join(','));
  for (const r of bySourceProgram) lines.push(['source_program', r.sourceProgram || '(null)', '', r.cnt, r.amt].map(esc).join(','));
  for (const r of byRefPrefix) lines.push(['ref_prefix', r.refPrefix, '', r.cnt, r.amt].map(esc).join(','));
  for (const r of byDescriptionTag) lines.push(['description_tag', r.tag, '', r.cnt, r.amt].map(esc).join(','));
  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');

  console.log(JSON.stringify({ outFile, byConoDivi, bySourceProgram, topRefPrefixes: byRefPrefix.slice(0, 10), byDescriptionTag }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

