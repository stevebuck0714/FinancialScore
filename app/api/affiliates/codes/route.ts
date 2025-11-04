import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST - Create new affiliate code
export async function POST(request: NextRequest) {
  try {
    const { affiliateId, code, description, maxUses, expiresAt, monthlyPrice, quarterlyPrice, annualPrice } = await request.json();

    if (!affiliateId || !code) {
      return NextResponse.json(
        { error: 'Affiliate ID and code are required' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existing = await prisma.affiliateCode.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'This code already exists' },
        { status: 409 }
      );
    }

    const affiliateCode = await prisma.affiliateCode.create({
      data: {
        affiliateId,
        code: code.toUpperCase(),
        description,
        monthlyPrice: monthlyPrice ? parseFloat(monthlyPrice) : 0,
        quarterlyPrice: quarterlyPrice ? parseFloat(quarterlyPrice) : 0,
        annualPrice: annualPrice ? parseFloat(annualPrice) : 0,
        maxUses: maxUses ? parseInt(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    });

    return NextResponse.json({ code: affiliateCode });
  } catch (error) {
    console.error('Error creating affiliate code:', error);
    return NextResponse.json(
      { error: 'Failed to create code' },
      { status: 500 }
    );
  }
}

// DELETE - Remove affiliate code
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Code ID is required' },
        { status: 400 }
      );
    }

    await prisma.affiliateCode.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting affiliate code:', error);
    return NextResponse.json(
      { error: 'Failed to delete code' },
      { status: 500 }
    );
  }
}
