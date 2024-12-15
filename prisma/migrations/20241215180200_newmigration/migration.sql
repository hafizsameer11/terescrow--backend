/*
  Warnings:

  - You are about to drop the column `agentId` on the `transaction` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `transaction` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `transaction` table. All the data in the column will be lost.
  - You are about to drop the column `departmentId` on the `transaction` table. All the data in the column will be lost.
  - You are about to drop the column `transactionId` on the `transaction` table. All the data in the column will be lost.
  - Added the required column `chatId` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Made the column `status` on table `transaction` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `Transaction_agentId_fkey`;

-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `Transaction_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `Transaction_customerId_fkey`;

-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `Transaction_departmentId_fkey`;

-- AlterTable
ALTER TABLE `transaction` DROP COLUMN `agentId`,
    DROP COLUMN `categoryId`,
    DROP COLUMN `customerId`,
    DROP COLUMN `departmentId`,
    DROP COLUMN `transactionId`,
    ADD COLUMN `chatId` INTEGER NOT NULL,
    MODIFY `status` ENUM('pending', 'failed', 'successful') NOT NULL DEFAULT 'successful';

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `Chat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
