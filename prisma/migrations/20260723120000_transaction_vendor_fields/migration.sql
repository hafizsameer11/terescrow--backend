-- Add vendor and receipt fields to gift card / chat transactions
ALTER TABLE `Transaction` ADD COLUMN `vendorName` VARCHAR(191) NULL;
ALTER TABLE `Transaction` ADD COLUMN `vendorRate` DOUBLE NULL;
ALTER TABLE `Transaction` ADD COLUMN `transactionRef` VARCHAR(191) NULL;
