# Frontend guide — admin exchange rates & referral commission

This document is for the frontend team to integrate **crypto exchange rate management** (NGN per USD tiers) and **referral commission settings** in the admin panel.

It covers:

- Base URLs and authentication
- Response envelope differences (crypto rates vs standard `ApiResponse`)
- All relevant admin routes with request/response contracts
- Customer-facing rate endpoint (read-only, for parity with app users)
- TypeScript-style contracts
- Suggested UI placement and flows
- Error handling and edge cases

---

## 1) Concepts

### 1.1 Exchange rates (`crypto_rates`)

- Rates are stored as **tiered rows** keyed by **`transactionType`** and a **USD notional range**.
- **`rate`** = **Naira per 1 USD** (not “per coin” — the app resolves USD amount first, then applies the tier).
- **`minAmount` / `maxAmount`**: bounds for the tier in **USD** (see `CryptoRate` model). `maxAmount` may be `null` for “no upper limit” on that tier.
- **`transactionType`** must be one of: `BUY`, `SELL`, `SWAP`, `SEND`, `RECEIVE`, **`GIFT_CARD_BUY`**.
- **`GIFT_CARD_BUY`**: same tier rules — **USD notional** = `unitPrice × quantity` for **USD-priced** Reloadly gift cards; customer is charged **`usdNotional × rate`** NGN from their fiat wallet before Reloadly is called. If Reloadly fails, NGN is refunded automatically.
- **Delete** in admin is a **soft deactivate** (`isActive: false`).

Backend selection logic for a quote amount uses the **highest matching `minAmount`** tier (`getRateForAmount` in `crypto.rate.service.ts`).

### 1.2 Referral commission settings

- **Per-service** settings: `BILL_PAYMENT`, `GIFT_CARD_BUY`, `GIFT_CARD_SELL`, `CRYPTO_BUY`, `CRYPTO_SELL`.
- **`commissionType`**: `PERCENTAGE` or `FIXED`.
- **`commissionValue`**: numeric; meaning depends on `commissionType`.
- **`level2Pct`**, **`signupBonus`**, **`minFirstWithdrawal`**: stored per service row; defaults are applied when no DB row exists (see `getCommissionSettings`).
- **`isActive`**: whether that service’s referral config is active.

**Legacy** `ReferralEarnSettings` (global percentages) remains available via `/earn-settings` for backward compatibility.

**Per-user overrides** (`UserReferralOverride`) allow influencer-specific commission for a given `service`.

---

## 2) Base URLs and auth

| Module | Base path |
|--------|-----------|
| Admin crypto rates | `/api/admin/crypto` |
| Admin referrals | `/api/admin/referrals` |
| Customer utilities (public tiers preview) | `/api/customer/utilities` |

### 2.1 Headers

- **`Authorization: Bearer <jwt>`** — required for all routes below.
- **`Content-Type: application/json`** — for `POST` / `PUT` bodies.

### 2.2 Middleware notes

- **Referrals admin** routes use **`authenticateUser`** + **`authenticateAdmin`** — only admin users.
- **Crypto rate admin** routes currently use **`authenticateUser` only** (no `authenticateAdmin` in router). The admin UI should still send an **admin JWT**; consider tightening backend policy later.

---

## 3) Response envelopes

### 3.1 Crypto rate controllers (admin)

Success:

```json
{
  "status": 200,
  "message": "string",
  "data": {}
}
```

Error (returned from controller):

```json
{
  "status": 400,
  "message": "string"
}
```

or `500` with `message`.

### 3.2 Referrals admin (`ApiResponse`)

Success:

```json
{
  "status": "success",
  "message": "string",
  "data": {}
}
```

### 3.3 Global error handler (`ApiError`)

Used by referral controllers for validation:

```json
{
  "message": "string",
  "data": null
}
```

HTTP status: `400`, `401`, `403`, `404`, `409`, `500` as applicable.

---

## 4) Admin — crypto exchange rates

