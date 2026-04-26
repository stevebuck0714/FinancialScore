import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const AI_RESEARCH_FIELDS = [
  'aiResearchSearchName',
  'aiResearchAliases',
  'aiResearchExcludedNames',
  'aiResearchIdentityAnchors',
] as const;

async function ensureAiResearchProfileColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "CompanyProfile"
      ADD COLUMN IF NOT EXISTS "aiResearchSearchName" TEXT,
      ADD COLUMN IF NOT EXISTS "aiResearchAliases" JSONB,
      ADD COLUMN IF NOT EXISTS "aiResearchExcludedNames" JSONB,
      ADD COLUMN IF NOT EXISTS "aiResearchIdentityAnchors" JSONB
  `);
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function splitAiResearchFields(profileData: Record<string, unknown>) {
  const aiResearch = {
    aiResearchSearchName: String(profileData.aiResearchSearchName || '').trim(),
    aiResearchAliases: normalizeStringList(profileData.aiResearchAliases),
    aiResearchExcludedNames: normalizeStringList(profileData.aiResearchExcludedNames),
    aiResearchIdentityAnchors: normalizeStringList(profileData.aiResearchIdentityAnchors),
  };
  const baseProfileData = { ...profileData };
  AI_RESEARCH_FIELDS.forEach((field) => delete baseProfileData[field]);
  return { baseProfileData, aiResearch };
}

async function getAiResearchFields(companyId: string) {
  await ensureAiResearchProfileColumns();
  const rows = await prisma.$queryRaw<
    Array<{
      aiResearchSearchName: string | null;
      aiResearchAliases: unknown;
      aiResearchExcludedNames: unknown;
      aiResearchIdentityAnchors: unknown;
    }>
  >`
    SELECT
      "aiResearchSearchName",
      "aiResearchAliases",
      "aiResearchExcludedNames",
      "aiResearchIdentityAnchors"
    FROM "CompanyProfile"
    WHERE "companyId" = ${companyId}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    aiResearchSearchName: row?.aiResearchSearchName || '',
    aiResearchAliases: normalizeStringList(row?.aiResearchAliases),
    aiResearchExcludedNames: normalizeStringList(row?.aiResearchExcludedNames),
    aiResearchIdentityAnchors: normalizeStringList(row?.aiResearchIdentityAnchors),
  };
}

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

    await ensureAiResearchProfileColumns();

    const profile = await prisma.companyProfile.findUnique({
      where: { companyId }
    });

    if (!profile) {
      return NextResponse.json({ profile });
    }

    const aiResearch = await getAiResearchFields(companyId);
    return NextResponse.json({ profile: { ...profile, ...aiResearch } });
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

    await ensureAiResearchProfileColumns();
    const { baseProfileData, aiResearch } = splitAiResearchFields(profileData);

    const profile = await prisma.companyProfile.upsert({
      where: { companyId },
      update: baseProfileData,
      create: {
        companyId,
        ...baseProfileData
      }
    });

    await prisma.$executeRawUnsafe(
      `UPDATE "CompanyProfile"
       SET "aiResearchSearchName" = $1,
           "aiResearchAliases" = $2::jsonb,
           "aiResearchExcludedNames" = $3::jsonb,
           "aiResearchIdentityAnchors" = $4::jsonb
       WHERE "companyId" = $5`,
      aiResearch.aiResearchSearchName || null,
      JSON.stringify(aiResearch.aiResearchAliases),
      JSON.stringify(aiResearch.aiResearchExcludedNames),
      JSON.stringify(aiResearch.aiResearchIdentityAnchors),
      companyId,
    );

    return NextResponse.json({ profile: { ...profile, ...aiResearch } });
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


