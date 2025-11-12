import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearQuickBooksConnection() {
  try {
    // Get all QuickBooks connections
    const connections = await prisma.accountingConnection.findMany({
      where: {
        platform: 'QUICKBOOKS'
      },
      include: {
        company: true
      }
    });

    console.log(`Found ${connections.length} QuickBooks connection(s)`);

    for (const connection of connections) {
      console.log(`\nCompany: ${connection.company.name}`);
      console.log(`Status: ${connection.status}`);
      console.log(`Last Sync: ${connection.lastSyncAt?.toISOString() || 'Never'}`);
      console.log(`Token Expires: ${connection.tokenExpiresAt?.toISOString() || 'Unknown'}`);
      
      // Delete the connection
      await prisma.accountingConnection.delete({
        where: {
          id: connection.id
        }
      });
      
      console.log(`✅ Deleted QuickBooks connection for ${connection.company.name}`);
    }

    console.log('\n✅ All QuickBooks connections cleared!');
    console.log('You can now reconnect to QuickBooks with fresh tokens.');

  } catch (error) {
    console.error('Error clearing QuickBooks connections:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearQuickBooksConnection();

