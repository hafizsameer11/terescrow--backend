-- StroWallet auto top-up settings + MerchantTopupLog trigger fields
ALTER TABLE `strowallet_config`
  ADD COLUMN `auto_topup_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `auto_topup_threshold_ngn` DECIMAL(15, 2) NULL,
  ADD COLUMN `auto_topup_amount_ngn` DECIMAL(15, 2) NULL,
  ADD COLUMN `auto_topup_cooldown_minutes` INT NOT NULL DEFAULT 30;

ALTER TABLE `merchant_topup_logs`
  ADD COLUMN `trigger` VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN `balance_before_ngn` DECIMAL(15, 2) NULL,
  MODIFY COLUMN `initiated_by_id` INT NULL;

CREATE INDEX `merchant_topup_logs_trigger_idx` ON `merchant_topup_logs`(`trigger`);
