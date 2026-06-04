-- CreateTable
CREATE TABLE `on_chain_surplus_transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `virtual_account_id` INTEGER NOT NULL,
    `source_deposit_address` VARCHAR(255) NOT NULL,
    `to_address` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(20, 8) NOT NULL,
    `currency` VARCHAR(50) NOT NULL,
    `blockchain` VARCHAR(255) NOT NULL,
    `amount_usd` DECIMAL(20, 8) NULL,
    `live_balance_at_send` DECIMAL(20, 8) NULL,
    `recorded_on_chain_at_send` DECIMAL(20, 8) NULL,
    `surplus_at_send` DECIMAL(20, 8) NULL,
    `tx_hash` VARCHAR(255) NULL,
    `gas_funding_tx_hash` VARCHAR(255) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `admin_user_id` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `on_chain_surplus_transfers_user_id_idx`(`user_id`),
    INDEX `on_chain_surplus_transfers_virtual_account_id_idx`(`virtual_account_id`),
    INDEX `on_chain_surplus_transfers_admin_user_id_idx`(`admin_user_id`),
    INDEX `on_chain_surplus_transfers_status_idx`(`status`),
    INDEX `on_chain_surplus_transfers_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `on_chain_surplus_transfers` ADD CONSTRAINT `on_chain_surplus_transfers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `on_chain_surplus_transfers` ADD CONSTRAINT `on_chain_surplus_transfers_virtual_account_id_fkey` FOREIGN KEY (`virtual_account_id`) REFERENCES `virtual_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `on_chain_surplus_transfers` ADD CONSTRAINT `on_chain_surplus_transfers_admin_user_id_fkey` FOREIGN KEY (`admin_user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
