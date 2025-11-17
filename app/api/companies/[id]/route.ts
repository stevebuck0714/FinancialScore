import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 });
    }

    // Delete the company and all related data (cascading deletes are handled by Prisma)
    // This will delete:
    // - The company record
    // - All monthly financial data
    // - All users associated with the company
    // - All financial records
    // - All account mappings
    // - All assessment records
    // - Subscription data
    // All due to the onDelete: Cascade settings in the Prisma schema
    await prisma.company.delete({
      where: {
        id: companyId
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Company and all associated data deleted successfully' 
    });

  } catch (error: any) {
    console.error('Error deleting company:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return NextResponse.json({ 
        success: false, 
        error: 'Company not found' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Failed to delete company. Please try again.' 
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

