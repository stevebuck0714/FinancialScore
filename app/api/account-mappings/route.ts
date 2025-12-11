import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

    // Get the company's saved LOB names
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { linesOfBusiness: true },
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
      mappings,
      linesOfBusiness: company?.linesOfBusiness || [],
      userDefinedAllocations: [], // Not available in current schema
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

    // Filter out mappings with empty targetField (unmapped accounts)
    const validMappings = mappings.filter(
      (m: any) => m.targetField && m.targetField.trim() !== "",
    );
    console.log(
      `Filtered to ${validMappings.length} valid mappings (removed ${mappings.length - validMappings.length} unmapped accounts)`,
    );
    console.log("Valid mappings sample:", validMappings.slice(0, 2));

    // Remove duplicates based on qbAccount to avoid unique constraint violations
    const uniqueMappings = validMappings.filter(
      (mapping, index, self) =>
        index === self.findIndex((m) => m.qbAccount === mapping.qbAccount),
    );
    console.log(
      `After processing: ${uniqueMappings.length} unique valid mappings (removed ${validMappings.length - uniqueMappings.length} duplicates)`,
    );

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

    // Delete existing mappings for this company
    const deleted = await prisma.accountMapping.deleteMany({
      where: { companyId },
    });
    console.log(`Deleted ${deleted.count} existing mappings`);

    // Create new mappings (only valid and unique ones with targetField)
    const createdMappings = await prisma.accountMapping.createMany({
      data: uniqueMappings.map((m: any) => ({
        companyId,
        qbAccount: m.qbAccount,
        qbAccountId: m.qbAccountId || null,
        qbAccountCode: m.qbAccountCode || null,
        qbAccountClassification: m.qbAccountClassification || null,
        targetField: m.targetField,
        confidence: m.confidence || "medium",
        lobAllocations: m.lobAllocations || null,
      })),
    });

    console.log(`Created ${createdMappings.count} new mappings`);

    // Verify they were saved
    const verification = await prisma.accountMapping.findMany({
      where: { companyId },
    });
    console.log(
      `Verification: ${verification.length} mappings now in database for company ${companyId}`,
    );

    return NextResponse.json({
      success: true,
      count: createdMappings.count,
      filtered: mappings.length - validMappings.length,
      duplicates: validMappings.length - uniqueMappings.length,
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
