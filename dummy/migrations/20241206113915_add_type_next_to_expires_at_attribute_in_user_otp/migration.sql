/*
  Warnings:

  - Added the required column `type` to the `UserOTP` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `user` 
MODIFY COLUMN `gender` ENUM('male', 'female', 'non_binary', 'prefer_not_to_say') NOT NULL;

ALTER TABLE `userotp` DROP COLUMN `type`;

ALTER TABLE `userotp` 
ADD COLUMN `type` ENUM('email_verification', 'password_verification') NOT NULL AFTER `expiresAt`;

