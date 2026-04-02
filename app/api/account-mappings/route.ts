import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAllowedTargetFieldSet, getTargetFieldOptions } from "@/lib/constants/sector-target-fields";

export const dynamic = "force-dynamic";

function normalizeForCompare(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeTargetFieldValue(value: unknown, industrySectorCategory?: string | null): string {
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
  // Coerce legacy label-style values (e.g., "Other Revenue") to valid option values.
  const sectorCategory = industrySectorCategory || "01";
  const options = Object.values(getTargetFieldOptions(sectorCategory)).flat();
  const byExactValue = options.find((opt) => opt.value.toLowerCase() === normalized);
  if (byExactValue) return byExactValue.value;

  const rawComparable = normalizeForCompare(raw);
  const byValueComparable = options.find((opt) => normalizeForCompare(opt.value) === rawComparable);
  if (byValueComparable) return byValueComparable.value;
  const byLabelComparable = options.find((opt) => normalizeForCompare(opt.label) === rawComparable);
  if (byLabelComparable) return byLabelComparable.value;

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

function stripManualClassificationPrefix(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.toLowerCase().startsWith("manual:") ? raw.slice("manual:".length).trim() : raw;
}

function isManualClassification(value: unknown): boolean {
  return String(value || "").trim().toLowerCase().startsWith("manual:");
}

function parseAccountSnapshot(value: unknown): AccountSnapshotRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const accountId =
        typeof record.accountId === "string" ? record.accountId.trim()
          : typeof record.accountCode === "string" ? record.accountCode.trim()
          : typeof record.acct === "string" ? record.acct.trim()
          : typeof record.Acct === "string" ? record.Acct.trim()
          : typeof record.account === "string" ? record.account.trim()
          : typeof record.Account === "string" ? record.Account.trim()
          : "";
      const accountName =
        typeof record.accountName === "string" ? record.accountName.trim()
          : typeof record.description === "string" ? record.description.trim()
          : typeof record.Description === "string" ? record.Description.trim()
          : typeof record.ChaDescription === "string" ? record.ChaDescription.trim()
          : typeof record.FRDerDescription === "string" ? record.FRDerDescription.trim()
          : "";
      if (!accountId || !accountName) return null;
      return {
        accountId,
        accountName,
        accountCode:
          typeof record.accountCode === "string" ? record.accountCode.trim()
            : typeof record.acct === "string" ? record.acct.trim()
            : typeof record.Acct === "string" ? record.Acct.trim()
            : typeof record.account === "string" ? record.account.trim()
            : typeof record.Account === "string" ? record.Account.trim()
            : null,
        classification:
          typeof record.classification === "string" ? record.classification.trim() : null,
      } as AccountSnapshotRow;
    })
    .filter((row): row is AccountSnapshotRow => !!row);
}

function extractNormalizedAccountCode(...values: unknown[]): number | null {
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    const match = raw.match(/(\d{4,})/);
    if (!match) continue;
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric)) continue;
    if (numeric >= 10000 && numeric % 10 === 0) return Math.floor(numeric / 10);
    if (numeric >= 10000) {
      const firstFour = Number(String(numeric).slice(0, 4));
      if (Number.isFinite(firstFour)) return firstFour;
    }
    return numeric;
  }
  return null;
}

function isRevenueTargetField(targetField: string): boolean {
  const normalized = String(targetField || "").trim().toLowerCase();
  return normalized === "revenue" || normalized === "otherrevenue" || normalized.startsWith("rev_");
}

