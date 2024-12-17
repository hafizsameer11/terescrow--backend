/*
  Warnings:

  - You are about to drop the column `country` on the `user` table. All the data in the column will be lost.
  - Made the column `countryId` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `user` DROP COLUMN `country`,
    MODIFY `countryId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_countryId_fkey` FOREIGN KEY (`countryId`) REFERENCES `Country`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
