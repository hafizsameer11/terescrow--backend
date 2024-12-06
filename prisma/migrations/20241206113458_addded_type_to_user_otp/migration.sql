-- AlterTable
ALTER TABLE `userotp` ADD COLUMN `type` ENUM('email_verification', 'password_verification') NOT NULL;
