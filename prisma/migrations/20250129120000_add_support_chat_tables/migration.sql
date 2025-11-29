-- CreateTable
CREATE TABLE IF NOT EXISTS `SupportChat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NULL,
    `status` ENUM('pending', 'processing', 'completed') NOT NULL DEFAULT 'pending',
    `assignedAgentId` INTEGER NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupportChat_userId_idx`(`userId`),
    INDEX `SupportChat_status_idx`(`status`),
    INDEX `SupportChat_assignedAgentId_idx`(`assignedAgentId`),
    INDEX `SupportChat_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `SupportChatMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supportChatId` INTEGER NOT NULL,
    `senderType` ENUM('user', 'support') NOT NULL,
    `senderId` INTEGER NOT NULL,
    `message` TEXT NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupportChatMessage_supportChatId_idx`(`supportChatId`),
    INDEX `SupportChatMessage_senderType_idx`(`senderType`),
    INDEX `SupportChatMessage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SupportChat` ADD CONSTRAINT `SupportChat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportChat` ADD CONSTRAINT `SupportChat_assignedAgentId_fkey` FOREIGN KEY (`assignedAgentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportChatMessage` ADD CONSTRAINT `SupportChatMessage_supportChatId_fkey` FOREIGN KEY (`supportChatId`) REFERENCES `SupportChat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
