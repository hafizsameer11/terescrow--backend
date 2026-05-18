-- AlterTable
ALTER TABLE `vendors` ADD COLUMN `wallet_currency_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `admin_exchange_payout_addresses` ADD COLUMN `wallet_currency_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `vendors_wallet_currency_id_idx` ON `vendors`(`wallet_currency_id`);

-- CreateIndex
CREATE INDEX `admin_exchange_payout_addresses_wallet_currency_id_idx` ON `admin_exchange_payout_addresses`(`wallet_currency_id`);

-- AddForeignKey
ALTER TABLE `vendors` ADD CONSTRAINT `vendors_wallet_currency_id_fkey` FOREIGN KEY (`wallet_currency_id`) REFERENCES `wallet_currencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_exchange_payout_addresses` ADD CONSTRAINT `admin_exchange_payout_addresses_wallet_currency_id_fkey` FOREIGN KEY (`wallet_currency_id`) REFERENCES `wallet_currencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
