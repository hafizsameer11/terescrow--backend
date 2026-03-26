# Tatum exact source mirror

Plain copies of Tatum-related code and Prisma snippets from this repo, used to build **[`../TATUM_EXACT_INTEGRATION_CODE.md`](../TATUM_EXACT_INTEGRATION_CODE.md)**.

Regenerate the big markdown:

```bash
./docs/build-tatum-doc.sh
```

## File map

| File | Source in repo |
|------|----------------|
| `schema.prisma.wallets_addresses_webhook.txt` | Prisma: `MasterWallet`, `WalletCurrency`, `UserWallet`, `VirtualAccount`, `DepositAddress`, `WebhookResponse` |
| `schema.prisma.tatum_raw_webhook.txt` | `TatumRawWebhook` |
| `schema.prisma.crypto_receive_chain.txt` | `CryptoTransaction`, `CryptoBuy`, `CryptoSell`, `CryptoSend`, `CryptoReceive`, related models |
| `schema.prisma.crypto_enums.txt` | `CryptoTxType`, `CryptoTxStatus` |
| `tatum.service.ts` | `src/services/tatum/tatum.service.ts` |
| `virtual.account.service.ts` | `src/services/tatum/virtual.account.service.ts` |
| `deposit.address.service.ts` | `src/services/tatum/deposit.address.service.ts` |
| `master.wallet.service.ts` | `src/services/tatum/master.wallet.service.ts` |
| `tatum.logger.ts` | `src/utils/tatum.logger.ts` |
| `tatum.webhook.controller.ts` | `src/controllers/webhooks/tatum.webhook.controller.ts` |
| `tatum.webhook.router.ts` | `src/routes/webhooks/tatum.webhook.router.ts` |
| `process.webhook.job.ts` | `src/jobs/tatum/process.webhook.job.ts` |
| `crypto.transaction.service.ts` | `src/services/crypto/crypto.transaction.service.ts` |
| `create.virtual.account.job.ts` | `src/jobs/tatum/create.virtual.account.job.ts` |
| `retry.sell.token.transfer.job.ts` | `src/jobs/tatum/retry.sell.token.transfer.job.ts` |

If sources move, update copies here and re-run `build-tatum-doc.sh`.

## Related docs

- `docs/TATUM_ENV_CONFIGURATION.md`
- `docs/TATUM_CODE_REFERENCE.md`
- `docs/TATUM_QUEUE_SYSTEM.md`
