-- Enforce one virtual account per (user, currency, blockchain).
-- Remove duplicate rows on production before applying this migration.

CREATE UNIQUE INDEX `virtual_accounts_user_currency_blockchain_unique` ON `virtual_accounts`(`user_id`, `currency`, `blockchain`);
