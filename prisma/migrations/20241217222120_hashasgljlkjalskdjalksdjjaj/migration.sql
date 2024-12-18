-- AlterTable
ALTER TABLE `inappnotification` ADD COLUMN `type` ENUM('customeer', 'team') NOT NULL DEFAULT 'customeer';
