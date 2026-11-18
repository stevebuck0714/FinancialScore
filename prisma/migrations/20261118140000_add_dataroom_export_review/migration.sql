-- AlterTable
ALTER TABLE "DataRoomDocument" ADD COLUMN "reviewStatus" TEXT;
ALTER TABLE "DataRoomDocument" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "DataRoomDocument" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "DataRoomDocument" ADD COLUMN "reviewedByUserId" TEXT;
ALTER TABLE "DataRoomDocument" ADD COLUMN "importMapping" JSONB;
