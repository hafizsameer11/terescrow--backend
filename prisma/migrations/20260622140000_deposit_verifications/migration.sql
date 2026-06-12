-- CreateTable
CREATE TABLE `deposit_verifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tx_hash` VARCHAR(255) NOT NULL,
    `chain` VARCHAR(50) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `virtual_account_id` INTEGER NOT NULL,
    `account_id` VARCHAR(255) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_retry_at` DATETIME(3) NULL,
    `webhook_amount` VARCHAR(100) NULL,
    `on_chain_amount` VARCHAR(100) NULL,
    `contract_address` VARCHAR(255) NULL,
    `deposit_address` VARCHAR(255) NULL,
    `provider` VARCHAR(50) NULL,
    `failure_reason` VARCHAR(500) NULL,
    `raw_snippet` JSON NULL,
    `received_asset_id` INTEGER NULL,
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `deposit_verifications_tx_chain_unique`(`tx_hash`, `chain`),
    INDEX `deposit_verifications_status_idx`(`status`),
    INDEX `deposit_verifications_next_retry_at_idx`(`next_retry_at`),
    INDEX `deposit_verifications_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Extend CryptoTransaction status enum for deposit verification
ALTER TABLE `crypto_transactions` MODIFY `status` ENUM(
  'pending',
  'processing',
  'successful',
  'failed',
  'cancelled',
  'fake',
  'revoked',
  'pending_verification',
  'verify_failed_timeout'
) NOT NULL DEFAULT 'pending';
