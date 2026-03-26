#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/PALMPAY_EXACT_INTEGRATION_CODE.md"
DOC="$ROOT/docs/palmpay-exact-source"

append_ts() {
  local title="$1"
  local path="$2"
  echo ""
  echo "---"
  echo ""
  echo "## $title"
  echo ""
  echo '```ts'
  cat "$path"
  echo '```'
}

{
  echo '# PalmPay — **complete** exact code & database (verbatim from this repo)'
  echo ''
  echo 'This document is the **full** integration pack: config, auth, signature, banks, wallet ledger, deposit, withdrawal, bill payments (full controller), webhooks, routes, and Prisma models.'
  echo ''
  echo '**Mirror folder:** `docs/palmpay-exact-source/` — same files as `.ts` for direct copy.'
  echo ''
  echo '### Table of contents'
  echo ''
  echo '1. PalmPay bill scene codes & DB mapping'
  echo '2. Prisma models'
  echo '3. palmpay.config.ts'
  echo '4. palmpay.auth.service.ts'
  echo '5. palmpay.logger.ts'
  echo '6. palmpay.checkout.service.ts'
  echo '7. palmpay.payout.service.ts'
  echo '8. palmpay.banks.service.ts'
  echo '9. fiat.wallet.service.ts'
  echo '10. palmpay.types (lines 1–356)'
  echo '11. palmpay.deposit.controller.ts'
  echo '12. palmpay.payout.controller.ts'
  echo '13. palmpay.billpayment.service.ts'
  echo '14. billpayment.controller.ts (full)'
  echo '15. palmpay.webhook.controller.ts'
  echo '16. Route files'
  echo '17. External dependencies'
  echo ''
  echo '---'
  echo ''
  echo '## 1) PalmPay bill payment — API scene codes & DB meaning'
  echo ''
  echo '| Item | Value |'
  echo '|------|-------|'
  echo '| PalmPay Biller API sceneCode | airtime, data, betting |'
  echo '| BillPayment.sceneCode | Same as request |'
  echo '| BillPayment.billType | sceneCode.toUpperCase() |'
  echo '| Merchant order | outOrderNo stored as palmpayOrderId |'
  echo '| PalmPay orderNo | palmpayOrderNo |'
  echo '| Bill notify URL | PALMPAY_WEBHOOK_URL/bill-payment |'
  echo '| App note | airtime is routed to Reloadly in createBillOrderController; PalmPay used for data/betting when provider=palmpay |'
  echo ''
  echo '---'
  echo ''
  echo '## 2) Prisma — FiatWallet, FiatTransaction, BillPayment, PalmPayUserVirtualAccount'
  echo ''
  echo '```prisma'
  cat "$DOC/schema.prisma.fiat_bill_va.txt"
  echo '```'
  echo ''
  echo '### PalmPayRawWebhook'
  echo ''
  echo '```prisma'
  cat "$DOC/schema.prisma.raw_webhook.txt"
  echo '```'

  append_ts '3) palmpay.config.ts' "$DOC/palmpay.config.ts"
  append_ts '4) palmpay.auth.service.ts' "$DOC/palmpay.auth.service.ts"
  append_ts '5) palmpay.logger.ts' "$DOC/palmpay.logger.ts"
  append_ts '6) palmpay.checkout.service.ts' "$DOC/palmpay.checkout.service.ts"
  append_ts '7) palmpay.payout.service.ts' "$DOC/palmpay.payout.service.ts"
  append_ts '8) palmpay.banks.service.ts' "$DOC/palmpay.banks.service.ts"
  append_ts '9) fiat.wallet.service.ts' "$DOC/fiat.wallet.service.ts"
  append_ts '10) palmpay.types.core.ts (palmpay.types lines 1–356)' "$DOC/palmpay.types.core.ts"
  append_ts '11) palmpay.deposit.controller.ts' "$DOC/palmpay.deposit.controller.ts"
  append_ts '12) palmpay.payout.controller.ts' "$DOC/palmpay.payout.controller.ts"
  append_ts '13) palmpay.billpayment.service.ts' "$DOC/palmpay.billpayment.service.ts"
  append_ts '14) billpayment.controller.ts (full)' "$DOC/billpayment.controller.ts"
  append_ts '15) palmpay.webhook.controller.ts' "$DOC/palmpay.webhook.controller.ts"

  echo ""
  echo "---"
  echo ""
  echo "## 16) Route files"
  echo ""
  echo "### palmpay.deposit.router.ts"
  echo '```ts'
  cat "$DOC/palmpay.deposit.router.ts"
  echo '```'
  echo ""
  echo "### palmpay.payout.router.ts"
  echo '```ts'
  cat "$DOC/palmpay.payout.router.ts"
  echo '```'
  echo ""
  echo "### billpayment.router.ts"
  echo '```ts'
  cat "$DOC/billpayment.router.ts"
  echo '```'
  echo ""
  echo "### palmpay.webhook.router.ts"
  echo '```ts'
  cat "$DOC/palmpay.webhook.router.ts"
  echo '```'

  echo ""
  echo "---"
  echo ""
  echo "## 17) External dependencies (implement or stub in your app)"
  echo ""
  echo "- utils/prisma — Prisma client"
  echo "- utils/ApiError, utils/ApiResponse"
  echo "- middlewares/authenticate.user"
  echo "- utils/customer.restrictions — deposit/payout"
  echo "- services/referral/referral.commission.service — bill payment"
  echo "- services/vtpass/*, services/reloadly/* — only for multi-provider branches in billpayment.controller"
  echo "- utils/pushService — webhook notifications"
  echo ""

} > "$OUT"

wc -l "$OUT"
