import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { buildOperationalMockResponse, buildOperationalMockSummaryCounts } from '@/lib/operations/sector-mock-data';

export const dynamic = 'force-dynamic';

async function companyHasAnyRealOperationalData(companyId: string): Promise<boolean> {
  const [
    customers,
    arAging,
    apAging,
    products,
    inventory,
    cash,
    arOpenInvoices,
    arPayments,
    apOpenBills,
    apPayments,
  ] = await Promise.all([
    prisma.customerSalesSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.aRAgingSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.aPAgingSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.productSalesSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.inventorySnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.cashSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.aROpenInvoiceSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    prisma.aRPaymentFact.findFirst({ where: { companyId }, select: { id: true } }),
    (prisma as any).aPOpenBillSnapshot.findFirst({ where: { companyId }, select: { id: true } }),
    (prisma as any).aPPaymentFact.findFirst({ where: { companyId }, select: { id: true } }),
  ]);
  return Boolean(
    customers ||
      arAging ||
      apAging ||
      products ||
      inventory ||
      cash ||
      arOpenInvoices ||
      arPayments ||
      apOpenBills ||
      apPayments
  );
}

async function activateRealOperationalData(companyId: string): Promise<void> {
  await prisma.company.updateMany({
    where: {
      id: companyId,
      hasRealOperationalData: false,
    },
    data: {
      hasRealOperationalData: true,
      realDataActivatedAt: new Date(),
    },
  });
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/**
 * GET /api/operational-data
 * 
 * Query parameters:
 * - companyId: string (required)
 * - type: 'customers' | 'ar-aging' | 'ap-aging' | 'products' | 'inventory' | 'cash' | 'daily-financials'
 * - startDate: ISO date string (optional) - defaults to 90 days ago
 * - endDate: ISO date string (optional) - defaults to today
 * - frequency: 'daily' | 'weekly' | 'monthly' (optional) - defaults to 'monthly'
 * - limit: number (optional) - max records to return
 * - sectorCategory: NAICS sector code (optional) - falls back to company sector
 */
export async function GET(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    // SECURITY: Require authentication
    await requireAuth();
    
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');
    const type = searchParams.get('type');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const frequency = (searchParams.get('frequency') || 'monthly') as 'daily' | 'weekly' | 'monthly';
    const limit = parseInt(searchParams.get('limit') || '1000');
    const sectorCategoryParam = searchParams.get('sectorCategory');

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
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        industrySectorCategory: true,
        hasRealOperationalData: true,
        forceOperationalMockData: true,
      },
    });
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    const hasAnyRealData = await companyHasAnyRealOperationalData(companyId);
    let hasRealOperationalData = company.hasRealOperationalData;
    if (hasAnyRealData && !hasRealOperationalData) {
      await activateRealOperationalData(companyId);
      hasRealOperationalData = true;
    }
    // Explicit admin override for demos: if enabled, use mock/fallback operational responses
    // in any environment (including production).
    const shouldUseMockData = company.forceOperationalMockData === true;

    const sectorCategory = sectorCategoryParam || company?.industrySectorCategory || '01';

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

        if (!data.length && shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'customers',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

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

        let unpaidByCustomer: Array<{
          customerName: string;
          current: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          days90plus: number;
          totalDue: number;
        }> = [];
        let unpaidInvoices: Array<{
          customerName: string;
          customerNumber: string;
          invoiceDate: string | null;
          dueDate: string | null;
          amountDue: number;
        }> = [];
        let customerInvoices: Array<{
          customerName: string;
          invoiceNo: string;
          date: string | null;
          dueDate: string | null;
          currency: string;
          amountCurrency: number;
          amountHome: number;
          amountDueHome: number;
        }> = [];
        let paidInvoices: Array<{
          customerName: string;
          currentMonth: number;
          lastMonth: number;
          last12Months: number;
        }> = [];

        const latestOpenSnapshotDate = await prisma.aROpenInvoiceSnapshot.findFirst({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });

        if (latestOpenSnapshotDate?.snapshotDate) {
          const openRows = await prisma.aROpenInvoiceSnapshot.findMany({
            where: {
              companyId,
              frequency,
              snapshotDate: latestOpenSnapshotDate.snapshotDate,
            },
            orderBy: [{ amountDueHome: 'desc' }],
            take: Math.max(limit, 500),
          });

          const customerAging = openRows.reduce((acc: Record<string, any>, row: any) => {
            const name = row.customerName || 'Unknown Customer';
            if (!acc[name]) {
              acc[name] = {
                customerName: name,
                current: 0,
                days1to30: 0,
                days31to60: 0,
                days61to90: 0,
                days90plus: 0,
                totalDue: 0,
              };
            }
            const bucketCurrent = Number(row.current || 0);
            const bucket1to30 = Number(row.days1to30 || 0);
            const bucket31to60 = Number(row.days31to60 || 0);
            const bucket61to90 = Number(row.days61to90 || 0);
            const bucket90plus = Number(row.days90plus || 0);
            const openAmount = Number(row.amountDueHome || 0);
            acc[name].current += bucketCurrent;
            acc[name].days1to30 += bucket1to30;
            acc[name].days31to60 += bucket31to60;
            acc[name].days61to90 += bucket61to90;
            acc[name].days90plus += bucket90plus;
            acc[name].totalDue +=
              bucketCurrent + bucket1to30 + bucket31to60 + bucket61to90 + bucket90plus > 0
                ? bucketCurrent + bucket1to30 + bucket31to60 + bucket61to90 + bucket90plus
                : openAmount;
            return acc;
          }, {});

          unpaidByCustomer = Object.values(customerAging)
            .sort((a: any, b: any) => b.totalDue - a.totalDue)
            .slice(0, 25) as any[];

          unpaidInvoices = openRows
            .filter((row: any) => Number(row.amountDueHome || 0) > 0)
            .slice(0, 250)
            .map((row: any) => ({
              customerName: row.customerName || 'Unknown Customer',
              customerNumber: row.customerId || '-',
              invoiceDate: row.invoiceDate ? new Date(row.invoiceDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              amountDue: Number(row.amountDueHome || 0),
            }));

          customerInvoices = openRows.slice(0, 500).map((row: any) => ({
            customerName: row.customerName || 'Unknown Customer',
            invoiceNo: row.invoiceNo || '-',
            date: row.invoiceDate ? new Date(row.invoiceDate).toISOString().split('T')[0] : null,
            dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
            currency: row.currencyCode || 'USD',
            amountCurrency: Number(row.amountCurrency || row.amountHome || 0),
            amountHome: Number(row.amountHome || row.amountDueHome || 0),
            amountDueHome: Number(row.amountDueHome || 0),
          }));
        }

        const monthStart = startOfMonth(endDate);
        const lastMonthStart = addMonths(monthStart, -1);
        const trailing12Start = addMonths(monthStart, -11);
        const paymentRows = await prisma.aRPaymentFact.findMany({
          where: {
            companyId,
            paymentDate: {
              gte: trailing12Start,
              lte: endDate,
            },
          },
          orderBy: [{ paymentDate: 'desc' }],
          take: Math.max(limit * 5, 2000),
        });

        if (paymentRows.length) {
          const grouped = paymentRows.reduce((acc: Record<string, any>, row: any) => {
            const name = row.customerName || 'Unknown Customer';
            if (!acc[name]) {
              acc[name] = {
                customerName: name,
                currentMonth: 0,
                lastMonth: 0,
                last12Months: 0,
              };
            }
            const dt = new Date(row.paymentDate);
            const amount = Number(row.paidAmountHome || 0);
            if (dt >= monthStart && dt <= endDate) acc[name].currentMonth += amount;
            if (dt >= lastMonthStart && dt < monthStart) acc[name].lastMonth += amount;
            if (dt >= trailing12Start && dt <= endDate) acc[name].last12Months += amount;
            return acc;
          }, {});
          paidInvoices = Object.values(grouped)
            .sort((a: any, b: any) => b.last12Months - a.last12Months)
            .slice(0, 25) as any[];
        }

        if (!data.length && shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'ar-aging',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        return NextResponse.json({
          records: data,
          summary: agingMetrics
            ? {
                ...agingMetrics,
                breakdown: unpaidByCustomer,
                unpaidByCustomer,
                unpaidInvoices,
                paidInvoices,
                customerInvoices,
              }
            : agingMetrics,
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

        let unpaidByVendor: Array<{
          vendorName: string;
          current: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          days90plus: number;
          totalDue: number;
        }> = [];
        let unpaidBills: Array<{
          vendorName: string;
          billNo: string;
          date: string | null;
          dueDate: string | null;
          amountDue: number;
        }> = [];
        let vendorBills: Array<{
          vendorName: string;
          billNo: string;
          date: string | null;
          dueDate: string | null;
          currency: string;
          amountCurrency: number;
          amountHome: number;
          amountDueHome: number;
        }> = [];
        let paidBills: Array<{
          vendorName: string;
          currentMonth: number;
          lastMonth: number;
          last12Months: number;
        }> = [];

        const latestOpenBillsSnapshotDate = await (prisma as any).aPOpenBillSnapshot.findFirst({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });

        if (latestOpenBillsSnapshotDate?.snapshotDate) {
          const openBillRows = await (prisma as any).aPOpenBillSnapshot.findMany({
            where: {
              companyId,
              frequency,
              snapshotDate: latestOpenBillsSnapshotDate.snapshotDate,
            },
            orderBy: [{ amountDueHome: 'desc' }],
            take: Math.max(limit, 500),
          });

          const vendorAging = openBillRows.reduce((acc: Record<string, any>, row: any) => {
            const name = row.vendorName || 'Unknown Vendor';
            if (!acc[name]) {
              acc[name] = {
                vendorName: name,
                current: 0,
                days1to30: 0,
                days31to60: 0,
                days61to90: 0,
                days90plus: 0,
                totalDue: 0,
              };
            }
            const bucketCurrent = Number(row.current || 0);
            const bucket1to30 = Number(row.days1to30 || 0);
            const bucket31to60 = Number(row.days31to60 || 0);
            const bucket61to90 = Number(row.days61to90 || 0);
            const bucket90plus = Number(row.days90plus || 0);
            const openAmount = Number(row.amountDueHome || 0);
            acc[name].current += bucketCurrent;
            acc[name].days1to30 += bucket1to30;
            acc[name].days31to60 += bucket31to60;
            acc[name].days61to90 += bucket61to90;
            acc[name].days90plus += bucket90plus;
            acc[name].totalDue +=
              bucketCurrent + bucket1to30 + bucket31to60 + bucket61to90 + bucket90plus > 0
                ? bucketCurrent + bucket1to30 + bucket31to60 + bucket61to90 + bucket90plus
                : openAmount;
            return acc;
          }, {});

          unpaidByVendor = Object.values(vendorAging)
            .sort((a: any, b: any) => b.totalDue - a.totalDue)
            .slice(0, 25) as any[];

          unpaidBills = openBillRows
            .filter((row: any) => Number(row.amountDueHome || 0) > 0)
            .slice(0, 250)
            .map((row: any) => ({
              vendorName: row.vendorName || 'Unknown Vendor',
              billNo: row.billNo || '-',
              date: row.billDate ? new Date(row.billDate).toISOString().split('T')[0] : null,
              dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
              amountDue: Number(row.amountDueHome || 0),
            }));

          vendorBills = openBillRows.slice(0, 500).map((row: any) => ({
            vendorName: row.vendorName || 'Unknown Vendor',
            billNo: row.billNo || '-',
            date: row.billDate ? new Date(row.billDate).toISOString().split('T')[0] : null,
            dueDate: row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : null,
            currency: row.currencyCode || 'USD',
            amountCurrency: Number(row.amountCurrency || row.amountHome || 0),
            amountHome: Number(row.amountHome || row.amountDueHome || 0),
            amountDueHome: Number(row.amountDueHome || 0),
          }));
        }

        const apMonthStart = startOfMonth(endDate);
        const apLastMonthStart = addMonths(apMonthStart, -1);
        const apTrailing12Start = addMonths(apMonthStart, -11);
        const apPaymentRows = await (prisma as any).aPPaymentFact.findMany({
          where: {
            companyId,
            paymentDate: {
              gte: apTrailing12Start,
              lte: endDate,
            },
          },
          orderBy: [{ paymentDate: 'desc' }],
          take: Math.max(limit * 5, 2000),
        });

        if (apPaymentRows.length) {
          const grouped = apPaymentRows.reduce((acc: Record<string, any>, row: any) => {
            const name = row.vendorName || 'Unknown Vendor';
            if (!acc[name]) {
              acc[name] = {
                vendorName: name,
                currentMonth: 0,
                lastMonth: 0,
                last12Months: 0,
              };
            }
            const dt = new Date(row.paymentDate);
            const amount = Number(row.paidAmountHome || 0);
            if (dt >= apMonthStart && dt <= endDate) acc[name].currentMonth += amount;
            if (dt >= apLastMonthStart && dt < apMonthStart) acc[name].lastMonth += amount;
            if (dt >= apTrailing12Start && dt <= endDate) acc[name].last12Months += amount;
            return acc;
          }, {});
          paidBills = Object.values(grouped)
            .sort((a: any, b: any) => b.last12Months - a.last12Months)
            .slice(0, 25) as any[];
        }

        if (!data.length && shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'ap-aging',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        return NextResponse.json({
          records: data,
          summary: apMetrics
            ? {
                ...apMetrics,
                breakdown: unpaidByVendor,
                unpaidByVendor,
                unpaidBills,
                paidBills,
                vendorBills,
              }
            : apMetrics,
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

        if (!data.length && shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'products',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

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

        if (!data.length && shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'inventory',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

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

        if (!data.length && shouldUseMockData) {
          return NextResponse.json(
            buildOperationalMockResponse({
              type: 'cash',
              companyId,
              sectorCategory,
              frequency,
              startDate,
              endDate,
              limit,
            })
          );
        }

        return NextResponse.json({
          records: data,
          summary: cashMetrics,
        });

      case 'daily-financials':
        // Financial snapshots used by Operations (daily/weekly/monthly).
        const dailySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
        const dailyMappedLineDelegate = (prisma as any).dailyFinancialMappedLine;
        if (!dailySnapshotDelegate) {
          return NextResponse.json({
            records: [],
            summary: {
              latestRevenue: 0,
              latestExpense: 0,
              latestNet: 0,
              latestCash: 0,
              message: 'Daily financial snapshots model not available yet.',
            },
          });
        }

        data = await dailySnapshotDelegate.findMany({
          where: {
            companyId,
            frequency,
            snapshotDate: dateFilter,
          },
          orderBy: { snapshotDate: 'desc' },
          take: limit,
        });

        if (!data.length) {
          return NextResponse.json({
            records: [],
            summary: {
              latestRevenue: 0,
              latestExpense: 0,
              latestNet: 0,
              latestCash: 0,
              days: 0,
            },
          });
        }

        const latestDaily = data[0];
        const previousDaily = data[1] || latestDaily;
        const latestRevenue = Number(latestDaily.revenue || 0);
        const latestExpense = Number(latestDaily.expense || 0);
        const latestNet = latestRevenue - latestExpense;
        const previousNet = Number(previousDaily.revenue || 0) - Number(previousDaily.expense || 0);
        const netChange = latestNet - previousNet;
        const mappedLines = dailyMappedLineDelegate
          ? await dailyMappedLineDelegate.findMany({
              where: {
                companyId,
                frequency,
                snapshotDate: dateFilter,
              },
              orderBy: [{ snapshotDate: 'desc' }, { sourceAccountName: 'asc' }],
              take: Math.max(limit * 200, 3000),
            })
          : [];

        return NextResponse.json({
          records: data,
          mappedLines,
          summary: {
            latestRevenue,
            latestExpense,
            latestNet,
            latestCash: Number(latestDaily.cash || 0),
            latestAR: Number(latestDaily.ar || 0),
            latestAP: Number(latestDaily.ap || 0),
            netChange,
            days: data.length,
            mappedLineCount: mappedLines.length,
          },
        });

      default:
        // Get all data types summary
        const [customers, arAging, apAging, products, inventory, cash, dailyFinancials] = await Promise.all([
          prisma.customerSalesSnapshot.count({ where: { companyId } }),
          prisma.aRAgingSnapshot.count({ where: { companyId } }),
          prisma.aPAgingSnapshot.count({ where: { companyId } }),
          prisma.productSalesSnapshot.count({ where: { companyId } }),
          prisma.inventorySnapshot.count({ where: { companyId } }),
          prisma.cashSnapshot.count({ where: { companyId } }),
          (prisma as any).dailyFinancialSnapshot
            ? (prisma as any).dailyFinancialSnapshot.count({ where: { companyId } })
            : Promise.resolve(0),
        ]);

        const summary = {
          customerSalesRecords: customers,
          arAgingRecords: arAging,
          apAgingRecords: apAging,
          productSalesRecords: products,
          inventoryRecords: inventory,
          cashRecords: cash,
          dailyFinancialRecords: dailyFinancials,
        };
        if (!customers && !arAging && !apAging && !products && !inventory && !cash && !dailyFinancials && shouldUseMockData) {
          return NextResponse.json({
            summary: buildOperationalMockSummaryCounts(sectorCategory),
          });
        }

        return NextResponse.json({
          summary: {
            ...summary,
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

