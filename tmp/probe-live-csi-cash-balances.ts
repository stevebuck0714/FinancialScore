import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const MONTH = process.argv[3] || '2026-03';
const ACCOUNTS = ['10100', '10150', '10200', '10250', '10400', '10450'];

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

function toNum(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

async function main() {
  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { accountingSystem: true },
  });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');

  const outDir = path.join(process.cwd(), 'exports');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `live-csi-cash-probe-${MONTH}.csv`);
  const lines: string[] = [];
  lines.push(
    [
      'company_id',
      'month',
      'ido',
      'account_id',
      'status',
      'item_count',
      'sum_dom_amount',
      'sum_amount',
      'sample_keys',
      'request_path',
    ].join(',')
  );

  const monthStart = `${MONTH}-01`;
  const monthEnd = `${MONTH}-31`;

  for (const acct of ACCOUNTS) {
    const queries = [
      {
        ido: 'SLGlTrans',
        path: `/APR_PRD/CSI/IDORequestService/ido/load/SLGlTrans?properties=Acct,DomAmount,Amount,TransDate,RecordDate,Ref,TransNum,DrCr&filter=Acct='${acct}' and TransDate>='${monthStart}' and TransDate<='${monthEnd}'&recordCap=2000`,
      },
      {
        ido: 'GLAcctPeriodBalances',
        path: `/APR_PRD/CSI/IDORequestService/ido/load/GLAcctPeriodBalances?properties=Acct,DomAmount,Amount,TransDate,RecordDate,Ref,TransNum,DrCr,ControlYear,ControlPeriod,FiscalYear,FiscalPeriod,EndBalance,Balance&filter=Acct='${acct}'&recordCap=2000`,
      },
    ];

    for (const q of queries) {
      const response = await callInforIonApi(resolved.credentials, q.path, { timeoutMs: 45000 });
      const items = extractItems(response.body);
      const sumDom = items.reduce((s, it) => s + toNum((it as any).DomAmount ?? (it as any).domAmount), 0);
      const sumAmt = items.reduce((s, it) => s + toNum((it as any).Amount ?? (it as any).amount), 0);
      const keys = items.length ? Object.keys(items[0]).join('|') : '';
      lines.push(
        [
          csvEscape(COMPANY_ID),
          csvEscape(MONTH),
          csvEscape(q.ido),
          csvEscape(acct),
          csvEscape(response.status),
          csvEscape(items.length),
          csvEscape(sumDom),
          csvEscape(sumAmt),
          csvEscape(keys),
          csvEscape(q.path),
        ].join(',')
      );
    }
  }

  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({ companyId: COMPANY_ID, month: MONTH, outFile }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
