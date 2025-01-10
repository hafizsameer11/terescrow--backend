-- AlterTable
ALTER TABLE `chatdetails` MODIFY `status` ENUM('pending', 'successful', 'declined', 'unsucessful') NOT NULL;

-- CreateTable
CREATE TABLE `quickReplies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
