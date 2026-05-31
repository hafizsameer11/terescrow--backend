-- Per-wallet-currency deposit service fee rules

CREATE TABLE IF NOT EXISTS `crypto_deposit_fee_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `wallet_currency_id` INT NOT NULL,
  `fee_percent` DECIMAL(8, 4) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `crypto_deposit_fee_rules_wallet_currency_id_key`(`wallet_currency_id`),
  CONSTRAINT `crypto_deposit_fee_rules_wallet_currency_id_fkey`
    FOREIGN KEY (`wallet_currency_id`) REFERENCES `wallet_currencies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migrate legacy single-fee config into per-currency rules
INSERT INTO `crypto_deposit_fee_rules` (`wallet_currency_id`, `fee_percent`, `updated_at`)
SELECT wc.`id`, c.`fee_percent`, CURRENT_TIMESTAMP(3)
FROM `wallet_currencies` wc
CROSS JOIN `crypto_deposit_fee_config` c
WHERE c.`id` = 1
  AND c.`is_active` = true
  AND c.`fee_percent` > 0
  AND c.`apply_to_all_currencies` = true
ON DUPLICATE KEY UPDATE
  `fee_percent` = VALUES(`fee_percent`),
  `updated_at` = VALUES(`updated_at`);

INSERT INTO `crypto_deposit_fee_rules` (`wallet_currency_id`, `fee_percent`, `updated_at`)
SELECT CAST(j.`wc_id` AS UNSIGNED), c.`fee_percent`, CURRENT_TIMESTAMP(3)
FROM `crypto_deposit_fee_config` c
JOIN JSON_TABLE(
  IFNULL(c.`wallet_currency_ids`, JSON_ARRAY()),
  '$[*]' COLUMNS (`wc_id` INT PATH '$')
) j
WHERE c.`id` = 1
  AND c.`is_active` = true
  AND c.`fee_percent` > 0
  AND c.`apply_to_all_currencies` = false
ON DUPLICATE KEY UPDATE
  `fee_percent` = VALUES(`fee_percent`),
  `updated_at` = VALUES(`updated_at`);
