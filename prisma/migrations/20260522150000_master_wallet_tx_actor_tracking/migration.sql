-- Track which admin/agent performed master wallet actions (disburse, swap, sweep, etc.)
ALTER TABLE `master_wallet_transactions`
  ADD COLUMN `performed_by_user_id` INTEGER NULL,
  ADD COLUMN `vendor_id` INTEGER NULL,
  ADD COLUMN `notes` TEXT NULL;

CREATE INDEX `master_wallet_transactions_performed_by_user_id_idx`
  ON `master_wallet_transactions`(`performed_by_user_id`);

CREATE INDEX `master_wallet_transactions_vendor_id_idx`
  ON `master_wallet_transactions`(`vendor_id`);

ALTER TABLE `master_wallet_transactions`
  ADD CONSTRAINT `master_wallet_transactions_performed_by_user_id_fkey`
  FOREIGN KEY (`performed_by_user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `master_wallet_transactions`
  ADD CONSTRAINT `master_wallet_transactions_vendor_id_fkey`
  FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
