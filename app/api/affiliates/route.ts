import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Fetch all affiliates with their codes and company counts
export async function GET() {
  try {
    const affiliates = await prisma.affiliate.findMany({
      include: {
        codes: {
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { companies: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({ affiliates });
  } catch (error) {
    console.error('Error fetching affiliates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch affiliates' },
      { status: 500 }
    );
  }
}

// POST - Create new affiliate
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const {
      name,
      contactName,
      contactEmail,
      contactPhone,
      address,
      city,
      state,
      zip,
      website,
      isActive
    } = data;

    if (!name) {
      return NextResponse.json(
        { error: 'Affiliate name is required' },
        { status: 400 }
      );
    }

    // Check if affiliate with this name already exists
    const existing = await prisma.affiliate.findUnique({
      where: { name }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An affiliate with this name already exists' },
        { status: 409 }
      );
    }

    const affiliate = await prisma.affiliate.create({
      data: {
        name,
        contactName,
        contactEmail,
        contactPhone,
        address,
        city,
        state,
        zip,
        website,
        isActive: isActive !== false
      },
      include: {
        codes: true,
        _count: {
          select: { companies: true }
        }
      }
    });

    return NextResponse.json({ affiliate });
  } catch (error) {
    console.error('Error creating affiliate:', error);
    return NextResponse.json(
      { error: 'Failed to create affiliate' },
      { status: 500 }
    );
  }
}

// PUT - Update existing affiliate
export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const { id, ...updateData } = data;

    if (!id) {
      return NextResponse.json(
        { error: 'Affiliate ID is required' },
        { status: 400 }
      );
    }

    const affiliate = await prisma.affiliate.update({
      where: { id },
      data: {
        name: updateData.name,
        contactName: updateData.contactName,
        contactEmail: updateData.contactEmail,
        contactPhone: updateData.contactPhone,
        address: updateData.address,
        city: updateData.city,
        state: updateData.state,
        zip: updateData.zip,
        website: updateData.website,
        isActive: updateData.isActive
      },
      include: {
        codes: true,
        _count: {
          select: { companies: true }
        }
      }
    });

    return NextResponse.json({ affiliate });
  } catch (error) {
    console.error('Error updating affiliate:', error);
    return NextResponse.json(
      { error: 'Failed to update affiliate' },
      { status: 500 }
    );
  }
}

// DELETE - Remove affiliate
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Affiliate ID is required' },
        { status: 400 }
      );
    }

    // Check if affiliate has companies
    const affiliate = await prisma.affiliate.findUnique({
      where: { id },
      include: {
        _count: {
          select: { companies: true }
        }
      }
    });

    if (affiliate && affiliate._count.companies > 0) {
      return NextResponse.json(
        { error: 'Cannot delete affiliate with registered companies' },
        { status: 400 }
      );
    }

    await prisma.affiliate.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting affiliate:', error);
    return NextResponse.json(
      { error: 'Failed to delete affiliate' },
      { status: 500 }
    );
  }
}
