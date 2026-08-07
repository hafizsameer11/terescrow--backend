-- CreateTable
CREATE TABLE `strowallet_config` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `topup_bank_code` VARCHAR(20) NULL,
    `topup_bank_name` VARCHAR(120) NULL,
    `topup_account_number` VARCHAR(30) NULL,
    `topup_account_name` VARCHAR(120) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_topup_logs` (
    `id` VARCHAR(191) NOT NULL,
    `merchant` VARCHAR(30) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'NGN',
    `bank_code` VARCHAR(20) NOT NULL,
    `bank_name` VARCHAR(120) NULL,
    `account_number` VARCHAR(30) NOT NULL,
    `account_name` VARCHAR(120) NULL,
    `palmpay_order_id` VARCHAR(64) NULL,
    `palmpay_order_no` VARCHAR(64) NULL,
    `palmpay_status` VARCHAR(20) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `initiated_by_id` INTEGER NOT NULL,
    `error_message` TEXT NULL,
    `provider_response` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `merchant_topup_logs_merchant_idx`(`merchant`),
    INDEX `merchant_topup_logs_status_idx`(`status`),
    INDEX `merchant_topup_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `merchant_topup_logs` ADD CONSTRAINT `merchant_topup_logs_initiated_by_id_fkey` FOREIGN KEY (`initiated_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
