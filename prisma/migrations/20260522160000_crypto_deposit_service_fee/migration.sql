-- Crypto deposit service fee (admin-configurable % withheld on receive)

CREATE TABLE IF NOT EXISTS `crypto_deposit_fee_config` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fee_percent` DECIMAL(8, 4) NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `updated_by_user_id` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `crypto_deposit_fee_config` (`id`, `fee_percent`, `is_active`, `updated_at`)
VALUES (1, 0, true, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP(3);

ALTER TABLE `crypto_receive`
  ADD COLUMN `gross_amount` DECIMAL(20, 8) NULL AFTER `amount`,
  ADD COLUMN `credited_amount` DECIMAL(20, 8) NULL AFTER `gross_amount`,
  ADD COLUMN `gross_amount_usd` DECIMAL(20, 8) NULL AFTER `amount_usd`,
  ADD COLUMN `credited_amount_usd` DECIMAL(20, 8) NULL AFTER `gross_amount_usd`,
  ADD COLUMN `service_fee_percent` DECIMAL(8, 4) NULL AFTER `credited_amount_usd`,
  ADD COLUMN `service_fee_amount` DECIMAL(20, 8) NULL AFTER `service_fee_percent`,
  ADD COLUMN `service_fee_usd` DECIMAL(20, 8) NULL AFTER `service_fee_amount`;

-- Backfill: existing rows treated as no fee (gross = credited)
UPDATE `crypto_receive`
SET
  `gross_amount` = COALESCE(`gross_amount`, `amount`),
  `credited_amount` = COALESCE(`credited_amount`, `amount`),
  `gross_amount_usd` = COALESCE(`gross_amount_usd`, `amount_usd`),
  `credited_amount_usd` = COALESCE(`credited_amount_usd`, `amount_usd`),
  `service_fee_percent` = COALESCE(`service_fee_percent`, 0),
  `service_fee_amount` = COALESCE(`service_fee_amount`, 0),
  `service_fee_usd` = COALESCE(`service_fee_usd`, 0)
WHERE `gross_amount` IS NULL;
