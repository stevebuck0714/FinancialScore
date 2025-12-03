const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const consultantId = 'cminkkqbk0005l204i64njd0n';
  const userId = 'cminkkqb60003l204sjexyu7v';
  
  console.log('Deleting Tim Haluszczak / Lane 6 data...');
  
  // First delete the consultant (this will cascade delete companies)
  try {
    await prisma.consultant.delete({
      where: { id: consultantId }
    });
    console.log('✓ Deleted Consultant record (Tim Haluszczak / Lane 6)');
  } catch (e) {
    console.log('Consultant delete error:', e.message);
  }
  
  // Then delete the orphaned user (since consultantId was NULL, it won't cascade)
  try {
    await prisma.user.delete({
      where: { id: userId }
    });
    console.log('✓ Deleted User record (email: steve.buck@venturisfinancial.com)');
  } catch (e) {
    console.log('User delete error:', e.message);
  }
  
  console.log('\nDone!');
}

main().catch(console.error).finally(() => prisma.$disconnect());

