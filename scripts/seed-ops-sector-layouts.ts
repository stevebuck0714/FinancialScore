import prisma from '../lib/prisma';
import { INDUSTRY_SECTORS } from '../lib/constants/company-options';

const DEFAULT_LAYOUT_CONFIG = {
  version: 1,
  layoutId: 'default',
  modules: ['ops-default'],
};

async function main() {
  const sectors = INDUSTRY_SECTORS.map((sector) => sector.value).filter(
    (value) => value && value !== 'DEFAULT'
  );

  const results = await Promise.all(
    sectors.map((sectorCategory) =>
      prisma.opsSectorLayoutConfig.upsert({
        where: { sectorCategory },
        update: {},
        create: { sectorCategory, config: DEFAULT_LAYOUT_CONFIG },
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
