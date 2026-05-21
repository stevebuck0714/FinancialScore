// Create operational data tables in production
const { Client } = require('pg');
const { requireDatabaseUrl } = require('./require-database-url');

const client = new Client({
  connectionString: requireDatabaseUrl(),
});

async function createTables() {
  try {
    await client.connect();
    
    console.log('📊 Creating operational data tables...\n');
    
    // CashSnapshot
    console.log('Creating CashSnapshot...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CashSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "snapshotDate" TIMESTAMP(3) NOT NULL,
        "frequency" TEXT NOT NULL DEFAULT 'daily',
        "accountId" TEXT,
        "accountName" TEXT NOT NULL,
        "accountNumber" TEXT,
        "cashBalance" DOUBLE PRECISION NOT NULL,
        "changeAmount" DOUBLE PRECISION,
        "changePercent" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CashSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS "CashSnapshot_companyId_snapshotDate_idx" ON "CashSnapshot"("companyId", "snapshotDate" DESC);
      CREATE INDEX IF NOT EXISTS "CashSnapshot_companyId_frequency_snapshotDate_idx" ON "CashSnapshot"("companyId", "frequency", "snapshotDate" DESC);
      CREATE INDEX IF NOT EXISTS "CashSnapshot_companyId_accountId_idx" ON "CashSnapshot"("companyId", "accountId");
    `);
    
    // ARAgingSnapshot
    console.log('Creating ARAgingSnapshot...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ARAgingSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "snapshotDate" TIMESTAMP(3) NOT NULL,
        "frequency" TEXT NOT NULL DEFAULT 'monthly',
        "totalAR" DOUBLE PRECISION NOT NULL,
        "current" DOUBLE PRECISION NOT NULL,
        "days1to30" DOUBLE PRECISION NOT NULL,
        "days31to60" DOUBLE PRECISION NOT NULL,
        "days61to90" DOUBLE PRECISION NOT NULL,
        "days90plus" DOUBLE PRECISION NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ARAgingSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS "ARAgingSnapshot_companyId_snapshotDate_idx" ON "ARAgingSnapshot"("companyId", "snapshotDate" DESC);
      CREATE INDEX IF NOT EXISTS "ARAgingSnapshot_companyId_frequency_snapshotDate_idx" ON "ARAgingSnapshot"("companyId", "frequency", "snapshotDate" DESC);
    `);
    
    // APAgingSnapshot
    console.log('Creating APAgingSnapshot...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "APAgingSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "snapshotDate" TIMESTAMP(3) NOT NULL,
        "frequency" TEXT NOT NULL DEFAULT 'monthly',
        "totalAP" DOUBLE PRECISION NOT NULL,
        "current" DOUBLE PRECISION NOT NULL,
        "days1to30" DOUBLE PRECISION NOT NULL,
        "days31to60" DOUBLE PRECISION NOT NULL,
        "days61to90" DOUBLE PRECISION NOT NULL,
        "days90plus" DOUBLE PRECISION NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "APAgingSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS "APAgingSnapshot_companyId_snapshotDate_idx" ON "APAgingSnapshot"("companyId", "snapshotDate" DESC);
      CREATE INDEX IF NOT EXISTS "APAgingSnapshot_companyId_frequency_snapshotDate_idx" ON "APAgingSnapshot"("companyId", "frequency", "snapshotDate" DESC);
    `);
    
    // CustomerSalesSnapshot
    console.log('Creating CustomerSalesSnapshot...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CustomerSalesSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "snapshotDate" TIMESTAMP(3) NOT NULL,
        "frequency" TEXT NOT NULL DEFAULT 'monthly',
        "customerId" TEXT,
        "customerName" TEXT NOT NULL,
        "revenue" DOUBLE PRECISION NOT NULL,
        "invoiceCount" INTEGER NOT NULL,
        "avgInvoiceSize" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CustomerSalesSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS "CustomerSalesSnapshot_companyId_snapshotDate_idx" ON "CustomerSalesSnapshot"("companyId", "snapshotDate" DESC);
      CREATE INDEX IF NOT EXISTS "CustomerSalesSnapshot_companyId_frequency_snapshotDate_idx" ON "CustomerSalesSnapshot"("companyId", "frequency", "snapshotDate" DESC);
    `);
    
    // ProductSalesSnapshot
    console.log('Creating ProductSalesSnapshot...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ProductSalesSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "snapshotDate" TIMESTAMP(3) NOT NULL,
        "frequency" TEXT NOT NULL DEFAULT 'monthly',
        "itemId" TEXT,
        "itemName" TEXT NOT NULL,
        "sku" TEXT,
        "quantitySold" DOUBLE PRECISION NOT NULL,
        "revenue" DOUBLE PRECISION NOT NULL,
        "cogs" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProductSalesSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS "ProductSalesSnapshot_companyId_snapshotDate_idx" ON "ProductSalesSnapshot"("companyId", "snapshotDate" DESC);
      CREATE INDEX IF NOT EXISTS "ProductSalesSnapshot_companyId_frequency_snapshotDate_idx" ON "ProductSalesSnapshot"("companyId", "frequency", "snapshotDate" DESC);
    `);
    
    // InventorySnapshot
    console.log('Creating InventorySnapshot...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "InventorySnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "snapshotDate" TIMESTAMP(3) NOT NULL,
        "frequency" TEXT NOT NULL DEFAULT 'monthly',
        "itemId" TEXT,
        "itemName" TEXT NOT NULL,
        "sku" TEXT,
        "qtyOnHand" DOUBLE PRECISION NOT NULL,
        "assetValue" DOUBLE PRECISION NOT NULL,
        "avgCost" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "InventorySnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS "InventorySnapshot_companyId_snapshotDate_idx" ON "InventorySnapshot"("companyId", "snapshotDate" DESC);
      CREATE INDEX IF NOT EXISTS "InventorySnapshot_companyId_frequency_snapshotDate_idx" ON "InventorySnapshot"("companyId", "frequency", "snapshotDate" DESC);
    `);
    
    console.log('\n✅ All operational data tables created successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

createTables();

