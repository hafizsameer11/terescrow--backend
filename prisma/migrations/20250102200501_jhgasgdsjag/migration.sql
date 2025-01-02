-- CreateTable
CREATE TABLE `smtp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `host` VARCHAR(191) NOT NULL,
    `from` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `encryption` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
