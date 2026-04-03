# Frontend guide — admin ChangeNOW swaps

This guide is for the frontend team to integrate the new **admin ChangeNOW swap module** end-to-end.

It covers:
- all admin routes
- request/response contracts
- UI screens and where to integrate them
- expected statuses and actions
- error handling and UX behavior

---

## 1) Base URL and auth

**Base path:** `/api/admin/changenow`  
**Auth:** admin-only (same auth as other admin modules)

- Preferred: `Authorization: Bearer <jwt>`
- Alternative: cookie `token=<jwt>`

All endpoints below require authenticated admin.

---

## 2) Response envelope

Success:

```json
{
  "status": "success",
  "message": "string",
  "data": {}
}
```

Error (global handler):

```json
{
  "message": "string",
  "data": {}
}
```

Common error codes: `400`, `401`, `404`, `409`, `500`.

---

## 3) What admin can do (actions)

Admin can:
1. Browse ChangeNOW currencies.
2. View deterministic available swap pairs (if partner access enabled).
3. See internal asset -> ChangeNOW ticker mapping.
4. Override ticker mapping for any internal `WalletCurrency`.
5. Get real-time quote (`min`, `estimated receive`, detected networks).
6. Get network-fee estimate for better UX.
7. Manage payout destination addresses (create/list/update/archive).
8. Create swap from:
   - customer received asset (`sourceType=received_asset`) OR
   - master wallet asset (`sourceType=master_wallet`)
9. Track swap orders list/detail.
10. Manually refresh order status.
11. View partner exchange list (`/partner-exchanges`) for reconciliation.

---

## 4) Routes (complete)

### 4.1 Currencies

#### `GET /currencies`
Returns ChangeNOW currencies (cached server-side).

`data`:

```ts
{
  items: Array<{
    ticker: string;
    name: string;
    image?: string;
    network?: string;
    tokenContract?: string | null;
    buy?: boolean;
    sell?: boolean;
    legacyTicker?: string;
  }>;
}
```

---

### 4.2 Available pairs

#### `GET /available-pairs`
Deterministic pair/network discovery from ChangeNOW.

Query (all optional):
- `fromCurrency`
- `toCurrency`
- `fromNetwork`
- `toNetwork`
- `flow` (`standard` | `fixed-rate`)  
Current product flow is `standard`.

`data`:

```ts
{
  items: Array<{
    fromCurrency: string;
    toCurrency: string;
    fromNetwork?: string;
    toNetwork?: string;
    flow?: {
      standard?: boolean;
      "fixed-rate"?: boolean;
    };
  }>;
}
```

Use this endpoint to build pair pickers and avoid network ambiguity.

---

### 4.3 Internal ticker map

#### `GET /map-internal`
Returns internal wallet currencies and resolved ChangeNOW ticker.

`data`:

```ts
{
  items: Array<{
    id: number;                    // walletCurrencyId
    blockchain: string;
    currency: string;
    contractAddress: string | null;
    isToken: boolean;
    changenowTicker: string;
    mappingSource: "database" | "fallback";
  }>;
}
```

---

### 4.4 Upsert ticker mapping

#### `PUT /ticker-mappings/:walletCurrencyId`
Body:

```json
{
  "changenowTicker": "usdterc20"
}
```

Use this when fallback mapping is wrong for your partner account.

Response `data` is the saved mapping row.

---

### 4.5 Quote

#### `GET /quote?fromTicker=&toTicker=&amount=`
Returns min amount + estimated receive + networks used.

`data`:

```ts
{
  minAmount: number;
  fromTicker: string;
  toTicker: string;
  amountFrom: string;
  fromNetwork: string | null;
  toNetwork: string | null;
  estimatedAmountTo: string | null;
  rawEstimate: Record<string, unknown>;
}
```

Frontend behavior:
- disable submit if `amount < minAmount`
- show `estimatedAmountTo` prominently
- show detected network pair for transparency

---

### 4.6 Network fee estimate

#### `GET /network-fee`
Query:
- required: `fromTicker`, `toTicker`, `amount`
- optional: `fromNetwork`, `toNetwork`, `convertedCurrency`, `convertedNetwork`

Example:
`/network-fee?fromTicker=usdt&toTicker=btc&amount=100&fromNetwork=eth&toNetwork=btc&convertedCurrency=usd&convertedNetwork=usd`

`data`: passthrough from ChangeNOW network-fee response (contains `estimatedFee` object).

Use in quote panel as “est. network fee (already included in estimate)” note.

