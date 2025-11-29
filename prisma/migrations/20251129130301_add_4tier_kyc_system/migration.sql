-- AlterTable
ALTER TABLE `KycLimits` ADD COLUMN `depositDailyLimit` VARCHAR(50) NULL,
    ADD COLUMN `depositMonthlyLimit` VARCHAR(50) NULL,
    ADD COLUMN `withdrawalDailyLimit` VARCHAR(50) NULL,
    ADD COLUMN `withdrawalMonthlyLimit` VARCHAR(50) NULL,
    MODIFY `tier` ENUM('tier1', 'tier2', 'tier3', 'tier4') NOT NULL;

-- AlterTable  
ALTER TABLE `KycStateTwo` ADD COLUMN `address` VARCHAR(500) NULL,
    ADD COLUMN `country` VARCHAR(100) NULL,
    ADD COLUMN `documentNumber` VARCHAR(50) NULL,
    ADD COLUMN `documentType` VARCHAR(50) NULL,
    ADD COLUMN `idDocumentUrl` VARCHAR(500) NULL,
    ADD COLUMN `nin` VARCHAR(50) NULL,
    ADD COLUMN `proofOfAddressUrl` VARCHAR(500) NULL,
    ADD COLUMN `proofOfFundsUrl` VARCHAR(500) NULL,
    ADD COLUMN `selfieUrl` VARCHAR(500) NULL,
    ADD COLUMN `tier` ENUM('tier1', 'tier2', 'tier3', 'tier4') NOT NULL DEFAULT 'tier1',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `bvn` VARCHAR(191) NULL,
    MODIFY `status` ENUM('tier1', 'tier2', 'tier3', 'tier4') NOT NULL,
    MODIFY `reason` TEXT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `currentKycTier` ENUM('tier1', 'tier2', 'tier3', 'tier4') NULL,
    ADD COLUMN `kycTier1Verified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `kycTier2Verified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `kycTier3Verified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `kycTier4Verified` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `KycLimits_tier_key` ON `KycLimits`(`tier`);

-- CreateIndex
CREATE INDEX `KycStateTwo_tier_idx` ON `KycStateTwo`(`tier`);

-- CreateIndex
CREATE INDEX `KycStateTwo_state_idx` ON `KycStateTwo`(`state`);

-- CreateIndex
CREATE INDEX `KycStateTwo_createdAt_idx` ON `KycStateTwo`(`createdAt`);

-- CreateIndex (only if it doesn't exist - MySQL doesn't support IF NOT EXISTS, so we'll handle errors)
CREATE INDEX `KycStateTwo_userId_idx` ON `KycStateTwo`(`userId`);
