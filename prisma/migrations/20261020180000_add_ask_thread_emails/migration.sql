-- CreateTable
CREATE TABLE "AskThreadEmail" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "sentTurnCount" INTEGER NOT NULL,
    "message" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskThreadEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AskThreadEmail_threadId_sentAt_idx" ON "AskThreadEmail"("threadId", "sentAt" DESC);

-- CreateIndex
CREATE INDEX "AskThreadEmail_sentByUserId_sentAt_idx" ON "AskThreadEmail"("sentByUserId", "sentAt" DESC);

-- AddForeignKey
ALTER TABLE "AskThreadEmail" ADD CONSTRAINT "AskThreadEmail_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AskThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskThreadEmail" ADD CONSTRAINT "AskThreadEmail_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
