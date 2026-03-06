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

    const rows = await prisma.$queryRawUnsafe<Array<{ createdAt: Date }>>(
      `SELECT "createdAt"
       FROM "FinancialForecastBudgetArchive"
       WHERE "companyId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      companyId,
    );

    return NextResponse.json({
      latestArchiveAt: rows[0]?.createdAt || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to load forecast budget archives", details: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, label, snapshot } = body || {};
    if (!companyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }
    if (!snapshot || typeof snapshot !== "object") {
      return NextResponse.json({ error: "Missing snapshot payload" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ createdAt: Date }>>(
      `INSERT INTO "FinancialForecastBudgetArchive"
        ("id", "companyId", "label", "snapshot", "createdAt")
       VALUES
        ($1, $2, $3, $4::jsonb, NOW())
       RETURNING "createdAt"`,
      crypto.randomUUID(),
      companyId,
      label || null,
      JSON.stringify(snapshot),
    );

    return NextResponse.json({
      success: true,
      createdAt: rows[0]?.createdAt || new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to archive forecast budget", details: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
