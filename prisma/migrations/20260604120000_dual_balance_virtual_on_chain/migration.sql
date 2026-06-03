-- Dual balance buckets on virtual accounts (virtual = bought with Naira, on_chain = deposited).
ALTER TABLE `virtual_accounts`
  ADD COLUMN `virtual_balance` VARCHAR(255) NOT NULL DEFAULT '0',
  ADD COLUMN `on_chain_balance` VARCHAR(255) NOT NULL DEFAULT '0';

-- Existing ledger balance treated as on-chain; virtual starts at zero.
UPDATE `virtual_accounts`
SET
  `on_chain_balance` = COALESCE(NULLIF(`available_balance`, ''), NULLIF(`account_balance`, ''), '0'),
  `virtual_balance` = '0';

-- Tag crypto transactions with balance bucket and optional split-sell batch id.
ALTER TABLE `crypto_transactions`
  ADD COLUMN `balance_bucket` ENUM('virtual', 'on_chain') NULL,
  ADD COLUMN `sell_batch_id` VARCHAR(255) NULL;

CREATE INDEX `crypto_transactions_balance_bucket_idx` ON `crypto_transactions`(`balance_bucket`);
CREATE INDEX `crypto_transactions_sell_batch_id_idx` ON `crypto_transactions`(`sell_batch_id`);
