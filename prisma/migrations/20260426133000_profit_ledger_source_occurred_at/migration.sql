-- AlterTable
ALTER TABLE `profit_ledger` ADD COLUMN `source_occurred_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `profit_ledger_source_occurred_at_idx` ON `profit_ledger`(`source_occurred_at`);

-- CreateIndex
CREATE INDEX `profit_ledger_transaction_type_source_occurred_at_idx` ON `profit_ledger`(`transaction_type`, `source_occurred_at`);
