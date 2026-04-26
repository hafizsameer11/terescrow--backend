# Profit Tracker Rollout Notes

## Feature flag

- `PROFIT_TRACKER_WRITE_ENABLED=true` (default behavior)
- Set `PROFIT_TRACKER_WRITE_ENABLED=false` to disable writes to `profit_ledger` while still allowing the app to run.

## Rollout order

1. Deploy schema and generate Prisma client.
2. Seed `profit_configs`, `rate_configs`, and `discount_tiers`.
3. Enable admin preview and dashboard endpoints.
4. Enable ledger writes (`PROFIT_TRACKER_WRITE_ENABLED=true`).
5. Run backfill:
   - `POST /api/admin/profit-tracker/backfill` with `{ "dryRun": true }`
   - `POST /api/admin/profit-tracker/backfill` with `{ "dryRun": false, "limit": 1000 }`
6. Validate reconciliation:
   - `GET /api/admin/profit-tracker/reconcile?limit=1000`

## Minimal verification checklist

- `GET /api/admin/profit-tracker/configs` returns seeded configs.
- `POST /api/admin/profit-tracker/preview` returns computed `profitNgn`.
- Execute one BUY/SELL/SEND/SWAP and verify one `profit_ledger` row per transaction.
- Execute deposit/withdrawal/bill-payment and verify `profit_ledger` row.
- `GET /api/admin/profit-tracker/stats` and `GET /api/admin/profit-tracker/ledger` return data.
