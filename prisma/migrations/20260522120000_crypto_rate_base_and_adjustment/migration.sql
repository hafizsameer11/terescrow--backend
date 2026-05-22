-- Base rate config for BUY/SELL percentage tiers
CREATE TABLE `crypto_rate_bases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transaction_type` VARCHAR(50) NOT NULL,
    `base_rate` DECIMAL(20, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `crypto_rate_bases_transaction_type_key`(`transaction_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tier adjustment % (BUY/SELL); effective rate remains in `rate` for backward compatibility
ALTER TABLE `crypto_rates` ADD COLUMN `adjustment_percent` DECIMAL(10, 4) NULL;
