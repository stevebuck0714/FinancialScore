-- Manual migration: add INFOR_M3 accounting platform
-- Safe to run multiple times.

DO $$
BEGIN
  ALTER TYPE "AccountingPlatform" ADD VALUE 'INFOR_M3';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
