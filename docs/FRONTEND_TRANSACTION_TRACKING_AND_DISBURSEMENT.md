# Frontend guide — transaction tracking & vendor disbursement

This document describes the **admin** APIs the frontend should call for the **on-chain receive** tracking table, **detail** / **timeline**, **vendor directory**, **single** disbursement to a vendor, and **bulk** disbursement.

**Base path (append to your API host):**  
`/api/admin`

**Authentication:** All endpoints require a logged-in user with **admin** role.

- Preferred: `Authorization: Bearer <jwt>`
- Alternative: cookie `token=<jwt>` (same token as other admin calls)

---

## 1. Response envelope

Successful responses:

```json
{
  "status": "success",
  "message": "<string>",
  "data": {}
}
```

Errors (global error handler):

```json
{
  "message": "<string>",
  "data": <optional>
}
```

HTTP status on errors is typically **400**, **401**, **404**, **409**, or **500**.

---

## 2. How `currency` is determined (important)

The tracking list **does not guess** the asset from the numeric amount (e.g. `0.0004` is **not** interpreted as ETH vs USDT).

**What happens:**

1. When a deposit is recorded, `CryptoTransaction.currency` and `blockchain` are set from the **`VirtualAccount`** that received the credit (see `createReceiveTransaction` in `crypto.transaction.service.ts` — it uses `virtualAccount.currency` / `virtualAccount.blockchain`).
2. That virtual account is tied to a **specific product** (e.g. “USDT on Ethereum”). The **amount** on the row is whatever Tatum/webhook reported for that event (ERC-20 transfer amount, etc.).
3. So **`currency` is always “what account we credited,”** not a chain heuristic. If you see `USDT` with a small number like `0.0004`, that means the **stored receive** was recorded under a **USDT** virtual account with that amount — not that the backend inferred “USDT” from the magnitude.

**Display tip:** Use the new **`walletCurrency`** object on each list item (and **`virtualAccount`** on details) to show **symbol**, **name**, and **`isToken`** so the UI can label rows clearly (e.g. ERC-20 vs native).

---

