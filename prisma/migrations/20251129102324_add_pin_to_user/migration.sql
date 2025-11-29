/*
  Warnings:

  - You are about to drop the `kyclimits` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `fcmToken` VARCHAR(191) NULL,
    ADD COLUMN `pin` VARCHAR(4) NULL;

-- DropTable
DROP TABLE `kyclimits`;

-- CreateTable
CREATE TABLE `KycLimits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tier` ENUM('tier1', 'tier2', 'tier3') NOT NULL,
    `cryptoBuyLimit` VARCHAR(191) NULL,
    `cryptoSellLimit` VARCHAR(191) NULL,
    `giftCardBuyLimit` VARCHAR(191) NULL,
    `giftCardSellLimit` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