function getTargetFieldFamily(targetField: string): "revenue" | "cogs" | "expense" | "asset" | "liability" | "equity" | "other" {
  const normalized = String(targetField || "").trim().toLowerCase();
  if (!normalized || normalized === "unmapped") return "other";
  if (normalized === "revenue" || normalized.startsWith("rev_")) return "revenue";
  if (normalized === "nonoperatingincome") return "revenue";
  if (
    normalized === "costofgoodssold" ||
    normalized === "cogstotal" ||
    normalized.startsWith("cogs_") ||
    normalized.startsWith("cogs")
  ) {
    return "cogs";
  }
  if (
    [
      "payroll",
      "ownerbasepay",
      "ownersretirement",
      "benefits",
      "insurance",
      "professionalfees",
      "subcontractors",
      "rent",
      "taxlicense",
      "stateincometaxes",
      "federalincometaxes",
      "phonecomm",
      "infrastructure",
      "autotravel",
      "salesexpense",
      "marketing",
      "trainingcert",
      "mealsentertainment",
      "interestexpense",
      "depreciationamortization",
      "otherexpense",
      "expense",
      "operatingexpensetotal",
      "nonoperatingexpense",
      "extraordinaryitems",
    ].includes(normalized)
  ) {
    return "expense";
  }
  if (["cash", "ar", "inventory", "otherca", "tca", "fixedassets", "otherassets", "totalassets"].includes(normalized)) return "asset";
  if (["ap", "loc", "othercl", "tcl", "ltd", "totalliab"].includes(normalized)) return "liability";
  if (
    [
      "ownerscapital",
      "ownersdraw",
      "commonstock",
      "preferredstock",
      "retainedearnings",
      "additionalpaidincapital",
      "treasurystock",
      "totalequity",
      "totallande",
    ].includes(normalized)
  ) {
    return "equity";
  }
  return "other";
}

function getClassificationFamily(classification: unknown): "revenue" | "cogs" | "expense" | "asset" | "liability" | "equity" | "other" {
  const normalized = stripManualClassificationPrefix(classification).toLowerCase();
  if (!normalized) return "other";
  if (normalized === "r") return "revenue";
  if (normalized === "e") return "expense";
  if (normalized === "a") return "asset";
  if (normalized === "l") return "liability";
  if (normalized === "q") return "equity";
  if (normalized === "c") return "cogs";
  if (normalized.includes("cost of goods") || normalized.includes("cost of sales") || normalized.includes("cogs")) return "cogs";
  if (normalized.includes("expense")) return "expense";
  if (normalized.includes("income") || normalized.includes("revenue") || normalized.includes("sales")) return "revenue";
  if (normalized.includes("asset")) return "asset";
  if (normalized.includes("liabil")) return "liability";
  if (normalized.includes("equity")) return "equity";
  return "other";
}

function isLikelyCogsAccount(accountName: unknown, accountCode: unknown, classification: unknown): boolean {
  const name = String(accountName || "").toLowerCase();
  const compactName = name.replace(/[\s_-]+/g, "");
  const cls = stripManualClassificationPrefix(classification).toLowerCase();
  const code = extractNormalizedAccountCode(accountCode, accountName);
  const isCogsCode = Number.isFinite(code) && (code as number) >= 5000 && (code as number) < 6000;
  const isCogsLabel =
    name.includes("cost of sales") ||
    name.includes("costs of sales") ||
    name.includes("cost of goods sold") ||
    name.includes("cost of goods") ||
    name.includes("cogs") ||
    name.includes("direct cost") ||
    compactName.includes("costofsales") ||
    compactName.includes("costofgoodssold") ||
    compactName.includes("costofgoods") ||
    compactName.includes("directcost");
  const isCogsClassification =
    cls.includes("cost of sales") ||
    cls.includes("cost of goods") ||
    cls.includes("cogs") ||
    cls === "c";
  return isCogsCode || isCogsLabel || isCogsClassification;
}

function isTargetFieldIncompatibleWithClassification(
  targetField: string,
  classification: unknown,
  accountName?: unknown,
  accountCode?: unknown,
): boolean {
  const targetFamily = getTargetFieldFamily(targetField);
  const classificationFamily = getClassificationFamily(classification);
  if (targetFamily === "other" || classificationFamily === "other") return false;
  // Several accounting systems emit COGS under generic "Expense".
  // Keep explicit COGS accounts mappable to COGS families.
  if (
    classificationFamily === "expense" &&
    targetFamily === "cogs" &&
    isLikelyCogsAccount(accountName, accountCode, classification)
  ) {
    return false;
  }
  if (classificationFamily === "expense") return targetFamily !== "expense";
  return targetFamily !== classificationFamily;
}

function isLikelyEquityMapping(mapping: {
  qbAccount?: string | null;
  qbAccountCode?: string | null;
  qbAccountClassification?: string | null;
}): boolean {
  const classification = stripManualClassificationPrefix(mapping.qbAccountClassification).toLowerCase();
  const accountName = String(mapping.qbAccount || "").toLowerCase();
  const code = extractNormalizedAccountCode(mapping.qbAccountCode, mapping.qbAccount);
  const isEquityCode = Number.isFinite(code) && (code as number) >= 3000 && (code as number) < 4000;
  const isEquityByLabel =
    classification.includes("equity") ||
    accountName.includes("retained earnings") ||
    accountName.includes("opening balance equity") ||
    accountName.includes("owner's equity") ||
    accountName.includes("owners equity") ||
    accountName.includes("current year earnings") ||
    accountName.includes("net income");
  return isEquityCode || isEquityByLabel;
}

