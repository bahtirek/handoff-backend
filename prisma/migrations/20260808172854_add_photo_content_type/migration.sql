/*
  Warnings:

  - Added the required column `contentType` to the `Photo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "contentType" TEXT NOT NULL;
