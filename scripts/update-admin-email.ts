import prisma from '../lib/prisma';

async function updateAdminEmail() {
  try {
    const oldEmail = 'siteadministrator@venturis.com';
    const newEmail = process.env.SITEADMIN_EMAIL || 'steve@stevebuck.us';

    console.log(`🔄 Updating site administrator email...`);
    console.log(`   From: ${oldEmail}`);
    console.log(`   To: ${newEmail}\n`);

    // Check if old admin exists
    const oldAdmin = await prisma.user.findUnique({
      where: { email: oldEmail }
    });

    if (oldAdmin) {
      // Update the email
      const updatedAdmin = await prisma.user.update({
        where: { email: oldEmail },
        data: { email: newEmail }
      });

      console.log(`✅ Site administrator email updated successfully!`);
      console.log(`   ID: ${updatedAdmin.id}`);
      console.log(`   Name: ${updatedAdmin.name}`);
      console.log(`   Email: ${updatedAdmin.email}`);
      console.log(`   Role: ${updatedAdmin.role}`);
    } else {
      console.log(`⚠️  No existing site administrator found with email: ${oldEmail}`);
      console.log(`   Database might already be updated or empty.`);
    }

  } catch (error) {
    console.error('❌ Error updating admin email:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateAdminEmail()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


