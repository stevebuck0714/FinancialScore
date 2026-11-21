import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { assertProductsForecastAccess } from '@/lib/operations/product-revenue-actual-db';
import { loadCustomerGroups } from '@/lib/operations/customer-groups';

export const dynamic = 'force-dynamic';

const normalizeText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

export async function GET(request: NextRequest) {
  const companyId = normalizeText(request.nextUrl.searchParams.get('companyId'));
  if (!companyId) {
    return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
  }

  const denied = await assertProductsForecastAccess(companyId);
  if (denied) return denied;

  try {
    const [forecastLines, revenueLines, assignments, inheritedGroups] = await Promise.all([
      prisma.productRevenueForecastLine.findMany({
        where: { companyId },
        select: { customerId: true, customerName: true, customerGroup: true, csr: true },
        orderBy: [{ customerName: 'asc' }],
      }),
      prisma.productRevenueLine.findMany({
        where: { companyId },
        select: { customerId: true, customerName: true, customerGroup: true, csr: true },
        orderBy: [{ customerName: 'asc' }],
      }),
      prisma.customerGroupAssignment.findMany({
        where: { companyId },
        select: { customerId: true, customerName: true, customerGroup: true, csr: true, updatedAt: true },
      }),
      loadCustomerGroups(companyId),
    ]);

    const assignmentsByCustomer = new Map(assignments.map((row) => [row.customerId, row]));
    const customers = new Map<string, { customerId: string; customerName: string; customerGroup: string; csr: string }>();
    for (const row of [...forecastLines, ...revenueLines]) {
      const customerId = normalizeText(row.customerId);
      const customerName = normalizeText(row.customerName);
      if (!customerId || !customerName) continue;
      const existing = customers.get(customerId);
      const assignment = assignmentsByCustomer.get(customerId);
      customers.set(customerId, {
        customerId,
        customerName: assignment?.customerName || existing?.customerName || customerName,
        customerGroup: assignment?.customerGroup ?? existing?.customerGroup ?? inheritedGroups.get(customerId) ?? normalizeText(row.customerGroup),
        csr: assignment?.csr ?? existing?.csr ?? normalizeText(row.csr),
      });
    }

    for (const assignment of assignments) {
      if (!customers.has(assignment.customerId)) {
        customers.set(assignment.customerId, {
          customerId: assignment.customerId,
          customerName: assignment.customerName,
          customerGroup: assignment.customerGroup || '',
          csr: assignment.csr || '',
        });
      }
    }

    return NextResponse.json({
      customers: Array.from(customers.values()).sort((left, right) => left.customerName.localeCompare(right.customerName)),
    });
  } catch (error) {
    console.error('Failed to load customer group management data', error);
    return NextResponse.json({ error: 'Failed to load customer group management data' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const companyId = normalizeText(body.companyId);
  const customerId = normalizeText(body.customerId);
  const customerName = normalizeText(body.customerName);
  if (!companyId || !customerId || !customerName) {
    return NextResponse.json({ error: 'Company, customer ID, and customer name are required' }, { status: 400 });
  }

  const denied = await assertProductsForecastAccess(companyId);
  if (denied) return denied;

  const customerGroup = normalizeText(body.customerGroup) || null;
  const csr = normalizeText(body.csr) || null;
  try {
    await prisma.$transaction([
      prisma.customerGroupAssignment.upsert({
        where: { companyId_customerId: { companyId, customerId } },
        create: { companyId, customerId, customerName, customerGroup, csr },
        update: { customerName, customerGroup, csr },
      }),
      prisma.productRevenueForecastLine.updateMany({
        where: { companyId, customerId },
        data: { customerGroup, csr },
      }),
      prisma.productRevenueLine.updateMany({
        where: { companyId, customerId },
        data: { customerGroup, csr },
      }),
    ]);
    return NextResponse.json({ customerId, customerName, customerGroup: customerGroup || '', csr: csr || '' });
  } catch (error) {
    console.error('Failed to save customer group management data', error);
    return NextResponse.json({ error: 'Failed to save customer group management data' }, { status: 500 });
  }
}
