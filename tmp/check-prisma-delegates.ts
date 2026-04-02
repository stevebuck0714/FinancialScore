import prisma from '../lib/prisma';

async function main() {
  const keys = Object.keys(prisma).filter((k) => k.toLowerCase().includes('transactionfact') || k.toLowerCase().includes('gl'));
  console.log(JSON.stringify(keys, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

