-- CreateTable
CREATE TABLE `KycLimits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tier` ENUM('tier1', 'tier2', 'tier3') NOT NULL,
    `cryptoBuyLimit` DOUBLE NULL,
    `cryptoSellLimit` DOUBLE NULL,
    `giftCardBuyLimit` DOUBLE NULL,
    `giftCardSellLimit` DOUBLE NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
