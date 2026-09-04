-- Amount-range (USD) markup tiers for Busha buy/sell
CREATE TABLE IF NOT EXISTS `busha_markup_ranges` (
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
  INDEX `busha_markup_ranges_side_is_active_idx` (`side`, `is_active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
