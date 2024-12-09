/*
  Warnings:

  - A unique constraint covering the columns `[chatId]` on the table `ChatDetails` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chatId]` on the table `ChatGroup` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `ChatDetails_chatId_key` ON `ChatDetails`(`chatId`);

-- CreateIndex
CREATE UNIQUE INDEX `ChatGroup_chatId_key` ON `ChatGroup`(`chatId`);