All paths are prefixed with **`/api/admin/crypto`**.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rates` | All transaction types, grouped by type |
| `GET` | `/rates/history` | Rate change history (optional filters) |
| `GET` | `/rates/:type` | Tiers for one type (`BUY`, `SELL`, …) |
| `POST` | `/rates` | Create tier |
| `PUT` | `/rates/:id` | Update `rate` on a tier |
| `DELETE` | `/rates/:id` | Deactivate tier |

**Route order:** `GET /rates/history` must be registered before `GET /rates/:type` so `history` is not parsed as `:type`. The backend implements this order.

### 4.1 `GET /rates`

**Response `data`:**

```ts
{
  BUY: CryptoRateTier[];
  SELL: CryptoRateTier[];
  SWAP: CryptoRateTier[];
  SEND: CryptoRateTier[];
  RECEIVE: CryptoRateTier[];
  GIFT_CARD_BUY: CryptoRateTier[];
}
```

### 4.2 `GET /rates/:type`

**Path:** `type` = `BUY` | `SELL` | `SWAP` | `SEND` | `RECEIVE` | `GIFT_CARD_BUY` (case-insensitive in practice; use uppercase).

**Response `data`:** `CryptoRateTier[]`

**Error:** `400` if invalid type.

### 4.3 `GET /rates/history`

**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `rateId` | number (optional) | Filter by crypto rate id |
| `transactionType` | string (optional) | `BUY` \| `SELL` \| … |

**Response `data`:** array of history rows (last **100** changes), newest first.

### 4.4 `POST /rates`

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transactionType` | string | yes | `BUY` \| `SELL` \| `SWAP` \| `SEND` \| `RECEIVE` \| `GIFT_CARD_BUY` |
| `minAmount` | number | yes | USD lower bound |
| `maxAmount` | number \| null | no | USD upper bound; omit or `null` for unlimited |
| `rate` | number | yes | NGN per USD |

**Success:** `201` with created tier in `data`.

**Errors:** `400` validation; `500` e.g. `"Rate tier overlaps with existing tier"`.

### 4.5 `PUT /rates/:id`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `rate` | number | yes |

**Success:** `200` with updated tier.

### 4.6 `DELETE /rates/:id`

**Success:** `200` — tier deactivated.

---

## 5) Customer — read-only rate tiers (app parity)

For showing the same tiers end users see (crypto buy/sell, **gift card buy** NGN conversion, etc.):

**`GET /api/customer/utilities/crypto-rates/:type`**

- **Auth:** customer JWT (`authenticateUser`).
- `:type` = `BUY` | `SELL` | `SWAP` | `SEND` | `RECEIVE` | **`GIFT_CARD_BUY`**.

**Success (`ApiResponse`):**

```json
{
  "status": "success",
  "message": "Crypto rates retrieved successfully",
  "data": {
    "tiers": [],
    "bestRate": null
  }
}
```

- **`tiers`**: active tiers for that type, sorted by `minAmount` ascending.
- **`bestRate`**: the tier with the **largest `minAmount`** (reserved for highest trade amounts — used as a “headline” rate before amount entry). If no tiers, `bestRate` is `null` and message may indicate no configuration.

---

## 6) Admin — referral commission

Base path: **`/api/admin/referrals`**. All routes below require **admin**.

### 6.1 Per-service commission settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/commission-settings` | List all services with defaults merged |
| `PUT` | `/commission-settings` | Upsert one service |

#### `GET /commission-settings`

**Response `data`:** array of **6** entries (fixed service list), shape:

```ts
interface CommissionSettingRow {
  service:
    | 'BILL_PAYMENT'
    | 'GIFT_CARD_BUY'
    | 'GIFT_CARD_SELL'
    | 'CRYPTO_BUY'
    | 'CRYPTO_SELL';
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  level2Pct: number;
  signupBonus: number;
  minFirstWithdrawal: number;
  isActive: boolean;
}
```

If no DB row exists for a service, defaults are returned (e.g. `commissionValue: 0`, `level2Pct: 30`, `signupBonus: 10000`, `minFirstWithdrawal: 20000`, `isActive: false`).

#### `PUT /commission-settings`

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `service` | string | yes | One of the five services above |
| `commissionType` | string | yes | `PERCENTAGE` or `FIXED` |
| `commissionValue` | number | yes | Main commission value |
| `level2Pct` | number | no | Level-2 percentage |
| `signupBonus` | number | no | Signup bonus (NGN) |
| `minFirstWithdrawal` | number | no | Minimum first withdrawal (NGN) |
| `isActive` | boolean | no | Toggle |

**Success:** `200` with saved `ReferralCommissionSetting` record in `data`.

**Errors:** `400` — missing fields, invalid `service`, or invalid `commissionType`.

### 6.2 Legacy earn settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/earn-settings` | Global legacy settings |
| `PUT` | `/earn-settings` | Update global legacy settings |

**`GET` response `data`:**

```ts
{
  firstTimeDepositBonusPct: number;
  commissionReferralTradesPct: number;
  commissionDownlineTradesPct: number;
}
```

**`PUT` body:** any subset of the same three fields.

Use this if the product still exposes “global” referral percentages separate from per-service commission.

### 6.3 Per-user overrides (influencers)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/user-override/:userId` | List overrides for user |
| `PUT` | `/user-override/:userId` | Upsert override for one service |
| `DELETE` | `/user-override/:userId/:service` | Remove override |

**`PUT` body:**

| Field | Type | Required |
|-------|------|----------|
| `service` | string | yes — `ReferralService` enum value |
| `commissionType` | string | yes — `PERCENTAGE` \| `FIXED` |
| `commissionValue` | number | yes |

