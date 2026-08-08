-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PAIRING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CloseReason" AS ENUM ('REVOKED', 'EXPIRED', 'FINISHED');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('UPLOADING', 'READY', 'DOWNLOADED', 'DELETED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "pairingSecretHash" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PAIRING',
    "pairingExpiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedReason" "CloseReason",
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "downloadedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "helperTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "PhotoStatus" NOT NULL DEFAULT 'UPLOADING',
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "Session_pairingExpiresAt_idx" ON "Session"("pairingExpiresAt");

-- CreateIndex
CREATE INDEX "Session_closedAt_idx" ON "Session"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_sessionId_key" ON "Claim"("sessionId");

-- CreateIndex
CREATE INDEX "Claim_helperTokenHash_idx" ON "Claim"("helperTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_storageKey_key" ON "Photo"("storageKey");

-- CreateIndex
CREATE INDEX "Photo_sessionId_idx" ON "Photo"("sessionId");

-- CreateIndex
CREATE INDEX "Photo_sessionId_status_idx" ON "Photo"("sessionId", "status");

-- CreateIndex
CREATE INDEX "PushDevice_sessionId_idx" ON "PushDevice"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_platform_token_key" ON "PushDevice"("platform", "token");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
