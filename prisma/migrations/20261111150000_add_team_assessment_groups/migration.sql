CREATE TABLE "TeamAssessmentGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamAssessmentGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamAssessmentGroup_companyId_idx" ON "TeamAssessmentGroup"("companyId");

ALTER TABLE "TeamAssessmentGroup"
ADD CONSTRAINT "TeamAssessmentGroup_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserCompanyAccess" ADD COLUMN "assessmentGroupId" TEXT;
CREATE INDEX "UserCompanyAccess_assessmentGroupId_idx" ON "UserCompanyAccess"("assessmentGroupId");
ALTER TABLE "UserCompanyAccess"
ADD CONSTRAINT "UserCompanyAccess_assessmentGroupId_fkey"
FOREIGN KEY ("assessmentGroupId") REFERENCES "TeamAssessmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssessmentRecord" ADD COLUMN "groupId" TEXT;
CREATE INDEX "AssessmentRecord_groupId_idx" ON "AssessmentRecord"("groupId");
ALTER TABLE "AssessmentRecord"
ADD CONSTRAINT "AssessmentRecord_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "TeamAssessmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing invitees and submitted assessments become each company's "Group 1".
INSERT INTO "TeamAssessmentGroup" ("id", "companyId", "name", "createdAt", "updatedAt")
SELECT 'tag1_' || c."id", c."id", 'Group 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
WHERE EXISTS (
    SELECT 1 FROM "UserCompanyAccess" uca
    JOIN "User" u ON u."id" = uca."userId"
    WHERE uca."companyId" = c."id"
      AND (uca."assessmentInvitedAt" IS NOT NULL OR u."userType"::text = 'ASSESSMENT')
)
OR EXISTS (SELECT 1 FROM "AssessmentRecord" ar WHERE ar."companyId" = c."id");

UPDATE "UserCompanyAccess" uca
SET "assessmentGroupId" = 'tag1_' || uca."companyId"
FROM "User" u
WHERE u."id" = uca."userId"
  AND (uca."assessmentInvitedAt" IS NOT NULL OR u."userType"::text = 'ASSESSMENT');

UPDATE "AssessmentRecord"
SET "groupId" = 'tag1_' || "companyId";
