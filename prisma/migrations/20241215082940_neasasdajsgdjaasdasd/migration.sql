-- AlterTable
ALTER TABLE `category` ADD COLUMN `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active';
