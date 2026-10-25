-- Tercescrow 3-tier KYC deposit/withdrawal limits (client sheet).
-- Tier 1: monthly deposit removed (NULL). Daily deposit ₦0.
-- Run manually against production DB when deploying.
-- Prefer kyc_tier_limits_display_2026.sql if both exist (same values).

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
