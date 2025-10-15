import prisma from '../lib/prisma';

async function clearAllUsers() {
  try {
    const siteAdminEmail = process.env.SITEADMIN_EMAIL || 'steve@stevebuck.us';

    console.log('🗑️  Clearing all users and companies...\n');

    // Delete all users except site administrator
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: {
          not: siteAdminEmail
        }
      }
    });
    console.log(`✅ Deleted ${deletedUsers.count} users (kept site admin)`);

    // Delete all consultants
    const deletedConsultants = await prisma.consultant.deleteMany({});
    console.log(`✅ Deleted ${deletedConsultants.count} consultants`);

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

    console.log('\n✨ Database cleared! You can now register as a consultant and start fresh.');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearAllUsers()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


