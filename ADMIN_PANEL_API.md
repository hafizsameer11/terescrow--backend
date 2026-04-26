# Admin panel API integration guide

This document describes how the Terescrow backend exposes **admin** HTTP APIs: authentication, common response shapes, and **detailed** coverage of the **Profit Tracker** module. Other admin modules are listed with their URL prefixes; sub-routes live in the referenced router files under `src/routes/admin/`.

**Typical production base URL:** `https://backend.tercescrow.site`  
All paths below are **relative** to that host unless you substitute your own.

---

## 1. Authentication

Most admin routes use the shared middleware `authenticateUser` (`src/middlewares/authenticate.user.ts`).

### Accepted credentials

| Source | How to send |
|--------|-------------|
| **Bearer JWT** | Header: `Authorization: Bearer <token>` (token is the substring after the first space). |
| **Cookie** | Cookie name: `token` |

If neither is present, the API returns **401** with a message such as `You are not logged in`.

### Obtaining a token

Admin login is handled by your existing admin auth flow (JWT issued after successful login). The admin panel frontend should store the JWT and send it on every request as `Authorization: Bearer …` (recommended).

### User resolution

The middleware loads the user from the database by decoded JWT `id` and attaches:

- `req.user` (Express convention)
- `req.body._user` (legacy compatibility)

**Note:** The same `authenticateUser` middleware is used for admin profit-tracker routes; ensure the JWT corresponds to a user who is allowed to use the admin panel in your product (role checks may exist elsewhere).

---

## 2. Standard JSON response shape

Successful responses use the `ApiResponse` class (`src/utils/ApiResponse.ts`):

```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Human readable message",
  "data": { }
}
```

For **201** creates, `statusCode` is `201` and `status` remains `"success"` when `statusCode < 400`.

Errors use `ApiError` (`src/utils/ApiError.ts`): typical shape includes `statusCode`, `message`, and optionally structured `data` depending on the error.

---

## 3. Profit Tracker module (full detail)

**Base path:** `/api/admin/profit-tracker`  
**Mounted in:** `src/index.ts` → `app.use('/api/admin/profit-tracker', profitAdminRouter)`  
**Router:** `src/routes/admin/profit.admin.router.ts`  
**Controllers:** `src/controllers/admin/profit.admin.controller.ts`  
**Services:** `src/services/profit/profit.admin.service.ts`, `profit.tracker.service.ts`, `profit.backfill.service.ts`

All routes below require **`authenticateUser`** (Bearer or `token` cookie).

### 3.1 Environment: ledger writes

| Variable | Effect |
|----------|--------|
| `PROFIT_TRACKER_WRITE_ENABLED` | If set to the string `false`, **new rows are not written** to `profit_ledger` (runtime no-op for `record`). Default is enabled (any value other than `false`). |

---

### 3.2 `GET /api/admin/profit-tracker/configs`

Returns all configuration rows used by the profit engine.

**Response `data` shape:**

```json
{
  "profitConfigs": [ ],
  "rateConfigs": [ ],
  "discountTiers": [ ]
}
```

Each array contains Prisma models: `ProfitConfig`, `RateConfig`, `DiscountTier` (field names match DB column mapping in `prisma/schema.prisma`).

---

### 3.3 `POST /api/admin/profit-tracker/configs/profit`

Creates a **profit rule** (`ProfitConfig`).

**Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`

**Body (JSON):**

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `transactionType` | Yes | string | Stored uppercased (e.g. `BUY`, `SELL`, `DEPOSIT`, `WITHDRAWAL`, `BILL_PAYMENTS`). |
| `scope` | No | string | `GLOBAL` (default), `ASSET`, or `SERVICE`. |
| `asset` | If scope `ASSET` | string | Uppercased on save (e.g. `USDT`, `BTC`). |
| `service` | If scope `SERVICE` | string | Lowercased on save (e.g. `bill_payment`, `crypto_send`). |
| `profitType` | Yes | string | `FIXED`, `PERCENTAGE`, or `SPREAD`. |
| `value` | Yes | number/string | Meaning depends on `profitType` (see §3.8). |
| `isActive` | No | boolean | Default `true`. |
| `effectiveFrom` | No | ISO date string | Default `now`. |
| `effectiveTo` | No | ISO date string or null | Open-ended if omitted/null. |

**Response:** `201`, `data` is the created `ProfitConfig` row.

---

### 3.4 `PUT /api/admin/profit-tracker/configs/profit/:id`

Updates an existing profit config. **Path:** `id` — integer primary key.

**Body:** any subset of the create fields; omitted fields are left unchanged (per `profit.admin.service.ts`).

**Response:** `200`, `data` is the updated row.

---

### 3.5 `POST /api/admin/profit-tracker/configs/rate`

Creates **base buy/sell rates** for an asset (`RateConfig`).

**Body:**

| Field | Required | Notes |
|-------|----------|--------|
| `asset` | Yes | Uppercased (e.g. `USDT`). |
| `blockchain` | No | Lowercased if provided (e.g. `ethereum`, `tron`). `null` = global for that asset. |
| `baseBuyRate` | Yes | Decimal. |
| `baseSellRate` | Yes | Decimal. |
| `isActive` | No | Default `true`. |
| `effectiveFrom` / `effectiveTo` | No | Same as profit config. |

**Response:** `201`, created `RateConfig`.

---

### 3.6 `PUT /api/admin/profit-tracker/configs/rate/:id`

Updates a rate config by `id`.

---

### 3.7 `POST /api/admin/profit-tracker/configs/discount-tier`

Creates a **discount tier** (`DiscountTier`) used to adjust effective sell rate from `baseSellRate`.

**Body:**

| Field | Required | Notes |
|-------|----------|--------|
| `minAmount` | Yes | Lower bound of **USD** notion (decimal). |
| `maxAmount` | No | Upper bound; `null` = open-ended. |
| `discountPercentage` | Yes | Applied as percent off **base sell rate** (engine: `sellRate = baseSellRate - baseSellRate * (pct/100)`). |
| `asset` | No | If set, tier can be asset-specific (uppercased). |
| `transactionType` | No | If set, uppercased; can scope tier to a type. |
| `precedence` | No | Integer, default `0`; higher wins first in tie ordering. |
| `isActive` | No | Default `true`. |
| `effectiveFrom` / `effectiveTo` | No | Same pattern as above. |

**Response:** `201`, created `DiscountTier`.

---

### 3.8 `PUT /api/admin/profit-tracker/configs/discount-tier/:id`

Updates a discount tier by `id`.

---

### 3.9 `POST /api/admin/profit-tracker/preview`

Runs the **profit engine** without writing to `profit_ledger`. Use this from the admin UI before saving rules or to debug a scenario.

**Body:**

| Field | Required | Notes |
|-------|----------|--------|
| `transactionType` | Yes | e.g. `SELL`, `BUY`, `DEPOSIT`. |
| `amount` | Yes | Primary amount in **trade units** (crypto amount for crypto types, or fiat amount when appropriate). |
| `asset` | No | Helps pick asset-scoped config and `RateConfig`. |
| `blockchain` | No | Lowercased; used for rate lookup. |
| `service` | No | Lowercased; used for service-scoped `ProfitConfig`. |
| `amountUsd` | No | If provided, used to select **discount tier** by USD range. |
| `amountNgn` | No | Used as base for **percentage** profit when `profitType` is `PERCENTAGE` (if `amountNgn` missing, engine may fall back to `amountUsd` or `amount`). |
| `buyRate` | No | Optional override; else from `RateConfig.baseBuyRate` if found. |
| `sellRate` | No | Optional override; else derived from `RateConfig.baseSellRate` and discount tier. **Field name is `sellRate` (not `rateUsdToNgn`).** |

**Response `data`:** engine output (numbers may appear as strings or Prisma `Decimal` serialization depending on client):

- `transactionType`, `asset`, `blockchain`, `service`
- `amount`, `amountUsd`, `amountNgn`, `buyRate`, `sellRate`, `discountPercentage`
- `profitType`: `FIXED` | `PERCENTAGE` | `SPREAD`
- `profitValue`, `profitNgn`
- `configId`, `rateConfigId`, `discountTierId` (when resolved)
- `notes`

**Profit semantics (summary):**

- **`SPREAD`:** `profitNgn = (sellRate - buyRate) * amount` (spread per unit × amount).
- **`PERCENTAGE`:** `profitNgn = base * (value/100)` where `base` prefers `amountNgn`, then `amountUsd`, then `amount`; `profitValue` stores the percentage value from config.
- **`FIXED`:** `profitNgn = value` (fixed ₦ amount).

If **no** `ProfitConfig` matches but **both** `buyRate` and `sellRate` resolve, the engine uses a **spread fallback** and sets a note accordingly.

---

### 3.10 `GET /api/admin/profit-tracker/ledger`

Paginated **profit ledger** rows (`ProfitLedger`).

**Query parameters:**

| Param | Type | Notes |
|-------|------|--------|
| `page` | number | Default `1`. |
| `limit` | number | Default `20`, max `100`. |
| `transactionType` | string | Filter; uppercased in query. |
| `asset` | string | Filter; uppercased. |
| `status` | string | Filter; lowercased. |
| `startDate` | ISO string | `createdAt >= startDate` |
| `endDate` | ISO string | `createdAt <= endDate` |

**Response `data`:**

```json
{
  "items": [ ],
  "total": 0,
  "page": 1,
  "limit": 20,
  "totalPages": 0
}
```

Each item is a `ProfitLedger` row. Important fields:

| Field | Meaning |
|-------|---------|
| `eventKey` | Unique idempotency key: `SOURCE:SOURCE_ID:TRANSACTION_TYPE` unless overridden. |
| `sourceTransactionType` | e.g. `CRYPTO_TRANSACTION`, `FIAT_TRANSACTION`. |
| `sourceTransactionId` | External id: crypto `transactionId` string or fiat UUID. |
| `transactionType` | Normalized type for reporting (`BUY`, `SELL`, `DEPOSIT`, `WITHDRAWAL`, …). |
| `profitNgn` | Profit in **NGN** (primary dashboard currency for this module). |
| `meta` | JSON metadata (often includes `configId`, `rateConfigId`, `discountTierId`). |

---

### 3.11 `GET /api/admin/profit-tracker/stats`

Aggregated metrics for dashboard cards (all respect the same filters as ledger except pagination).

**Query parameters:** `transactionType`, `asset`, `status`, `startDate`, `endDate` (same semantics as §3.10).

**Response `data`:**

```json
{
  "totalProfit": "0",
  "profitToday": "0",
  "profitThisWeek": "0",
  "profitThisMonth": "0",
  "byTransactionType": [
    { "transactionType": "SELL", "totalProfit": "0", "count": 0 }
  ],
  "byAsset": [
    { "asset": "USDT", "totalProfit": "0", "count": 0 }
  ]
}
```

**Week definition:** `profitThisWeek` uses a simple week start: **Sunday 00:00 local server time** (see `profit.tracker.service.ts`).

---

### 3.12 `POST /api/admin/profit-tracker/backfill`

Creates missing `profit_ledger` rows for historical data (idempotent: skips if `eventKey` already exists).

**Body (JSON):**

| Field | Type | Notes |
|-------|------|--------|
| `dryRun` | boolean | If `true`, only counts `scanned` / `skipped`; does **not** insert. |
| `limit` | number | Optional; caps batch size per domain (default and max enforced in service). |

**Response `data`:**

```json
{
  "crypto": { "scanned": 0, "created": 0, "skipped": 0, "dryRun": false },
  "fiat": { "scanned": 0, "created": 0, "skipped": 0, "dryRun": false }
}
```

**Crypto backfill** processes `crypto_transactions` with `status = successful` and replays BUY/SELL/SEND/RECEIVE/SWAP child amounts into `record()`.

**Fiat backfill** processes `fiat_transactions` with `status = completed`.

---

### 3.13 `GET /api/admin/profit-tracker/reconcile`

Dry-run style counts of how many rows in the latest batch would still need ledger rows.

**Query:** `limit` (optional number).

**Response `data` example:**

```json
{
  "missing": { "crypto": 0, "fiat": 0 },
  "scanned": { "crypto": 0, "fiat": 0 }
}
```

Interpretation: `missing.*` is derived from `scanned - skipped` in dry-run backfill passes (rows in batch that did not already have a ledger entry).

---

### 3.14 Idempotency and `eventKey` rules

Default `eventKey` format (`profit.ledger.service.ts`):

```text
<SOURCE_TRANSACTION_TYPE>:<SOURCE_TRANSACTION_ID>:<TRANSACTION_TYPE>
```

Examples:

- Crypto sell: `CRYPTO_TRANSACTION:abc123txid:SELL`
- Fiat deposit completion: `FIAT_TRANSACTION:<uuid>:DEPOSIT`

Duplicate POSTs / replays return the existing row on unique constraint (`P2002`).

---

## 4. Other admin API prefixes (reference)

These are mounted in `src/index.ts`. Each module has its own router file under `src/routes/admin/` with subpaths (not fully expanded here to avoid duplication drift).

| Base path | Purpose |
|-----------|---------|
| `/api/admin/crypto` | Crypto rate tiers CRUD (`crypto.rate.router.ts`). |
| `/api/admin/master-wallet` | Master wallet management. |
| `/api/admin/transactions` | Admin transaction listing. |
| `/api/admin/user-balances` | User balance utilities. |
| `/api/admin/vendors` | Vendor CRUD / payout addresses. |
| `/api/admin/daily-report` | Daily reporting. |
| `/api/admin/transaction-tracking` | Receive tracking, disbursements, ChangeNOW-related flows. |
| `/api/admin/changenow` | ChangeNOW admin APIs. |
| `/api/admin/referrals` | Referral admin. |
| `/api/admin/support` | Support admin. |
| `/api/admin/customers` | Customer freeze / restrictions. |
| `/api/admin/profit-tracker` | **Profit Tracker** (this document §3). |
| `/api/admin/giftcards` | Gift card admin. |
| `/api/admin` | Misc admin routes (`auth.router.ts`, `chat.router.ts`, …). |
| `/api/admin/operations` | Operations utilities. |
| `/api/admin/webhooks` | Webhook migration / tooling. |

For each prefix, open the matching `src/routes/admin/*.router.ts` file for exact paths, HTTP verbs, and validators.

---

## 5. Frontend integration checklist

1. **Login** → obtain JWT.
2. Set **axios/fetch** default: `Authorization: Bearer <token>` (or ensure `token` cookie is sent with `credentials: 'include'` if you use cookie auth).
3. **Profit Tracker screens**
   - Load config: `GET /api/admin/profit-tracker/configs`
   - Table: `GET /api/admin/profit-tracker/ledger?page=&limit=&…`
   - Cards: `GET /api/admin/profit-tracker/stats?…`
   - Before saving a rule: `POST /api/admin/profit-tracker/preview`
4. **Parse** `ApiResponse` shape: read `data`, display `message`, handle `statusCode`.
5. **Deploy note:** run Prisma migrations so `profit_configs`, `rate_configs`, `discount_tiers`, and `profit_ledger` exist before calling these endpoints.

---

## 6. Quick cURL examples

Replace `BASE` and `TOKEN`.

```bash
BASE="https://backend.tercescrow.site"
TOKEN="<jwt>"

curl -sS "$BASE/api/admin/profit-tracker/configs" \
  -H "Authorization: Bearer $TOKEN"

curl -sS "$BASE/api/admin/profit-tracker/preview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transactionType":"SELL","asset":"USDT","blockchain":"ethereum","amount":"100","amountUsd":"100"}'

curl -sS "$BASE/api/admin/profit-tracker/ledger?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 7. Related internal docs

- Rollout and `PROFIT_TRACKER_WRITE_ENABLED`: [docs/profit-tracker.md](docs/profit-tracker.md)
