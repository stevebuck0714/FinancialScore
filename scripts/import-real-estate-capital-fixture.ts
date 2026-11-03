/**
 * Loads the client-provided BGAH capital-account summary into a named DEV company.
 * Usage: npx tsx scripts/import-real-estate-capital-fixture.ts --company "BGAH Demo"
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';
import prisma from '../lib/prisma';

const SOURCE_FILE = path.join('C:', 'Users', 'steve', 'Downloads', 'BGAHMemberCapitalAccts (1).xlsx');
const money = (value: unknown) => {
  const result = Number(String(value ?? '').replace(/[$,\s()]/g, ''));
  return Number.isFinite(result) ? result : 0;
};

async function main() {
  const index = process.argv.indexOf('--company');
  const companyName = index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
  if (!companyName) throw new Error('Pass --company "BGAH Demo".');
  const companies = await prisma.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "Company" WHERE "name"=$1', companyName);
  if (companies.length !== 1) throw new Error(`Expected one company named "${companyName}", found ${companies.length}.`);
  const companyId = companies[0].id;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateInvestor" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "legalName" TEXT NOT NULL, "memberGroup" TEXT,
      "ownershipPercentage" NUMERIC(9,6), "preferredReturnRate" NUMERIC(9,6), "active" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","legalName")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateInvestorLedgerEntry" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "investorId" TEXT NOT NULL, "entryType" TEXT NOT NULL,
      "effectiveDate" DATE NOT NULL, "amount" NUMERIC(18,2) NOT NULL, "reference" TEXT, "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const book = XLSX.readFile(SOURCE_FILE, { raw: false });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: null, raw: false });
  let group = '';
  const members: Array<{ name: string; group: string; contribution: number; deemedContribution: number; distributions: number }> = [];
  const transfers: Array<{ from: string; to: string; amount: number; date: string }> = [];
  let lastMemberName = '';
  for (const row of rows.slice(1)) {
    const name = String(row[0] || '').trim();
    if (!name) continue;
    if (/GROUP$/i.test(name)) { group = name; continue; }
    if (/^total$/i.test(name)) continue;
    if (/^purchase from iav,\s*6\.26\.24$/i.test(name)) {
      if (lastMemberName) transfers.push({ from: 'Igor A Vaserfirer', to: lastMemberName, amount: money(row[1]), date: '2024-06-26' });
      continue;
    }
    members.push({ name, group, contribution: money(row[1]), deemedContribution: money(row[2]), distributions: money(row[6]) });
    lastMemberName = name;
  }
  const investorContributionTotal = members.filter((member) => /INVESTOR/i.test(member.group)).reduce((sum, member) => sum + member.contribution, 0);
  for (const member of members) {
    const isLandContributor = /LAND/i.test(member.group);
    const ownership = isLandContributor
      ? 12.5
      : /INVESTOR/i.test(member.group)
        ? (member.contribution / investorContributionTotal) * 75
        : null;
    const preferredRate = isLandContributor ? 6 : null;
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "RealEstateInvestor" WHERE "companyId"=$1 AND "legalName"=$2', companyId, member.name,
    );
    const investorId = existing[0]?.id || randomUUID();
    if (existing.length) {
      await prisma.$executeRawUnsafe(
        'UPDATE "RealEstateInvestor" SET "memberGroup"=$1,"ownershipPercentage"=$2,"preferredReturnRate"=$3,"updatedAt"=NOW() WHERE "id"=$4',
        member.group, ownership, preferredRate, investorId,
      );
    } else {
      await prisma.$executeRawUnsafe(
        'INSERT INTO "RealEstateInvestor" ("id","companyId","legalName","memberGroup","ownershipPercentage","preferredReturnRate","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
        investorId, companyId, member.name, member.group, ownership, preferredRate,
      );
    }
    await prisma.$executeRawUnsafe('DELETE FROM "RealEstateInvestorLedgerEntry" WHERE "investorId"=$1 AND "reference"=$2', investorId, 'BGAH capital account fixture');
    const entries = [
      ['CONTRIBUTION', member.contribution, '2022-01-01', 'Cash contribution'],
      ['DEEMED_CONTRIBUTION', member.deemedContribution, '2022-01-01', 'Deemed capital contribution'],
      ['DISTRIBUTION', member.distributions, '2026-08-31', 'Total cash distributions through Aug. 2026'],
    ] as const;
    for (const [entryType, amount, effectiveDate, notes] of entries) {
      if (!amount) continue;
      await prisma.$executeRawUnsafe(
        'INSERT INTO "RealEstateInvestorLedgerEntry" ("id","companyId","investorId","entryType","effectiveDate","amount","reference","notes","updatedAt") VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,NOW())',
        randomUUID(), companyId, investorId, entryType, effectiveDate, amount, 'BGAH capital account fixture', notes,
      );
    }
  }
  for (const transfer of transfers) {
    const [from, to] = await Promise.all(
      [transfer.from, transfer.to].map((legalName) =>
        prisma.$queryRawUnsafe<Array<{ id: string }>>(
          'SELECT "id" FROM "RealEstateInvestor" WHERE "companyId"=$1 AND "legalName"=$2',
          companyId,
          legalName,
        ),
      ),
    );
    if (!from[0] || !to[0]) throw new Error(`Could not record transfer from ${transfer.from} to ${transfer.to}.`);
    await prisma.$executeRawUnsafe(
      'DELETE FROM "RealEstateInvestorLedgerEntry" WHERE "companyId"=$1 AND "reference"=$2',
      companyId,
      'BGAH ownership transfer fixture',
    );
    await prisma.$executeRawUnsafe(
      'INSERT INTO "RealEstateInvestorLedgerEntry" ("id","companyId","investorId","entryType","effectiveDate","amount","reference","notes","updatedAt") VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,NOW())',
      randomUUID(), companyId, from[0].id, 'OWNERSHIP_TRANSFER_OUT', transfer.date, -transfer.amount,
      'BGAH ownership transfer fixture', `Transferred interest to ${transfer.to}`, 
    );
    await prisma.$executeRawUnsafe(
      'INSERT INTO "RealEstateInvestorLedgerEntry" ("id","companyId","investorId","entryType","effectiveDate","amount","reference","notes","updatedAt") VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,NOW())',
      randomUUID(), companyId, to[0].id, 'OWNERSHIP_TRANSFER_IN', transfer.date, transfer.amount,
      'BGAH ownership transfer fixture', `Purchased interest from ${transfer.from}`,
    );
  }
  // Remove the two invalid pseudo-members created by the earlier fixture version.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "RealEstateInvestorLedgerEntry" WHERE "investorId" IN
      (SELECT "id" FROM "RealEstateInvestor" WHERE "companyId"=$1 AND "legalName" IN ('Total', 'Purchase from IAV, 6.26.24'))`,
    companyId,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "RealEstateInvestor" WHERE "companyId"=$1 AND "legalName" IN ('Total', 'Purchase from IAV, 6.26.24')`,
    companyId,
  );
  console.log(`Loaded ${members.length} BGAH members and ${transfers.length} ownership transfer(s) into ${companyName}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
