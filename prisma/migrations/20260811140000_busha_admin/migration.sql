-- Busha admin integration tables

CREATE TABLE `busha_config` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `payout_bank_code` VARCHAR(20) NULL,
    `payout_bank_name` VARCHAR(120) NULL,
    `payout_account_number` VARCHAR(30) NULL,
    `payout_account_name` VARCHAR(120) NULL,
    `payout_recipient_id` VARCHAR(64) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `busha_customers` (
    `id` VARCHAR(191) NOT NULL,
    `busha_profile_id` VARCHAR(64) NOT NULL,
    `email` VARCHAR(120) NOT NULL,
    `first_name` VARCHAR(80) NOT NULL,
    `last_name` VARCHAR(80) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `country_id` VARCHAR(5) NOT NULL DEFAULT 'NG',
    `status` VARCHAR(30) NOT NULL DEFAULT 'inactive',
    `created_by_id` INTEGER NOT NULL,
    `provider_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `busha_customers_busha_profile_id_key`(`busha_profile_id`),
    INDEX `busha_customers_email_idx`(`email`),
    INDEX `busha_customers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `busha_trade_logs` (
    `id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `side` VARCHAR(10) NOT NULL,
    `source_currency` VARCHAR(10) NOT NULL,
    `target_currency` VARCHAR(10) NOT NULL,
    `source_amount` VARCHAR(40) NOT NULL,
    `target_amount` VARCHAR(40) NULL,
    `busha_quote_id` VARCHAR(64) NULL,
    `busha_transfer_id` VARCHAR(64) NULL,
    `busha_status` VARCHAR(40) NULL,
    `palmpay_order_id` VARCHAR(64) NULL,
    `palmpay_order_no` VARCHAR(64) NULL,
    `palmpay_status` VARCHAR(20) NULL,
    `pay_in_bank_code` VARCHAR(20) NULL,
    `pay_in_bank_name` VARCHAR(120) NULL,
    `pay_in_account_number` VARCHAR(30) NULL,
    `pay_in_account_name` VARCHAR(120) NULL,
    `pay_in_expires_at` DATETIME(3) NULL,
    `crypto_deposit_address` VARCHAR(120) NULL,
    `crypto_deposit_network` VARCHAR(20) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `error_message` TEXT NULL,
    `provider_response` JSON NULL,
    `initiated_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `busha_trade_logs_side_idx`(`side`),
    INDEX `busha_trade_logs_status_idx`(`status`),
    INDEX `busha_trade_logs_created_at_idx`(`created_at`),
    INDEX `busha_trade_logs_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `busha_customers` ADD CONSTRAINT `busha_customers_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `busha_trade_logs` ADD CONSTRAINT `busha_trade_logs_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `busha_customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `busha_trade_logs` ADD CONSTRAINT `busha_trade_logs_initiated_by_id_fkey` FOREIGN KEY (`initiated_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
