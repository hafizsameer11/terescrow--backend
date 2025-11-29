-- CreateTable
CREATE TABLE `GiftCardProduct` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reloadlyProductId` INTEGER NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `brandName` VARCHAR(191) NULL,
    `countryCode` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL,
    `minValue` DECIMAL(10, 2) NULL,
    `maxValue` DECIMAL(10, 2) NULL,
    `fixedValue` DECIMAL(10, 2) NULL,
    `isVariableDenomination` BOOLEAN NOT NULL DEFAULT true,
    `isGlobal` BOOLEAN NOT NULL DEFAULT false,
    `reloadlyImageUrl` VARCHAR(191) NULL,
    `reloadlyLogoUrls` JSON NULL,
    `imageUrl` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `redemptionInstructions` TEXT NULL,
    `terms` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `category` VARCHAR(191) NULL,
    `productType` VARCHAR(191) NULL,
    `supportedCardTypes` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastSyncedAt` DATETIME(3) NULL,

    UNIQUE INDEX `GiftCardProduct_reloadlyProductId_key`(`reloadlyProductId`),
    INDEX `GiftCardProduct_countryCode_idx`(`countryCode`),
    INDEX `GiftCardProduct_status_idx`(`status`),
    INDEX `GiftCardProduct_brandName_idx`(`brandName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GiftCardProductCountry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `countryCode` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL,
    `minValue` DECIMAL(10, 2) NULL,
    `maxValue` DECIMAL(10, 2) NULL,
    `fixedValue` DECIMAL(10, 2) NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GiftCardProductCountry_countryCode_idx`(`countryCode`),
    UNIQUE INDEX `GiftCardProductCountry_productId_countryCode_key`(`productId`, `countryCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GiftCardOrder` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `reloadlyOrderId` VARCHAR(191) NULL,
    `reloadlyTransactionId` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `cardType` VARCHAR(191) NOT NULL,
    `countryCode` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL,
    `faceValue` DECIMAL(10, 2) NOT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `fees` DECIMAL(10, 2) NOT NULL,
    `exchangeRate` DECIMAL(10, 6) NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `paymentTransactionId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `reloadlyStatus` VARCHAR(191) NULL,
    `cardCode` VARCHAR(191) NULL,
    `cardPin` VARCHAR(191) NULL,
    `cardNumber` VARCHAR(191) NULL,
    `expiryDate` DATETIME(3) NULL,
    `cardImageUrl` VARCHAR(191) NULL,
    `recipientEmail` VARCHAR(191) NULL,
    `recipientPhone` VARCHAR(191) NULL,
    `senderName` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `errorMessage` TEXT NULL,
    `refundedAt` DATETIME(3) NULL,
    `refundReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `GiftCardOrder_reloadlyOrderId_key`(`reloadlyOrderId`),
    UNIQUE INDEX `GiftCardOrder_reloadlyTransactionId_key`(`reloadlyTransactionId`),
    INDEX `GiftCardOrder_userId_idx`(`userId`),
    INDEX `GiftCardOrder_status_idx`(`status`),
    INDEX `GiftCardOrder_reloadlyTransactionId_idx`(`reloadlyTransactionId`),
    INDEX `GiftCardOrder_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReloadlyConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `environment` VARCHAR(191) NOT NULL DEFAULT 'sandbox',
    `clientId` VARCHAR(255) NOT NULL,
    `clientSecret` VARCHAR(255) NOT NULL,
    `accessToken` TEXT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ReloadlyConfig_environment_key`(`environment`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GiftCardProductSyncLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `syncType` VARCHAR(191) NOT NULL,
    `productsSynced` INTEGER NOT NULL DEFAULT 0,
    `productsCreated` INTEGER NOT NULL DEFAULT 0,
    `productsUpdated` INTEGER NOT NULL DEFAULT 0,
    `productsFailed` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL,
    `errorMessage` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `GiftCardProductSyncLog_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GiftCardProductCountry` ADD CONSTRAINT `GiftCardProductCountry_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `GiftCardProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GiftCardOrder` ADD CONSTRAINT `GiftCardOrder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GiftCardOrder` ADD CONSTRAINT `GiftCardOrder_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `GiftCardProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
