-- CreateTable
CREATE TABLE "SectionView" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "isResume" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SectionView_startedAt_idx" ON "SectionView"("startedAt");

-- CreateIndex
CREATE INDEX "SectionView_companyId_startedAt_idx" ON "SectionView"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "SectionView_userId_idx" ON "SectionView"("userId");

-- AddForeignKey
ALTER TABLE "SectionView" ADD CONSTRAINT "SectionView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionView" ADD CONSTRAINT "SectionView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
