import prisma from '@/lib/prisma';

type ProvisionDemoWorkspaceParams = {
  companyId: string;
  userId: string;
  userEmail: string;
  companyName: string;
};

type Frequency = 'daily' | 'weekly' | 'monthly';

function listDates(startDate: Date, endDate: Date, frequency: Frequency): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    dates.push(new Date(cursor));
    if (frequency === 'daily') cursor.setDate(cursor.getDate() + 1);
    else if (frequency === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return dates;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export async function provisionDemoWorkspace(params: ProvisionDemoWorkspaceParams): Promise<void> {
  const { companyId, userId, userEmail, companyName } = params;

  const now = new Date();
  const monthlyDates = listDates(new Date(now.getFullYear() - 1, now.getMonth(), 1), now, 'monthly');
  const weeklyDates = listDates(new Date(now.getTime() - 16 * 7 * 24 * 60 * 60 * 1000), now, 'weekly');
  const dailyDates = listDates(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), now, 'daily');

  await prisma.$transaction(async (tx) => {
    const requestUser = userId
      ? await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, companyId: true },
        })
      : null;

    const fallbackCompanyUser = await tx.user.findFirst({
      where: { companyId },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    const effectiveUser = requestUser?.companyId === companyId ? requestUser : fallbackCompanyUser;
    if (!effectiveUser) {
      throw new Error(`No valid company user found for demo provisioning (companyId=${companyId})`);
    }

    await Promise.all([
      tx.customerSalesSnapshot.deleteMany({ where: { companyId } }),
      tx.aRAgingSnapshot.deleteMany({ where: { companyId } }),
      tx.aPAgingSnapshot.deleteMany({ where: { companyId } }),
      tx.aROpenInvoiceSnapshot.deleteMany({ where: { companyId } }),
      tx.aRPaymentFact.deleteMany({ where: { companyId } }),
      tx.aPOpenBillSnapshot.deleteMany({ where: { companyId } }),
      tx.aPPaymentFact.deleteMany({ where: { companyId } }),
      tx.customerOrderLineSnapshot.deleteMany({ where: { companyId } }),
      tx.salesInvoiceHeaderSnapshot.deleteMany({ where: { companyId } }),
      tx.gLTransactionFact.deleteMany({ where: { companyId } }),
      tx.aRInvoiceDetail.deleteMany({ where: { companyId } }),
      tx.aRInvoiceOriginMap.deleteMany({ where: { companyId } }),
      tx.customerContractStatus.deleteMany({ where: { companyId } }),
      tx.customerCashFlow.deleteMany({ where: { companyId } }),
      tx.productSalesSnapshot.deleteMany({ where: { companyId } }),
      tx.inventorySnapshot.deleteMany({ where: { companyId } }),
      tx.cashSnapshot.deleteMany({ where: { companyId } }),
      tx.dailyFinancialMappedLine.deleteMany({ where: { companyId } }),
      tx.dailyFinancialSnapshot.deleteMany({ where: { companyId } }),
      tx.monthlyFinancial.deleteMany({ where: { companyId } }),
      tx.financialRecord.deleteMany({ where: { companyId } }),
    ]);

    const financialRecord = await tx.financialRecord.create({
      data: {
        companyId,
        uploadedByUserId: effectiveUser.id,
        fileName: 'demo-seeded-data',
        rawData: { source: 'demo_provisioning', generatedAt: now.toISOString() },
        columnMapping: { type: 'demo_seed' },
      },
    });

    const monthlyFinancialRows = monthlyDates.map((date, idx) => {
      const growth = 1 + idx * 0.012;
      const revenue = Math.round(rand(190000, 260000) * growth);
      const cogsTotal = Math.round(revenue * rand(0.33, 0.42));
      const expense = Math.round(revenue * rand(0.35, 0.48));
      const cogsPayroll = Math.round(cogsTotal * rand(0.28, 0.34));
      const cogsMaterials = Math.round(cogsTotal * rand(0.24, 0.31));
      const cogsContractors = Math.round(cogsTotal * rand(0.10, 0.15));
      const cogsCommissions = Math.round(cogsTotal * rand(0.03, 0.06));
      const cogsOwnerPay = Math.round(cogsTotal * rand(0.03, 0.06));
      const cogsOther = Math.max(
        0,
        cogsTotal -
          cogsPayroll -
          cogsMaterials -
          cogsContractors -
          cogsCommissions -
          cogsOwnerPay
      );

      const payroll = Math.round(expense * rand(0.18, 0.24));
      const ownerBasePay = Math.round(expense * rand(0.03, 0.06));
      const benefits = Math.round(expense * rand(0.03, 0.06));
      const insurance = Math.round(expense * rand(0.02, 0.04));
      const professionalFees = Math.round(expense * rand(0.03, 0.06));
      const subcontractors = Math.round(expense * rand(0.04, 0.08));
      const rent = Math.round(expense * rand(0.05, 0.09));
      const taxLicense = Math.round(expense * rand(0.01, 0.03));
      const stateIncomeTaxes = Math.round(expense * rand(0.01, 0.03));
      const federalIncomeTaxes = Math.round(expense * rand(0.02, 0.05));
      const phoneComm = Math.round(expense * rand(0.01, 0.02));
      const infrastructure = Math.round(expense * rand(0.02, 0.04));
      const autoTravel = Math.round(expense * rand(0.02, 0.04));
      const salesExpense = Math.round(expense * rand(0.02, 0.05));
      const marketing = Math.round(expense * rand(0.03, 0.06));
      const trainingCert = Math.round(expense * rand(0.005, 0.015));
      const mealsEntertainment = Math.round(expense * rand(0.004, 0.014));
      const interestExpense = Math.round(expense * rand(0.01, 0.03));
      const depreciationAmortization = Math.round(expense * rand(0.02, 0.04));
      const allocatedExpense =
        payroll +
        ownerBasePay +
        benefits +
        insurance +
        professionalFees +
        subcontractors +
        rent +
        taxLicense +
        stateIncomeTaxes +
        federalIncomeTaxes +
        phoneComm +
        infrastructure +
        autoTravel +
        salesExpense +
        marketing +
        trainingCert +
        mealsEntertainment +
        interestExpense +
        depreciationAmortization;
      const otherExpense = Math.max(0, expense - allocatedExpense);
      const nonOperatingIncome = Math.round(rand(800, 4500));
      const nonOperatingExpense = Math.round(rand(600, 2800));
      const extraordinaryItems = 0;
      const cash = Math.round(rand(85000, 170000) * growth);
      const ar = Math.round(rand(60000, 130000));
      const inventory = Math.round(rand(50000, 140000));
      const ap = Math.round(rand(35000, 90000));
      const totalAssets = cash + ar + inventory + Math.round(rand(180000, 320000));
      const totalLiab = ap + Math.round(rand(90000, 210000));
      const totalEquity = totalAssets - totalLiab;

      return {
        companyId,
        financialRecordId: financialRecord.id,
        monthDate: new Date(date.getFullYear(), date.getMonth(), 1),
        revenue,
        expense,
        cogsPayroll,
        cogsOwnerPay,
        cogsContractors,
        cogsMaterials,
        cogsCommissions,
        cogsOther,
        cogsTotal,
        payroll,
        ownerBasePay,
        benefits,
        insurance,
        professionalFees,
        subcontractors,
        rent,
        taxLicense,
        stateIncomeTaxes,
        federalIncomeTaxes,
        phoneComm,
        infrastructure,
        autoTravel,
        salesExpense,
        marketing,
        trainingCert,
        mealsEntertainment,
        interestExpense,
        depreciationAmortization,
        otherExpense,
        nonOperatingIncome,
        nonOperatingExpense,
        extraordinaryItems,
        expenseBreakdown: {
          payroll,
          ownerBasePay,
          benefits,
          insurance,
          professionalFees,
          subcontractors,
          rent,
          taxLicense,
          stateIncomeTaxes,
          federalIncomeTaxes,
          phoneComm,
          infrastructure,
          autoTravel,
          salesExpense,
          marketing,
          trainingCert,
          mealsEntertainment,
          interestExpense,
          depreciationAmortization,
          otherExpense,
        },
        cash,
        ar,
        inventory,
        ap,
        totalAssets,
        totalLiab,
        totalEquity,
        totalLAndE: totalAssets,
      };
    });

    if (monthlyFinancialRows.length > 0) {
      await tx.monthlyFinancial.createMany({ data: monthlyFinancialRows });
    }

    const dailyFinancialRows = dailyDates.map((date, idx) => {
      const trend = 1 + idx * 0.0015;
      const revenue = Math.round(rand(5500, 10500) * trend);
      const expense = Math.round(revenue * rand(0.68, 0.83));
      const cogsTotal = Math.round(revenue * rand(0.32, 0.41));
      const cogsPayroll = Math.round(cogsTotal * rand(0.28, 0.34));
      const cogsMaterials = Math.round(cogsTotal * rand(0.24, 0.31));
      const cogsContractors = Math.round(cogsTotal * rand(0.10, 0.15));
      const cogsCommissions = Math.round(cogsTotal * rand(0.03, 0.06));
      const cogsOwnerPay = Math.round(cogsTotal * rand(0.03, 0.06));
      const cogsOther = Math.max(
        0,
        cogsTotal -
          cogsPayroll -
          cogsMaterials -
          cogsContractors -
          cogsCommissions -
          cogsOwnerPay
      );
      const payroll = Math.round(expense * rand(0.18, 0.24));
      const ownerBasePay = Math.round(expense * rand(0.03, 0.06));
      const benefits = Math.round(expense * rand(0.03, 0.06));
      const insurance = Math.round(expense * rand(0.02, 0.04));
      const professionalFees = Math.round(expense * rand(0.03, 0.06));
      const subcontractors = Math.round(expense * rand(0.04, 0.08));
      const rent = Math.round(expense * rand(0.05, 0.09));
      const taxLicense = Math.round(expense * rand(0.01, 0.03));
      const stateIncomeTaxes = Math.round(expense * rand(0.01, 0.03));
      const federalIncomeTaxes = Math.round(expense * rand(0.02, 0.05));
      const phoneComm = Math.round(expense * rand(0.01, 0.02));
      const infrastructure = Math.round(expense * rand(0.02, 0.04));
      const autoTravel = Math.round(expense * rand(0.02, 0.04));
      const salesExpense = Math.round(expense * rand(0.02, 0.05));
      const marketing = Math.round(expense * rand(0.03, 0.06));
      const trainingCert = Math.round(expense * rand(0.005, 0.015));
      const mealsEntertainment = Math.round(expense * rand(0.004, 0.014));
      const interestExpense = Math.round(expense * rand(0.01, 0.03));
      const depreciationAmortization = Math.round(expense * rand(0.02, 0.04));
      const allocatedExpense =
        payroll +
        ownerBasePay +
        benefits +
        insurance +
        professionalFees +
        subcontractors +
        rent +
        taxLicense +
        stateIncomeTaxes +
        federalIncomeTaxes +
        phoneComm +
        infrastructure +
        autoTravel +
        salesExpense +
        marketing +
        trainingCert +
        mealsEntertainment +
        interestExpense +
        depreciationAmortization;
      const otherExpense = Math.max(0, expense - allocatedExpense);
      const nonOperatingIncome = Math.round(rand(30, 240));
      const nonOperatingExpense = Math.round(rand(20, 180));
      const extraordinaryItems = 0;
      const cash = Math.round(rand(90000, 175000) * trend);
      const ar = Math.round(rand(55000, 125000));
      const inventory = Math.round(rand(42000, 118000));
      const ap = Math.round(rand(28000, 82000));
      const totalAssets = cash + ar + inventory + Math.round(rand(165000, 295000));
      const totalLiab = ap + Math.round(rand(82000, 185000));
      const totalEquity = totalAssets - totalLiab;

      return {
        companyId,
        snapshotDate: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        frequency: 'daily',
        sourcePlatform: 'DEMO_SEED',
        sourceRunId: `demo-${companyId}`,
        revenue,
        expense,
        cogsPayroll,
        cogsOwnerPay,
        cogsContractors,
        cogsMaterials,
        cogsCommissions,
        cogsOther,
        cogsTotal,
        payroll,
        ownerBasePay,
        benefits,
        insurance,
        professionalFees,
        subcontractors,
        rent,
        taxLicense,
        stateIncomeTaxes,
        federalIncomeTaxes,
        phoneComm,
        infrastructure,
        autoTravel,
        salesExpense,
        marketing,
        trainingCert,
        mealsEntertainment,
        interestExpense,
        depreciationAmortization,
        otherExpense,
        nonOperatingIncome,
        nonOperatingExpense,
        extraordinaryItems,
        cash,
        ar,
        inventory,
        ap,
        totalAssets,
        totalLiab,
        totalEquity,
        totalLAndE: totalAssets,
      };
    });

    if (dailyFinancialRows.length > 0) {
      await tx.dailyFinancialSnapshot.createMany({ data: dailyFinancialRows });
    }

    const mappedLineRows = dailyFinancialRows.flatMap((row) => [
      {
        companyId,
        snapshotDate: row.snapshotDate,
        frequency: 'daily',
        sourceAccountName: '41000 Service Revenue',
        sourceAccountId: '41000',
        targetField: 'revenue',
        amount: Number(row.revenue || 0),
        sourcePlatform: 'DEMO_SEED',
        sourceRunId: `demo-${companyId}`,
      },
      {
        companyId,
        snapshotDate: row.snapshotDate,
        frequency: 'daily',
        sourceAccountName: '51000 Payroll Expense',
        sourceAccountId: '51000',
        targetField: 'payroll',
        amount: Number(row.payroll || 0),
        sourcePlatform: 'DEMO_SEED',
        sourceRunId: `demo-${companyId}`,
      },
      {
        companyId,
        snapshotDate: row.snapshotDate,
        frequency: 'daily',
        sourceAccountName: '52000 Rent Expense',
        sourceAccountId: '52000',
        targetField: 'rent',
        amount: Number(row.rent || 0),
        sourcePlatform: 'DEMO_SEED',
        sourceRunId: `demo-${companyId}`,
      },
      {
        companyId,
        snapshotDate: row.snapshotDate,
        frequency: 'daily',
        sourceAccountName: '13000 Accounts Receivable',
        sourceAccountId: '13000',
        targetField: 'ar',
        amount: Number(row.ar || 0),
        sourcePlatform: 'DEMO_SEED',
        sourceRunId: `demo-${companyId}`,
      },
      {
        companyId,
        snapshotDate: row.snapshotDate,
        frequency: 'daily',
        sourceAccountName: '12000 Cash Operating',
        sourceAccountId: '12000',
        targetField: 'cash',
        amount: Number(row.cash || 0),
        sourcePlatform: 'DEMO_SEED',
        sourceRunId: `demo-${companyId}`,
      },
      {
        companyId,
        snapshotDate: row.snapshotDate,
        frequency: 'daily',
        sourceAccountName: '12000 Cash Operating',
        sourceAccountId: '12000',
        targetField: 'balance_movement:cash',
        amount: Number(row.revenue || 0) - Number(row.expense || 0),
        sourcePlatform: 'DEMO_SEED',
        sourceRunId: `demo-${companyId}`,
      },
    ]);
    if (mappedLineRows.length > 0) {
      await tx.dailyFinancialMappedLine.createMany({ data: mappedLineRows });
    }

    const customerNames = ['Atlas Manufacturing', 'Beacon Industrial', 'Northstar Fabrication', 'Summit Components', 'Pioneer Controls'];
    const productNames = ['Premium Unit', 'Standard Unit', 'Economy Unit', 'Service Package', 'Custom Line'];
    const cashAccounts = ['Operating Account', 'Savings Reserve'];

    const pushOpsRows = (
      frequency: Frequency,
      dates: Date[],
      container: {
        customerSales: any[];
        arAging: any[];
        apAging: any[];
        productSales: any[];
        inventory: any[];
        cash: any[];
      }
    ) => {
      dates.forEach((date, idx) => {
        const base = 1 + idx * (frequency === 'daily' ? 0.0008 : frequency === 'weekly' ? 0.0035 : 0.01);
        const totalAR = Math.round(rand(65000, 140000) * base);
        const totalAP = Math.round(rand(42000, 98000) * base);

        container.arAging.push({
          companyId,
          snapshotDate: new Date(date),
          frequency,
          totalAR,
          current: totalAR * 0.64,
          days1to30: totalAR * 0.18,
          days31to60: totalAR * 0.10,
          days61to90: totalAR * 0.05,
          days90plus: totalAR * 0.03,
        });

        container.apAging.push({
          companyId,
          snapshotDate: new Date(date),
          frequency,
          totalAP,
          current: totalAP * 0.67,
          days1to30: totalAP * 0.17,
          days31to60: totalAP * 0.09,
          days61to90: totalAP * 0.05,
          days90plus: totalAP * 0.02,
        });

        customerNames.forEach((name, i) => {
          const revenue = Math.round(rand(6000 + i * 1000, 14000 + i * 1400) * base);
          const invoiceCount = Math.max(1, Math.round(rand(2, 8)));
          container.customerSales.push({
            companyId,
            snapshotDate: new Date(date),
            frequency,
            customerId: `DEMO-C-${i + 1}`,
            customerName: name,
            revenue,
            invoiceCount,
            avgInvoiceSize: revenue / invoiceCount,
          });
        });

        productNames.forEach((name, i) => {
          const quantitySold = Math.round(rand(18 + i * 5, 60 + i * 8) * base);
          const unitPrice = rand(130, 520);
          const revenue = quantitySold * unitPrice;
          const cogs = revenue * rand(0.36, 0.58);
          container.productSales.push({
            companyId,
            snapshotDate: new Date(date),
            frequency,
            itemId: `DEMO-P-${i + 1}`,
            itemName: name,
            sku: `DEMO-SKU-${i + 1}`,
            quantitySold,
            revenue,
            cogs,
            grossMargin: revenue - cogs,
            grossMarginPct: revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0,
          });
          container.inventory.push({
            companyId,
            snapshotDate: new Date(date),
            frequency,
            itemId: `DEMO-I-${i + 1}`,
            itemName: name,
            sku: `DEMO-SKU-${i + 1}`,
            qtyOnHand: Math.round(rand(120, 620)),
            avgCost: rand(28, 140),
            assetValue: rand(18000, 98000),
          });
        });

        cashAccounts.forEach((accountName, i) => {
          container.cash.push({
            companyId,
            snapshotDate: new Date(date),
            frequency,
            accountId: `DEMO-CASH-${i + 1}`,
            accountName,
            accountNumber: `${4300 + i}`,
            cashBalance: Math.round(rand(65000, 185000) * base),
            changeAmount: rand(-6000, 9000),
            changePercent: rand(-4, 6),
          });
        });
      });
    };

    const opsRows = {
      customerSales: [] as any[],
      arAging: [] as any[],
      apAging: [] as any[],
      productSales: [] as any[],
      inventory: [] as any[],
      cash: [] as any[],
    };

    pushOpsRows('monthly', monthlyDates, opsRows);
    pushOpsRows('weekly', weeklyDates, opsRows);
    pushOpsRows('daily', dailyDates, opsRows);

    await Promise.all([
      tx.customerSalesSnapshot.createMany({ data: opsRows.customerSales }),
      tx.aRAgingSnapshot.createMany({ data: opsRows.arAging }),
      tx.aPAgingSnapshot.createMany({ data: opsRows.apAging }),
      tx.productSalesSnapshot.createMany({ data: opsRows.productSales }),
      tx.inventorySnapshot.createMany({ data: opsRows.inventory }),
      tx.cashSnapshot.createMany({ data: opsRows.cash }),
    ]);

    const arOpenInvoices: any[] = [];
    const arPayments: any[] = [];
    const apOpenBills: any[] = [];
    const apPayments: any[] = [];
    const customerOrderLines: any[] = [];
    const salesInvoiceHeaders: any[] = [];
    const glFacts: any[] = [];
    const arInvoiceDetails: any[] = [];
    const arOriginMapRows: any[] = [];
    const customerContractRows: any[] = [];
    const customerCashFlowRows: any[] = [];

    dailyDates.forEach((snapshotDate, dayIdx) => {
      customerNames.forEach((customerName, i) => {
        const invoiceNo = `INV-${snapshotDate.getFullYear()}${String(snapshotDate.getMonth() + 1).padStart(2, '0')}${String(snapshotDate.getDate()).padStart(2, '0')}-${i + 1}`;
        const amountDueHome = Math.round(rand(1200, 9800) * (1 + dayIdx * 0.002));
        const invoiceDate = new Date(snapshotDate);
        invoiceDate.setDate(invoiceDate.getDate() - Math.floor(rand(0, 35)));
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + 30);
        arOpenInvoices.push({
          companyId,
          snapshotDate: new Date(snapshotDate),
          frequency: 'daily',
          customerId: `DEMO-C-${i + 1}`,
          customerName,
          invoiceNo,
          invoiceDate,
          dueDate,
          status: dayIdx % 6 === 0 ? 'PAST_DUE' : 'OPEN',
          currencyCode: 'USD',
          amountCurrency: amountDueHome,
          amountHome: amountDueHome,
          amountDueHome,
          current: amountDueHome * 0.62,
          days1to30: amountDueHome * 0.20,
          days31to60: amountDueHome * 0.11,
          days61to90: amountDueHome * 0.05,
          days90plus: amountDueHome * 0.02,
        });
        arInvoiceDetails.push({
          companyId,
          asOfDate: new Date(snapshotDate),
          snapshotFrequency: 'daily',
          customerId: `DEMO-C-${i + 1}`,
          customerName,
          invoiceId: invoiceNo,
          invoiceDate,
          dueDate,
          invoiceAmount: amountDueHome,
          amountPaid: amountDueHome * 0.45,
          remainingBalance: amountDueHome * 0.55,
          sourceClass: 'NON_CONTRACT',
          sourceSystem: 'DEMO_SEED',
          sourceDocId: invoiceNo,
          sourceMatchConfidence: 'HIGH',
          sourceMatchedBy: 'INVOICE_NO',
          daysOutstanding: Math.max(0, Math.floor((snapshotDate.getTime() - invoiceDate.getTime()) / (24 * 60 * 60 * 1000))),
          agingBucket: dayIdx % 8 === 0 ? '61-90' : dayIdx % 3 === 0 ? '31-60' : '0-30',
        });
        arOriginMapRows.push({
          companyId,
          invoiceNoNormalized: invoiceNo.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
          customerId: `DEMO-C-${i + 1}`,
          customerKey: `DEMO-C-${i + 1}`,
          sourceClass: 'NON_CONTRACT',
          sourceSystem: 'DEMO_SEED',
          sourceDocId: invoiceNo,
          sourceInvoiceNoRaw: invoiceNo,
          matchConfidence: 'HIGH',
          matchedBy: 'INVOICE_NO',
        });

        const orderId = `SO-${snapshotDate.getFullYear()}${String(snapshotDate.getMonth() + 1).padStart(2, '0')}${String(i + 1).padStart(2, '0')}`;
        const lineId = `L-${(dayIdx % 4) + 1}`;
        const qtyOrdered = Math.round(rand(8, 42));
        const qtyInvoiced = Math.max(0, qtyOrdered - Math.round(rand(0, 4)));
        const unitPrice = Math.round(rand(160, 520));
        const contractValue = qtyOrdered * unitPrice;
        const invoicedAmount = qtyInvoiced * unitPrice;
        customerOrderLines.push({
          companyId,
          snapshotDate: new Date(snapshotDate),
          frequency: 'daily',
          customerId: `DEMO-C-${i + 1}`,
          customerName,
          orderId,
          lineId,
          orderDate: new Date(invoiceDate),
          itemId: `DEMO-P-${(i % productNames.length) + 1}`,
          itemName: productNames[i % productNames.length],
          sku: `DEMO-SKU-${(i % productNames.length) + 1}`,
          qtyOrdered,
          qtyInvoiced,
          unitPrice,
          contractValue,
          invoicedAmount,
          remainingAmount: Math.max(0, contractValue - invoicedAmount),
        });
        salesInvoiceHeaders.push({
          companyId,
          snapshotDate: new Date(snapshotDate),
          frequency: 'daily',
          orderId,
          invoiceNo,
          customerId: `DEMO-C-${i + 1}`,
          customerName,
          invoiceDate,
          sourcePlatform: 'DEMO_SEED',
          sourceProgram: 'DEMO',
          sourceTransaction: 'INVOICE',
        });
        customerContractRows.push({
          companyId,
          asOfDate: new Date(snapshotDate),
          customerId: `DEMO-C-${i + 1}`,
          customerName,
          contractId: `CT-${i + 1}`,
          contractValue: contractValue * 6,
          earnedToDate: contractValue * 2.8,
          invoicedToDate: contractValue * 2.4,
          remainingValue: contractValue * 3.2,
          accruedRevenueUnbilled: contractValue * 0.2,
          arOutstanding: amountDueHome,
          cashCollectedToDate: contractValue * 2.1,
          lastPaymentDate: new Date(snapshotDate.getTime() - 6 * 24 * 60 * 60 * 1000),
        });
        customerCashFlowRows.push({
          companyId,
          customerId: `DEMO-C-${i + 1}`,
          customerName,
          date: new Date(snapshotDate),
          cashInflow: Math.round(rand(1800, 7800)),
          source: 'DEMO_PAYMENT',
        });

        if (dayIdx % 3 === 0) {
          arPayments.push({
            companyId,
            paymentDate: new Date(snapshotDate),
            customerId: `DEMO-C-${i + 1}`,
            customerName,
            invoiceNo,
            currencyCode: 'USD',
            paidAmountCurrency: Math.round(amountDueHome * rand(0.25, 0.75)),
            paidAmountHome: Math.round(amountDueHome * rand(0.25, 0.75)),
            sourcePlatform: 'DEMO_SEED',
            sourceProgram: 'DEMO',
            sourceTransaction: 'AR_PAYMENT',
          });
        }
      });

      for (let v = 0; v < 5; v++) {
        const vendorName = `Vendor ${String(v + 1).padStart(2, '0')}`;
        const billNo = `BILL-${snapshotDate.getFullYear()}${String(snapshotDate.getMonth() + 1).padStart(2, '0')}${String(snapshotDate.getDate()).padStart(2, '0')}-${v + 1}`;
        const amountDueHome = Math.round(rand(900, 6400));
        const billDate = new Date(snapshotDate.getTime() - Math.floor(rand(0, 28)) * 24 * 60 * 60 * 1000);
        const dueDate = new Date(billDate);
        dueDate.setDate(dueDate.getDate() + 30);
        apOpenBills.push({
          companyId,
          snapshotDate: new Date(snapshotDate),
          frequency: 'daily',
          vendorId: `DEMO-V-${v + 1}`,
          vendorName,
          billNo,
          billDate,
          dueDate,
          status: dayIdx % 7 === 0 ? 'PAST_DUE' : 'OPEN',
          currencyCode: 'USD',
          amountCurrency: amountDueHome,
          amountHome: amountDueHome,
          amountDueHome,
          current: amountDueHome * 0.67,
          days1to30: amountDueHome * 0.18,
          days31to60: amountDueHome * 0.10,
          days61to90: amountDueHome * 0.04,
          days90plus: amountDueHome * 0.01,
        });
        if (dayIdx % 4 === 0) {
          apPayments.push({
            companyId,
            paymentDate: new Date(snapshotDate),
            vendorId: `DEMO-V-${v + 1}`,
            vendorName,
            billNo,
            currencyCode: 'USD',
            paidAmountCurrency: Math.round(amountDueHome * rand(0.35, 0.9)),
            paidAmountHome: Math.round(amountDueHome * rand(0.35, 0.9)),
            sourcePlatform: 'DEMO_SEED',
            sourceProgram: 'DEMO',
            sourceTransaction: 'AP_PAYMENT',
          });
        }
      }

      glFacts.push({
        companyId,
        transDate: new Date(snapshotDate),
        accountId: '4000',
        accountName: 'Service Revenue',
        accountType: 'Revenue',
        accountCategory: 'Revenue',
        signedAmount: Math.round(rand(6500, 15000)),
        creditAmount: Math.round(rand(6500, 15000)),
        drCr: 'CR',
        transNum: `GL-${snapshotDate.getTime()}-1`,
        ref: 'DEMO_REV',
        description: 'Demo revenue posting',
        sourcePlatform: 'DEMO_SEED',
      });
      glFacts.push({
        companyId,
        transDate: new Date(snapshotDate),
        accountId: '5100',
        accountName: 'Payroll Expense',
        accountType: 'Expense',
        accountCategory: 'Expense',
        signedAmount: -Math.round(rand(1800, 4200)),
        debitAmount: Math.round(rand(1800, 4200)),
        drCr: 'DR',
        transNum: `GL-${snapshotDate.getTime()}-2`,
        ref: 'DEMO_PAY',
        description: 'Demo payroll posting',
        sourcePlatform: 'DEMO_SEED',
      });
    });

    await Promise.all([
      tx.aROpenInvoiceSnapshot.createMany({ data: arOpenInvoices }),
      tx.aRPaymentFact.createMany({ data: arPayments }),
      tx.aPOpenBillSnapshot.createMany({ data: apOpenBills }),
      tx.aPPaymentFact.createMany({ data: apPayments }),
      tx.customerOrderLineSnapshot.createMany({ data: customerOrderLines }),
      tx.salesInvoiceHeaderSnapshot.createMany({ data: salesInvoiceHeaders }),
      tx.gLTransactionFact.createMany({ data: glFacts }),
      tx.aRInvoiceDetail.createMany({ data: arInvoiceDetails }),
      tx.aRInvoiceOriginMap.createMany({ data: arOriginMapRows }),
      tx.customerContractStatus.createMany({ data: customerContractRows }),
      tx.customerCashFlow.createMany({ data: customerCashFlowRows }),
    ]);

    await tx.auditLog.create({
      data: {
        userId: effectiveUser.id,
        userEmail: effectiveUser.email || userEmail,
        action: 'DEMO_DATA_PROVISIONED',
        entityType: 'Company',
        entityId: companyId,
        changes: {
          companyName,
          monthlyFinancialRows: monthlyFinancialRows.length,
          dailyFinancialRows: dailyFinancialRows.length,
          customerSalesRows: opsRows.customerSales.length,
          arAgingRows: opsRows.arAging.length,
          apAgingRows: opsRows.apAging.length,
          productSalesRows: opsRows.productSales.length,
          inventoryRows: opsRows.inventory.length,
          cashRows: opsRows.cash.length,
          arOpenInvoiceRows: arOpenInvoices.length,
          arPaymentRows: arPayments.length,
          apOpenBillRows: apOpenBills.length,
          apPaymentRows: apPayments.length,
          customerOrderLineRows: customerOrderLines.length,
          salesInvoiceHeaderRows: salesInvoiceHeaders.length,
          glTransactionRows: glFacts.length,
          mappedFinancialRows: mappedLineRows.length,
        },
      },
    });
  }, {
    maxWait: 15000,
    timeout: 180000,
  });
}
