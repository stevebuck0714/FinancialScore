import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { validateCompanyAccess } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { companyId, preferences } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Validate company access
    const hasAccess = await validateCompanyAccess(session, companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Ensure the table exists
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

    // Check if preferences already exist
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "OpsDashboardPreference" WHERE "companyId" = ${companyId}
    `;

    const now = new Date();

    if (existing.length > 0) {
      // Update existing preferences
      await prisma.$executeRawUnsafe(
        `UPDATE "OpsDashboardPreference" 
         SET "preferences" = $1, "updatedAt" = $2 
         WHERE "companyId" = $3`,
        JSON.stringify(preferences),
        now,
        companyId
      );
    } else {
      // Insert new preferences
      const id = `pref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "OpsDashboardPreference" ("id", "companyId", "preferences", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5)`,
        id,
        companyId,
        JSON.stringify(preferences),
        now,
        now
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving ops dashboard preferences:', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Validate company access
    const hasAccess = await validateCompanyAccess(session, companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Try to get preferences
    try {
      const result = await prisma.$queryRaw<Array<{ preferences: any }>>`
        SELECT preferences FROM "OpsDashboardPreference" WHERE "companyId" = ${companyId}
      `;

      const preferences = result.length > 0 ? result[0].preferences : null;
      return NextResponse.json({ success: true, preferences });
    } catch (error: any) {
      // If table doesn't exist yet, return empty preferences
      if (error.code === '42P01') {
        return NextResponse.json({ success: true, preferences: null });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error loading ops dashboard preferences:', error);
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

