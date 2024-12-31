-- AlterTable
ALTER TABLE `notification` MODIFY `type` ENUM('admin', 'agent', 'customer', 'other') NOT NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'active';
