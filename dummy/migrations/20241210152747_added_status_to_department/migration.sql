-- AlterTable
ALTER TABLE `department` ADD COLUMN `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active';
