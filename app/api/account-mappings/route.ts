import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Retrieve mappings for a company
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId parameter' },
        { status: 400 }
      );
    }

    const mappings = await prisma.accountMapping.findMany({
      where: { companyId },
      orderBy: { qbAccount: 'asc' },
    });

    console.log(`Retrieved ${mappings.length} mappings for company ${companyId}`);
    if (mappings.length > 0) {
      console.log('First mapping:', mappings[0]);
    }

    return NextResponse.json({ mappings });
  } catch (error: any) {
    console.error('Error fetching mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mappings', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Save or update mappings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, mappings } = body;

    if (!companyId || !mappings || !Array.isArray(mappings)) {
      return NextResponse.json(
        { error: 'Missing required fields: companyId and mappings array' },
        { status: 400 }
      );
    }

    console.log(`Saving ${mappings.length} mappings for company ${companyId}`);
    
    // Delete existing mappings for this company
    const deleted = await prisma.accountMapping.deleteMany({
      where: { companyId },
    });
    console.log(`Deleted ${deleted.count} existing mappings`);

        // Create new mappings
        const createdMappings = await prisma.accountMapping.createMany({
          data: mappings.map((m: any) => ({
            companyId,
            qbAccount: m.qbAccount,
            qbAccountId: m.qbAccountId || null,
            qbAccountCode: m.qbAccountCode || null,
            qbAccountClassification: m.qbAccountClassification || null,
            targetField: m.targetField,
            confidence: m.confidence || 'medium',
            lobAllocations: m.lobAllocations || null,
          })),
        });

    console.log(`Created ${createdMappings.count} new mappings`);
    
    // Verify they were saved
    const verification = await prisma.accountMapping.findMany({
      where: { companyId },
    });
    console.log(`Verification: ${verification.length} mappings now in database for company ${companyId}`);

    return NextResponse.json({
      success: true,
      count: createdMappings.count,
      verified: verification.length
    });
  } catch (error: any) {
    console.error('Error saving mappings:', error);
    return NextResponse.json(
      { error: 'Failed to save mappings', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete mappings for a company
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const id = searchParams.get('id');

    // If companyId is provided, delete all mappings for that company
    if (companyId) {
      const deleted = await prisma.accountMapping.deleteMany({
        where: { companyId },
      });
      console.log(`Deleted ${deleted.count} mappings for company ${companyId}`);
      return NextResponse.json({ success: true, count: deleted.count });
    }

    // If id is provided, delete that specific mapping
    if (id) {
      await prisma.accountMapping.delete({
        where: { id },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Missing id or companyId parameter' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error deleting mapping:', error);
    return NextResponse.json(
      { error: 'Failed to delete mapping', details: error.message },
      { status: 500 }
    );
  }
}
