import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { companyId, preferences } = body;

    console.log('💾 API: Saving ops dashboard preferences for company:', companyId);
    console.log('💾 API: Preferences data:', preferences);

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
        CREATE TABLE IF NOT EXISTS "OpsDashboardPreference" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "preferences" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL
        )
      `);

      // Add unique index if it doesn't exist
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "OpsDashboardPreference_companyId_key" 
        ON "OpsDashboardPreference"("companyId")
      `);
    } catch (tableError: any) {
      // Ignore errors if table/indexes already exist
      if (!tableError.message?.includes('already exists') && !tableError.message?.includes('duplicate')) {
        console.warn('⚠️ Table creation warning:', tableError.message);
      }
    }

    const existing = await prisma.$queryRaw<Array<{ id: string; preferences: any }>>`
      SELECT id, preferences FROM "OpsDashboardPreference" WHERE "companyId" = ${companyId}
    `;

    const mergedPreferences =
      existing.length > 0 && existing[0].preferences && typeof existing[0].preferences === 'object'
        ? { ...existing[0].preferences, ...(preferences || {}) }
        : (preferences || {});

    // Use raw SQL with proper type casts
    const preferencesJson = JSON.stringify(mergedPreferences);
    const now = new Date().toISOString();

    console.log('💾 API: Existing record check:', existing);

    if (existing.length > 0) {
      // Update existing preferences
      console.log('💾 API: Updating existing record');
      await prisma.$executeRawUnsafe(
        `UPDATE "OpsDashboardPreference" 
         SET preferences = $1::jsonb, "updatedAt" = $2::timestamp
         WHERE "companyId" = $3`,
        preferencesJson,
        now,
        companyId
      );
    } else {
      // Insert new preferences
      console.log('💾 API: Creating new record');
      const id = `pref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "OpsDashboardPreference" (id, "companyId", preferences, "createdAt", "updatedAt") 
         VALUES ($1, $2, $3::jsonb, $4::timestamp, $5::timestamp)`,
        id,
        companyId,
        preferencesJson,
        now,
        now
      );
    }

    console.log('✅ API: Ops dashboard preferences saved successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ API Error saving ops dashboard preferences:', error);
    return NextResponse.json({ 
      error: 'Failed to save preferences', 
      details: String(error) 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    console.log('📊 API: Loading ops dashboard preferences for company:', companyId);

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Validate company access
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Ensure table exists
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "OpsDashboardPreference" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "preferences" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL
        )
      `);
    } catch (tableError: any) {
      // Ignore errors if table already exists
      if (!tableError.message?.includes('already exists')) {
        console.warn('⚠️ Table creation warning:', tableError.message);
      }
    }

    // Try to get preferences
    try {
      const result = await prisma.$queryRaw<Array<{ preferences: any }>>`
        SELECT preferences FROM "OpsDashboardPreference" WHERE "companyId" = ${companyId}
      `;

      console.log('📊 API: Query result:', result);

      // PostgreSQL returns JSON as an already-parsed object
      const preferences = result.length > 0 ? result[0].preferences : null;

      console.log('📊 API: Returning preferences:', preferences);

      return NextResponse.json({ success: true, preferences });
    } catch (error: any) {
      // If table doesn't exist yet, return empty preferences
      if (error.code === '42P01') {
        return NextResponse.json({ success: true, preferences: null });
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ API Error loading ops dashboard preferences:', error);
    return NextResponse.json({ 
      error: 'Failed to load preferences', 
      details: String(error) 
    }, { status: 500 });
  }
}

