-- Tercescrow 3-tier KYC deposit/withdrawal limits (product spec Aug 2026)
-- Tier 1 = registration (auto on email verify)
-- Run manually against production DB when deploying.

INSERT INTO `KycLimits` (
  `tier`,
  `depositDailyLimit`,
  `depositMonthlyLimit`,
  `withdrawalDailyLimit`,
  `withdrawalMonthlyLimit`
) VALUES
  ('tier1', '100000', '3000000', '1000000', '30000000'),
  ('tier2', '1000000', '30000000', '5000000', '150000000'),
  ('tier3', '5000000', '150000000', '50000000', '1500000000')
ON DUPLICATE KEY UPDATE
  `depositDailyLimit` = VALUES(`depositDailyLimit`),
  `depositMonthlyLimit` = VALUES(`depositMonthlyLimit`),
  `withdrawalDailyLimit` = VALUES(`withdrawalDailyLimit`),
  `withdrawalMonthlyLimit` = VALUES(`withdrawalMonthlyLimit`);
