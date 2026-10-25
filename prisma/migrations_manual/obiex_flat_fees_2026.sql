-- Flat NGN buy/sell fees on ObiexConfig (in addition to % markup).
-- Run once on MySQL. Ignore duplicate-column errors if already applied.
ALTER TABLE `obiex_config`
  ADD COLUMN `buy_flat_fee_ngn` DECIMAL(18, 2) NOT NULL DEFAULT 0 AFTER `sell_markup_percent`;
ALTER TABLE `obiex_config`
  ADD COLUMN `sell_flat_fee_ngn` DECIMAL(18, 2) NOT NULL DEFAULT 0 AFTER `buy_flat_fee_ngn`;
