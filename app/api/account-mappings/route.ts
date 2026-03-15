import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAllowedTargetFieldSet } from "@/lib/constants/sector-target-fields";

export const dynamic = "force-dynamic";

function normalizeTargetFieldValue(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  if (
    compact === "nonoperatingincome" ||
    compact === "nonopertingincome" ||
    compact === "nonoperatngincome" ||
    compact === "otherincome"
  ) {
    return "nonOperatingIncome";
  }
  if (
    compact === "nonoperatingexpense" ||
    compact === "nonopertingexpense" ||
    compact === "nonoperatngexpense" ||
    compact === "othernonoperatingexpense"
  ) {
    return "nonOperatingExpense";
  }
  return raw;
}

type AccountSnapshotRow = {
  accountId: string;
  accountName: string;
  accountCode?: string | null;
  classification?: string | null;
};

function normalize(v: unknown): string {
  if (typeof v === "string") return v.trim().toLowerCase();
  if (typeof v === "number" || typeof v === "bigint") return String(v).trim().toLowerCase();
  return "";
}

function parseAccountSnapshot(value: unknown): AccountSnapshotRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const accountId = typeof record.accountId === "string" ? record.accountId.trim() : "";
      const accountName = typeof record.accountName === "string" ? record.accountName.trim() : "";
      if (!accountId || !accountName) return null;
      return {
        accountId,
        accountName,
        accountCode: typeof record.accountCode === "string" ? record.accountCode.trim() : null,
        classification:
          typeof record.classification === "string" ? record.classification.trim() : null,
      } as AccountSnapshotRow;
    })
    .filter((row): row is AccountSnapshotRow => !!row);
}

// GET - Retrieve mappings for a company
export async function GET(request: NextRequest) {
  try {
    console.log("🔍 Account mappings API called");
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    console.log("🔍 Query params:", { companyId });

    if (!companyId) {
      return NextResponse.json(
        { error: "Missing companyId parameter" },
        { status: 400 },
      );
    }

    const mappings = await prisma.accountMapping.findMany({
      where: { companyId },
      orderBy: { qbAccount: "asc" },
    });

    // Get company context (LOB names + sector category)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { linesOfBusiness: true, industrySectorCategory: true, accountingSystem: true },
    });

    const seededPlatform =
      company?.accountingSystem === "INFOR_M3"
        ? "INFOR_M3"
        : company?.accountingSystem === "QUICKBOOKS_DESKTOP"
          ? "QUICKBOOKS"
          : null;

    const seededConnection = seededPlatform
      ? await prisma.accountingConnection.findUnique({
          where: {
            companyId_platform: {
              companyId,
              platform: seededPlatform,
            },
          },
          select: {
            connectionMetadata: true,
          },
        })
      : null;

    const connectionMetadata =
      seededConnection?.connectionMetadata &&
      typeof seededConnection.connectionMetadata === "object" &&
      !Array.isArray(seededConnection.connectionMetadata)
        ? (seededConnection.connectionMetadata as Record<string, unknown>)
        : {};
    const snapshot =
      company?.accountingSystem === "INFOR_M3"
        ? parseAccountSnapshot(connectionMetadata.inforM3AccountSeedSnapshot)
        : company?.accountingSystem === "QUICKBOOKS_DESKTOP"
          ? parseAccountSnapshot(connectionMetadata.quickbooksDesktopAccountSeedSnapshot)
          : [];
    const snapshotById = new Map(snapshot.map((row) => [normalize(row.accountId), row]));
    const snapshotByName = new Map(snapshot.map((row) => [normalize(row.accountName), row]));

    const allowedTargetFields = getAllowedTargetFieldSet(company?.industrySectorCategory || '01');
    const invalidMappings = mappings.filter((m: any) => {
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField);
      return normalizedTargetField && !allowedTargetFields.has(normalizedTargetField);
    });
    const statusCounts = {
      total: mappings.length,
      new: 0,
      changed: 0,
      inactive: 0,
      unmapped: 0,
    };
    const sanitizedMappings = mappings.map((m: any) => {
      const sourceMatch =
        snapshotById.get(normalize(m.qbAccountId)) || snapshotByName.get(normalize(m.qbAccount));
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField);
      const isUnmapped =
        !normalizedTargetField || normalizedTargetField === "unmapped";
      let sourceStatus: "mapped" | "new" | "changed" | "inactive" = isUnmapped ? "new" : "mapped";
      if (snapshot.length > 0 && !sourceMatch) {
        sourceStatus = "inactive";
      } else if (sourceMatch) {
        const nameChanged = normalize(sourceMatch.accountName) !== normalize(m.qbAccount);
        const classChanged =
          normalize(sourceMatch.classification || "") !== normalize(m.qbAccountClassification || "");
        if (nameChanged || classChanged) sourceStatus = "changed";
      }
      if (sourceStatus === "new") statusCounts.new += 1;
      if (sourceStatus === "changed") statusCounts.changed += 1;
      if (sourceStatus === "inactive") statusCounts.inactive += 1;
      if (isUnmapped) statusCounts.unmapped += 1;

      if (!normalizedTargetField || allowedTargetFields.has(normalizedTargetField)) {
        return {
          ...m,
          targetField: normalizedTargetField,
          sourceStatus,
        };
      }
      return {
        ...m,
        invalidTargetField: m.targetField,
        targetField: "",
        sourceStatus,
      };
    });

    console.log(
      `Retrieved ${mappings.length} mappings for company ${companyId}`,
    );
    if (mappings.length > 0) {
      console.log("First mapping:", mappings[0]);
      console.log(
        "First mapping has lobAllocations?",
        !!mappings[0].lobAllocations,
      );
      if (mappings[0].lobAllocations) {
        console.log("LOB Allocations:", mappings[0].lobAllocations);
      }
    }
    if (company?.linesOfBusiness) {
      console.log("Company LOB names:", company.linesOfBusiness);
    }

    return NextResponse.json({
      mappings: sanitizedMappings,
      linesOfBusiness: company?.linesOfBusiness || [],
      userDefinedAllocations: [], // Not available in current schema
      industrySectorCategory: company?.industrySectorCategory || '01',
      invalidMappings: invalidMappings.map((m: any) => ({
        qbAccount: m.qbAccount,
        invalidTargetField: m.targetField,
        qbAccountClassification: m.qbAccountClassification,
      })),
      invalidMappingsCount: invalidMappings.length,
      sourceSummary: {
        ...statusCounts,
        lastSeedAt:
          company?.accountingSystem === "INFOR_M3"
            ? typeof connectionMetadata.inforM3AccountSeedLastRunAt === "string"
              ? connectionMetadata.inforM3AccountSeedLastRunAt
              : null
            : company?.accountingSystem === "QUICKBOOKS_DESKTOP"
              ? typeof connectionMetadata.quickbooksDesktopAccountSeedLastRunAt === "string"
                ? connectionMetadata.quickbooksDesktopAccountSeedLastRunAt
                : null
              : null,
      },
    });
  } catch (error: any) {
    console.error("❌ Error fetching mappings:", error);
    console.error("❌ Error details:", error.message);
    console.error("❌ Error stack:", error.stack);
    return NextResponse.json(
      { error: "Failed to fetch mappings", details: error.message },
      { status: 500 },
    );
  }
}

