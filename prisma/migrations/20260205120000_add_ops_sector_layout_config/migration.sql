-- Create Ops sector layout config table
CREATE TABLE "OpsSectorLayoutConfig" (
  "id" TEXT NOT NULL,
  "sectorCategory" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpsSectorLayoutConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpsSectorLayoutConfig_sectorCategory_key" ON "OpsSectorLayoutConfig"("sectorCategory");
