import prisma from '../lib/prisma';

async function clearUsers() {
  try {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.FORCE_ALLOW_PROD_CLEAR !== 'true'
    ) {
      throw new Error(
        'Refusing to clear production data. Set FORCE_ALLOW_PROD_CLEAR=true only for intentional emergency operations.'
      );
    }

    console.log('🗑️  Starting cleanup...\n');

    // Get site admin email from env
    const siteAdminEmail = process.env.SITEADMIN_EMAIL || 'siteadministrator@venturis.com';

    // Delete all consultants (this will cascade delete their companies and users)
    const deletedConsultants = await prisma.consultant.deleteMany({});
    console.log(`✅ Deleted ${deletedConsultants.count} consultants`);

    // Delete all users except site administrator
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: {
          not: siteAdminEmail
        }
      }
    });
    console.log(`✅ Deleted ${deletedUsers.count} users (kept site admin)`);

    // Delete all companies
    const deletedCompanies = await prisma.company.deleteMany({});
    console.log(`✅ Deleted ${deletedCompanies.count} companies`);

    // Delete all financial records
    const deletedFinancials = await prisma.financialRecord.deleteMany({});
    console.log(`✅ Deleted ${deletedFinancials.count} financial records`);

    // Delete all assessment records
    const deletedAssessments = await prisma.assessmentRecord.deleteMany({});
    console.log(`✅ Deleted ${deletedAssessments.count} assessment records`);

    // Delete all company profiles
    const deletedProfiles = await prisma.companyProfile.deleteMany({});
    console.log(`✅ Deleted ${deletedProfiles.count} company profiles`);

    // Verify remaining users
    const remainingUsers = await prisma.user.findMany({
      select: {
        email: true,
        name: true,
        role: true
      }
    });

    console.log('\n📋 Remaining users:');
    remainingUsers.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - ${user.role}`);
    });

    console.log('\n✨ Cleanup complete!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearUsers()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


