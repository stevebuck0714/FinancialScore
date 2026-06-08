-- Manual migration: add standalone DataRoomDocument storage.
-- Data Room documents must not share CompanyDocument records with the
-- consultant/internal Documents repository.

CREATE TABLE IF NOT EXISTS "DataRoomDocument" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  "category" "CompanyDocumentCategory" NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "blobPathname" TEXT,
  "contentType" TEXT,
  "sizeBytes" INTEGER,
  "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "extractionError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataRoomDocument_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "DataRoomDocument"
    ADD CONSTRAINT "DataRoomDocument_blobUrl_key" UNIQUE ("blobUrl");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "DataRoomDocument"
    ADD CONSTRAINT "DataRoomDocument_blobPathname_key" UNIQUE ("blobPathname");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "DataRoomDocument"
    ADD CONSTRAINT "DataRoomDocument_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "DataRoomDocument"
    ADD CONSTRAINT "DataRoomDocument_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "DataRoomDocument_companyId_idx" ON "DataRoomDocument" ("companyId");
CREATE INDEX IF NOT EXISTS "DataRoomDocument_uploadedByUserId_idx" ON "DataRoomDocument" ("uploadedByUserId");
CREATE INDEX IF NOT EXISTS "DataRoomDocument_category_idx" ON "DataRoomDocument" ("category");
CREATE INDEX IF NOT EXISTS "DataRoomDocument_createdAt_idx" ON "DataRoomDocument" ("createdAt");

-- Preserve existing Data Room files that were previously stored as CompanyDocument
-- rows and referenced from Company.userDefinedAllocations.dataRoom.documentIndex.
WITH indexed_dataroom_documents AS (
  SELECT DISTINCT
    item ->> 'documentId' AS "documentId"
  FROM "Company" c
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(c."userDefinedAllocations"::jsonb -> 'dataRoom' -> 'documentIndex', '[]'::jsonb)
  ) item
  WHERE item ->> 'documentId' IS NOT NULL
)
INSERT INTO "DataRoomDocument" (
  "id",
  "companyId",
  "uploadedByUserId",
  "category",
  "originalFileName",
  "blobUrl",
  "blobPathname",
  "contentType",
  "sizeBytes",
  "extractionStatus",
  "extractionError",
  "createdAt",
  "updatedAt"
)
SELECT
  cd."id",
  cd."companyId",
  cd."uploadedByUserId",
  cd."category",
  cd."originalFileName",
  cd."blobUrl",
  cd."blobPathname",
  cd."contentType",
  cd."sizeBytes",
  cd."extractionStatus",
  cd."extractionError",
  cd."createdAt",
  cd."updatedAt"
FROM "CompanyDocument" cd
JOIN indexed_dataroom_documents idx ON idx."documentId" = cd."id"
ON CONFLICT ("id") DO NOTHING;

WITH indexed_dataroom_documents AS (
  SELECT DISTINCT
    item ->> 'documentId' AS "documentId"
  FROM "Company" c
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(c."userDefinedAllocations"::jsonb -> 'dataRoom' -> 'documentIndex', '[]'::jsonb)
  ) item
  WHERE item ->> 'documentId' IS NOT NULL
)
DELETE FROM "CompanyDocument" cd
USING indexed_dataroom_documents idx
WHERE cd."id" = idx."documentId"
  AND EXISTS (
    SELECT 1
    FROM "DataRoomDocument" dr
    WHERE dr."id" = cd."id"
  );
