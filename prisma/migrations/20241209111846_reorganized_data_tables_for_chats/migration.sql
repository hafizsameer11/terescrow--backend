/*
  Warnings:

  - You are about to drop the column `agentId` on the `chat` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `chat` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `chat` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `chat` table. All the data in the column will be lost.
  - You are about to drop the column `departmentId` on the `chat` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `chat` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `chat` table. All the data in the column will be lost.
  - Added the required column `chatType` to the `Chat` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `chat` DROP FOREIGN KEY `Chat_agentId_fkey`;

-- DropForeignKey
ALTER TABLE `chat` DROP FOREIGN KEY `Chat_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `chat` DROP FOREIGN KEY `Chat_customerId_fkey`;

-- DropForeignKey
ALTER TABLE `chat` DROP FOREIGN KEY `Chat_departmentId_fkey`;

-- AlterTable
ALTER TABLE `chat` DROP COLUMN `agentId`,
    DROP COLUMN `categoryId`,
    DROP COLUMN `createdAt`,
    DROP COLUMN `customerId`,
    DROP COLUMN `departmentId`,
    DROP COLUMN `status`,
    DROP COLUMN `updatedAt`,
    ADD COLUMN `chatType` ENUM('customer_to_agent', 'team_chat', 'group_chat') NOT NULL;

-- CreateTable
CREATE TABLE `ChatParticipant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `chatId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `chatId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `categoryId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `messageId` INTEGER NOT NULL,
    `media_type` ENUM('image', 'document', 'video') NOT NULL,
    `media_url` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatParticipant` ADD CONSTRAINT `ChatParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatParticipant` ADD CONSTRAINT `ChatParticipant_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `Chat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatDetails` ADD CONSTRAINT `ChatDetails_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `Chat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatDetails` ADD CONSTRAINT `ChatDetails_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatDetails` ADD CONSTRAINT `ChatDetails_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
