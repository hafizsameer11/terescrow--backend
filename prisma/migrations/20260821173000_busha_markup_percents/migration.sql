-- Busha live-rate platform markup (% of Busha quote)
ALTER TABLE `busha_config`
  ADD COLUMN `buy_markup_percent` DECIMAL(8, 4) NOT NULL DEFAULT 0 AFTER `sell_payout_mode`,
  ADD COLUMN `sell_markup_percent` DECIMAL(8, 4) NOT NULL DEFAULT 0 AFTER `buy_markup_percent`;
