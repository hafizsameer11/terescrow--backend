/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `UserOTP` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `userotp` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `UserOTP_userId_key` ON `UserOTP`(`userId`);
