-- Obiex currency map + user-asset reconcile fields + trade reconciliation snapshots.
-- Run manually if migrate deploy is skipped.

-- Add columns if missing (ignore duplicate-column errors on re-run).
-- ALTER TABLE `obiex_user_assets` ADD COLUMN `last_obiex_master_balance` DECIMAL(28, 12) NULL;
-- ALTER TABLE `obiex_user_assets` ADD COLUMN `last_reconciled_at` DATETIME(3) NULL;
-- ALTER TABLE `obiex_user_assets` ADD COLUMN `reconcile_mismatch` BOOLEAN NOT NULL DEFAULT false;

SET @db := DATABASE();
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'obiex_user_assets' AND COLUMN_NAME = 'last_obiex_master_balance'
    ),
    'SELECT 1',
    'ALTER TABLE `obiex_user_assets` ADD COLUMN `last_obiex_master_balance` DECIMAL(28, 12) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'obiex_user_assets' AND COLUMN_NAME = 'last_reconciled_at'
    ),
    'SELECT 1',
    'ALTER TABLE `obiex_user_assets` ADD COLUMN `last_reconciled_at` DATETIME(3) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'obiex_user_assets' AND COLUMN_NAME = 'reconcile_mismatch'
    ),
    'SELECT 1',
    'ALTER TABLE `obiex_user_assets` ADD COLUMN `reconcile_mismatch` BOOLEAN NOT NULL DEFAULT false'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `obiex_currency_map` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `app_currency` VARCHAR(20) NOT NULL,
  `obiex_currency` VARCHAR(20) NOT NULL,
  `display_name` VARCHAR(80) NULL,
  `networks` JSON NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `obiex_currency_map_app_currency_key` (`app_currency`),
  INDEX `obiex_currency_map_obiex_currency_idx` (`obiex_currency`),
  INDEX `obiex_currency_map_is_active_idx` (`is_active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `obiex_currency_map`
  (`app_currency`, `obiex_currency`, `display_name`, `is_active`, `sort_order`, `created_at`, `updated_at`)
VALUES
  ('USDT', 'USDT', 'Tether', true, 10, NOW(3), NOW(3)),
  ('USDC', 'USDC', 'USD Coin', true, 20, NOW(3), NOW(3)),
  ('BTC', 'BTC', 'Bitcoin', true, 30, NOW(3), NOW(3)),
  ('ETH', 'ETH', 'Ethereum', true, 40, NOW(3), NOW(3)),
  ('BNB', 'BNB', 'BNB', true, 50, NOW(3), NOW(3)),
  ('SOL', 'SOL', 'Solana', true, 60, NOW(3), NOW(3)),
  ('TRX', 'TRX', 'TRON', true, 70, NOW(3), NOW(3)),
  ('DOGE', 'DOGE', 'Dogecoin', true, 80, NOW(3), NOW(3)),
  ('XRP', 'XRP', 'XRP', true, 90, NOW(3), NOW(3)),
  ('TON', 'TON', 'Toncoin', true, 100, NOW(3), NOW(3)),
  ('MATIC', 'MATIC', 'Polygon', true, 110, NOW(3), NOW(3)),
  ('AVAX', 'AVAX', 'Avalanche', true, 120, NOW(3), NOW(3)),
  ('LTC', 'LTC', 'Litecoin', true, 130, NOW(3), NOW(3)),
  ('ADA', 'ADA', 'Cardano', true, 140, NOW(3), NOW(3)),
  ('DOT', 'DOT', 'Polkadot', true, 150, NOW(3), NOW(3)),
  ('LINK', 'LINK', 'Chainlink', true, 160, NOW(3), NOW(3)),
  ('SHIB', 'SHIB', 'Shiba Inu', true, 170, NOW(3), NOW(3));

CREATE TABLE IF NOT EXISTS `obiex_trade_reconciliations` (
  `id` VARCHAR(191) NOT NULL,
  `trade_log_id` VARCHAR(191) NOT NULL,
  `user_id` INT NOT NULL,
  `side` VARCHAR(20) NOT NULL,
  `coin_currency` VARCHAR(20) NOT NULL,
  `master_ngnx_before` DECIMAL(28, 12) NULL,
  `master_coin_before` DECIMAL(28, 12) NULL,
  `user_ledger_before` DECIMAL(28, 12) NULL,
  `master_ngnx_after` DECIMAL(28, 12) NULL,
  `master_coin_after` DECIMAL(28, 12) NULL,
  `user_ledger_after` DECIMAL(28, 12) NULL,
  `expected_master_ngnx_delta` DECIMAL(28, 12) NULL,
  `expected_master_coin_delta` DECIMAL(28, 12) NULL,
  `expected_user_ledger_delta` DECIMAL(28, 12) NULL,
  `actual_master_ngnx_delta` DECIMAL(28, 12) NULL,
  `actual_master_coin_delta` DECIMAL(28, 12) NULL,
  `actual_user_ledger_delta` DECIMAL(28, 12) NULL,
  `mismatch` BOOLEAN NOT NULL DEFAULT false,
  `mismatch_detail` TEXT NULL,
  `provider_balances` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `obiex_trade_reconciliations_trade_log_id_key` (`trade_log_id`),
  INDEX `obiex_trade_reconciliations_user_id_idx` (`user_id`),
  INDEX `obiex_trade_reconciliations_side_idx` (`side`),
  INDEX `obiex_trade_reconciliations_mismatch_idx` (`mismatch`),
  INDEX `obiex_trade_reconciliations_created_at_idx` (`created_at`),
  CONSTRAINT `obiex_trade_reconciliations_trade_log_id_fkey`
    FOREIGN KEY (`trade_log_id`) REFERENCES `obiex_trade_logs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `obiex_trade_reconciliations_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
