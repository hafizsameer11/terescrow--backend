-- Durable login lockout (survives Redis rate-limit reset).
ALTER TABLE `User`
  ADD COLUMN `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lockedUntil` DATETIME(3) NULL;
