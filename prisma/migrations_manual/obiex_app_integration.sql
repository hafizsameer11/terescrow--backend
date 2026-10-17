-- Obiex parallel integration (alongside Busha). Run manually if migrate deploy is skipped.

CREATE TABLE IF NOT EXISTS `obiex_config` (
  `id` INT NOT NULL DEFAULT 1,
  `buy_mode` VARCHAR(30) NOT NULL DEFAULT 'master_swap',
  `buy_markup_percent` DECIMAL(8, 4) NOT NULL DEFAULT 0,
  `sell_markup_percent` DECIMAL(8, 4) NOT NULL DEFAULT 0,
  `collections_target` VARCHAR(10) NOT NULL DEFAULT 'USDT',
  `is_active` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `obiex_config` (`id`, `buy_mode`, `buy_markup_percent`, `sell_markup_percent`, `collections_target`, `is_active`, `created_at`, `updated_at`)
VALUES (1, 'master_swap', 0, 0, 'USDT', false, NOW(3), NOW(3));

CREATE TABLE IF NOT EXISTS `obiex_markup_ranges` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `side` VARCHAR(10) NOT NULL,
  `min_usd` DECIMAL(18, 4) NOT NULL,
  `max_usd` DECIMAL(18, 4) NOT NULL,
  `percent` DECIMAL(8, 4) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `obiex_markup_ranges_side_is_active_idx` (`side`, `is_active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `obiex_user_assets` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` INT NOT NULL,
  `currency` VARCHAR(20) NOT NULL,
  `user_available` DECIMAL(28, 12) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `obiex_user_assets_user_id_currency_key` (`user_id`, `currency`),
  INDEX `obiex_user_assets_user_id_idx` (`user_id`),
  INDEX `obiex_user_assets_currency_idx` (`currency`),
  CONSTRAINT `obiex_user_assets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `obiex_deposit_addresses` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` INT NOT NULL,
  `currency` VARCHAR(20) NOT NULL,
  `network` VARCHAR(30) NOT NULL,
  `address` VARCHAR(120) NOT NULL,
  `unique_user_identifier` VARCHAR(80) NOT NULL,
  `provider_data` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `obiex_deposit_addresses_user_id_currency_network_key` (`user_id`, `currency`, `network`),
  INDEX `obiex_deposit_addresses_address_idx` (`address`),
  INDEX `obiex_deposit_addresses_unique_user_identifier_idx` (`unique_user_identifier`),
  CONSTRAINT `obiex_deposit_addresses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `obiex_trade_logs` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` INT NULL,
  `side` VARCHAR(20) NOT NULL,
  `source_currency` VARCHAR(20) NOT NULL,
  `target_currency` VARCHAR(20) NOT NULL,
  `source_amount` VARCHAR(40) NOT NULL,
  `target_amount` VARCHAR(40) NULL,
  `obiex_reference` VARCHAR(80) NULL,
  `obiex_transaction_id` VARCHAR(80) NULL,
  `obiex_quote_id` VARCHAR(80) NULL,
  `obiex_status` VARCHAR(40) NULL,
  `crypto_deposit_address` VARCHAR(120) NULL,
  `crypto_deposit_network` VARCHAR(30) NULL,
  `withdraw_address` VARCHAR(120) NULL,
  `withdraw_network` VARCHAR(30) NULL,
  `fiat_transaction_id` VARCHAR(64) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'pending',
  `error_message` TEXT NULL,
  `provider_response` JSON NULL,
  `initiated_by_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `obiex_trade_logs_side_idx` (`side`),
  INDEX `obiex_trade_logs_status_idx` (`status`),
  INDEX `obiex_trade_logs_created_at_idx` (`created_at`),
  INDEX `obiex_trade_logs_user_id_idx` (`user_id`),
  INDEX `obiex_trade_logs_obiex_reference_idx` (`obiex_reference`),
  INDEX `obiex_trade_logs_obiex_transaction_id_idx` (`obiex_transaction_id`),
  CONSTRAINT `obiex_trade_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `obiex_trade_logs_initiated_by_id_fkey` FOREIGN KEY (`initiated_by_id`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
