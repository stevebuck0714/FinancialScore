import prisma from '../lib/prisma';

type ExpectedTarget = 'interestExpense' | 'depreciationAmortization' | 'incomeTax';

function expectedTarget(accountName: string): ExpectedTarget | null {
  const name = accountName.toLowerCase();
  if (/\b(depreciation|amortization|amortisation)\b/.test(name)) {
    return 'depreciationAmortization';
  }
  if (/\binterest expense\b/.test(name)) return 'interestExpense';
  if (/\b(income tax|federal tax|state tax|provision for tax)\b/.test(name)) return 'incomeTax';
  return null;
}

function targetIsValid(expected: ExpectedTarget, target: string): boolean {
  if (expected === 'incomeTax') {
    return target === 'stateIncomeTaxes' || target === 'federalIncomeTaxes';
  }
  return target === expected;
}

async function main() {
  const mappings = await prisma.accountMapping.findMany({
    select: {
      accountName: true,
      accountCode: true,
      accountClassification: true,
      targetField: true,
      company: { select: { id: true, name: true } },
    },
    orderBy: [{ company: { name: 'asc' } }, { accountName: 'asc' }],
  });

  const findings = mappings.flatMap((mapping) => {
    const classification = (mapping.accountClassification || '').toLowerCase();
    const isPnlAccount =
      classification.includes('expense') ||
      classification.includes('cost of goods sold') ||
      classification === 'cogs';
    if (!isPnlAccount) return [];

    const expected = expectedTarget(mapping.accountName);
    if (!expected || targetIsValid(expected, mapping.targetField)) return [];
    return [{
      companyId: mapping.company.id,
      companyName: mapping.company.name,
      accountCode: mapping.accountCode,
      accountName: mapping.accountName,
      accountClassification: mapping.accountClassification,
      currentTarget: mapping.targetField,
      expectedTarget: expected === 'incomeTax'
        ? 'stateIncomeTaxes or federalIncomeTaxes'
        : expected,
    }];
  });

  console.log(JSON.stringify({
    mappingsReviewed: mappings.length,
    findingsCount: findings.length,
    findings,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
