/*
  Warnings:

  - You are about to alter the column `role` on the `user` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(4))` to `Enum(EnumId(1))`.
  - Added the required column `status` to the `ChatDetails` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `chatdetails` ADD COLUMN `status` ENUM('pending', 'successful', 'declined') NOT NULL AFTER `categoryId`;

-- AlterTable
ALTER TABLE `message` ADD COLUMN `isRead` BOOLEAN NOT NULL DEFAULT false AFTER `message`;

-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('admin', 'agent', 'customer') NOT NULL;
