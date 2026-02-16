-- Manual migration: pgvector + document chunk index
-- This repo uses manual migrations to avoid Prisma migrate issues on some environments.
--
-- Safe to run multiple times.

-- 1) Enable pgvector extension (Neon supports this on most plans)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Add indexing status fields to CompanyDocument
ALTER TABLE IF EXISTS "CompanyDocument"
  ADD COLUMN IF NOT EXISTS "indexStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "indexedAt" TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS "indexError" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "embeddingDim" INTEGER NULL;

-- 3) Chunk table (stores text + embedding vector)
CREATE TABLE IF NOT EXISTS "CompanyDocumentChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "startOffset" INTEGER NULL,
  "endOffset" INTEGER NULL,
  "text" TEXT NOT NULL,
  "textHash" TEXT NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "CompanyDocumentChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyDocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CompanyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanyDocumentChunk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanyDocumentChunk_document_chunkIndex_key" UNIQUE ("documentId","chunkIndex")
);

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS "CompanyDocumentChunk_documentId_idx" ON "CompanyDocumentChunk" ("documentId");
CREATE INDEX IF NOT EXISTS "CompanyDocumentChunk_companyId_idx" ON "CompanyDocumentChunk" ("companyId");

-- Keyword search index (expression index; avoids needing a dedicated tsvector column)
CREATE INDEX IF NOT EXISTS "CompanyDocumentChunk_text_fts_idx"
  ON "CompanyDocumentChunk"
  USING GIN (to_tsvector('english', coalesce("text", '')));

