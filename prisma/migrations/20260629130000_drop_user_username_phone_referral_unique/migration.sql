-- Allow duplicate username, phone, and referralCode on production (legacy data).
-- Email remains unique via User_email_key.

DROP INDEX `User_username_key` ON `User`;
DROP INDEX `User_phoneNumber_key` ON `User`;
DROP INDEX `User_referralCode_key` ON `User`;
