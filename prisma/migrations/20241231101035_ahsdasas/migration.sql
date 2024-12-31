-- DropIndex
-- DROP INDEX `ChatGroup_adminId_key` ON `chatgroup`;

-- AlterTable
ALTER TABLE `kycstatetwo` ADD COLUMN `state` VARCHAR(191) NOT NULL DEFAULT 'pending';
