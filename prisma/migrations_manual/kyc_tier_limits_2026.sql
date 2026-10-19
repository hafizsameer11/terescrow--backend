-- Tercescrow 3-tier KYC deposit/withdrawal limits
-- Tier 1 = registration (auto on email verify)
-- Withdrawal caps (client request): daily ₦2M, monthly ₦20M for default tier.
-- Run manually against production DB when deploying.

INSERT INTO `KycLimits` (
  `tier`,
  `depositDailyLimit`,
  `depositMonthlyLimit`,
  `withdrawalDailyLimit`,
  `withdrawalMonthlyLimit`
) VALUES
  ('tier1', '100000', '3000000', '2000000', '20000000'),
  ('tier2', '1000000', '30000000', '2000000', '20000000'),
  ('tier3', '5000000', '150000000', '2000000', '20000000')
ON DUPLICATE KEY UPDATE
  `depositDailyLimit` = VALUES(`depositDailyLimit`),
  `depositMonthlyLimit` = VALUES(`depositMonthlyLimit`),
  `withdrawalDailyLimit` = VALUES(`withdrawalDailyLimit`),
  `withdrawalMonthlyLimit` = VALUES(`withdrawalMonthlyLimit`);