async function loadSeedSnapshotFromMetadataPath(
  companyId: string,
  accountingSystem: string,
): Promise<unknown> {
  if (accountingSystem !== "INFOR_M3" && accountingSystem !== "INFOR_CSI" && accountingSystem !== "QUICKBOOKS_DESKTOP") {
    return null;
  }
  const snapshotPath =
    accountingSystem === "INFOR_M3"
      ? "inforM3AccountSeedSnapshot"
      : accountingSystem === "INFOR_CSI"
        ? "inforCsiAccountSeedSnapshot"
        : "quickbooksDesktopAccountSeedSnapshot";
  const platform = accountingSystem === "QUICKBOOKS_DESKTOP" ? "QUICKBOOKS" : "INFOR_M3";
  const rows = await prisma.$queryRaw<Array<{ snapshot: unknown }>>`
    SELECT "connectionMetadata"->${snapshotPath} AS snapshot
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = CAST(${platform} AS "AccountingPlatform")
    LIMIT 1
  `;
  return rows[0]?.snapshot ?? null;
}

async function loadSeedLastRunAtFromMetadataPath(
  companyId: string,
  accountingSystem: string,
): Promise<string | null> {
  if (accountingSystem !== "INFOR_M3" && accountingSystem !== "INFOR_CSI" && accountingSystem !== "QUICKBOOKS_DESKTOP") {
    return null;
  }
  const runAtPath =
    accountingSystem === "INFOR_M3"
      ? "inforM3AccountSeedLastRunAt"
      : accountingSystem === "INFOR_CSI"
        ? "inforCsiAccountSeedLastRunAt"
        : "quickbooksDesktopAccountSeedLastRunAt";
  const platform = accountingSystem === "QUICKBOOKS_DESKTOP" ? "QUICKBOOKS" : "INFOR_M3";
  const rows = await prisma.$queryRaw<Array<{ run_at: unknown }>>`
    SELECT "connectionMetadata"->>${runAtPath} AS run_at
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = CAST(${platform} AS "AccountingPlatform")
    LIMIT 1
  `;
  const value = rows[0]?.run_at;
  return typeof value === "string" && value.trim() ? value : null;
}

function parseQuickBooksSnapshotFromRawData(rawData: unknown): AccountSnapshotRow[] {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return [];
  const record = rawData as Record<string, unknown>;
  const chart = record.chartOfAccounts;
  if (!chart || typeof chart !== "object" || Array.isArray(chart)) return [];
  const chartRecord = chart as Record<string, unknown>;
  const queryResponse =
    chartRecord.QueryResponse && typeof chartRecord.QueryResponse === "object" && !Array.isArray(chartRecord.QueryResponse)
      ? (chartRecord.QueryResponse as Record<string, unknown>)
      : null;
  const accounts = Array.isArray(queryResponse?.Account) ? (queryResponse?.Account as unknown[]) : [];
  return accounts
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const account = row as Record<string, unknown>;
      const accountId = String(account.Id || "").trim();
      const accountName = String(account.Name || "").trim();
      if (!accountId || !accountName) return null;
      const accountCode = String(account.AcctNum || accountId).trim();
      const classification = String(account.AccountType || account.Classification || "").trim() || null;
      return {
        accountId,
        accountName,
        accountCode,
        classification,
      } as AccountSnapshotRow;
    })
    .filter((row): row is AccountSnapshotRow => !!row);
}

