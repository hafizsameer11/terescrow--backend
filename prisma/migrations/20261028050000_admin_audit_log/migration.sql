CREATE TABLE `AdminAuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `adminUserId` INTEGER NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `method` VARCHAR(10) NOT NULL,
  `path` VARCHAR(500) NOT NULL,
  `targetUserId` INTEGER NULL,
  `statusCode` INTEGER NULL,
  `ip` VARCHAR(64) NULL,
  `userAgent` VARCHAR(500) NULL,
  `requestMeta` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `AdminAuditLog_adminUserId_idx`(`adminUserId`),
  INDEX `AdminAuditLog_action_idx`(`action`),
  INDEX `AdminAuditLog_targetUserId_idx`(`targetUserId`),
  INDEX `AdminAuditLog_createdAt_idx`(`createdAt`),
  INDEX `AdminAuditLog_path_idx`(`path`),
  CONSTRAINT `AdminAuditLog_adminUserId_fkey`
    FOREIGN KEY (`adminUserId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