// POST - Save or update mappings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, mappings, linesOfBusiness } = body;

    if (!companyId || !mappings || !Array.isArray(mappings)) {
      return NextResponse.json(
        { error: "Missing required fields: companyId and mappings array" },
        { status: 400 },
      );
    }

    console.log(`Saving ${mappings.length} mappings for company ${companyId}`);
    console.log("First few mappings:", mappings.slice(0, 3));

    // Resolve company sector for sector-specific Revenue/COGS validation.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, industrySectorCategory: true },
    });
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 },
      );
    }

    const allowedTargetFields = getAllowedTargetFieldSet(company.industrySectorCategory || '01');

    const uniqueMappings = mappings.filter(
      (mapping: any, index: number, self: any[]) =>
        index === self.findIndex((m: any) => m.qbAccount === mapping.qbAccount),
    );
    const sanitizedUniqueMappings = uniqueMappings.map((m: any) => {
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField);
      const isExplicitlyMapped = normalizedTargetField && normalizedTargetField !== "unmapped";
      if (isExplicitlyMapped && !allowedTargetFields.has(normalizedTargetField)) {
        return {
          ...m,
          invalidTargetField: m.targetField,
          targetField: "unmapped",
        };
      }
      return {
        ...m,
        targetField: normalizedTargetField || "unmapped",
      };
    });
    const mappedRows = sanitizedUniqueMappings.filter(
      (m: any) => m.targetField && m.targetField !== "unmapped",
    );
    const invalidMappings = sanitizedUniqueMappings.filter((m: any) => m.invalidTargetField);
    console.log(
      `Prepared ${mappedRows.length} mapped rows and ${sanitizedUniqueMappings.length - mappedRows.length} unmapped rows`,
    );
    console.log("Mappings sample:", sanitizedUniqueMappings.slice(0, 2));

    // Save the LOB names to the Company record if provided
    if (
      linesOfBusiness &&
      Array.isArray(linesOfBusiness) &&
      linesOfBusiness.length > 0
    ) {
      await prisma.company.update({
        where: { id: companyId },
        data: { linesOfBusiness: linesOfBusiness },
      });
      console.log(
        `Saved ${linesOfBusiness.length} LOB names to company record`,
      );
    }

    let created = 0;
    let updated = 0;
    for (const m of sanitizedUniqueMappings) {
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField);
      const targetField =
        normalizedTargetField && normalizedTargetField !== "" ? normalizedTargetField : "unmapped";
      const baseMappingData = {
        qbAccountId: m.qbAccountId || null,
        qbAccountCode: m.qbAccountCode || null,
        qbAccountClassification: m.qbAccountClassification || null,
        targetField,
      };
      const extendedMappingData = {
        ...baseMappingData,
        allocationMethod: m.allocationMethod || "manual",
        confidence: m.confidence || "medium",
        lobAllocations: m.lobAllocations || null,
      };
      const existing = await prisma.accountMapping.findUnique({
        where: {
          companyId_qbAccount: {
            companyId,
            qbAccount: m.qbAccount,
          },
        },
        select: { id: true },
      });
      if (!existing) {
        try {
          await prisma.accountMapping.create({
            data: {
              companyId,
              qbAccount: m.qbAccount,
              ...extendedMappingData,
            },
          });
        } catch (createError: any) {
          const message = String(createError?.message || "");
          const isCompatFieldError =
            message.includes("Unknown argument `allocationMethod`") ||
            message.includes("Unknown argument `confidence`") ||
            message.includes("Unknown argument `lobAllocations`");
          if (!isCompatFieldError) throw createError;
          console.warn(
            "AccountMapping create fallback: schema/client does not support extended mapping fields in this environment.",
          );
          await prisma.accountMapping.create({
            data: {
              companyId,
              qbAccount: m.qbAccount,
              ...baseMappingData,
            },
          });
        }
        created += 1;
      } else {
        try {
          await prisma.accountMapping.update({
            where: { id: existing.id },
            data: extendedMappingData,
          });
        } catch (updateError: any) {
          const message = String(updateError?.message || "");
          const isCompatFieldError =
            message.includes("Unknown argument `allocationMethod`") ||
            message.includes("Unknown argument `confidence`") ||
            message.includes("Unknown argument `lobAllocations`");
          if (!isCompatFieldError) throw updateError;
          console.warn(
            "AccountMapping update fallback: schema/client does not support extended mapping fields in this environment.",
          );
          await prisma.accountMapping.update({
            where: { id: existing.id },
            data: baseMappingData,
          });
        }
        updated += 1;
      }
    }

    console.log(`Upserted mappings: created=${created}, updated=${updated}`);

    // Verify they were saved
    const verification = await prisma.accountMapping.findMany({
      where: { companyId },
    });
    console.log(
      `Verification: ${verification.length} mappings now in database for company ${companyId}`,
    );

    return NextResponse.json({
      success: true,
      count: created + updated,
      created,
      updated,
      filtered: sanitizedUniqueMappings.length - mappedRows.length,
      duplicates: mappings.length - uniqueMappings.length,
      invalidCount: invalidMappings.length,
      invalidMappings: invalidMappings.slice(0, 10).map((m: any) => ({
        qbAccount: m.qbAccount,
        invalidTargetField: m.invalidTargetField,
        classification: m.qbAccountClassification,
      })),
      verified: verification.length,
    });
  } catch (error: any) {
    console.error("Error saving mappings:", error);
    return NextResponse.json(
      { error: "Failed to save mappings", details: error.message },
      { status: 500 },
    );
  }
}

// DELETE - Delete mappings for a company
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const id = searchParams.get("id");

    // If companyId is provided, delete all mappings for that company
    if (companyId) {
      const deleted = await prisma.accountMapping.deleteMany({
        where: { companyId },
      });
      console.log(`Deleted ${deleted.count} mappings for company ${companyId}`);
      return NextResponse.json({ success: true, count: deleted.count });
    }

    // If id is provided, delete that specific mapping
    if (id) {
      await prisma.accountMapping.delete({
        where: { id },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Missing id or companyId parameter" },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("Error deleting mapping:", error);
    return NextResponse.json(
      { error: "Failed to delete mapping", details: error.message },
      { status: 500 },
    );
  }
}
