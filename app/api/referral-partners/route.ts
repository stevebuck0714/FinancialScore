import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';

async function requireSiteAdmin() {
  const context = await requireAuth();
  if (context.role !== 'SITEADMIN') {
    return NextResponse.json({ error: 'Forbidden: site admin access required' }, { status: 403 });
  }
  return null;
}

function normalizePercentage(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('Referral percentages must be between 0 and 100');
  }
  return parsed;
}

async function getReferralPartnerDelegate() {
  const delegate = (prisma as any).referralPartner;
  return delegate && typeof delegate.findMany === 'function' ? delegate : null;
}

async function getReferralPartnersWithAddress() {
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "id",
      "name",
      "contactName",
      "email",
      "phone",
      "addressStreet",
      "addressCity",
      "addressState",
      "addressZip",
      "addressCountry",
      "defaultSetupFeePercentage",
      "defaultRecurringFeePercentage",
      "paymentMethod",
      "taxId",
      "notes",
      "active",
      "createdAt",
      "updatedAt"
    FROM "ReferralPartner"
    ORDER BY "active" DESC, "name" ASC
  `;
}

async function getReferralPartnerWithAddress(id: string) {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "id",
      "name",
      "contactName",
      "email",
      "phone",
      "addressStreet",
      "addressCity",
      "addressState",
      "addressZip",
      "addressCountry",
      "defaultSetupFeePercentage",
      "defaultRecurringFeePercentage",
      "paymentMethod",
      "taxId",
      "notes",
      "active",
      "createdAt",
      "updatedAt"
    FROM "ReferralPartner"
    WHERE "id" = ${id}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function updateReferralPartnerAddress(id: string, body: any) {
  if (
    body.addressStreet === undefined &&
    body.addressCity === undefined &&
    body.addressState === undefined &&
    body.addressZip === undefined &&
    body.addressCountry === undefined
  ) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE "ReferralPartner"
    SET
      "addressStreet" = ${body.addressStreet === undefined ? null : String(body.addressStreet || '').trim() || null},
      "addressCity" = ${body.addressCity === undefined ? null : String(body.addressCity || '').trim() || null},
      "addressState" = ${body.addressState === undefined ? null : String(body.addressState || '').trim() || null},
      "addressZip" = ${body.addressZip === undefined ? null : String(body.addressZip || '').trim() || null},
      "addressCountry" = ${body.addressCountry === undefined ? null : String(body.addressCountry || '').trim() || null},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `;
}

export async function GET() {
  try {
    const authError = await requireSiteAdmin();
    if (authError) return authError;

    const referralPartner = await getReferralPartnerDelegate();
    if (!referralPartner) {
      return NextResponse.json({ referralPartners: [] });
    }

    const referralPartners = await getReferralPartnersWithAddress();

    return NextResponse.json({ referralPartners });
  } catch (error) {
    console.error('Error fetching referral partners:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSiteAdmin();
    if (authError) return authError;

    const referralPartner = await getReferralPartnerDelegate();
    if (!referralPartner) {
      return NextResponse.json({ error: 'Referral partner table is not available yet' }, { status: 503 });
    }

    const body = await request.json();
    const name = String(body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Referral partner name is required' }, { status: 400 });
    }

    const created = await referralPartner.create({
      data: {
        name,
        contactName: String(body?.contactName || '').trim() || null,
        email: String(body?.email || '').trim().toLowerCase() || null,
        phone: String(body?.phone || '').trim() || null,
        defaultSetupFeePercentage: normalizePercentage(body?.defaultSetupFeePercentage),
        defaultRecurringFeePercentage: normalizePercentage(body?.defaultRecurringFeePercentage),
        paymentMethod: String(body?.paymentMethod || '').trim() || null,
        taxId: String(body?.taxId || '').trim() || null,
        notes: String(body?.notes || '').trim() || null,
        active: body?.active === undefined ? true : Boolean(body.active),
      },
    });
    await updateReferralPartnerAddress(created.id, body || {});
    const createdWithAddress = await getReferralPartnerWithAddress(created.id);

    return NextResponse.json({ referralPartner: createdWithAddress || created }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating referral partner:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authError = await requireSiteAdmin();
    if (authError) return authError;

    const referralPartner = await getReferralPartnerDelegate();
    if (!referralPartner) {
      return NextResponse.json({ error: 'Referral partner table is not available yet' }, { status: 503 });
    }

    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Referral partner ID is required' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name || '').trim();
    if (body.contactName !== undefined) data.contactName = String(body.contactName || '').trim() || null;
    if (body.email !== undefined) data.email = String(body.email || '').trim().toLowerCase() || null;
    if (body.phone !== undefined) data.phone = String(body.phone || '').trim() || null;
    if (body.defaultSetupFeePercentage !== undefined) {
      data.defaultSetupFeePercentage = normalizePercentage(body.defaultSetupFeePercentage);
    }
    if (body.defaultRecurringFeePercentage !== undefined) {
      data.defaultRecurringFeePercentage = normalizePercentage(body.defaultRecurringFeePercentage);
    }
    if (body.paymentMethod !== undefined) data.paymentMethod = String(body.paymentMethod || '').trim() || null;
    if (body.taxId !== undefined) data.taxId = String(body.taxId || '').trim() || null;
    if (body.notes !== undefined) data.notes = String(body.notes || '').trim() || null;
    if (body.active !== undefined) data.active = Boolean(body.active);

    if (data.name === '') {
      return NextResponse.json({ error: 'Referral partner name is required' }, { status: 400 });
    }

    const updated = await referralPartner.update({
      where: { id },
      data,
    });
    await updateReferralPartnerAddress(id, body || {});
    const updatedWithAddress = await getReferralPartnerWithAddress(id);

    return NextResponse.json({ referralPartner: updatedWithAddress || updated });
  } catch (error: any) {
    console.error('Error updating referral partner:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authError = await requireSiteAdmin();
    if (authError) return authError;

    const referralPartner = await getReferralPartnerDelegate();
    if (!referralPartner) {
      return NextResponse.json({ success: true });
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Referral partner ID is required' }, { status: 400 });
    }

    await referralPartner.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting referral partner:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
