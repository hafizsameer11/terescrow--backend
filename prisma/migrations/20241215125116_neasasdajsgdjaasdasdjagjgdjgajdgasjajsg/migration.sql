-- DropIndex
DROP INDEX `NotificationAttachment_motificationId_fkey` ON `notificationattachment`;

-- AlterTable
ALTER TABLE `notification` ADD COLUMN `image` VARCHAR(191) NULL;
