-- Item 13: Daily withdrawal ₦2,000,000 / Monthly ₦20,000,000
-- Apply on production when deploying.

UPDATE `KycLimits`
SET
  `withdrawalDailyLimit` = '2000000',
  `withdrawalMonthlyLimit` = '20000000'
WHERE `tier` IN ('tier1', 'tier2', 'tier3');
