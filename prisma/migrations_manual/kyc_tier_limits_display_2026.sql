-- KYC tier deposit/withdrawal limits (client sheet Oct 2026).
-- Tier 1: no monthly deposit line — depositMonthlyLimit cleared (NULL).
-- Run once on MySQL when deploying.

INSERT INTO `KycLimits` (
  `tier`,
  `depositDailyLimit`,
  `depositMonthlyLimit`,
  `withdrawalDailyLimit`,
  `withdrawalMonthlyLimit`
) VALUES
  ('tier1', '0', NULL, '2000000', '30000000'),
  ('tier2', '5000000', '170000000', '20000000', '500000000'),
  ('tier3', '5000000', '500000000', '50000000', '1500000000')
ON DUPLICATE KEY UPDATE
  `depositDailyLimit` = VALUES(`depositDailyLimit`),
  `depositMonthlyLimit` = VALUES(`depositMonthlyLimit`),
  `withdrawalDailyLimit` = VALUES(`withdrawalDailyLimit`),
  `withdrawalMonthlyLimit` = VALUES(`withdrawalMonthlyLimit`);
