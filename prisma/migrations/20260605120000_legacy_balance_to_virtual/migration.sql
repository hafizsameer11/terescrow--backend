-- Reclassify existing wallet balances as virtual (admin-held / pre-deposit-split).
-- on_chain_balance is reserved for new RECEIVE webhook credits only.
UPDATE `virtual_accounts`
SET
  `virtual_balance` = COALESCE(
    NULLIF(TRIM(`available_balance`), ''),
    NULLIF(TRIM(`account_balance`), ''),
    '0'
  ),
  `on_chain_balance` = '0';
