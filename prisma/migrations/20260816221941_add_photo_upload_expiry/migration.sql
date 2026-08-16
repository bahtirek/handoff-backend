-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "uploadExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Photo_status_uploadExpiresAt_idx" ON "Photo"("status", "uploadExpiresAt");
