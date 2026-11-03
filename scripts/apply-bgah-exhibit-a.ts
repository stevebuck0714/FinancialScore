/**
 * Applies the ownership percentages stated in BGAH Operating Agreement Exhibit A
 * (effective January 1, 2024) to the BGAH Demo fixture.
 * Usage: npx tsx scripts/apply-bgah-exhibit-a.ts --company "BGAH Demo"
 */
import prisma from '../lib/prisma';

const EXHIBIT_A = [
  ['Henry Morgan', 'Henry W. Morgan', 12.5],
  ['Richard Turner', 'Richard L. Turner', 12.5],
  ["Benn's Grant Development, LLC", "Benn's Grant Development, LLC", 17.85],
  ['Stokes Properties, LLC', 'Stokes Properties, L.L.C.', 10],
  ['GKSFP, LLC', 'GKSFP, LLC', 5],
  ['John L Gibson III Rev Trust', 'John L. Gibson, III Revocable Trust', 1],
  ['JBANC BG LLC', 'JBANC-BG, LLC', 1],
  ['JWL Investments LLC', 'JWL Investments, LLC', 1],
  ['Gary J Beck', 'Gary J. Beck', 1],
  ['Donna Whitaker', 'Donna Whitaker', 1],
  ['Ann P Stokes', 'Ann P. Stokes', 0.5],
  ['AnnBurns Stokes Morrison', 'AnnBurns Stokes Morrison', 0.5],
  ['Joseph JL Morrison', 'Joseph J. L. Morrison', 0.5],
  ['JABA, LLC', 'JABA, LLC', 1],
  ['Charles Neal', 'Charles H. Neal', 2.5],
  ['JCSB Murphy Benns Grant', 'JCSB Murphy Benns Grant LLC', 2],
  ['William H. McCutcheon', 'William H. McCutcheon, Jr.', 1],
  ['Henry Frenck', 'Henry C. Frenck', 1],
  ['Peter K Stris', 'Peter Stris', 1],
  ['Amy Shu Inc', 'Amy-Shu, Inc.', 2],
  ['John Stokes, Jr.', 'John R. Stokes, Jr.', 0.5],
  ['Samuel Stokes', 'Samuel O. Stokes', 0.4],
  ['Dean Workman', 'Dean M. Workman', 0.25],
  ['JRSFP, LLC', 'JRSEP, LLC', 10],
  ['GMH Grant LLC', 'GMH Grant LLC', 8],
  ['Igor A Vaserfirer', 'Igor A. Vaserfirer', 4],
  ['Edward L. Stokes', 'Edward L. Stokes', 2],
] as const;

async function main() {
  const index = process.argv.indexOf('--company');
  const companyName = index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
  if (!companyName) throw new Error('Pass --company "BGAH Demo".');
  const companies = await prisma.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "Company" WHERE "name"=$1', companyName);
  if (companies.length !== 1) throw new Error(`Expected one company named "${companyName}", found ${companies.length}.`);
  const companyId = companies[0].id;
  const total = EXHIBIT_A.reduce((sum, [, , percentage]) => sum + percentage, 0);
  if (Math.abs(total - 100) > 0.00001) throw new Error(`Exhibit A ownership totals ${total}%, not 100%.`);

  for (const [fixtureName, legalName, ownershipPercentage] of EXHIBIT_A) {
    const result = await prisma.$executeRawUnsafe(
      'UPDATE "RealEstateInvestor" SET "legalName"=$1,"ownershipPercentage"=$2,"updatedAt"=NOW() WHERE "companyId"=$3 AND "legalName"=$4',
      legalName,
      ownershipPercentage,
      companyId,
      fixtureName,
    );
    if (result !== 1) throw new Error(`Expected one fixture member named "${fixtureName}", updated ${result}.`);
  }
  console.log(`Applied Exhibit A ownership percentages for ${EXHIBIT_A.length} members; total ${total}%.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
