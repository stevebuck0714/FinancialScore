import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET company profile
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const profile = await prisma.companyProfile.findUnique({
      where: { companyId }
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create or update company profile
export async function POST(request: NextRequest) {
  try {
    const { companyId, ...profileData } = await request.json();

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const profile = await prisma.companyProfile.upsert({
      where: { companyId },
      update: profileData,
      create: {
        companyId,
        ...profileData
      }
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Error saving profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE company profile
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    await prisma.companyProfile.delete({
      where: { companyId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


