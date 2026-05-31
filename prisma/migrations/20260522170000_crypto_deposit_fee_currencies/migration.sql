-- Allow deposit service fee to apply only to selected wallet currencies

ALTER TABLE `crypto_deposit_fee_config`
  ADD COLUMN `apply_to_all_currencies` BOOLEAN NOT NULL DEFAULT true AFTER `is_active`,
  ADD COLUMN `wallet_currency_ids` JSON NULL AFTER `apply_to_all_currencies`;