---

### 4.7 Payout addresses (admin-managed destination wallets)

#### `GET /payout-addresses` 
`data`:

```ts
{
  items: Array<{
    id: number;
    adminUserId: number;
    label: string | null;
    address: string;
    extraId: string | null;
    toNetworkHint: string | null;
    isDefault: boolean;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

#### `POST /payout-addresses`
Body:

```json
{
  "label": "Treasury USDT ERC20",
  "address": "0x....",
  "extraId": "",
  "toNetworkHint": "eth",
  "isDefault": true
}
```

#### `PATCH /payout-addresses/:id`
Body can include any of:
- `label`
- `address`
- `extraId` (`string | null`)
- `toNetworkHint` (`string | null`)
- `isDefault`
- `archived`

#### `DELETE /payout-addresses/:id`
Soft archive. (It is not hard deleted.)

---

### 4.8 Create swap (main action)

#### `POST /swaps`

Two modes:

1) **From received asset**

```json
{
  "sourceType": "received_asset",
  "receiveTransactionId": "RECEIVE-1768556527439-14-eghihr74i",
  "fromTicker": "usdterc20",
  "toTicker": "btc",
  "amountFrom": "4",
  "payoutAddressId": 12,
  "refundAddress": "0x...."
}
```

2) **From master wallet**

```json
{
  "sourceType": "master_wallet",
  "masterWalletBlockchain": "ethereum",
  "walletCurrencyId": 5,
  "fromTicker": "usdterc20",
  "toTicker": "btc",
  "amountFrom": "50",
  "payoutAddressId": 12,
  "refundAddress": "0x...."
}
```

Important validations:
- `sourceType` must be `received_asset` or `master_wallet`.
- `fromTicker`, `toTicker`, `amountFrom`, `payoutAddressId` required.
- for `received_asset`, `receiveTransactionId` required.
- for `master_wallet`, `masterWalletBlockchain` + `walletCurrencyId` required.
- `fromTicker` must match internal mapping (backend enforces).

Response:
- returns created order with related data; pay-in broadcast is attempted immediately.
- order status transitions to `payin_broadcast` if outbound tx succeeded.

---

### 4.9 Swap list

#### `GET /swaps?page=1&limit=20&status=exchanging`

Allowed `status`:
- `awaiting_payin`
- `payin_broadcast`
- `exchanging`
- `completed`
- `failed`
- `refunded`

`data`:

```ts
{
  items: Array<{
    id: number;
    sourceType: "received_asset" | "master_wallet";
    status: string;
    changenowStatus: string | null;
    fromTicker: string;
    toTicker: string;
    amountFrom: string;
    expectedAmountTo: string | null;
    amountReceive: string | null;
    payinAddress: string;
    payoutAddress: string;
    outboundTxHash: string | null;
    payinHash: string | null;
    payoutHash: string | null;
    createdAt: string;
    updatedAt: string;
    payoutProfile?: { id: number; label: string | null; address: string };
    cryptoTransaction?: { transactionId: string; currency: string; blockchain: string };
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

### 4.10 Swap detail

#### `GET /swaps/:id`
Returns full order details including:
- payout profile
- linked receive tx (if source is `received_asset`)
- linked master-wallet tx (if source is `master_wallet`)
- linked disbursement row (if created)

---

### 4.11 Manual refresh

#### `POST /swaps/:id/refresh`
Pulls latest status from ChangeNOW `by-id`.

Use for:
- “Refresh now” button in detail
- recovering stale status in UI

---

### 4.12 Partner exchanges list (reconciliation)

#### `GET /partner-exchanges`
Query options:
- `limit`, `offset`
- `sortDirection` (`ASC`/`DESC`)
- `sortField` (`createdAt`/`updatedAt`)
- `dateField` (`createdAt`/`updatedAt`)
- `dateFrom`, `dateTo` (ISO)
- `requestId`, `userId`, `payoutAddress`, `statuses`

Returns raw partner-level listing from ChangeNOW.

Use this for admin/reconciliation screen, not as primary order source for product UX.

---

## 5) Status model for frontend

Local `ChangeNowSwapOrder.status`:
- `awaiting_payin`
- `payin_broadcast`
- `exchanging`
- `completed`
- `failed`
- `refunded`

Remote `changenowStatus` examples:
- in-progress: `waiting`, `new`, `confirming`, `exchanging`, `sending`, `verifying`
- terminal: `finished`, `failed`, `refunded`

Suggested UI mapping:
- `awaiting_payin`/`payin_broadcast`/`exchanging` -> badge `Processing`
- `completed` -> badge `Completed`
- `failed`/`refunded` -> badge `Problem`

---

## 6) Where to integrate in admin frontend

Recommended placement:

1. **Transaction Tracking details panel**
   - Add “Swap via ChangeNOW” button next to “Send to vendor”.
   - Pre-fill:
     - `sourceType=received_asset`
     - `receiveTransactionId=transactionId`
     - `amountFrom=details.amount` (or editable if product allows partial)
   - Fetch:
     - `/map-internal` to determine `fromTicker`
     - `/payout-addresses` for destination select
     - `/quote` and optional `/network-fee`

2. **New admin page: `Operations -> ChangeNOW Swaps`**
   - List (`GET /swaps`) with filters, pagination.
   - Click row -> detail (`GET /swaps/:id`).
   - “Refresh” action -> `POST /swaps/:id/refresh`.
   - Secondary tab for partner reconciliation: `GET /partner-exchanges`.

3. **Settings page: `Admin -> Swap payout wallets`**
   - CRUD payout addresses.
   - set default.

4. **Settings page: `Admin -> Ticker mapping`**
   - show `/map-internal`.
   - allow override via `PUT /ticker-mappings/:walletCurrencyId`.

---

## 7) UX flow (received asset swap)

1. User opens receive details.
2. Clicks “Swap via ChangeNOW”.
3. UI loads:
   - `GET /map-internal`
   - `GET /payout-addresses`
   - optional `GET /available-pairs` (for to-asset selector)
4. User picks target asset + payout address.
5. UI calls `GET /quote`.
6. Optional `GET /network-fee` to show fee block.
7. User confirms; UI calls `POST /swaps`.
8. Redirect to swap detail and poll locally or use refresh endpoint.

---

## 8) UX flow (master wallet swap)

1. Open “New master swap” modal/page.
2. Select:
   - master chain (`ethereum`/`bsc`/`polygon`)
   - internal asset (`walletCurrencyId`)
   - `fromTicker` (resolved from map)
   - target ticker (`toTicker`)
   - amount + payout address
3. Quote, then submit `POST /swaps`.
4. Track on swaps list/detail.

---

## 9) Error handling rules for frontend

- Show `message` from backend directly.
- Common conflict cases (`409`):
  - open swap already exists for receive
  - source funds already disbursed
- Validation (`400`):
  - missing required fields
  - ticker mismatch with internal mapping
  - amount below minimum
- Infrastructure (`500`):
  - ChangeNOW upstream errors
  - chain send failures

For create-swap failure after exchange creation attempt, backend marks local order as `failed` if order row already exists.

---

## 10) TypeScript contracts (frontend)

```ts
export type ApiSuccess<T> = {
  status: 'success';
  message: string;
  data: T;
};

export type SwapStatus =
  | 'awaiting_payin'
  | 'payin_broadcast'
  | 'exchanging'
  | 'completed'
  | 'failed'
  | 'refunded';

export interface AdminPayoutAddress {
  id: number;
  adminUserId: number;
  label: string | null;
  address: string;
  extraId: string | null;
  toNetworkHint: string | null;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SwapOrder {
  id: number;
  sourceType: 'received_asset' | 'master_wallet';
  status: SwapStatus;
  changenowStatus: string | null;
  fromTicker: string;
  toTicker: string;
  amountFrom: string;
  expectedAmountTo: string | null;
  amountReceive: string | null;
  payinAddress: string;
  payinExtraId: string | null;
  payoutAddress: string;
  payoutExtraId: string | null;
  outboundTxHash: string | null;
  payinHash: string | null;
  payoutHash: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 11) Notes for frontend Cursor agent

- Always resolve `fromTicker` from `/map-internal` for selected source asset. Do not hardcode.
- For token assets with multiple networks, prefer:
  1) `/available-pairs` (if enabled)
  2) `quote.fromNetwork` + `quote.toNetwork`
  3) `payoutAddress.toNetworkHint` as fallback
- Keep swap tracking UI driven by local `/swaps` endpoints. Use `/partner-exchanges` as reconciliation tool.
- Provide explorer links for `outboundTxHash`, `payinHash`, `payoutHash` when chain is known.

---

Keep this doc aligned with:
- `src/routes/admin/changenow.router.ts`
- `src/controllers/admin/changenow.admin.controller.ts`
- `src/services/changenow/changenow.admin.service.ts`
- `src/services/changenow/changenow.client.ts`
