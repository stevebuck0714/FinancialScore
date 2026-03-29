-- CreateIndex
CREATE INDEX "InforSyncTask_runId_status_idx" ON "InforSyncTask"("runId", "status");

-- CreateIndex
CREATE INDEX "InforSyncTask_status_leaseExpiresAt_idx" ON "InforSyncTask"("status", "leaseExpiresAt");
