/**
 * Extracts aggregate unit counts from OneSite occupancy summaries embedded in
 * Benn's Grant monthly final packets. It never imports resident/unit detail.
 *
 * Usage:
 *   npx tsx scripts/import-benns-grant-packet-occupancy.ts --company "BGAH Demo"
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import pdf from 'pdf-parse';
import { PrismaClient } from '@prisma/client';
import { enforceDatabaseSecurity, validateDatabaseConnection } from '../lib/db-security';

dotenv.config({ path: '.env.local' });

const ROOT = 'C:/Users/steve/Dropbox/New Corelytics/CUSTOMERS/Benns Grant';
const FOLDERS = ['2024 SLN MONTHLY FINANCIALS', '2025 SLN MONTHLY FINANCIALS', '2026 SLN MONTHLY FINANCIALS'];
const prisma = new PrismaClient();

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}

function periodFromPath(file: string): string | null {
  const parts = file.split(/[\\/]/);
  const rootIndex = parts.findIndex((part) => /\b20\d\d\s+SLN\s+MONTHLY\s+FINANCIALS\b/i.test(part));
  const year = rootIndex >= 0 ? parts[rootIndex].match(/\b(20\d\d)\b/)?.[1] : null;
  const folder = rootIndex >= 0 ? parts[rootIndex + 1] || '' : '';
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const numeric = folder.match(/\b(0?[1-9]|1[0-2])\b/);
  const named = monthNames.findIndex((month) => new RegExp(`\\b${month.slice(0, 3)}`, 'i').test(folder));
  const month = numeric ? Number(numeric[1]) : named + 1;
  if (!year || !month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(Number(year), month, 0).getDate()).padStart(2, '0')}`;
}

function rank(file: string) {
  const normalized = file.toLowerCase();
  return (normalized.includes('prior') ? -100 : 0) + (normalized.includes('updated') ? 100 : 0);
}

async function main() {
  const companyName = argument('--company');
  if (!companyName) throw new Error('Pass --company "BGAH Demo".');
  enforceDatabaseSecurity();
  if (validateDatabaseConnection().isProduction) throw new Error('Development-only import.');
  const company = await prisma.company.findFirst({ where: { name: companyName }, select: { id: true, name: true } });
  if (!company) throw new Error(`Company "${companyName}" was not found.`);

  const allFiles = (await Promise.all(FOLDERS.map((folder) => walk(path.join(ROOT, folder))))).flat();
  const files = allFiles
    .filter((file) => /\.pdf$/i.test(file))
    .filter((file) => /final|488400|financials/i.test(path.basename(file)))
    .filter((file) => !/mortgage|expense|check|true.?up|payroll|^je\b/i.test(path.basename(file)));
  const selected = new Map<string, string>();
  for (const file of files) {
    const period = periodFromPath(file);
    if (!period || (!selected.has(period) || rank(file) >= rank(selected.get(period)!))) selected.set(period, file);
  }

  let imported = 0;
  const skipped: string[] = [];
  for (const [periodEnd, file] of selected) {
    const sourceReference = path.relative(ROOT, file).replace(/\\/g, '/');
    const existing = await prisma.$queryRawUnsafe<Array<{ sourceReference: string | null }>>(
      `SELECT "sourceReference" FROM "RealEstateOccupancySnapshot" WHERE "companyId"=$1 AND "periodEnd"=$2::date`,
      company.id, periodEnd,
    );
    // The structured VHDA workbook is more authoritative than packet text.
    if (/vhda/i.test(existing[0]?.sourceReference || '')) continue;
    const text = (await pdf(await (await import('node:fs/promises')).readFile(file))).text.replace(/\n+/g, ' ');
    const match = text.match(/Total\s+(\d{2,3})\s+([\d.]+)\s+%\s+.{0,300}?Vacant\s+.{0,300}?(\d{2,3})\s+Occupied Unit Count/i);
    if (!match) {
      skipped.push(`${periodEnd}: no aggregate occupancy summary`);
      continue;
    }
    const totalUnits = Number(match[1]);
    const occupiedUnits = Number(match[3]);
    if (!Number.isInteger(totalUnits) || !Number.isInteger(occupiedUnits) || totalUnits < 1 || occupiedUnits < 0 || occupiedUnits > totalUnits) {
      skipped.push(`${periodEnd}: invalid counts`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RealEstateOccupancySnapshot" ("id","companyId","periodEnd","totalUnits","occupiedUnits","physicalOccupancyPct","economicOccupancyPct","sourceReference","updatedAt")
       VALUES ($1,$2,$3::date,$4,$5,$6,NULL,$7,NOW())
       ON CONFLICT ("companyId","periodEnd") DO UPDATE SET "totalUnits"=EXCLUDED."totalUnits","occupiedUnits"=EXCLUDED."occupiedUnits","physicalOccupancyPct"=EXCLUDED."physicalOccupancyPct","sourceReference"=EXCLUDED."sourceReference","updatedAt"=NOW()`,
      randomUUID(), company.id, periodEnd, totalUnits, occupiedUnits, (occupiedUnits / totalUnits) * 100, sourceReference,
    );
    const movement = text.match(/Moves\/Transfers\s+\w+\s+In\s+\w+\s+Out\s+(\d+)\s+(\d+)/i);
    if (movement) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateOperationalMetric" ("id","companyId","periodEnd","metric","value","unit","sourceReference","updatedAt")
         VALUES ($1,$2,$3::date,'move_outs',$4,'units',$5,NOW())
         ON CONFLICT ("companyId","periodEnd","metric") DO NOTHING`,
        randomUUID(), company.id, periodEnd, Number(movement[2]), sourceReference,
      );
    }
    imported += 1;
  }
  console.log(JSON.stringify({ company: company.name, packetsSelected: selected.size, imported, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
