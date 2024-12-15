-- AlterTable
ALTER TABLE `department` ADD COLUMN `Type` ENUM('sell', 'buy') NOT NULL DEFAULT 'buy',
    ADD COLUMN `niche` ENUM('crypto', 'giftCard') NOT NULL DEFAULT 'crypto';
