import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { companyId, widgets } = body;

    console.log('💾 API: Saving dashboard widget preferences for company:', companyId);
    console.log('💾 API: Widgets:', widgets);

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Validate company access
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Ensure the table exists
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "DashboardPreference" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "widgets" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL
        )
      `);

      // Add unique index if it doesn't exist
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "DashboardPreference_companyId_key" 
        ON "DashboardPreference"("companyId")
      `);
    } catch (tableError: any) {
      // Ignore errors if table/indexes already exist
      if (!tableError.message?.includes('already exists') && !tableError.message?.includes('duplicate')) {
        console.warn('⚠️ Table creation warning:', tableError.message);
      }
    }

    // Use raw SQL with proper type casts
    const widgetsJson = JSON.stringify(widgets);
    const now = new Date().toISOString();

    // Check if preferences already exist
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "DashboardPreference" WHERE "companyId" = ${companyId}
    `;

    console.log('💾 API: Existing record check:', existing);

    if (existing.length > 0) {
      // Update existing preferences
      console.log('💾 API: Updating existing record');
      await prisma.$executeRawUnsafe(
        `UPDATE "DashboardPreference" 
         SET widgets = $1::jsonb, "updatedAt" = $2::timestamp
         WHERE "companyId" = $3`,
        widgetsJson,
        now,
        companyId
      );
    } else {
      // Insert new preferences
      console.log('💾 API: Creating new record');
      const id = `dashpref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "DashboardPreference" (id, "companyId", widgets, "createdAt", "updatedAt") 
         VALUES ($1, $2, $3::jsonb, $4::timestamp, $5::timestamp)`,
        id,
        companyId,
        widgetsJson,
        now,
        now
      );
    }

    console.log('✅ API: Dashboard widget preferences saved successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ API Error saving dashboard preferences:', error);
    return NextResponse.json({ 
      error: 'Failed to save dashboard preferences', 
      details: String(error) 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    console.log('📊 API: Loading dashboard widget preferences for company:', companyId);

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Validate company access
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Ensure the table exists
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "DashboardPreference" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "widgets" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL
        )
      `);
    } catch (tableError: any) {
      // Ignore if table already exists
      if (!tableError.message?.includes('already exists')) {
        console.warn('⚠️ Table creation warning:', tableError.message);
      }
    }

    // Query the preferences
    const result = await prisma.$queryRaw<Array<{ widgets: any }>>`
      SELECT widgets FROM "DashboardPreference" WHERE "companyId" = ${companyId}
    `;

    console.log('📊 API: Query result:', result);

    if (result.length > 0) {
      const widgets = result[0].widgets;
      console.log('✅ API: Dashboard widget preferences loaded successfully');
      return NextResponse.json({ widgets });
    } else {
      console.log('📊 API: No saved preferences found');
      return NextResponse.json({ widgets: [] });
    }
  } catch (error) {
    console.error('❌ API Error loading dashboard preferences:', error);
    return NextResponse.json({ 
      error: 'Failed to load dashboard preferences', 
      details: String(error) 
    }, { status: 500 });
  }
}

