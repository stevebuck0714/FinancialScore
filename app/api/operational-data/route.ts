import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

/**
 * GET /api/operational-data
 * 
 * Query parameters:
 * - companyId: string (required)
 * - type: 'customers' | 'ar-aging' | 'ap-aging' | 'products' | 'inventory' | 'cash'
 * - startDate: ISO date string (optional) - defaults to 90 days ago
 * - endDate: ISO date string (optional) - defaults to today
 * - frequency: 'daily' | 'weekly' | 'monthly' (optional) - defaults to 'monthly'
 * - limit: number (optional) - max records to return
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    await requireAuth();
    
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');
    const type = searchParams.get('type');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const frequency = searchParams.get('frequency') || 'monthly';
    const limit = parseInt(searchParams.get('limit') || '1000');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // SECURITY: Validate access to company data
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('OperationalData', companyId, 'READ');
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    // Default date range: last 90 days
    const defaultEndDate = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 90);

    const startDate = startDateParam ? new Date(startDateParam) : defaultStartDate;
    const endDate = endDateParam ? new Date(endDateParam) : defaultEndDate;

    // Build date filter
    const dateFilter = {
      gte: startDate,
      lte: endDate,
    };

    let data;

    switch (type) {
      case 'customers':
        // Get customer sales data
        data = await prisma.customerSalesSnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        // Calculate top customers
        const customerTotals = data.reduce((acc, record) => {
          if (!acc[record.customerName]) {
            acc[record.customerName] = {
              name: record.customerName,
              totalRevenue: 0,
              totalInvoices: 0,
            };
          }
          acc[record.customerName].totalRevenue += record.revenue;
          acc[record.customerName].totalInvoices += record.invoiceCount;
          return acc;
        }, {} as Record<string, any>);

        return NextResponse.json({
          records: data,
          summary: {
            topCustomers: Object.values(customerTotals)
              .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
              .slice(0, 10),
          },
        });

      case 'ar-aging':
        // Get AR aging data
        data = await prisma.aRAgingSnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        // Calculate aging trends
        const latestAR = data[0];
        const agingMetrics = latestAR
          ? {
              totalAR: latestAR.totalAR,
              currentPct: (latestAR.current / latestAR.totalAR) * 100,
              over30Pct:
                ((latestAR.days1to30 + latestAR.days31to60 + latestAR.days61to90 + latestAR.days90plus) /
                  latestAR.totalAR) *
                100,
              over90Pct: (latestAR.days90plus / latestAR.totalAR) * 100,
              dso: calculateDSO(data), // Days Sales Outstanding estimate
            }
          : null;

        return NextResponse.json({
          records: data,
          summary: agingMetrics,
        });

      case 'ap-aging':
        // Get AP aging data
        data = await prisma.aPAgingSnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        // Calculate aging trends
        const latestAP = data[0];
        const apMetrics = latestAP
          ? {
              totalAP: latestAP.totalAP,
              currentPct: (latestAP.current / latestAP.totalAP) * 100,
              over30Pct:
                ((latestAP.days1to30 + latestAP.days31to60 + latestAP.days61to90 + latestAP.days90plus) /
                  latestAP.totalAP) *
                100,
              over90Pct: (latestAP.days90plus / latestAP.totalAP) * 100,
              dpo: calculateDPO(data), // Days Payable Outstanding estimate
            }
          : null;

        return NextResponse.json({
          records: data,
          summary: apMetrics,
        });

      case 'products':
        // Get product sales data
        data = await prisma.productSalesSnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        // Calculate product performance
        const productTotals = data.reduce((acc, record) => {
          if (!acc[record.itemName]) {
            acc[record.itemName] = {
              name: record.itemName,
              sku: record.sku,
              totalRevenue: 0,
              totalCogs: 0,
              totalQuantity: 0,
            };
          }
          acc[record.itemName].totalRevenue += record.revenue;
          acc[record.itemName].totalCogs += record.cogs || 0;
          acc[record.itemName].totalQuantity += record.quantitySold;
          return acc;
        }, {} as Record<string, any>);

        return NextResponse.json({
          records: data,
          summary: {
            topProducts: Object.values(productTotals)
              .map((p: any) => ({
                ...p,
                grossMargin: p.totalRevenue - p.totalCogs,
                grossMarginPct: ((p.totalRevenue - p.totalCogs) / p.totalRevenue) * 100,
              }))
              .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
              .slice(0, 10),
          },
        });

      case 'inventory':
        // Get inventory data
        data = await prisma.inventorySnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        // Calculate inventory metrics
        const latestInventory = data.filter(
          (record) =>
            record.snapshotDate.getTime() === Math.max(...data.map((r) => r.snapshotDate.getTime()))
        );

        const inventoryMetrics = {
          totalValue: latestInventory.reduce((sum, item) => sum + item.assetValue, 0),
          itemCount: latestInventory.length,
          topItems: latestInventory
            .sort((a, b) => b.assetValue - a.assetValue)
            .slice(0, 10),
        };

        return NextResponse.json({
          records: data,
          summary: inventoryMetrics,
        });

      case 'cash':
        // Get cash data
        data = await prisma.cashSnapshot.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        console.log(`💰 Cash API - frequency: ${frequency}, records returned: ${data.length}`);

        // Calculate cash metrics
        const latestCash = data.filter(
          (record) =>
            record.snapshotDate.getTime() === Math.max(...data.map((r) => r.snapshotDate.getTime()))
        );

        const totalCash = latestCash.reduce((sum, record) => sum + record.cashBalance, 0);
        const previousCash = data.filter(
          (record) => {
            const dates = [...new Set(data.map(r => r.snapshotDate.getTime()))].sort((a, b) => b - a);
            return record.snapshotDate.getTime() === dates[1];
          }
        );
        const previousTotal = previousCash.reduce((sum, record) => sum + record.cashBalance, 0);
        const changeAmount = previousTotal ? totalCash - previousTotal : 0;
        const changePercent = previousTotal ? (changeAmount / previousTotal) * 100 : 0;

        // Calculate average cash balance over the period
        const accountBalances = data.reduce((acc, record) => {
          if (!acc[record.accountName]) {
            acc[record.accountName] = [];
          }
          acc[record.accountName].push(record.cashBalance);
          return acc;
        }, {} as Record<string, number[]>);

        const accountSummaries = Object.entries(accountBalances).map(([name, balances]) => ({
          accountName: name,
          currentBalance: latestCash.find(r => r.accountName === name)?.cashBalance || 0,
          avgBalance: balances.reduce((sum, b) => sum + b, 0) / balances.length,
          minBalance: Math.min(...balances),
          maxBalance: Math.max(...balances),
        })).sort((a, b) => b.currentBalance - a.currentBalance);

        const cashMetrics = {
          totalCash,
          changeAmount,
          changePercent,
          accountCount: latestCash.length,
          accounts: accountSummaries,
          avgTotalCash: data.length > 0 
            ? data.reduce((sum, r) => sum + r.cashBalance, 0) / data.length 
            : 0,
        };

        return NextResponse.json({
          records: data,
          summary: cashMetrics,
        });

      default:
        // Get all data types summary
        const [customers, arAging, apAging, products, inventory, cash] = await Promise.all([
          prisma.customerSalesSnapshot.count({ where: { companyId } }),
          prisma.aRAgingSnapshot.count({ where: { companyId } }),
          prisma.aPAgingSnapshot.count({ where: { companyId } }),
          prisma.productSalesSnapshot.count({ where: { companyId } }),
          prisma.inventorySnapshot.count({ where: { companyId } }),
          prisma.cashSnapshot.count({ where: { companyId } }),
        ]);

        return NextResponse.json({
          summary: {
            customerSalesRecords: customers,
            arAgingRecords: arAging,
            apAgingRecords: apAging,
            productSalesRecords: products,
            inventoryRecords: inventory,
            cashRecords: cash,
          },
        });
    }
  } catch (error) {
    console.error('Error fetching operational data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch operational data' },
      { status: 500 }
    );
  }
}

// Helper function to calculate Days Sales Outstanding (simplified)
function calculateDSO(arData: any[]): number {
  if (arData.length < 2) return 0;
  
  const latest = arData[0];
  const avgAR = arData.slice(0, 3).reduce((sum, r) => sum + r.totalAR, 0) / Math.min(3, arData.length);
  
  // Estimate daily sales (would need revenue data for accurate calculation)
  // For now, assume AR represents ~45 days of sales
  const estimatedDailySales = avgAR / 45;
  return estimatedDailySales > 0 ? latest.totalAR / estimatedDailySales : 0;
}

// Helper function to calculate Days Payable Outstanding (simplified)
function calculateDPO(apData: any[]): number {
  if (apData.length < 2) return 0;
  
  const latest = apData[0];
  const avgAP = apData.slice(0, 3).reduce((sum, r) => sum + r.totalAP, 0) / Math.min(3, apData.length);
  
  // Estimate daily purchases (would need COGS data for accurate calculation)
  // For now, assume AP represents ~30 days of purchases
  const estimatedDailyPurchases = avgAP / 30;
  return estimatedDailyPurchases > 0 ? latest.totalAP / estimatedDailyPurchases : 0;
}

