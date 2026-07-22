import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const AI_RESEARCH_FIELDS = [
  'aiResearchSearchName',
  'aiResearchAliases',
  'aiResearchExcludedNames',
  'aiResearchIdentityAnchors',
] as const;

const INDUSTRY_BRIEF_FIELDS = [
  'industryBriefProductFocus',
  'industryBriefBrands',
  'industryBriefCustomerChannels',
  'industryBriefCompetitors',
  'industryBriefLocalMarketEvents',
  'industryBriefKnownOpportunities',
] as const;

async function ensureAiResearchProfileColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "CompanyProfile"
      ADD COLUMN IF NOT EXISTS "aiResearchSearchName" TEXT,
      ADD COLUMN IF NOT EXISTS "aiResearchAliases" JSONB,
      ADD COLUMN IF NOT EXISTS "aiResearchExcludedNames" JSONB,
      ADD COLUMN IF NOT EXISTS "aiResearchIdentityAnchors" JSONB,
      ADD COLUMN IF NOT EXISTS "industryBriefProductFocus" TEXT,
      ADD COLUMN IF NOT EXISTS "industryBriefBrands" JSONB,
      ADD COLUMN IF NOT EXISTS "industryBriefCustomerChannels" TEXT,
      ADD COLUMN IF NOT EXISTS "industryBriefCompetitors" TEXT,
      ADD COLUMN IF NOT EXISTS "industryBriefLocalMarketEvents" TEXT,
      ADD COLUMN IF NOT EXISTS "industryBriefKnownOpportunities" TEXT
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
  const industryBrief = {
    industryBriefProductFocus: String(profileData.industryBriefProductFocus || '').trim(),
    industryBriefBrands: normalizeStringList(profileData.industryBriefBrands),
    industryBriefCustomerChannels: String(profileData.industryBriefCustomerChannels || '').trim(),
    industryBriefCompetitors: String(profileData.industryBriefCompetitors || '').trim(),
    industryBriefLocalMarketEvents: String(profileData.industryBriefLocalMarketEvents || '').trim(),
    industryBriefKnownOpportunities: String(profileData.industryBriefKnownOpportunities || '').trim(),
  };
  INDUSTRY_BRIEF_FIELDS.forEach((field) => delete baseProfileData[field]);
  return { baseProfileData, aiResearch, industryBrief };
}

async function getAiResearchFields(companyId: string) {
  await ensureAiResearchProfileColumns();
  const rows = await prisma.$queryRaw<
    Array<{
      aiResearchSearchName: string | null;
      aiResearchAliases: unknown;
      aiResearchExcludedNames: unknown;
      aiResearchIdentityAnchors: unknown;
      industryBriefProductFocus: string | null;
      industryBriefBrands: unknown;
      industryBriefCustomerChannels: string | null;
      industryBriefCompetitors: string | null;
      industryBriefLocalMarketEvents: string | null;
      industryBriefKnownOpportunities: string | null;
    }>
  >`
    SELECT
      "aiResearchSearchName",
      "aiResearchAliases",
      "aiResearchExcludedNames",
      "aiResearchIdentityAnchors",
      "industryBriefProductFocus",
      "industryBriefBrands",
      "industryBriefCustomerChannels",
      "industryBriefCompetitors",
      "industryBriefLocalMarketEvents",
      "industryBriefKnownOpportunities"
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
    industryBriefProductFocus: row?.industryBriefProductFocus || '',
    industryBriefBrands: normalizeStringList(row?.industryBriefBrands),
    industryBriefCustomerChannels: row?.industryBriefCustomerChannels || '',
    industryBriefCompetitors: row?.industryBriefCompetitors || '',
    industryBriefLocalMarketEvents: row?.industryBriefLocalMarketEvents || '',
    industryBriefKnownOpportunities: row?.industryBriefKnownOpportunities || '',
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
    const { baseProfileData, aiResearch, industryBrief } = splitAiResearchFields(profileData);

    const profile = await (prisma.companyProfile as any).upsert({
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
           "aiResearchIdentityAnchors" = $4::jsonb,
           "industryBriefProductFocus" = $5,
           "industryBriefBrands" = $6::jsonb,
           "industryBriefCustomerChannels" = $7,
           "industryBriefCompetitors" = $8,
           "industryBriefLocalMarketEvents" = $9,
           "industryBriefKnownOpportunities" = $10
       WHERE "companyId" = $11`,
      aiResearch.aiResearchSearchName || null,
      JSON.stringify(aiResearch.aiResearchAliases),
      JSON.stringify(aiResearch.aiResearchExcludedNames),
      JSON.stringify(aiResearch.aiResearchIdentityAnchors),
      industryBrief.industryBriefProductFocus || null,
      JSON.stringify(industryBrief.industryBriefBrands),
      industryBrief.industryBriefCustomerChannels || null,
      industryBrief.industryBriefCompetitors || null,
      industryBrief.industryBriefLocalMarketEvents || null,
      industryBrief.industryBriefKnownOpportunities || null,
      companyId,
    );

    return NextResponse.json({ profile: { ...profile, ...aiResearch, ...industryBrief } });
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


