# PalmPay — exact source copies (complete set)

All files below are **verbatim copies** from `terescrow--backend` for integration into another project.

## Consolidated markdown (recommended)

**[`../PALMPAY_EXACT_INTEGRATION_CODE.md`](../PALMPAY_EXACT_INTEGRATION_CODE.md)** — single file (~5500 lines) with:

- Prisma models
- `palmpay.config.ts`, `palmpay.auth.service.ts`, `palmpay.logger.ts`
- `palmpay.checkout.service.ts`, `palmpay.payout.service.ts`, `palmpay.banks.service.ts`
- `fiat.wallet.service.ts` (wallet credit/debit used by flows)
- `palmpay.types` lines 1–356 (core types)
- `palmpay.deposit.controller.ts`, `palmpay.payout.controller.ts`
- `palmpay.billpayment.service.ts`
- **`billpayment.controller.ts` (full)** — billers, items, verify, create-order, status, history
- `palmpay.webhook.controller.ts`
- All route files (deposit, payout, bill-payment, webhook)

Regenerate the big doc after changing sources:

```bash
./docs/build-palmpay-doc.sh
```

## Files in this folder

| File | Original path |
|------|----------------|
| `palmpay.config.ts` | `src/services/palmpay/palmpay.config.ts` |
| `palmpay.auth.service.ts` | `src/services/palmpay/palmpay.auth.service.ts` |
| `palmpay.logger.ts` | `src/utils/palmpay.logger.ts` |
| `palmpay.checkout.service.ts` | `src/services/palmpay/palmpay.checkout.service.ts` |
| `palmpay.payout.service.ts` | `src/services/palmpay/palmpay.payout.service.ts` |
| `palmpay.banks.service.ts` | `src/services/palmpay/palmpay.banks.service.ts` |
| `fiat.wallet.service.ts` | `src/services/fiat/fiat.wallet.service.ts` |
| `palmpay.types.core.ts` | `src/types/palmpay.types.ts` (lines 1–356) |
| `palmpay.deposit.controller.ts` | `src/controllers/customer/palmpay.deposit.controller.ts` |
| `palmpay.payout.controller.ts` | `src/controllers/customer/palmpay.payout.controller.ts` |
| `palmpay.billpayment.service.ts` | `src/services/palmpay/palmpay.billpayment.service.ts` |
| `billpayment.controller.ts` | `src/controllers/customer/billpayment.controller.ts` (full) |
| `palmpay.webhook.controller.ts` | `src/controllers/webhooks/palmpay.webhook.controller.ts` |
| `palmpay.deposit.router.ts` | `src/routes/cutomer/palmpay.deposit.router.ts` |
| `palmpay.payout.router.ts` | `src/routes/cutomer/palmpay.payout.router.ts` |
| `billpayment.router.ts` | `src/routes/cutomer/billpayment.router.ts` |
| `palmpay.webhook.router.ts` | `src/routes/webhooks/palmpay.webhook.router.ts` |
| `schema.prisma.fiat_bill_va.txt` | `prisma/schema.prisma` (lines 607–773) |
| `schema.prisma.raw_webhook.txt` | `prisma/schema.prisma` (lines 1239–1255) |

## Optional (not duplicated here)

- `src/queue/jobs/billpayment.status.job.ts` — async PalmPay bill status polling
- `src/controllers/customer/palmpay.merchant.order.controller.ts` — generic merchant create order
