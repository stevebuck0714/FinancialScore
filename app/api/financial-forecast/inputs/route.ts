import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type BasisMode = "cash" | "accrual";

function asBasisMode(value: unknown): BasisMode {
  return value === "accrual" ? "accrual" : "cash";
}

function extractBasisPayload(raw: unknown, basisMode: BasisMode): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const hasBasisKeys = Object.prototype.hasOwnProperty.call(obj, "cash") || Object.prototype.hasOwnProperty.call(obj, "accrual");
  if (!hasBasisKeys) return obj;
  const scoped = obj[basisMode];
  return scoped && typeof scoped === "object" ? (scoped as Record<string, unknown>) : {};
}

function mergeBasisPayload(existingRaw: unknown, incoming: unknown, basisMode: BasisMode): Record<string, unknown> {
  const incomingObj = incoming && typeof incoming === "object" ? (incoming as Record<string, unknown>) : {};
  if (!existingRaw || typeof existingRaw !== "object") {
    return { [basisMode]: incomingObj };
  }
  const existingObj = existingRaw as Record<string, unknown>;
  const hasBasisKeys = Object.prototype.hasOwnProperty.call(existingObj, "cash") || Object.prototype.hasOwnProperty.call(existingObj, "accrual");
  if (hasBasisKeys) {
    return { ...existingObj, [basisMode]: incomingObj };
  }
  // Legacy single-basis payload: preserve as cash and write scoped basis.
  return basisMode === "cash"
    ? { cash: incomingObj }
    : { cash: existingObj, accrual: incomingObj };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const basisMode = asBasisMode(searchParams.get("basisMode"));
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
    const row = rows[0] || null;
    const settings = row
      ? {
          revenueGrowthByRow: extractBasisPayload(row.revenueGrowthByRow, basisMode),
          cogsPctByRow: extractBasisPayload(row.cogsPctByRow, basisMode),
          opexPctByRow: extractBasisPayload(row.opexPctByRow, basisMode),
          updatedAt: row.updatedAt,
        }
      : null;

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
    const basisMode = asBasisMode(body?.basisMode);

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

    const existingRows = await prisma.$queryRawUnsafe<Array<{
      revenueGrowthByRow: unknown;
      cogsPctByRow: unknown;
      opexPctByRow: unknown;
    }>>(
      `SELECT "revenueGrowthByRow", "cogsPctByRow", "opexPctByRow"
       FROM "FinancialForecastInputSettings"
       WHERE "companyId" = $1
       LIMIT 1`,
      companyId,
    );
    const existing = existingRows[0] || null;
    const mergedRevenuePayload = mergeBasisPayload(existing?.revenueGrowthByRow, revenueGrowthByRow || {}, basisMode);
    const mergedCogsPayload = mergeBasisPayload(existing?.cogsPctByRow, cogsPctByRow || {}, basisMode);
    const mergedOpexPayload = mergeBasisPayload(existing?.opexPctByRow, opexPctByRow || {}, basisMode);

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
      JSON.stringify(mergedRevenuePayload),
      JSON.stringify(mergedCogsPayload),
      JSON.stringify(mergedOpexPayload),
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
