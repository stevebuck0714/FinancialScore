import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    if (!companyId) {
      return NextResponse.json({ error: "Missing companyId parameter" }, { status: 400 });
    }

    const rows = await prisma.$queryRawUnsafe<Array<{
      revenueGrowthByRow: unknown;
      cogsPctByRow: unknown;
      opexPctByRow: unknown;
      updatedAt: Date;
    }>>(
      `SELECT "revenueGrowthByRow", "cogsPctByRow", "opexPctByRow", "updatedAt"
       FROM "FinancialForecastInputSettings"
       WHERE "companyId" = $1
       LIMIT 1`,
      companyId,
    );
    const settings = rows[0] || null;

    return NextResponse.json({
      settings: settings || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to load forecast inputs", details: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, revenueGrowthByRow, cogsPctByRow, opexPctByRow } = body || {};

    if (!companyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const newId = crypto.randomUUID();
    const rows = await prisma.$queryRawUnsafe<Array<{ updatedAt: Date }>>(
      `INSERT INTO "FinancialForecastInputSettings"
        ("id", "companyId", "revenueGrowthByRow", "cogsPctByRow", "opexPctByRow", "createdAt", "updatedAt")
       VALUES
        ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, NOW(), NOW())
       ON CONFLICT ("companyId")
       DO UPDATE SET
        "revenueGrowthByRow" = EXCLUDED."revenueGrowthByRow",
        "cogsPctByRow" = EXCLUDED."cogsPctByRow",
        "opexPctByRow" = EXCLUDED."opexPctByRow",
        "updatedAt" = NOW()
       RETURNING "updatedAt"`,
      newId,
      companyId,
      JSON.stringify(revenueGrowthByRow || {}),
      JSON.stringify(cogsPctByRow || {}),
      JSON.stringify(opexPctByRow || {}),
    );
    const saved = rows[0];

    return NextResponse.json({
      success: true,
      updatedAt: saved.updatedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to save forecast inputs", details: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
