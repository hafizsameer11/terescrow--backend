#!/usr/bin/env bash
# Regenerate docs/TATUM_EXACT_INTEGRATION_CODE.md from docs/tatum-exact-source/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/TATUM_EXACT_INTEGRATION_CODE.md"
DOC="$ROOT/docs/tatum-exact-source"

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

append_prisma() {
  echo ""
  echo "---"
  echo ""
  echo "## $1"
  echo ""
  echo '```prisma'
  cat "$2"
  echo '```'
}

{
  echo '# Tatum — **complete** exact code & database (verbatim from this repo)'
  echo ''
  echo 'Same level of detail as `PALMPAY_EXACT_INTEGRATION_CODE.md`: Prisma models, Tatum API service, virtual accounts, deposit addresses, master wallet, webhook ingestion, async processing job, queue jobs, crypto transaction persistence, routes.'
  echo ''
  echo '**Mirror folder:** `docs/tatum-exact-source/` — plain `.ts` copies.'
  echo ''
  echo '### Table of contents'
  echo ''
  echo '1. Env vars & Tatum API overview'
  echo '2. Prisma: MasterWallet, WalletCurrency, UserWallet, VirtualAccount, DepositAddress, WebhookResponse'
  echo '3. Prisma: TatumRawWebhook'
  echo '4. Prisma: CryptoTransaction, CryptoBuy…CryptoReceive + enums'
  echo '5. tatum.service.ts (V3 + V4 API, wallets, webhooks)'
  echo '6. virtual.account.service.ts'
  echo '7. deposit.address.service.ts'
  echo '8. master.wallet.service.ts'
  echo '9. tatum.logger.ts'
  echo '10. tatum.webhook.controller.ts'
  echo '11. process.webhook.job.ts'
  echo '12. crypto.transaction.service.ts (used by webhook processing)'
  echo '13. create.virtual.account.job.ts'
  echo '14. retry.sell.token.transfer.job.ts'
  echo '15. tatum.webhook.router.ts'
  echo '16. External dependencies & queue wiring'
  echo ''
  echo '---'
  echo ''
  echo '## 1) Environment variables (Tatum)'
  echo ''
  echo '```env'
  echo 'TATUM_API_KEY=your_key'
  echo 'TATUM_BASE_URL=https://api.tatum.io/v3   # optional; V4 uses https://api.tatum.io/v4'
  echo 'ENCRYPTION_KEY=32_byte_compatible_key_for_aes256   # private key / mnemonic encryption'
  echo '# Webhook URL you register in Tatum must hit:'
  echo '# POST https://your-api.com/api/v2/webhooks/tatum'
  echo '```'
  echo ''
  echo '**API:** `tatum.service.ts` uses `x-api-key` header. V4 used for address-based webhook subscriptions (`INCOMING_NATIVE_TX`, `INCOMING_FUNGIBLE_TX`).'
  echo ''

  append_prisma '2–4) Prisma — wallets, deposit addresses, WebhookResponse' "$DOC/schema.prisma.wallets_addresses_webhook.txt"
  append_prisma '### TatumRawWebhook' "$DOC/schema.prisma.tatum_raw_webhook.txt"
  append_prisma '### CryptoTransaction + CryptoBuy / Sell / Send / Receive' "$DOC/schema.prisma.crypto_receive_chain.txt"
  append_prisma '### Enums CryptoTxType, CryptoTxStatus' "$DOC/schema.prisma.crypto_enums.txt"

  append_ts '5) tatum.service.ts' "$DOC/tatum.service.ts"
  append_ts '6) virtual.account.service.ts' "$DOC/virtual.account.service.ts"
  append_ts '7) deposit.address.service.ts' "$DOC/deposit.address.service.ts"
  append_ts '8) master.wallet.service.ts' "$DOC/master.wallet.service.ts"
  append_ts '9) tatum.logger.ts' "$DOC/tatum.logger.ts"
  append_ts '10) tatum.webhook.controller.ts' "$DOC/tatum.webhook.controller.ts"
  append_ts '11) process.webhook.job.ts' "$DOC/process.webhook.job.ts"
  append_ts '12) crypto.transaction.service.ts' "$DOC/crypto.transaction.service.ts"
  append_ts '13) create.virtual.account.job.ts' "$DOC/create.virtual.account.job.ts"
  append_ts '14) retry.sell.token.transfer.job.ts' "$DOC/retry.sell.token.transfer.job.ts"
  append_ts '15) tatum.webhook.router.ts' "$DOC/tatum.webhook.router.ts"

  echo ""
  echo "---"
  echo ""
  echo "## 16) External dependencies & queue wiring"
  echo ""
  echo "- utils/prisma, utils/ApiResponse"
  echo "- utils/pushService, Prisma InAppNotification (jobs / webhook side effects)"
  echo "- services/ethereum/* — used by retry.sell.token.transfer.job (gas, balance, tx)"
  echo "- services/user/user.wallet.service — imported by deposit.address.service"
  echo "- Bull queue: src/queue/worker.ts registers queue tatum with jobs create-virtual-account, retry-sell-token-transfer"
  echo "- App mount: src/index.ts -> app.use('/api/v2/webhooks/tatum', tatumWebhookRouter)"
  echo ""
  echo "### Related docs in repo"
  echo ""
  echo "- docs/TATUM_ENV_CONFIGURATION.md"
  echo "- docs/TATUM_CODE_REFERENCE.md"
  echo "- docs/TATUM_QUEUE_SYSTEM.md"
  echo ""

} > "$OUT"

wc -l "$OUT"
