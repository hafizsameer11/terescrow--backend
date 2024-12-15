-- DropForeignKey
ALTER TABLE `message` DROP FOREIGN KEY `Message_receiverId_fkey`;

-- AlterTable
ALTER TABLE `message` MODIFY `receiverId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
