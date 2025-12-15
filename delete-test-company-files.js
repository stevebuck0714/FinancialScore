const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteFiles() {
  try {
    // Find the company
    const company = await prisma.company.findFirst({
      where: { name: 'Test everthing again' }
    });

    if (!company) {
      console.log('Company "Test everthing again" not found');
      return;
    }

    console.log('Found company:', company.id, company.name);

    // Find all financial records for this company
    const records = await prisma.financialRecord.findMany({
      where: { companyId: company.id }
    });

    console.log('Found', records.length, 'financial records');

    // Show the files that will be deleted
    records.forEach(record => {
      console.log('- File:', record.fileName, '(ID:', record.id + ')');
    });

    if (records.length === 0) {
      console.log('No files to delete');
      return;
    }

    // Ask for confirmation
    console.log('\nAre you sure you want to delete these files? (This action cannot be undone)');
    console.log('Type "yes" to confirm:');

    // For now, let's just show what would be deleted
    console.log('\nTo actually delete, uncomment the deleteMany call in the script');

    // Uncomment this line to actually delete:
    // const deleteResult = await prisma.financialRecord.deleteMany({
    //   where: { companyId: company.id }
    // });
    // console.log('Deleted', deleteResult.count, 'financial records');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteFiles();


