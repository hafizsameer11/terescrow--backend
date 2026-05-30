# Profit Tracker — Admin Guide

Profit Tracker is Terescrow’s **internal profit accounting** dashboard. It answers:

> **How much did we earn (in NGN) from each user activity?**

It is **not** the same as:

- User wallet balances
- Total platform crypto holdings
- Cash in a bank account

It is a **computed ledger** built from admin rules and live transaction data.

---

## How it works

```
User action → Transaction saved → Profit engine runs → profit_ledger row → Admin UI
```

When a transaction completes, the system writes one row to **`profit_ledger`** with:

| Field | Meaning |
|-------|---------|
| Transaction type | SELL, BUY, RECEIVE, BILL_PAYMENT, etc. |
| Amounts | Crypto quantity, USD, NGN (when available) |
| Rates | Buy rate, sell rate, discount tier |
| **profitNgn** | Terescrow’s profit in Naira for that event |
| status | Usually `computed` (auto-calculated) |
| eventKey | Unique key so the same event is never double-recorded |
| sourceTransactionId | Link back to the real transaction (e.g. `SELL-...`) |

Writes can be disabled with `PROFIT_TRACKER_WRITE_ENABLED=false`. See [profit-tracker.md](./profit-tracker.md) for rollout and backfill.

---

## How profit is calculated

Rules are configured under the **Configs** tab (`profit_configs`, `rate_configs`, `discount_tiers`).

### Profit types

| Type | Formula | Example |
|------|---------|---------|
| **SPREAD** | `(sellRate − buyRate) × amount` | Sell ₦1,200/$ − buy ₦1,000/$ on $10 → **₦2,000** profit |
| **PERCENTAGE** | `baseAmount × (percent ÷ 100)` | 1% of ₦100,000 → **₦1,000** |
| **FIXED** | Flat NGN per transaction | **₦50** per bill payment |

**Priority for config lookup:** ASSET-specific → SERVICE-specific → GLOBAL.

If no profit config exists but buy and sell rates are available, the engine **falls back to SPREAD**.

### Crypto BUY / SELL (spread)

For crypto trades, profit uses the **NGN/$ spread**, not the crypto token price:

| Field | Meaning |
|-------|---------|
| **Sell-side rate** (`buyRate` in ledger) | SELL tier — lower NGN per $1 (what we pay when user sells) |
| **Buy-side rate** (`sellRate` in ledger) | BUY tier — higher NGN per $1 (what user pays when buying) |
| **Spread base** (`amount`) | USD value of the trade (not crypto quantity) |

**Formula:** `(Buy-side rate − Sell-side rate) × USD value = profit (NGN)`

Example: user sells $12 USDT with SELL tier ₦980/$ and BUY tier ₦1,000/$:

`(1,000 − 980) × 12 = ₦240` platform profit.

The user’s NGN payout (`amountNgn`) is separate — it reflects the SELL tier rate applied to USD, minus fees.

---

## Admin UI sections

### Filters

| Filter | Purpose |
|--------|---------|
| Transaction type | e.g. `SELL`, `BUY`, `USDT` flows |
| Asset | e.g. `USDT`, `BTC` |
| Status | e.g. `computed` |
| Start / End | Date range on **when the source transaction occurred** (`sourceOccurredAt`), with fallback to `createdAt` for legacy rows |
| Page size | Ledger rows per page (max 100) |
| Refresh | Reload stats and ledger; may sync missing historical rows |

### Summary cards

| Card | Meaning |
|------|---------|
| **Total profit (NGN)** | Sum of `profitNgn` for rows matching filters |
| **Today** | Profit from transactions that occurred today |
| **This week** | Profit since start of calendar week |
| **This month** | Profit since start of calendar month |

All NGN values are **whole numbers** (no kobo decimals).

### By transaction type

Groups ledger rows by `transactionType` and shows total profit + count.

Common types:

| Type | Typical profit |
|------|----------------|
| **BUY** | Spread/markup when users buy crypto with NGN |
| **SELL** | Spread/markup when users sell crypto (main profit line) |
| **CRYPTO_SELL** | Fiat wallet credit after a sell — often **₦0** (see below) |
| **CRYPTO_BUY** | Fiat debit for a buy — often **₦0** if profit is on BUY row |
| **RECEIVE** | On-chain deposit — usually **₦0** (no markup) |
| **BILL_PAYMENT** | Depends on FIXED/PERCENTAGE config |
| **DEPOSIT / WITHDRAWAL** | Depends on config |

