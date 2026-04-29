import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

type SavePlatosClosetWorkbookSnapshotInput = {
  companyId: string;
  documentId?: string | null;
  originalFileName?: string | null;
  blobUrl?: string | null;
  workbookPeriod?: string | null;
  storeNumber?: string | null;
  cityState?: string | null;
  visitDateText?: string | null;
  openDateText?: string | null;
  salesTrend?: number | null;
  buysTrend?: number | null;
  rowCount: number;
  departmentCount: number;
  categoryCount: number;
  parsedWorkbook: Record<string, unknown>;
};

export async function savePlatosClosetWorkbookSnapshot(input: SavePlatosClosetWorkbookSnapshotInput): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "PlatosClosetWorkbookSnapshot" (
      "id",
      "companyId",
      "sourceCode",
      "frequency",
      "documentId",
      "originalFileName",
      "blobUrl",
      "workbookPeriod",
      "storeNumber",
      "cityState",
      "visitDateText",
      "openDateText",
      "salesTrend",
      "buysTrend",
      "rowCount",
      "departmentCount",
      "categoryCount",
      "parsedWorkbook",
      "uploadedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      md5(random()::text || clock_timestamp()::text),
      ${input.companyId},
      'PLATOS_CLOSET_STORE_VISIT',
      'monthly',
      ${input.documentId ?? null},
      ${input.originalFileName ?? null},
      ${input.blobUrl ?? null},
      ${input.workbookPeriod ?? null},
      ${input.storeNumber ?? null},
      ${input.cityState ?? null},
      ${input.visitDateText ?? null},
      ${input.openDateText ?? null},
      ${input.salesTrend ?? null},
      ${input.buysTrend ?? null},
      ${input.rowCount},
      ${input.departmentCount},
      ${input.categoryCount},
      ${JSON.stringify(input.parsedWorkbook)}::jsonb,
      NOW(),
      NOW(),
      NOW()
    )
  `);
}

