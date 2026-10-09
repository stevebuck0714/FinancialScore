-- CreateTable
CREATE TABLE "AskThread" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "forkedFromThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AskThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskThreadTurn" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "useExternalSources" BOOLEAN NOT NULL DEFAULT false,
    "response" JSONB NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskThreadTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskThreadShare" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "sharedWithUserId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "sharedTurnCount" INTEGER NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),

    CONSTRAINT "AskThreadShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AskThread_companyId_ownerUserId_updatedAt_idx" ON "AskThread"("companyId", "ownerUserId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "AskThread_forkedFromThreadId_idx" ON "AskThread"("forkedFromThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "AskThreadTurn_threadId_position_key" ON "AskThreadTurn"("threadId", "position");

-- CreateIndex
CREATE INDEX "AskThreadShare_sharedWithUserId_sharedAt_idx" ON "AskThreadShare"("sharedWithUserId", "sharedAt" DESC);

-- CreateIndex
CREATE INDEX "AskThreadShare_sharedByUserId_idx" ON "AskThreadShare"("sharedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AskThreadShare_threadId_sharedWithUserId_key" ON "AskThreadShare"("threadId", "sharedWithUserId");

-- AddForeignKey
ALTER TABLE "AskThread" ADD CONSTRAINT "AskThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskThread" ADD CONSTRAINT "AskThread_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskThread" ADD CONSTRAINT "AskThread_forkedFromThreadId_fkey" FOREIGN KEY ("forkedFromThreadId") REFERENCES "AskThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskThreadTurn" ADD CONSTRAINT "AskThreadTurn_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AskThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskThreadShare" ADD CONSTRAINT "AskThreadShare_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AskThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskThreadShare" ADD CONSTRAINT "AskThreadShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskThreadShare" ADD CONSTRAINT "AskThreadShare_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

