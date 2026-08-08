-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deliveryExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Session_deliveryExpiresAt_idx" ON "Session"("deliveryExpiresAt");
