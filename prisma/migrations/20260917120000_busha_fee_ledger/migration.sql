-- Terescrow shadow ledger for Busha deposit/withdraw service fees
CREATE TABLE IF NOT EXISTS `busha_coin_fee_configs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `currency` VARCHAR(20) NOT NULL,
  `deposit_fee_percent` DECIMAL(8, 4) NOT NULL DEFAULT 0,
  `withdraw_fee_percent` DECIMAL(8, 4) NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `busha_coin_fee_configs_currency_key` (`currency`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `busha_user_assets` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` INT NOT NULL,
  `currency` VARCHAR(20) NOT NULL,
  `user_available` DECIMAL(28, 12) NOT NULL DEFAULT 0,
  `fee_held` DECIMAL(28, 12) NOT NULL DEFAULT 0,
  `last_busha_balance` DECIMAL(28, 12) NULL,
  `last_reconciled_at` DATETIME(3) NULL,
  `reconcile_mismatch` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `busha_user_assets_user_id_currency_key` (`user_id`, `currency`),
  INDEX `busha_user_assets_user_id_idx` (`user_id`),
  INDEX `busha_user_assets_currency_idx` (`currency`),
  CONSTRAINT `busha_user_assets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `busha_fee_ledgers` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` INT NOT NULL,
  `currency` VARCHAR(20) NOT NULL,
  `type` VARCHAR(30) NOT NULL,
  `amount_crypto` DECIMAL(28, 12) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'held',
  `source_trade_id` VARCHAR(64) NULL,
  `sold_trade_id` VARCHAR(64) NULL,
  `sold_amount_ngn` DECIMAL(18, 2) NULL,
  `sold_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `busha_fee_ledgers_user_id_currency_status_idx` (`user_id`, `currency`, `status`),
  INDEX `busha_fee_ledgers_status_idx` (`status`),
  INDEX `busha_fee_ledgers_source_trade_id_idx` (`source_trade_id`),
  INDEX `busha_fee_ledgers_sold_trade_id_idx` (`sold_trade_id`),
  CONSTRAINT `busha_fee_ledgers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
