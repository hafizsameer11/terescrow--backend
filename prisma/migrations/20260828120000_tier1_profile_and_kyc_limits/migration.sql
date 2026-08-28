-- Tier 1 profile fields on User (registration)
ALTER TABLE `User` ADD COLUMN `date_of_birth` VARCHAR(30) NULL,
    ADD COLUMN `residential_address` VARCHAR(500) NULL;

-- Default Terescrow KYC fiat limits (NGN)
INSERT INTO `KycLimits` (`tier`, `depositDailyLimit`, `depositMonthlyLimit`, `withdrawalDailyLimit`, `withdrawalMonthlyLimit`)
VALUES
  ('tier1', '100000', '3000000', '1000000', '30000000'),
  ('tier2', '1000000', '30000000', '5000000', '150000000'),
  ('tier3', '5000000', '150000000', '50000000', '1500000000')
ON DUPLICATE KEY UPDATE
  `depositDailyLimit` = VALUES(`depositDailyLimit`),
  `depositMonthlyLimit` = VALUES(`depositMonthlyLimit`),
  `withdrawalDailyLimit` = VALUES(`withdrawalDailyLimit`),
  `withdrawalMonthlyLimit` = VALUES(`withdrawalMonthlyLimit`);
