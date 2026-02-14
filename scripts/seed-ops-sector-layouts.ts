import prisma from '../lib/prisma';
import { INDUSTRY_SECTORS } from '../lib/constants/company-options';
import { getDefaultSectorLayoutConfig } from '../lib/operations/sector-layout-defaults';

async function main() {
  const sectors = INDUSTRY_SECTORS.map((sector) => sector.value).filter(
    (value) => value && value !== '01'
  );

  const results = await Promise.all(
    sectors.map((sectorCategory) =>
      prisma.opsSectorLayoutConfig.upsert({
        where: { sectorCategory },
        update: {},
        create: { sectorCategory, config: getDefaultSectorLayoutConfig(sectorCategory) },
      })
    )
  );

  console.log(`Seeded ops layouts for ${results.length} sectors.`);
}

main()
  .catch((error) => {
    console.error('Failed to seed ops sector layouts:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
