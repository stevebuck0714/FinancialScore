import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const DEFAULT_CONTEXT = {
  companyBackgroundHistory: '',
  marketPositionCompetitiveLandscape: '',
  competitorTable: [],
  researchDepth: 'deep',
  competitorSearchScopes: ['local', 'state', 'regional', 'national'],
  researchSources: [],
  lastResearchedAt: null,
};

async function ensureCompanyMarketContextTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanyMarketContext" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "companyBackgroundHistory" TEXT NOT NULL DEFAULT '',
      "marketPositionCompetitiveLandscape" TEXT NOT NULL DEFAULT '',
      "competitorTable" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "researchDepth" TEXT NOT NULL DEFAULT 'deep',
      "competitorSearchScopes" JSONB NOT NULL DEFAULT '["local","state","regional","national"]'::jsonb,
      "researchSources" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "lastResearchedAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CompanyMarketContext_companyId_key" ON "CompanyMarketContext"("companyId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CompanyMarketContext_companyId_idx" ON "CompanyMarketContext"("companyId")
  `);
}

function normalizeScopes(value: unknown): string[] {
  const allowed = new Set(['local', 'state', 'regional', 'national']);
  if (!Array.isArray(value)) return DEFAULT_CONTEXT.competitorSearchScopes;
  const scopes = value.map((item) => String(item || '').trim().toLowerCase()).filter((item) => allowed.has(item));
  return scopes.length > 0 ? scopes : DEFAULT_CONTEXT.competitorSearchScopes;
}

function normalizeSources(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeCompetitorTable(value: unknown): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        name: String(row.name || '').trim(),
        scope: String(row.scope || '').trim(),
        location: String(row.location || '').trim(),
        competitorType: String(row.competitorType || '').trim(),
        revenueEstimate: String(row.revenueEstimate || '').trim(),
        employeeEstimate: String(row.employeeEstimate || '').trim(),
        yearsInBusiness: String(row.yearsInBusiness || '').trim(),
        overlap: String(row.overlap || '').trim(),
        threatLevel: String(row.threatLevel || '').trim(),
        source: String(row.source || '').trim(),
      };
    })
    .filter((row) => row.name);
}

function normalizeResearchDepth(value: unknown): 'standard' | 'deep' {
  return String(value || '').trim().toLowerCase() === 'standard' ? 'standard' : 'deep';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    await ensureCompanyMarketContextTable();

    const result = await prisma.$queryRaw<
      Array<{
        companyBackgroundHistory: string | null;
        marketPositionCompetitiveLandscape: string | null;
        competitorTable: unknown;
        researchDepth: string | null;
        competitorSearchScopes: unknown;
        researchSources: unknown;
        lastResearchedAt: Date | null;
        updatedAt: Date | null;
      }>
    >`
      SELECT
        "companyBackgroundHistory",
        "marketPositionCompetitiveLandscape",
        "competitorTable",
        "researchDepth",
        "competitorSearchScopes",
        "researchSources",
        "lastResearchedAt",
        "updatedAt"
      FROM "CompanyMarketContext"
      WHERE "companyId" = ${companyId}
      LIMIT 1
    `;

    if (result.length === 0) {
      return NextResponse.json(DEFAULT_CONTEXT);
    }

    const context = result[0];
    return NextResponse.json({
      companyBackgroundHistory: context.companyBackgroundHistory || '',
      marketPositionCompetitiveLandscape: context.marketPositionCompetitiveLandscape || '',
      competitorTable: normalizeCompetitorTable(context.competitorTable),
      researchDepth: normalizeResearchDepth(context.researchDepth),
      competitorSearchScopes: normalizeScopes(context.competitorSearchScopes),
      researchSources: normalizeSources(context.researchSources),
      lastResearchedAt: context.lastResearchedAt ? context.lastResearchedAt.toISOString() : null,
      updatedAt: context.updatedAt ? context.updatedAt.toISOString() : null,
    });
  } catch (error) {
    console.error('Error fetching company market context:', error);
    return NextResponse.json({ error: 'Failed to fetch company market context' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      companyBackgroundHistory = '',
      marketPositionCompetitiveLandscape = '',
      competitorTable = [],
      researchDepth = DEFAULT_CONTEXT.researchDepth,
      competitorSearchScopes = DEFAULT_CONTEXT.competitorSearchScopes,
      researchSources = [],
      markResearched = false,
    } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    await ensureCompanyMarketContextTable();

    const now = new Date().toISOString();
    const scopesJson = JSON.stringify(normalizeScopes(competitorSearchScopes));
    const sourcesJson = JSON.stringify(normalizeSources(researchSources));
    const competitorTableJson = JSON.stringify(normalizeCompetitorTable(competitorTable));
    const normalizedResearchDepth = normalizeResearchDepth(researchDepth);
    const lastResearchedAt = markResearched ? now : null;

    const existing = await prisma.$queryRaw<Array<{ id: string; lastResearchedAt: Date | null }>>`
      SELECT id, "lastResearchedAt" FROM "CompanyMarketContext" WHERE "companyId" = ${companyId}
    `;

    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "CompanyMarketContext"
         SET "companyBackgroundHistory" = $1,
             "marketPositionCompetitiveLandscape" = $2,
             "competitorTable" = $3::jsonb,
             "researchDepth" = $4,
             "competitorSearchScopes" = $5::jsonb,
             "researchSources" = $6::jsonb,
             "lastResearchedAt" = COALESCE($7::timestamp, "lastResearchedAt"),
             "updatedAt" = $8::timestamp
         WHERE "companyId" = $9`,
        String(companyBackgroundHistory || ''),
        String(marketPositionCompetitiveLandscape || ''),
        competitorTableJson,
        normalizedResearchDepth,
        scopesJson,
        sourcesJson,
        lastResearchedAt,
        now,
        companyId,
      );
    } else {
      const id = `cmc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CompanyMarketContext" (
          id, "companyId", "companyBackgroundHistory", "marketPositionCompetitiveLandscape", "competitorTable", "researchDepth", "competitorSearchScopes", "researchSources", "lastResearchedAt", "createdAt", "updatedAt"
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9::timestamp, $10::timestamp, $11::timestamp)`,
        id,
        companyId,
        String(companyBackgroundHistory || ''),
        String(marketPositionCompetitiveLandscape || ''),
        competitorTableJson,
        normalizedResearchDepth,
        scopesJson,
        sourcesJson,
        lastResearchedAt,
        now,
        now,
      );
    }

    return NextResponse.json({
      success: true,
      context: {
        companyId,
        companyBackgroundHistory: String(companyBackgroundHistory || ''),
        marketPositionCompetitiveLandscape: String(marketPositionCompetitiveLandscape || ''),
        competitorTable: JSON.parse(competitorTableJson),
        researchDepth: normalizedResearchDepth,
        competitorSearchScopes: JSON.parse(scopesJson),
        researchSources: JSON.parse(sourcesJson),
        lastResearchedAt,
      },
    });
  } catch (error) {
    console.error('Error saving company market context:', error);
    return NextResponse.json({ error: 'Failed to save company market context' }, { status: 500 });
  }
}