async function loadQuickBooksSnapshotFromLatestFinancialRecord(companyId: string): Promise<AccountSnapshotRow[]> {
  const latestRecord = await prisma.financialRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { rawData: true },
  });
  return parseQuickBooksSnapshotFromRawData(latestRecord?.rawData);
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

    const accountingSystem = String(company?.accountingSystem || '').toUpperCase();
    const seededPlatform =
      accountingSystem === "INFOR_M3" || accountingSystem === "INFOR_CSI"
        ? "INFOR_M3"
        : accountingSystem === "QUICKBOOKS_DESKTOP"
          ? "QUICKBOOKS"
          : null;

    const snapshotRaw = seededPlatform
      ? await loadSeedSnapshotFromMetadataPath(companyId, accountingSystem)
      : null;
    const seedLastRunAt = seededPlatform
      ? await loadSeedLastRunAtFromMetadataPath(companyId, accountingSystem)
      : null;
    const snapshot =
      accountingSystem === "QUICKBOOKS"
        ? await loadQuickBooksSnapshotFromLatestFinancialRecord(companyId)
        : parseAccountSnapshot(snapshotRaw);
    const snapshotById = new Map(snapshot.map((row) => [normalize(row.accountId), row]));
    const snapshotByName = new Map(snapshot.map((row) => [normalize(row.accountName), row]));
    const snapshotByComparableName = new Map(
      snapshot.map((row) => [normalizeForCompare(row.accountName), row]),
    );
    const snapshotByNormalizedCode = new Map<number, AccountSnapshotRow>();
    for (const row of snapshot) {
      const normalizedCode = extractNormalizedAccountCode(row.accountCode, row.accountId, row.accountName);
      if (normalizedCode !== null && !snapshotByNormalizedCode.has(normalizedCode)) {
        snapshotByNormalizedCode.set(normalizedCode, row);
      }
    }
    const findSourceMatch = (mapping: any): AccountSnapshotRow | undefined => {
      const byId = snapshotById.get(normalize(mapping?.qbAccountId));
      if (byId) return byId;
      const byName = snapshotByName.get(normalize(mapping?.qbAccount));
      if (byName) return byName;
      const byComparableName = snapshotByComparableName.get(normalizeForCompare(String(mapping?.qbAccount || "")));
      if (byComparableName) return byComparableName;
      const normalizedCode = extractNormalizedAccountCode(
        mapping?.qbAccountCode,
        mapping?.qbAccountId,
        mapping?.qbAccount,
      );
      if (normalizedCode !== null) {
        const byCode = snapshotByNormalizedCode.get(normalizedCode);
        if (byCode) return byCode;
      }
      return undefined;
    };

    const allowedTargetFields = getAllowedTargetFieldSet(company?.industrySectorCategory || '01');
    const sectorCategory = company?.industrySectorCategory || '01';
    const invalidMappings = mappings.filter((m: any) => {
      const sourceMatch = findSourceMatch(m);
      const effectiveClassification = isManualClassification(m.qbAccountClassification)
        ? m.qbAccountClassification
        : (sourceMatch?.classification || m.qbAccountClassification);
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField, sectorCategory);
      if (!normalizedTargetField) return false;
      const invalidForSector = !allowedTargetFields.has(normalizedTargetField);
      const semanticallyInvalid =
        (isLikelyEquityMapping({ ...m, qbAccountClassification: effectiveClassification }) &&
          isRevenueTargetField(normalizedTargetField)) ||
        isTargetFieldIncompatibleWithClassification(
          normalizedTargetField,
          effectiveClassification,
          m.qbAccount,
          m.qbAccountCode || m.qbAccountId,
        );
      return invalidForSector || semanticallyInvalid;
    });
    const invalidMappingIds = invalidMappings
      .map((m: any) => m.id)
      .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0);
    if (invalidMappingIds.length > 0) {
      try {
        await prisma.accountMapping.updateMany({
          where: {
            id: { in: invalidMappingIds },
            companyId,
          },
          data: {
            targetField: "unmapped",
          },
        });
      } catch (repairError) {
        console.warn("Account mappings auto-repair failed for invalid target fields", repairError);
      }
    }
    const statusCounts = {
      total: mappings.length,
      new: 0,
      changed: 0,
      inactive: 0,
      unmapped: 0,
    };
    const sanitizedMappings = mappings.map((m: any) => {
      const sourceMatch = findSourceMatch(m);
      const effectiveClassification = isManualClassification(m.qbAccountClassification)
        ? m.qbAccountClassification
        : (sourceMatch?.classification || m.qbAccountClassification);
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField, sectorCategory);
      const semanticallyInvalid =
        (isLikelyEquityMapping({ ...m, qbAccountClassification: effectiveClassification }) &&
          isRevenueTargetField(normalizedTargetField)) ||
        isTargetFieldIncompatibleWithClassification(
          normalizedTargetField,
          effectiveClassification,
          m.qbAccount,
          m.qbAccountCode || m.qbAccountId,
        );
      const effectiveTargetField = semanticallyInvalid ? "unmapped" : normalizedTargetField;
      const isUnmapped =
        !effectiveTargetField || effectiveTargetField === "unmapped";
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

      if (!effectiveTargetField || effectiveTargetField === "unmapped" || allowedTargetFields.has(effectiveTargetField)) {
        return {
          ...m,
          qbAccountId: m.qbAccountId || sourceMatch?.accountId || null,
          qbAccountCode: m.qbAccountCode || sourceMatch?.accountCode || sourceMatch?.accountId || null,
          qbAccountClassification: effectiveClassification,
          targetField: effectiveTargetField,
          sourceStatus,
        };
      }
      return {
        ...m,
        qbAccountId: m.qbAccountId || sourceMatch?.accountId || null,
        qbAccountCode: m.qbAccountCode || sourceMatch?.accountCode || sourceMatch?.accountId || null,
        qbAccountClassification: effectiveClassification,
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
      // Avoid repeating the same warning after auto-repair has converted
      // stale invalid target fields to "unmapped" in persistent storage.
      invalidMappingsCount: 0,
      sourceSummary: {
        ...statusCounts,
        lastSeedAt: seedLastRunAt,
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
      select: { id: true, industrySectorCategory: true, accountingSystem: true },
    });
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 },
      );
    }

    const sectorCategory = company.industrySectorCategory || '01';
    const allowedTargetFields = getAllowedTargetFieldSet(sectorCategory);
    const accountingSystem = String((company as any)?.accountingSystem || "").toUpperCase();
    const quickBooksSnapshot =
      accountingSystem === "QUICKBOOKS"
        ? await loadQuickBooksSnapshotFromLatestFinancialRecord(companyId)
        : [];
    const quickBooksByName = new Map(
      quickBooksSnapshot.map((row) => [normalize(row.accountName), row]),
    );

    const uniqueMappings = mappings.filter(
      (mapping: any, index: number, self: any[]) =>
        index === self.findIndex((m: any) => m.qbAccount === mapping.qbAccount),
    );
    const sanitizedUniqueMappings = uniqueMappings.map((m: any) => {
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField, sectorCategory);
      const semanticallyInvalid =
        (isLikelyEquityMapping(m) && isRevenueTargetField(normalizedTargetField)) ||
        isTargetFieldIncompatibleWithClassification(
          normalizedTargetField,
          m.qbAccountClassification,
          m.qbAccount,
          m.qbAccountCode || m.qbAccountId,
        );
      const isExplicitlyMapped = normalizedTargetField && normalizedTargetField !== "unmapped";
      if ((isExplicitlyMapped && !allowedTargetFields.has(normalizedTargetField)) || semanticallyInvalid) {
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
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField, sectorCategory);
      const targetField =
        normalizedTargetField && normalizedTargetField !== "" ? normalizedTargetField : "unmapped";
      const existing = await prisma.accountMapping.findUnique({
        where: {
          companyId_qbAccount: {
            companyId,
            qbAccount: m.qbAccount,
          },
        },
        select: {
          id: true,
          qbAccountId: true,
          qbAccountCode: true,
          qbAccountClassification: true,
        },
      });
      const incomingAccountId = String(m.qbAccountId || "").trim() || null;
      const incomingAccountCode = String(m.qbAccountCode || "").trim() || null;
      const existingAccountId = String(existing?.qbAccountId || "").trim() || null;
      const existingAccountCode = String(existing?.qbAccountCode || "").trim() || null;
      const sourceMatch = quickBooksByName.get(normalize(m.qbAccount));
      const sourceAccountId = sourceMatch?.accountId ? String(sourceMatch.accountId).trim() : null;
      const sourceAccountCode = sourceMatch?.accountCode ? String(sourceMatch.accountCode).trim() : null;
      const baseMappingData = {
        qbAccountId: incomingAccountId || existingAccountId || sourceAccountId,
        qbAccountCode:
          incomingAccountCode || existingAccountCode || sourceAccountCode || incomingAccountId || existingAccountId || sourceAccountId,
        qbAccountClassification:
          m.qbAccountClassification || existing?.qbAccountClassification || null,
        targetField,
      };
      const extendedMappingData = {
        ...baseMappingData,
        allocationMethod: m.allocationMethod || "manual",
        confidence: m.confidence || "medium",
        lobAllocations: m.lobAllocations || null,
      };
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