**`DELETE`:** `:service` must be a valid `ReferralService` (e.g. `CRYPTO_BUY`).

### 6.4 Other referral admin endpoints (context)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/summary` | Summary stats (`startDate`, `endDate` query params) |
| `GET` | `/` | Paginated referral list |
| `GET` | `/by-user/:userId` | Referrals for a user |

Use these for dashboards; not required for “settings” screens only.

---

## 7) TypeScript contracts (copy-paste)

```ts
export type TransactionType =
  | 'BUY'
  | 'SELL'
  | 'SWAP'
  | 'SEND'
  | 'RECEIVE'
  | 'GIFT_CARD_BUY';

/** Raw API tier; Prisma Decimals may serialize as strings in JSON */
export interface CryptoRateTier {
  id: number;
  transactionType: TransactionType;
  minAmount: string | number;
  maxAmount: string | number | null;
  rate: string | number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRatesGroupedResponse {
  BUY: CryptoRateTier[];
  SELL: CryptoRateTier[];
  SWAP: CryptoRateTier[];
  SEND: CryptoRateTier[];
  RECEIVE: CryptoRateTier[];
  GIFT_CARD_BUY: CryptoRateTier[];
}

export type ReferralService =
  | 'BILL_PAYMENT'
  | 'GIFT_CARD_BUY'
  | 'GIFT_CARD_SELL'
  | 'CRYPTO_BUY'
  | 'CRYPTO_SELL';

export interface CommissionSettingRow {
  service: ReferralService;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  level2Pct: number;
  signupBonus: number;
  minFirstWithdrawal: number;
  isActive: boolean;
}
```

---

## 8) UI integration suggestions

### 8.1 Exchange rates

- **Settings → Crypto rates** (or **Finance → Exchange rates**).
- Tabs or sections per **`transactionType`**.
- Table columns: USD range (`minAmount`–`maxAmount`), **NGN per $1**, active, actions (edit rate, deactivate).
- **Add tier** modal: validate non-overlapping ranges; show backend error if overlap.
- **History** sub-page or drawer: `GET /rates/history` with `transactionType` filter.

### 8.2 Referral commission

- **Referrals → Commission settings** (or **Settings → Referrals**).
- One row or card per **`service`** from `GET /commission-settings`.
- Save calls **`PUT /commission-settings`** per row (or on “Save all”).
- Optional: link to **User profile → Referral override** using `user-override` routes.

### 8.3 Optional: legacy earn settings

- Separate small form for **`/earn-settings`** if product still uses global percentages.

---

## 9) Example API calls

### 9.1 Fetch all admin rates

```http
GET /api/admin/crypto/rates
Authorization: Bearer <admin_jwt>
```

### 9.2 Create BUY tier

```http
POST /api/admin/crypto/rates
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "transactionType": "BUY",
  "minAmount": 0,
  "maxAmount": 1000,
  "rate": 1550
}
```

### 9.3 Load commission settings

```http
GET /api/admin/referrals/commission-settings
Authorization: Bearer <admin_jwt>
```

### 9.4 Save CRYPTO_BUY commission

```http
PUT /api/admin/referrals/commission-settings
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "service": "CRYPTO_BUY",
  "commissionType": "PERCENTAGE",
  "commissionValue": 1.5,
  "level2Pct": 30,
  "signupBonus": 10000,
  "minFirstWithdrawal": 20000,
  "isActive": true
}
```

---

## 10) Edge cases and notes

1. **Decimal serialization:** Prisma `Decimal` fields may appear as **strings** in JSON; normalize with `Number()` or `Decimal` where needed.
2. **Crypto rate errors** use `{ status, message }` — not the same as `ApiError` shape.
3. **Customer `crypto-rates`** is useful to verify what users see vs admin-configured tiers.
4. **Security:** Prefer enforcing **admin-only** on `/api/admin/crypto/*` in the backend for production.

---

## 11) Backend file references

| Area | File |
|------|------|
| Admin rate routes | `src/routes/admin/crypto.rate.router.ts` |
| Admin rate controllers | `src/controllers/admin/crypto.rate.controller.ts` |
| Rate business logic | `src/services/crypto/crypto.rate.service.ts` |
| Customer rates | `src/controllers/customer/utilities.controller.ts` (`getCryptoRatesByType`) |
| Referral admin routes | `src/routes/admin/referrals.admin.router.ts` |
| Referral admin controller | `src/controllers/admin/referrals.admin.controller.ts` |
| Referral admin service | `src/services/admin/referrals.admin.service.ts` |
| Prisma models | `CryptoRate`, `CryptoRateHistory`, `ReferralCommissionSetting`, `UserReferralOverride` in `prisma/schema.prisma` |

---

*Last updated to match backend routes and services in this repository.*
