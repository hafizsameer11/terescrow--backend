-- Busha app integration columns (apply with prisma migrate or manually)
ALTER TABLE `busha_config`
  ADD COLUMN IF NOT EXISTS `sell_payout_mode` VARCHAR(30) NOT NULL DEFAULT 'palmpay_temp' AFTER `payout_recipient_id`;

ALTER TABLE `busha_customers`
  ADD COLUMN IF NOT EXISTS `user_id` INT NULL UNIQUE AFTER `busha_profile_id`;

-- MySQL may not support IF NOT EXISTS on ADD COLUMN in older versions; use prisma db push preferred.

ALTER TABLE `busha_trade_logs`
  ADD COLUMN `user_id` INT NULL AFTER `customer_id`,
  ADD COLUMN `payout_mode` VARCHAR(30) NULL AFTER `crypto_deposit_network`,
  ADD COLUMN `fiat_transaction_id` VARCHAR(64) NULL AFTER `payout_mode`;

CREATE INDEX `busha_trade_logs_user_id_idx` ON `busha_trade_logs`(`user_id`);
CREATE INDEX `busha_trade_logs_busha_transfer_id_idx` ON `busha_trade_logs`(`busha_transfer_id`);
