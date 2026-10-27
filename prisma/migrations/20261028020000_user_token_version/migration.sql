-- Single-device session: bump on login; JWT carries matching tv.
ALTER TABLE `User` ADD COLUMN `tokenVersion` INTEGER NOT NULL DEFAULT 0;
