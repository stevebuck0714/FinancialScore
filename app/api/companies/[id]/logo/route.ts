import { NextRequest, NextResponse } from 'next/server';
import { del, put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const LOGO_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function extensionFor(contentType: string) {
  return {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }[contentType] || 'img';
}

async function requireSiteAdmin() {
  const user = await requireAuth();
  if (String(user.role || '').toUpperCase() !== 'SITEADMIN') {
    throw new Error('Forbidden: Site Administrator access required');
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSiteAdmin();
    const { id: companyId } = await params;
    const formData = await request.formData();
    const file = formData.get('logo');

    if (!companyId || !(file instanceof File)) {
      return NextResponse.json({ error: 'A company logo file is required' }, { status: 400 });
    }
    if (!LOGO_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Use a PNG, JPG, WebP, or GIF logo file' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_LOGO_SIZE_BYTES) {
      return NextResponse.json({ error: 'Logo files must be between 1 byte and 2 MB' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { userDefinedAllocations: true },
    });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const blob = await put(`company-logos/${companyId}/logo.${extensionFor(file.type)}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type,
    });
    const allocations =
      company.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations as Record<string, unknown>
        : {};
    const existingBranding =
      allocations.branding &&
      typeof allocations.branding === 'object' &&
      !Array.isArray(allocations.branding)
        ? allocations.branding as Record<string, unknown>
        : {};
    const updatedAllocations = {
      ...allocations,
      branding: {
        ...existingBranding,
        logoUrl: blob.url,
        logoPathname: blob.pathname,
        logoContentType: file.type,
        logoFileName: file.name,
      },
    };
    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedAllocations as any },
      select: { id: true, userDefinedAllocations: true },
    });

    const previousPathname = String(existingBranding.logoPathname || '').trim();
    if (previousPathname && previousPathname !== blob.pathname) {
      void del(previousPathname).catch(() => undefined);
    }
    return NextResponse.json({ success: true, company: updatedCompany });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to upload company logo');
    const status = message.startsWith('Forbidden') ? 403 : message.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSiteAdmin();
    const { id: companyId } = await params;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { userDefinedAllocations: true },
    });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const allocations =
      company.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations as Record<string, unknown>
        : {};
    const existingBranding =
      allocations.branding &&
      typeof allocations.branding === 'object' &&
      !Array.isArray(allocations.branding)
        ? allocations.branding as Record<string, unknown>
        : {};
    const previousPathname = String(existingBranding.logoPathname || '').trim();
    const brandingWithoutLogo = { ...existingBranding };
    delete brandingWithoutLogo.logoUrl;
    delete brandingWithoutLogo.logoPathname;
    delete brandingWithoutLogo.logoContentType;
    delete brandingWithoutLogo.logoFileName;
    const updatedAllocations = {
      ...allocations,
      branding: brandingWithoutLogo,
    };
    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedAllocations as any },
      select: { id: true, userDefinedAllocations: true },
    });
    if (previousPathname) {
      await del(previousPathname).catch(() => undefined);
    }
    return NextResponse.json({ success: true, company: updatedCompany });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to remove company logo');
    const status = message.startsWith('Forbidden') ? 403 : message.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