## 3. Endpoints overview

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/transaction-tracking` | Paginated list of RECEIVE transactions |
| `GET` | `/transaction-tracking/:txId/details` | Full detail + disbursements |
| `GET` | `/transaction-tracking/:txId/steps` | Timeline steps |
| `POST` | `/transaction-tracking/:txId/send-to-vendor` | Single disbursement to one vendor |
| `POST` | `/transaction-tracking/bulk-send-to-vendor` | Many disbursements in one request |
| `GET` | `/vendors` | Vendor directory (optional `?currency=` filter) |
| `POST` | `/vendors` | Create vendor |
| `PATCH` | `/vendors/:id` | Update vendor |
| `DELETE` | `/vendors/:id` | Delete vendor |

`:txId` is the **`CryptoTransaction.transactionId`** (e.g. `RECEIVE-1730...`), **not** the numeric database id. **URL-encode** the path segment if the id ever contains special characters.

---

## 4. `GET /transaction-tracking`

**Query parameters**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page index (default effective **1**) |
| `limit` | number | Page size, **1–100**, default **20** |
| `startDate` | ISO date string | Optional lower bound on `createdAt` |
| `endDate` | ISO date string | Optional upper bound (end of that calendar day) |
| `search` | string | Matches `transactionId`, `txHash`, addresses, user name/email |

**`data` shape**

```ts
{
  items: Array<{
    id: number;                    // internal crypto_transactions.id
    transactionId: string;         // use as :txId everywhere
    customerName: string;
    customerEmail: string;
    customerId: number;
    status: string;                // CryptoTxStatus: pending | processing | successful | failed | cancelled
    masterWalletStatus: string;    // received_assets.status or "unknown"
    txHash: string;
    amount: string;
    amountUsd: string;
    amountNaira: string;
    currency: string;
    blockchain: string;
    fromAddress: string;
    toAddress: string;
    confirmations: number;
    blockNumber: string | null;
    date: string;                  // ISO8601
    walletCurrency: {
      symbol: string | null;
      name: string | null;
      isToken: boolean | null;
      tokenType: string | null;
    } | null;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

**`masterWalletStatus` / disposition (typical values)**  
`unknown` · `inWallet` · `transferredToMaster` · `sentToVendor`

---

## 5. `GET /transaction-tracking/:txId/details`

**`data`** (object at root of `data`):

```ts
{
  transactionId: string;
  status: string;
  masterWalletStatus: string;
  currency: string;
  blockchain: string;
  amount: string;               // receive amount (same as list)
  amountUsd: string;
  amountNaira: string;
  fromAddress: string;
  toAddress: string;
  txHash: string;
  blockNumber: string | null;
  confirmations: number;
  customer: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    username: string;
    profilePicture: string | null;
  } | null;
  receivedAsset: {
    id: number;
    accountId: string | null;
    status: string;
    reference: string | null;
    index: number | null;
    transactionDate: string | null;
  } | null;
  virtualAccount: {
    id: number;
    accountId: string;
    currency: string;
    blockchain: string;
    walletCurrency: {
      symbol: string | null;
      name: string | null;
      isToken: boolean | null;
      tokenType: string | null;
    } | null;
  } | null;
  disbursements: Array<{
    id: number;
    disbursementType: string;   // e.g. "vendor"
    status: string;             // pending | successful | failed
    amount: string;             // net to vendor for native fee-deducted chains; full token amount for tokens
    amountUsd: string | null;
    currency: string;
    blockchain: string;
    toAddress: string;
    txHash: string | null;
    vendor: {
      id: number;
      name: string;
      walletAddress: string;
    } | null;
    adminUserId: number;
    networkFee: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

**UI notes**

- **`disbursements`**: ledger for **received-asset** moves (not master-wallet internal ledger).
- After a successful vendor send, **`receivedAsset.status`** often becomes `sentToVendor` and **`masterWalletStatus`** reflects that.

---

## 6. `GET /transaction-tracking/:txId/steps`

**`data`**

```ts
{
  steps: Array<{
    title: string;
    status: string;   // completed | pending | skipped | failed | sometimes raw CryptoTxStatus on credit step
    date: string;     // ISO8601
    details: Record<string, string | number | null>;
  }>;
}
```

Typical step order includes: deposit detected → confirmations → credited → master-wallet step (may be **skipped** if sent to vendor) → vendor disbursement steps when present. Read **`details`** for `note`, `ledger`, `txHash`, etc.

---

## 7. `POST /transaction-tracking/:txId/send-to-vendor`

Sends from the **customer deposit** for that receive to the chosen **vendor** (on-chain). Not the master-wallet “treasury send” product.

**Request**

- **Headers:** `Content-Type: application/json`, plus auth.
- **Body:**

```json
{
  "vendorId": 1,
  "amount": "0.015"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `vendorId` | **Yes** | Integer ≥ 1 |
| `amount` | **No** | If **omitted** or empty, the server uses the **full receive amount** from `CryptoReceive` (recommended for simplicity). If provided, it **must equal** that full receive amount (string decimal). |

**Success `data`**

```ts
{
  disbursementId: number;
  txHash: string;
  amount: string;           // net BTC/ETH/native sent to vendor OR full token amount (see backend semantics)
  amountUsd: string;
  toAddress: string;
  vendorId: number;
  networkFee: string;
  gasFundingTxHash?: string;  // if master topped up gas (e.g. ETH for ERC-20, BNB, TRX)
}
```

**Semantics for `amount` in response**

- **Native assets (BTC, ETH, BNB, MATIC, TRX with fee model):** `amount` is what the **vendor receives** (receive amount **minus** estimated network fee). **`networkFee`** is the fee taken from the deposit.
- **Tokens (e.g. USDT):** `amount` is typically the **full token** amount sent; gas is paid in the native coin (possibly via **`gasFundingTxHash`**).

**Success `message` (example)**  
`Sent from customer deposit to vendor; recorded as received-asset disbursement`

**When to disable “Send to vendor”**

- `receivedAsset.status` is `transferredToMaster` or `sentToVendor`, or
- A successful vendor **`disbursements`** row already exists, or
- Row **`status`** (crypto tx) is not appropriate for payout (product decision).

---

## 8. `POST /transaction-tracking/bulk-send-to-vendor`

Runs **one independent disbursement per item** (separate on-chain transactions per deposit).

**Request body**

```json
{
  "items": [
    { "receiveTransactionId": "RECEIVE-abc", "vendorId": 2 },
    { "receiveTransactionId": "RECEIVE-def", "vendorId": 2 }
  ]
}
```

| Field | Description |
|-------|-------------|
| `items` | **Required.** Array of `{ receiveTransactionId: string, vendorId: number }`. **Max 100** items. |

No `amount` per row — each run uses the **full receive amount** for that `receiveTransactionId`.

**Success `data`**

```ts
{
  results: Array<{
    receiveTransactionId: string;
    success: boolean;
    data?: {
      disbursementId: number;
      txHash: string;
      amount: string;
      amountUsd: string;
      toAddress: string;
      vendorId: number;
      networkFee: string;
      gasFundingTxHash?: string;
    };
    error?: string;
    statusCode?: number;
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
```

**Success `message` (example)**  
`Bulk disbursement finished: 8/10 succeeded`

**UI:** Show per-row success/failure; failed rows do **not** roll back successful ones.

---

## 9. Vendors — `GET /api/admin/vendors`

Optional query: `?currency=USDT` (filters by vendor `currency` field).

**`data`:** array of:

```ts
{
  id: number;
  name: string;
  network: string;
  currency: string;
  walletAddress: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Filtering for the send modal**

- Match **`currency`** / network to the receive row (e.g. USDT on Ethereum vs `USDT_BSC` — backend normalizes; when in doubt, filter vendors whose `currency` matches the **base ticker** you show in the UI).
- **EVM** addresses: `0x` + 40 hex (42 chars).
- **Tron:** addresses start with `T` (base58).
- **Bitcoin:** legacy `1`/`3` or bech32 `bc1...`.

---

## 10. Suggested UI flows

### Single disbursement

1. List: `GET /transaction-tracking` → user selects row → `transactionId`.
2. Detail: `GET /transaction-tracking/:txId/details` and `.../steps`.
3. Load vendors: `GET /vendors?currency=<optional>`.
4. Submit: `POST /transaction-tracking/:txId/send-to-vendor` with `{ vendorId }` only (omit `amount`) **or** pass `amount` equal to `details.amount`.
5. Refresh details + steps; show `txHash` (link to block explorer per chain in your app).

### Bulk disbursement

1. User selects **multiple** rows (each has its own `transactionId`).
2. Map each row to a `vendorId` (same or different).
3. `POST /transaction-tracking/bulk-send-to-vendor` with `{ items: [...] }`.
4. Render **`results`** with success/error per `receiveTransactionId`; show **`summary`**.

### Error handling

- Show `message` from error JSON.
- For bulk, use each result’s **`statusCode`** and **`error`** when `success === false`.

---

## 11. TypeScript types (copy-paste)

```ts
export type ApiSuccess<T> = {
  status: 'success';
  message: string;
  data: T;
  token?: string;
};

export type TrackingListResponse = ApiSuccess<{
  items: TrackingListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}>;

export interface TrackingListItem {
  id: number;
  transactionId: string;
  customerName: string;
  customerEmail: string;
  customerId: number;
  status: string;
  masterWalletStatus: string;
  txHash: string;
  amount: string;
  amountUsd: string;
  amountNaira: string;
  currency: string;
  blockchain: string;
  fromAddress: string;
  toAddress: string;
  confirmations: number;
  blockNumber: string | null;
  date: string;
}

export interface SendToVendorResult {
  disbursementId: number;
  txHash: string;
  amount: string;
  amountUsd: string;
  toAddress: string;
  vendorId: number;
  networkFee: string;
  gasFundingTxHash?: string;
}

export interface BulkSendToVendorResponse {
  results: Array<{
    receiveTransactionId: string;
    success: boolean;
    data?: SendToVendorResult;
    error?: string;
    statusCode?: number;
  }>;
  summary: { total: number; succeeded: number; failed: number };
}
```

---

*Keep in sync with `src/routes/admin/transaction.tracking.router.ts` and controllers.*