### By asset

Same totals grouped by coin (BTC, ETH, USDT, LTC, etc.). Small negatives can appear from rounding, discounts, or missing rate config.

### Ledger table

| Column | Meaning |
|--------|---------|
| **When** | When the source transaction occurred |
| **Type** | SELL, BUY, RECEIVE, … |
| **Asset** | Coin involved (USDT, BTC, …) |
| **Amount** | Crypto qty or USD value |
| **Profit** | Terescrow earnings (NGN) |
| **Status** | `computed` = calculated from rules |
| **Details** | Full breakdown with spread formula and rates |

---

## SELL vs CRYPTO_SELL (important)

One user **sell** can produce **two** ledger rows:

1. **`SELL`** (source: `CRYPTO_TRANSACTION`)  
   - The crypto trade event  
   - **Profit is calculated here** (spread between BUY and SELL NGN/$ tiers)  
   - Example: **₦240** on a $12 sell with ₦20/$ spread

2. **`CRYPTO_SELL`** (source: `FIAT_TRANSACTION`)  
   - Skipped — profit is only on the crypto `SELL` row (no duplicate fiat ledger row)

**User received ≠ Terescrow profit**

- User sells 10 USDT at ₦980/$ → user may receive **₦9,800** (minus gas).  
- Ledger **SELL** row shows **platform margin** — e.g. **₦200** if BUY tier is ₦1,000/$ and spread is ₦20/$ × $10.

---

## Other tabs

| Tab | Purpose |
|-----|---------|
| **Overview** | Stats + ledger (this guide) |
| **Configs** | Profit rules, rate configs, discount tiers |
| **Preview** | Test profit calculation without saving |
| **Operations** | Backfill historical rows, reconcile |

### Backfill

Older transactions (before profit tracker was enabled) are synced via:

- Automatic sync when opening Overview with filters
- Manual: **Operations → Backfill** (`POST /api/admin/profit-tracker/backfill`)

Use `dryRun: true` first, then run with `dryRun: false`.

---

## API reference (admin)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/profit-tracker/stats` | Summary cards + breakdowns |
| `GET /api/admin/profit-tracker/ledger` | Paginated ledger |
| `GET /api/admin/profit-tracker/configs` | Profit / rate / discount configs |
| `POST /api/admin/profit-tracker/preview` | Preview profit for hypothetical input |
| `POST /api/admin/profit-tracker/backfill` | Sync missing ledger rows |
| `GET /api/admin/profit-tracker/reconcile` | Compare ledger vs source transactions |

---

## Code references

| Area | Path |
|------|------|
| Profit math | `src/services/profit/profit.math.ts` |
| Rule engine | `src/services/profit/profit.engine.service.ts` |
| Ledger writes | `src/services/profit/profit.ledger.service.ts` |
| Admin stats/list | `src/services/profit/profit.tracker.service.ts` |
| SELL hook | `src/services/crypto/crypto.sell.service.ts` |
| BUY hook | `src/services/crypto/crypto.buy.service.ts` |
| Fiat hooks | `src/services/fiat/fiat.wallet.service.ts` |
| Admin UI | `terescrow-electronjs/.../ProfitTrackerPage.tsx` |
| DB model | `prisma/schema.prisma` → `ProfitLedger`, `ProfitConfig` |

---

## Quick FAQ

**Why is RECEIVE profit zero?**  
Deposits credit the user’s crypto balance; markup is usually applied on BUY/SELL, not raw receive.

**Why does Total profit not match This month?**  
Total uses your **filters** (type, asset, dates). This month is always calendar month within those filters.

**Can I trust Details on a row?**  
Yes — open **Details** to see `profitType`, buy/sell rates, config ids, and notes from the engine.

**Does profit tracker reverse on failed txs?**  
Only successful/completed flows that call `profitLedgerService.record()` get rows. Failed txs typically do not.

---

*Last updated: May 2026*
