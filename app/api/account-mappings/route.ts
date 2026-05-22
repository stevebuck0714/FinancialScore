import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAllowedTargetFieldSet, getTargetFieldOptions } from "@/lib/constants/sector-target-fields";
import { rebuildDailyFinancialSnapshotsFromGL } from "@/lib/financial/daily-bs-from-gl";
import { syncMonthlyFinancialBsFromDailySnapshot } from "@/lib/financials/sync-monthly-bs-from-daily";
import { syncMonthlyFinancialPnlFromDailySnapshot } from "@/lib/financials/sync-monthly-pnl-from-daily";

export const dynamic = "force-dynamic";
// Mapping save can trigger a downstream DFS rebuild (Infor tenants only)
// which takes ~10-30s for a full multi-year window. Bump beyond default.
export const maxDuration = 120;

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
  if (compact === "ignored" || compact === "ignore" || compact === "donotprocess") {
    return "ignored";
  }
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

function isIgnoredTargetField(value: unknown): boolean {
  return String(value || "").trim().toLowerCase() === "ignored";
}

function isExcludedTargetField(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "unmapped" || normalized === "ignored";
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

function buildMappingIdentityKey(mapping: {
  accountName?: string | null;
  accountId?: string | null;
  accountCode?: string | null;
}): string {
  const idOrCode = normalize(mapping.accountId) || normalize(mapping.accountCode);
  const name = normalizeForCompare(String(mapping.accountName || ""));
  if (idOrCode && name) return `${idOrCode}|${name}`;
  return idOrCode || name;
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
  const pickFirstString = (record: Record<string, unknown>, keys: string[]): string => {
    for (const key of keys) {
      const raw = record[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
      if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    }
    return "";
  };
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      // CSI payloads can emit class/account identifiers as ClassId/classId.
      const accountId = pickFirstString(record, [
        "accountId",
        "classId",
        "ClassId",
        "accountCode",
        "acct",
        "Acct",
        "account",
        "Account",
      ]);
      const accountName = pickFirstString(record, [
        "accountName",
        "name",
        "Name",
        "description",
        "Description",
        "ChaDescription",
        "FRDerDescription",
      ]);
      if (!accountId || !accountName) return null;
      return {
        accountId,
        accountName,
        accountCode: pickFirstString(record, [
          "accountCode",
          "classId",
          "ClassId",
          "acct",
          "Acct",
          "account",
          "Account",
        ]) || null,
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
  if (isExcludedTargetField(normalized)) return "other";
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
  accountName?: string | null;
  accountCode?: string | null;
  accountClassification?: string | null;
}): boolean {
  const classification = stripManualClassificationPrefix(mapping.accountClassification).toLowerCase();
  const accountName = String(mapping.accountName || "").toLowerCase();
  const code = extractNormalizedAccountCode(mapping.accountCode, mapping.accountName);
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
      const accountName = String(account.FullyQualifiedName || account.Name || "").trim();
      if (!accountId || !accountName) return null;
      const rawAccountCode = String(account.AcctNum || "").trim();
      const accountCode = rawAccountCode && rawAccountCode !== accountId ? rawAccountCode : null;
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
      orderBy: { accountName: "asc" },
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
      const byId = snapshotById.get(normalize(mapping?.accountId));
      if (byId) return byId;
      const byName = snapshotByName.get(normalize(mapping?.accountName));
      if (byName) return byName;
      const byComparableName = snapshotByComparableName.get(normalizeForCompare(String(mapping?.accountName || "")));
      if (byComparableName) return byComparableName;
      const normalizedCode = extractNormalizedAccountCode(
        mapping?.accountCode,
        mapping?.accountId,
        mapping?.accountName,
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
      const effectiveClassification = isManualClassification(m.accountClassification)
        ? m.accountClassification
        : (sourceMatch?.classification || m.accountClassification);
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField, sectorCategory);
      if (!normalizedTargetField) return false;
      if (isIgnoredTargetField(normalizedTargetField)) return false;
      const invalidForSector = !allowedTargetFields.has(normalizedTargetField);
      const semanticallyInvalid =
        (isLikelyEquityMapping({ ...m, accountClassification: effectiveClassification }) &&
          isRevenueTargetField(normalizedTargetField)) ||
        isTargetFieldIncompatibleWithClassification(
          normalizedTargetField,
          effectiveClassification,
          m.accountName,
          m.accountCode || m.accountId,
        );
      return invalidForSector || semanticallyInvalid;
    });
    const statusCounts = {
      total: mappings.length,
      new: 0,
      changed: 0,
      inactive: 0,
      unmapped: 0,
      ignored: 0,
    };
    const sanitizedMappings = mappings.map((m: any) => {
      const sourceMatch = findSourceMatch(m);
      const effectiveClassification = isManualClassification(m.accountClassification)
        ? m.accountClassification
        : (sourceMatch?.classification || m.accountClassification);
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField, sectorCategory);
      const isIgnored = isIgnoredTargetField(normalizedTargetField);
      const semanticallyInvalid =
        !isIgnored &&
        ((isLikelyEquityMapping({ ...m, accountClassification: effectiveClassification }) &&
          isRevenueTargetField(normalizedTargetField)) ||
          isTargetFieldIncompatibleWithClassification(
            normalizedTargetField,
            effectiveClassification,
            m.accountName,
            m.accountCode || m.accountId,
          ));
      const effectiveTargetField = normalizedTargetField;
      const isUnmapped =
        !effectiveTargetField || effectiveTargetField === "unmapped";
      let sourceStatus: "mapped" | "new" | "changed" | "inactive" = isUnmapped ? "new" : "mapped";
      if (snapshot.length > 0 && !sourceMatch) {
        sourceStatus = "inactive";
      } else if (sourceMatch) {
        const nameChanged = normalize(sourceMatch.accountName) !== normalize(m.accountName);
        const classChanged =
          normalize(sourceMatch.classification || "") !== normalize(m.accountClassification || "");
        if (nameChanged || classChanged) sourceStatus = "changed";
      }
      if (sourceStatus === "new") statusCounts.new += 1;
      if (sourceStatus === "changed") statusCounts.changed += 1;
      if (sourceStatus === "inactive") statusCounts.inactive += 1;
      if (isUnmapped) statusCounts.unmapped += 1;
      if (isIgnored) statusCounts.ignored += 1;

      if (isExcludedTargetField(effectiveTargetField) || allowedTargetFields.has(effectiveTargetField)) {
        const sourceCode =
          sourceMatch?.accountCode && sourceMatch.accountCode !== sourceMatch.accountId
            ? sourceMatch.accountCode
            : null;
        const storedCode = m.accountCode && m.accountCode !== m.accountId ? m.accountCode : null;
        return {
          ...m,
          accountId: m.accountId || sourceMatch?.accountId || null,
          accountName: sourceMatch?.accountName || m.accountName,
          accountCode: sourceCode || storedCode || null,
          accountClassification: effectiveClassification,
          targetField: effectiveTargetField,
          sourceStatus,
        };
      }
      const sourceCode =
        sourceMatch?.accountCode && sourceMatch.accountCode !== sourceMatch.accountId
          ? sourceMatch.accountCode
          : null;
      const storedCode = m.accountCode && m.accountCode !== m.accountId ? m.accountCode : null;
      return {
        ...m,
        accountId: m.accountId || sourceMatch?.accountId || null,
        accountName: sourceMatch?.accountName || m.accountName,
        accountCode: sourceCode || storedCode || null,
        accountClassification: effectiveClassification,
        invalidTargetField: m.targetField,
        targetField: "",
        validationWarning: semanticallyInvalid ? "classification_mismatch" : "invalid_target_field",
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
        accountName: m.accountName,
        invalidTargetField: m.targetField,
        accountClassification: m.accountClassification,
      })),
      invalidMappingsCount: invalidMappings.length,
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
    const quickBooksById = new Map(
      quickBooksSnapshot.map((row) => [normalize(row.accountId), row]),
    );

    const seenIdentity = new Set<string>();
    const uniqueMappings = mappings.filter((mapping: any) => {
      const key = buildMappingIdentityKey(mapping);
      if (!key) return false;
      if (seenIdentity.has(key)) return false;
      seenIdentity.add(key);
      return true;
    });
    const sanitizedUniqueMappings = uniqueMappings.map((m: any) => {
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField, sectorCategory);
      const isIgnored = isIgnoredTargetField(normalizedTargetField);
      const semanticallyInvalid =
        !isIgnored &&
        ((isLikelyEquityMapping(m) && isRevenueTargetField(normalizedTargetField)) ||
          isTargetFieldIncompatibleWithClassification(
            normalizedTargetField,
            m.accountClassification,
            m.accountName,
            m.accountCode || m.accountId,
          ));
      const isExplicitlyMapped = normalizedTargetField && !isExcludedTargetField(normalizedTargetField);
      if (isExplicitlyMapped && !allowedTargetFields.has(normalizedTargetField)) {
        return {
          ...m,
          invalidTargetField: m.targetField,
          targetField: "unmapped",
          validationWarning: semanticallyInvalid ? "classification_mismatch" : "invalid_target_field",
        };
      }
      return {
        ...m,
        targetField: normalizedTargetField || "unmapped",
        ...(semanticallyInvalid ? { validationWarning: "classification_mismatch" } : {}),
      };
    });
    const mappedRows = sanitizedUniqueMappings.filter(
      (m: any) => !isExcludedTargetField(m.targetField),
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
    const existingMappingsAll = await prisma.accountMapping.findMany({
      where: { companyId },
      select: {
        id: true,
        accountName: true,
        accountId: true,
        accountCode: true,
        accountClassification: true,
      },
    });
    const existingByComparableName = new Map(
      existingMappingsAll.map((row) => [normalizeForCompare(String(row.accountName || "")), row]),
    );
    for (const m of sanitizedUniqueMappings) {
      const normalizedTargetField = normalizeTargetFieldValue(m.targetField, sectorCategory);
      const targetField =
        normalizedTargetField && normalizedTargetField !== "" ? normalizedTargetField : "unmapped";
      const incomingAccountId = String(m.accountId || "").trim() || null;
      const incomingAccountCode = String(m.accountCode || "").trim() || null;
      const incomingAccountName = String(m.accountName || "").trim();
      const existing = await prisma.accountMapping.findFirst({
        where: {
          companyId,
          OR: [
            ...(incomingAccountId ? [{ accountId: incomingAccountId }] : []),
            ...(incomingAccountCode ? [{ accountCode: incomingAccountCode, accountName: incomingAccountName }] : []),
            ...(!incomingAccountId && !incomingAccountCode && incomingAccountName ? [{ accountName: incomingAccountName }] : []),
          ],
        },
        select: {
          id: true,
          accountName: true,
          accountId: true,
          accountCode: true,
          accountClassification: true,
        },
      });
      const nameFallbackExisting =
        !existing && incomingAccountName
          ? existingByComparableName.get(normalizeForCompare(incomingAccountName))
          : null;
      const matchedExisting = existing || nameFallbackExisting || null;
      const existingAccountId = String(matchedExisting?.accountId || "").trim() || null;
      const existingAccountCode = String(matchedExisting?.accountCode || "").trim() || null;
      const sourceMatch =
        quickBooksById.get(normalize(m.accountId)) ||
        quickBooksByName.get(normalize(m.accountName));
      const sourceAccountId = sourceMatch?.accountId ? String(sourceMatch.accountId).trim() : null;
      const sourceAccountCode =
        sourceMatch?.accountCode && sourceMatch.accountCode !== sourceMatch.accountId
          ? String(sourceMatch.accountCode).trim()
          : null;
      const existingUsableCode =
        existingAccountCode && existingAccountCode !== existingAccountId ? existingAccountCode : null;
      const incomingUsableCode =
        incomingAccountCode && incomingAccountCode !== incomingAccountId ? incomingAccountCode : null;
      const resolvedAccountName = sourceMatch?.accountName || incomingAccountName;
      const baseMappingData = {
        accountId: incomingAccountId || existingAccountId || sourceAccountId,
        accountCode: sourceAccountCode || incomingUsableCode || existingUsableCode,
        accountClassification:
          m.accountClassification || matchedExisting?.accountClassification || null,
        targetField,
      };
      const incomingOwnerPercent = (() => {
        const raw = m?.ownerPercent;
        if (raw === null || raw === undefined || raw === "") return null;
        const num = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(num)) return null;
        return Math.max(0, Math.min(100, num));
      })();
      const extendedMappingData = {
        ...baseMappingData,
        allocationMethod: m.allocationMethod || "manual",
        confidence: m.confidence || "medium",
        lobAllocations: m.lobAllocations || null,
        ownerPercent: incomingOwnerPercent,
      };
      if (!matchedExisting) {
        try {
          await prisma.accountMapping.create({
            data: {
              companyId,
              accountName: resolvedAccountName,
              ...extendedMappingData,
            },
          });
        } catch (createError: any) {
          const message = String(createError?.message || "");
          const isCompatFieldError =
            message.includes("Unknown argument `allocationMethod`") ||
            message.includes("Unknown argument `confidence`") ||
            message.includes("Unknown argument `lobAllocations`") ||
            message.includes("Unknown argument `ownerPercent`") ||
            message.includes('column "ownerPercent" of relation "AccountMapping" does not exist');
          if (!isCompatFieldError) throw createError;
          console.warn(
            "AccountMapping create fallback: schema/client does not support extended mapping fields in this environment.",
          );
          await prisma.accountMapping.create({
            data: {
              companyId,
              accountName: resolvedAccountName,
              ...baseMappingData,
            },
          });
        }
        created += 1;
      } else {
        try {
          await prisma.accountMapping.update({
            where: { id: matchedExisting.id },
            data: {
              accountName: resolvedAccountName,
              ...extendedMappingData,
            },
          });
        } catch (updateError: any) {
          const message = String(updateError?.message || "");
          const isCompatFieldError =
            message.includes("Unknown argument `allocationMethod`") ||
            message.includes("Unknown argument `confidence`") ||
            message.includes("Unknown argument `lobAllocations`") ||
            message.includes("Unknown argument `ownerPercent`") ||
            message.includes('column "ownerPercent" of relation "AccountMapping" does not exist');
          if (!isCompatFieldError) throw updateError;
          console.warn(
            "AccountMapping update fallback: schema/client does not support extended mapping fields in this environment.",
          );
          await prisma.accountMapping.update({
            where: { id: matchedExisting.id },
            data: {
              accountName: resolvedAccountName,
              ...baseMappingData,
            },
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

    // For Infor (M3 / CSI) tenants, propagate the new mappings into financial
    // snapshots immediately so Daily Financials and Data Review reflect the
    // change without waiting for the next scheduled sync. This is two steps:
    //   1) Rebuild DailyFinancialSnapshot rows from GLTransactionFact using
    //      the freshly-saved AccountMapping rows.
    //   2) Sync MonthlyFinancial.bs* columns from those rebuilt DFS EOM rows
    //      so Data Review's BS lines update.
    // Best-effort: any failure is reported in the response payload but does
    // not fail the mapping save itself.
    let propagation:
      | {
          ok: boolean;
          rebuilt?: { datesProcessed: number; rowsWritten: number; mappedAccountCount: number };
          bsSync?: { monthsUpdated: number; monthsSkippedNoDfs: number; errors: number };
          pnlSync?: { monthsUpdated: number; monthsSkipped: number; errors: number };
          error?: string;
          skipped?: string;
        }
      | null = null;
    const isInforCompany =
      accountingSystem === "INFOR_M3" || accountingSystem === "INFOR_CSI";
    if (isInforCompany) {
      try {
        const monthlyBounds = await prisma.monthlyFinancial.aggregate({
          where: { companyId },
          _min: { monthDate: true },
          _max: { monthDate: true },
        });
        const minMonth = monthlyBounds._min.monthDate;
        const maxMonth = monthlyBounds._max.monthDate;
        if (minMonth && maxMonth) {
          const startDate = new Date(
            Date.UTC(minMonth.getUTCFullYear(), minMonth.getUTCMonth(), 1, 0, 0, 0),
          );
          const endDate = new Date(
            Date.UTC(maxMonth.getUTCFullYear(), maxMonth.getUTCMonth() + 1, 0, 23, 59, 59),
          );
          const rebuilt = await rebuildDailyFinancialSnapshotsFromGL({
            companyId,
            startDate,
            endDate,
            frequency: "daily",
            // Mapping changes can rewire which accounts feed which DFS
            // P&L columns. Force overwrite so the DFS rows reflect the
            // new mapping immediately, otherwise stale per-day P&L
            // values linger until the nightly sync.
            pnlUpdateMode: "overwrite",
          });
          const bsSync = await syncMonthlyFinancialBsFromDailySnapshot(companyId);
          // Re-derive MonthlyFinancial P&L scalars + revenue/cogs/expense
          // breakdown JSON from GL truth so Data Review and the rest of
          // useMasterData reflect the mapping change without waiting for
          // a nightly job. Idempotent and best-effort.
          const pnlSync = await syncMonthlyFinancialPnlFromDailySnapshot(companyId);
          propagation = {
            ok: true,
            rebuilt: {
              datesProcessed: rebuilt.datesProcessed,
              rowsWritten: rebuilt.rowsWritten,
              mappedAccountCount: rebuilt.mappedAccountCount,
            },
            bsSync: {
              monthsUpdated: bsSync.monthsUpdated,
              monthsSkippedNoDfs: bsSync.monthsSkippedNoDfs,
              errors: bsSync.errors,
            },
            pnlSync: {
              monthsUpdated: pnlSync.monthsUpdated,
              monthsSkipped: pnlSync.monthsSkippedNoMappings,
              errors: pnlSync.errors,
            },
          };
        } else {
          propagation = { ok: false, skipped: "no_monthly_bounds" };
        }
      } catch (err: any) {
        propagation = { ok: false, error: String(err?.message || err) };
      }
    }

    return NextResponse.json({
      success: true,
      count: created + updated,
      created,
      updated,
      filtered: sanitizedUniqueMappings.length - mappedRows.length,
      duplicates: mappings.length - uniqueMappings.length,
      invalidCount: invalidMappings.length,
      invalidMappings: invalidMappings.slice(0, 10).map((m: any) => ({
        accountName: m.accountName,
        invalidTargetField: m.invalidTargetField,
        classification: m.accountClassification,
      })),
      verified: verification.length,
      propagation,
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
