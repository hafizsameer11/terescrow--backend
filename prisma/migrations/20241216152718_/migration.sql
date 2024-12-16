-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `Transaction_chatId_fkey`;

-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `Transaction_countryId_fkey`;

-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `Transaction_subCategoryId_fkey`;

-- AlterTable
ALTER TABLE `transaction` ADD COLUMN `Transaction_Category_FK` INTEGER NULL,
    ADD COLUMN `Transaction_Department_FK` INTEGER NULL,
    MODIFY `countryId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_Chat_FK` FOREIGN KEY (`chatId`) REFERENCES `Chat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_SubCategory_FK` FOREIGN KEY (`subCategoryId`) REFERENCES `Subcategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_Country_FK` FOREIGN KEY (`countryId`) REFERENCES `Country`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_Department_FK` FOREIGN KEY (`Transaction_Department_FK`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_Category_FK` FOREIGN KEY (`Transaction_Category_FK`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
