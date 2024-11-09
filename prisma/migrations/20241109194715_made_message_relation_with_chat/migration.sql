/*
  Warnings:

  - A unique constraint covering the columns `[chatId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `chatId` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `message` ADD COLUMN `chatId` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Message_chatId_key` ON `Message`(`chatId`);

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `Chat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
