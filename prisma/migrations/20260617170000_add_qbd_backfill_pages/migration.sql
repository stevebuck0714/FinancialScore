-- Store QuickBooks Desktop Web Connector backfill pages outside the
-- AccountingConnection metadata blob so large backfills can be resumed and
-- imported without rewriting one oversized JSON document on every page.
CREATE TABLE IF NOT EXISTS "QuickBooksDesktopBackfillPage" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "ticket" TEXT,
  "requestName" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "remainingCount" INTEGER,
  "payload" JSONB NOT NULL,
  "rawXmlPreview" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuickBooksDesktopBackfillPage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuickBooksDesktopBackfillPage_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuickBooksDesktopBackfillPage_jobId_pageNumber_key"
  ON "QuickBooksDesktopBackfillPage"("jobId", "pageNumber");

CREATE INDEX IF NOT EXISTS "QuickBooksDesktopBackfillPage_companyId_batchId_idx"
  ON "QuickBooksDesktopBackfillPage"("companyId", "batchId");

CREATE INDEX IF NOT EXISTS "QuickBooksDesktopBackfillPage_jobId_idx"
  ON "QuickBooksDesktopBackfillPage"("jobId");

CREATE INDEX IF NOT EXISTS "QuickBooksDesktopBackfillPage_requestName_idx"
  ON "QuickBooksDesktopBackfillPage"("requestName");

CREATE INDEX IF NOT EXISTS "QuickBooksDesktopBackfillPage_createdAt_idx"
  ON "QuickBooksDesktopBackfillPage"("createdAt");
