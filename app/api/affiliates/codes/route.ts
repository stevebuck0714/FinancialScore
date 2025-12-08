import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Get affiliate code details by code
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Code parameter is required' },
        { status: 400 }
      );
    }

    const affiliateCode = await prisma.affiliateCode.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        affiliate: true
      }
    });

    if (!affiliateCode) {
      return NextResponse.json(
        { error: 'Affiliate code not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ code: affiliateCode });
  } catch (error) {
    console.error('Error fetching affiliate code:', error);
    return NextResponse.json(
      { error: 'Failed to fetch affiliate code' },
      { status: 500 }
    );
  }
}

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

// PUT - Update affiliate code
export async function PUT(request: NextRequest) {
  try {
    const { id, description, maxUses, expiresAt, monthlyPrice, quarterlyPrice, annualPrice, isActive } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Code ID is required' },
        { status: 400 }
      );
    }

    const affiliateCode = await prisma.affiliateCode.update({
      where: { id },
      data: {
        description: description || null,
        monthlyPrice: monthlyPrice ? parseFloat(monthlyPrice.toString()) : 0,
        quarterlyPrice: quarterlyPrice ? parseFloat(quarterlyPrice.toString()) : 0,
        annualPrice: annualPrice ? parseFloat(annualPrice.toString()) : 0,
        maxUses: maxUses ? parseInt(maxUses.toString()) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive !== undefined ? isActive : true
      }
    });

    return NextResponse.json({ code: affiliateCode });
  } catch (error) {
    console.error('Error updating affiliate code:', error);
    return NextResponse.json(
      { error: 'Failed to update code' },
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
