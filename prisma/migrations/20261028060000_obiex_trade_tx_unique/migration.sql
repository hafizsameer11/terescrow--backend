-- Idempotent Obiex provider tx: same side + transactionId cannot insert twice.
-- MySQL allows multiple NULLs in a UNIQUE index (trades without a tx id still OK).
CREATE UNIQUE INDEX `obiex_trade_logs_side_tx_unique`
  ON `obiex_trade_logs` (`side`, `obiex_transaction_id`);
