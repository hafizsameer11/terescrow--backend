# Busha + PalmPay Integration Guide (Terescrow)

Detailed documentation of how Terescrow integrates **Busha** (crypto ramp) with **PalmPay** (NGN rails) and **app KYC**. Use this to rebuild the same system on another app.

Official Busha docs: https://docs.busha.io · https://docs.busha.co

---

## Table of contents

1. [Product model & money custody](#1-product-model--money-custody)
2. [Environment & auth](#2-environment--auth)
3. [Database models](#3-database-models)
4. [KYC (app once → Busha sync)](#4-kyc-app-once--busha-sync)
5. [Buy flow (NGN → crypto) — PalmPay + Busha](#5-buy-flow-ngn--crypto--palmpay--busha)
6. [Sell flow (crypto → NGN) — PalmPay + Busha](#6-sell-flow-crypto--ngn--palmpay--busha)
7. [Receive crypto](#7-receive-crypto)
8. [Send crypto](#8-send-crypto)
9. [Settlement & refunds](#9-settlement--refunds)
10. [Webhooks](#10-webhooks)
11. [Pollers & queue](#11-pollers--queue)
12. [App APIs & mobile gate](#12-app-apis--mobile-gate)
13. [Error handling](#13-error-handling)
14. [Status machines](#14-status-machines)
15. [Code map](#15-code-map)
16. [Rebuild checklist](#16-rebuild-checklist)

---

## 1. Product model & money custody

### 1.1 Who holds what

| Asset | Where it lives | Notes |
|-------|----------------|-------|
| User crypto (USDT, BTC, …) | **Busha** balance on per-user profile `CUS_...` | App reads via Busha `balances` API |
| User NGN | **Terescrow fiat wallet** (`FiatWallet`) | Debited on buy; credited on sell settle |
| Platform NGN float | PalmPay merchant + optional dashboard bank | Used to pay Busha temp accounts on buy; receives Busha sell payouts |

### 1.2 Per-user Busha customer (required)

- Each app user gets one `BushaCustomer` row linked to `userId`.
- All quotes/transfers use header `X-BU-PROFILE-ID: {bushaProfileId}`.
- Busha customer must be **`active`** (KYC passed) before buy/sell/receive/send.
- **Busha KYC cannot be skipped** — only reused from your stored KYC.

### 1.3 Feature flag

`BushaConfig.isActive` + `BUSHA_API_KEY` configured:

- `true` → app crypto screens prefer Busha for supported currencies  
- `false` → fall back to legacy (Tatum / etc.)

### 1.4 Sell payout modes (admin)

| Mode | Meaning |
|------|---------|
| `palmpay_temp` | For each sell: create PalmPay **temp virtual account**, register it as Busha bank recipient on the **user’s** profile; Busha pays NGN there. Then credit user Terescrow NGN. |
| `dashboard_bank` | Create/sync configured admin bank as recipient on the **user’s** Busha profile; Busha pays that bank. Then credit user Terescrow NGN. |

In both cases the **end user** sees NGN appear in their Terescrow wallet when Busha completes — platform bank/PalmPay is settlement plumbing.

---

## 2. Environment & auth

```env
# Busha
BUSHA_API_KEY=...
BUSHA_ENVIRONMENT=sandbox|production
BUSHA_BASE_URL=                      # optional override
BUSHA_WEBHOOK_SECRET=...             # HMAC of raw body
BUSHA_SETTLEMENT_POLL_MS=30000
BUSHA_KYC_POLL_MS=20000

# PalmPay (already used for deposits/payouts)
PALMPAY_MERCHANT_ID=...
PALMPAY_APP_ID=...
PALMPAY_...                          # existing PalmPay signing / webhook URL
```

| Busha env | Base URL |
|-----------|----------|
| Sandbox | `https://api.sandbox.busha.so` |
| Production | `https://api.busha.so` |

**Every Busha customer-scoped request:**

```
Authorization: Bearer {BUSHA_API_KEY}
X-BU-PROFILE-ID: CUS_xxx
Content-Type: application/json
```

Birth date format Busha expects: **`DD-MM-YYYY`**.  
KYC images: **base64**, typically **&lt; 4MB**.

---

## 3. Database models

### 3.1 `BushaConfig` (singleton `id = 1`)

- `sellPayoutMode`: `palmpay_temp` | `dashboard_bank`
- `isActive`: feature flag
- `payoutBankCode`, `payoutAccountNumber`, `payoutAccountName`, `payoutRecipientId` (for dashboard mode)

### 3.2 `BushaCustomer`

- `bushaProfileId` (`CUS_...`) unique  
- `userId` unique (app user)  
- `email`, `firstName`, `lastName`, `phone`, `countryId`  
- `birthDate`, `nin`  
- `status`: `inactive` | `in_review` | `active` | `rejected`  
- `providerData` JSON  

### 3.3 `BushaKycApplication`

Queue row for pushing app KYC → Busha:

- Identity fields + `selfiePath` / `idDocumentPath` (disk paths under `uploads/`)  
- `source`: `terescrow_kyc` | `manual`  
- `terescrowKycId` (link to `KycStateTwo`)  
- `status`: `pending` | `processing` | `submitted` | `in_review` | `active` | `failed` | `rejected`  
- `attempts`, `errorMessage`  

### 3.4 `BushaTradeLog`

One row per buy/sell/receive/send:

- `side`: `buy` | `sell` | `cryptoRecv` | `cryptoSend`  
- amounts, currencies, `bushaQuoteId`, `bushaTransferId`, `bushaStatus`  
- Buy pay-in bank fields: `payInBankCode/Name/AccountNumber/AccountName`, `payInExpiresAt`  
- Receive: `cryptoDepositAddress`, `cryptoDepositNetwork`  
- PalmPay: `palmpayOrderId`, `palmpayOrderNo`, `palmpayStatus`  
- `payoutMode`, `fiatTransactionId`, `userId`  
- `status` (app orchestration — see §14)  
- `providerResponse` JSON (quote, transfer, payout, prepare meta)  

### 3.5 App KYC source (`KycStateTwo` + user flags)

Tier 2 stores: legal name (`firtName`/`surName`), `dob`, `nin`, `bvn`, `selfieUrl`, `idDocumentUrl`, `state` (`pending`/`approved`/`rejected`).  
User flag `kycTier2Verified = true` when admin (or auto) approves.

---

## 4. KYC (app once → Busha sync)

### 4.1 Rule

User completes **Terescrow Tier 2 once**. Crypto activation **reuses** that data — no second form for Busha.

Busha still requires create → upload identifying_information → `POST /verify` → webhook `active`.

### 4.2 App endpoints

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| GET | `/api/v2/busha/status` | — | Platform + KYC gate flags |
| GET | `/api/v2/busha/kyc/status` | — | Detailed status |
| POST | `/api/v2/busha/kyc/start` | `{}` | **Primary:** load Tier 2 from DB → queue Busha sync |
| POST | `/api/v2/busha/kyc/start` | name, DOB, NIN, selfieBase64 | Legacy manual path |
| POST | `/api/v2/busha/kyc/submit` | docs | Admin/legacy |
| POST | `/api/v2/busha/kyc/verify` | optional docs | Admin/legacy |

### 4.3 Worker (`processBushaKycApplication`)

1. Mark application `processing`.  
2. Read selfie (+ optional ID) from disk → base64.  
3. If no `BushaCustomer`: `POST /v1/customers` (email, names, phone, `country_id: NG`, `birth_date`).  
4. `PUT /v1/customers/{CUS}` with address + `identifying_information`:

```json
[
  { "type": "national-id", "number": "<NIN>", "country": "NG", "image_front": "<optional>" },
  { "type": "selfie", "image_front": "<base64>", "number": "", "country": "NG" }
]
```

5. `POST /v1/customers/{CUS}/verify`  
6. Local status → `submitted` / `in_review` / `active`  
7. Webhooks `customer.verification.*` finalize `active` / `rejected`

### 4.4 Mobile gate

Any crypto entry (`selectasset`, buy/sell/receive/send):

1. `GET /v2/busha/status`  
2. If `isActive && needsKyc && !canTrade` → `/bushakyc`  
3. Screen:  
   - needs Tier 2 → `/updatekyclevel`  
   - Tier 2 ready → **Activate crypto wallet** → `POST /kyc/start` `{}`  
   - waiting → poll until `canTrade`  

Trading APIs also call `assertCustomerTradeReady` → require Busha `status === active`.

---

## 5. Buy flow (NGN → crypto) — PalmPay + Busha

### 5.1 What the user experiences

1. User has NGN in Terescrow wallet.  
2. Chooses crypto (e.g. USDT) and NGN amount.  
3. App calls Busha buy.  
4. Crypto appears on **their Busha balance** when Busha finishes.  
5. NGN is already gone from Terescrow wallet (debited up front).

User never sees Busha temp bank details — **PalmPay pays Busha for them**.

### 5.2 Money movement (buy)

```
┌─────────────────┐  debit NGN   ┌──────────────────┐
│ User Terescrow  │ ───────────▶ │ FiatTransaction  │
│ NGN wallet      │              │ type CRYPTO_BUY  │
└─────────────────┘              └──────────────────┘
                                          │
         ┌────────────────────────────────┘
         ▼
┌─────────────────┐  create quote+transfer   ┌─────────────────┐
│ Your backend    │ ───────────────────────▶ │ Busha (CUS_user)│
│                 │ ◀── temp NGN bank acct ──│ pay_in TBA      │
└────────┬────────┘                          │ pay_out balance │
         │                                   └────────▲────────┘
         │ PalmPay payout to Busha bank details        │
         ▼                                             │
┌─────────────────┐  bank transfer NGN ──────────────────┘
│ PalmPay merchant│
│ (platform float)│
└─────────────────┘

When Busha marks transfer complete / funds_converted:
  → crypto credited to CUS_user Busha balance
  → mark fiat txn completed (NGN already taken)
If Busha/PalmPay fails:
  → CRYPTO_BUY_REFUND credit back to user NGN wallet
```

### 5.3 API

```
POST /api/v2/busha/buy/preview
Body: { "sourceAmount": "5000", "targetCurrency": "USDT" }

POST /api/v2/busha/buy
Body: { "sourceAmount": "5000", "targetCurrency": "USDT" }
```

Requires: Busha active feature + customer `active` + sufficient NGN balance.

### 5.4 Step-by-step (app buy) — `executeAppBushaBuy`

| Step | Actor | Action |
|------|-------|--------|
| 1 | Backend | `assertBushaAppActive`, `ensureBushaCustomerForUser`, `assertCustomerTradeReady` |
| 2 | Backend | Validate `sourceAmount` > 0 |
| 3 | Backend | Load NGN `FiatWallet`; reject if `balance < amount` |
| 4 | Backend | Create `FiatTransaction` `{ type: CRYPTO_BUY, status: pending, amount }` |
| 5 | Backend | **`debitWallet`** immediately (NGN leaves user) |
| 6 | Backend | Call core `executeBushaBuy({ ..., autoPalmpayPayout: true })` |
| 7 | Backend | Attach `userId`, `fiatTransactionId`; status `settling` (or `palmpay_failed`) |
| 8 | Backend | If PalmPay failed → **refund** user; else try `settleBushaTradeIfNeeded` |
| 9 | Backend | On any throw after debit → **`reverseBuyDebit`** (refund) |

### 5.5 Step-by-step (core buy) — `executeBushaBuy`

#### A. Busha quote + transfer (temporary bank account)

```http
POST /v1/quotes
X-BU-PROFILE-ID: CUS_xxx

{
  "source_currency": "NGN",
  "target_currency": "USDT",
  "source_amount": "5000",
  "pay_in": { "type": "temporary_bank_account" },
  "pay_out": { "type": "balance" }
}
```

Then:

```http
POST /v1/transfers
X-BU-PROFILE-ID: CUS_xxx
{ "quote_id": "QUO_..." }
```

Busha response `transfer.pay_in.recipient_details` contains:

- `bank_code`, `bank_name`  
- `account_number`, `account_name`  
- expiry on `pay_in.expires_at`  

Persist trade:

- `side: buy`  
- `bushaQuoteId`, `bushaTransferId`, `bushaStatus`  
- pay-in bank fields  
- `status: awaiting_palmpay` (when auto PalmPay on)  

#### B. PalmPay pays that Busha account

1. Map Busha bank → PalmPay bank code (`resolvePalmpayBankCode`).  
2. Build PalmPay order id: `busha_buy_{uuid}` (max 32 chars).  
3. Amount in **kobo**: `Math.round(amountNgn * 100)`.  
4. Call PalmPay **payout**:

```
payeeName     = Busha recipient account_name
payeeBankCode = mapped PalmPay bank code
payeeBankAccNo= Busha temp account_number
amount        = kobo
notifyUrl     = PalmPay webhook URL
remark        = Busha transfer id + currency
```

5. Map PalmPay `orderStatus`:  
   - `2` → completed  
   - `3` → failed  
   - else pending  

6. Update trade:  
   - success path → `status: awaiting_busha`, store `palmpayOrderId` / `orderNo`  
   - fail → `status: palmpay_failed` → app refunds user  

#### C. Wait for Busha

PalmPay funding the temp account triggers Busha transfer progression (`funds_received` → `funds_converted` / `completed`).

Handled by:

- Busha webhooks (`transfer.*`) → `settleBushaTradeIfNeeded`  
- Settlement poller every ~30s  

On success for buy:

- Mark trade `completed`  
- Mark linked `FiatTransaction` `completed`  
- Crypto is on Busha balance (no Terescrow crypto ledger credit needed)

On Busha failure after debit:

- `reverseBuyIfNeeded` → create `CRYPTO_BUY_REFUND`, credit NGN, mark original failed, trade `buy_reversed`

### 5.6 Buy sequence diagram

```
User App          Terescrow API         PalmPay            Busha
   |                    |                  |                 |
   |-- POST /buy ------>|                  |                 |
   |                    |-- debit NGN -----|                 |
   |                    |-- create quote -------------------->|
   |                    |<-- QUO + rates ---------------------|
   |                    |-- create transfer ----------------->|
   |                    |<-- TRF + temp bank details ---------|
   |                    |-- payout to temp bank ------------->|
   |                    |                  |-- NGN transfer ->|
   |                    |                  |                 |-- credit crypto to CUS
   |                    |<-- webhook transfer.completed ------|
   |                    |-- mark fiat completed              |
   |<-- trade settling -|                  |                 |
```

### 5.7 Buy failure matrix

| Failure point | User NGN | Trade status | Action |
|---------------|----------|--------------|--------|
| Insufficient balance | unchanged | — | 400 |
| Debit fails | unchanged | fiat failed | 400 |
| Busha quote/transfer error | **refunded** | — | throw + reverse |
| No temp account on transfer | **refunded** | failed | reverse |
| PalmPay payout fails | **refunded** | `palmpay_failed` | reverse |
| Busha later fails/cancels | **refunded** | `busha_failed` / `buy_reversed` | settlement reverse |
| Success | kept debited | `completed` | crypto on Busha |

### 5.8 Admin / lab buy

Same `executeBushaBuy`. If `autoPalmpayPayout: false`, trade stays `quoted` and admin can fund the temp account manually (Electron lab). App always uses `autoPalmpayPayout: true`.

---

## 6. Sell flow (crypto → NGN) — PalmPay + Busha

### 6.1 What the user experiences

1. User sells crypto from **Busha balance** (or optionally address funding).  
2. Busha converts crypto → NGN and pays out to platform bank (PalmPay VA or dashboard bank).  
3. When Busha completes, **Terescrow credits user NGN wallet** (`wallet_credited`).

### 6.2 Money movement (sell, mode `palmpay_temp`)

```
User Busha crypto balance
        │
        ▼  sell quote: pay_in balance, pay_out bank_transfer → PalmPay VA recipient
┌─────────────────┐
│ Busha           │── NGN payout ──▶ PalmPay temp VA (platform)
└─────────────────┘
                                      │
                                      │ (platform receives NGN)
                                      ▼
                              Webhook/poll: transfer complete
                                      │
                                      ▼
                              Credit User Terescrow NGN wallet
                              (FiatTransaction CRYPTO_SELL)
```

Important: PalmPay deposit webhook for `deposit_*` orders is **not** what credits the user for sells. User credit is driven by **Busha transfer completion** + settlement service. PalmPay VA is the destination Busha pays into.

### 6.3 API

```
POST /api/v2/busha/sell/preview
{ "sourceCurrency": "USDT", "sourceAmount": "10", "fundingMethod": "balance", "network": "TRX" }

POST /api/v2/busha/sell
{ "sourceCurrency": "USDT", "sourceAmount": "10", "fundingMethod": "balance" }
```

Requires customer `active` + payout capability.

### 6.4 Step-by-step — `executeAppBushaSell`

#### Mode A — `palmpay_temp` (`prepareBushaSellPalmpayPayout`)

1. Preview Busha sell quote with `payoutToBalance: true` to estimate NGN.  
2. Reject if estimated NGN **&lt; 100** (PalmPay VA minimum).  
3. Create PalmPay **virtual bank account** (checkout create order):  
   - amount ≈ `ceil(targetNgn)`  
   - returns `accountNumber`, `accountName`, `bankName`, `merchantOrderId`, `orderNo`  
4. Map PalmPay bank → Busha bank code (`resolveBushaBankCodeFromPalmpay`).  
5. Create Busha recipient **on the user profile**:

```http
POST /v1/recipients
X-BU-PROFILE-ID: CUS_user

{
  "currency": "NGN",
  "country_code": "NG",
  "type": "ngn_bank",
  "bank_name": "...",
  "bank_code": "...",
  "account_number": "<PalmPay VA>",
  "account_name": "..."
}
```

6. Execute sell with `payoutRecipientId = recipient.id`.

#### Mode B — `dashboard_bank`

1. Ensure admin bank fields configured on `BushaConfig`.  
2. `createDashboardBankRecipientOnProfile(CUS_user)` — recipient lives on **user** profile (not only business).  
3. Sell with that `recipient_id`.

#### Then (both modes)

7. Busha quote:

```json
{
  "source_currency": "USDT",
  "target_currency": "NGN",
  "source_amount": "10",
  "pay_in": { "type": "balance" },
  "pay_out": { "type": "bank_transfer", "recipient_id": "RCP_..." }
}
```

(`fundingMethod: address` uses `pay_in: { type: "address", network }` instead — user deposits exact crypto to generated address.)

8. `POST /v1/transfers` with quote id.  
9. Create pending `FiatTransaction` `CRYPTO_SELL` (estimated NGN, not credited yet).  
10. Trade status `settling` (or `awaiting_crypto_deposit` if address funding).  
11. On Busha complete → `creditSellToUserWallet` using **actual** `target_amount` from Busha.

### 6.5 Sell sequence (`palmpay_temp`)

```
User App       Terescrow API        PalmPay           Busha
  |                 |                  |                |
  |-- POST /sell -->|                  |                |
  |                 |-- create VA ---->|                |
  |                 |<-- VA details ---|                |
  |                 |-- create recipient on CUS -------->|
  |                 |-- quote sell + bank_transfer ----->|
  |                 |-- create transfer ---------------->|
  |                 |                  |<-- NGN payout --|
  |                 |<-- webhook complete ---------------|
  |                 |-- credit user NGN wallet          |
  |<-- settling / wallet_credited                       |
```

---

## 7. Receive crypto

User wants an address to deposit crypto onto their Busha balance.

### Flow

1. `POST /api/v2/busha/receive` `{ currency, amount, network? }`  
2. Quote same currency in/out:

```json
{
  "source_currency": "USDT",
  "target_currency": "USDT",
  "source_amount": "10",
  "pay_in": { "type": "address", "network": "TRX" },
  "pay_out": { "type": "balance" }
}
```

3. Create transfer → `pay_in.address`, `network`, `expires_at`.  
4. Trade `side: cryptoRecv`, status `awaiting_crypto_deposit`.  
5. **UI must show exact amount** — wrong amount can fail/delay.  
6. Webhook/poll when `funds_received` / completed → mark `completed`. Crypto sits on Busha balance.

---

## 8. Send crypto

1. Preview: check Busha available balance vs amount.  
2. `POST /api/v2/busha/send`:

```json
{
  "currency": "USDT",
  "amount": "5",
  "destinationAddress": "T...",
  "destinationNetwork": "TRX",
  "memo": "optional"
}
```

3. Quote: `pay_in: balance`, `pay_out: { type: address, address, network, memo? }`.  
4. Transfer → status `awaiting_busha` → completed when delivered.  
5. Requires customer active + payout enabled on profile when Busha exposes that flag.

---

## 9. Settlement & refunds

Service: `settleBushaTradeIfNeeded(tradeId)`

1. Load trade + customer.  
2. `GET /v1/transfers/{id}` with profile header.  
3. Classify remote status:

**Success set:** `completed`, `funds_converted`, `funds_delivered`  
Also treat `funds_received` as complete for buy / receive where appropriate.

**Fail set:** `failed`, `cancelled`, `funds_not_delivered`, `funds_refunded`

| Side | On success | On fail |
|------|------------|---------|
| **sell** | Credit Terescrow NGN from `target_amount`; status `wallet_credited` | `busha_failed` (no credit) |
| **buy** | Mark fiat txn `completed`; trade `completed` | Refund NGN (`buy_reversed`) |
| **receive/send** | Trade `completed` | `busha_failed` |

Sell credit uses `fiatWalletService.creditWallet` against the pending `CRYPTO_SELL` fiat txn (updates amount to actual Busha `target_amount`).

Idempotency: skip if already `wallet_credited` / appropriately completed.

---

## 10. Webhooks

### 10.1 Busha

```
POST /api/v2/webhooks/busha
```

- Verify HMAC-SHA256(`rawBody`, `BUSHA_WEBHOOK_SECRET`) vs header (`x-busha-signature` / `x-bc-signature` / `x-signature`).  
- Preserve **raw body** for signature (Express `verify` / `rawBody`).

| Events | Handling |
|--------|----------|
| `customer.*`, `customer.verification.*` | Update `BushaCustomer.status`; sync KYC application |
| `transfer.*`, `ramp.transfer.*` | Match `BushaTradeLog.bushaTransferId` → update → settle |
| `deposit.*` | Map to transfer settlement |
| `payment_request.*` | Map completed/failed → settlement |

Respond **200** after handling.

### 10.2 PalmPay

Existing PalmPay webhook (`/api/v2/webhooks/...`) auto-credits **user deposits** only for orders like `deposit_*`.

Busha buy payouts use order ids like `busha_buy_*` — they fund Busha’s temp account; **do not** treat them as user wallet deposits.

Busha sell PalmPay VAs are receive-side for platform; user NGN credit is from Busha settlement, not PalmPay deposit webhook.

---

## 11. Pollers & queue

| Job | Interval | Purpose |
|-----|----------|---------|
| `startBushaKycPoller` | `BUSHA_KYC_POLL_MS` (~20s) | Retry `pending`/`failed` KYC apps |
| `startBushaSettlementPoller` | `BUSHA_SETTLEMENT_POLL_MS` (~30s) | Open trades: `settling`, `awaiting_busha`, `awaiting_crypto_deposit`, `awaiting_palmpay` |
| Bull queue `busha` / `process-kyc` | optional | Same KYC processor; `setImmediate` always runs as fallback |

Started from API process `listen()` callback.

---

## 12. App APIs & mobile gate

Base: **`/api/v2/busha`** (authenticated).

| Method | Path |
|--------|------|
| GET | `/status` |
| GET | `/profile` |
| POST | `/profile/ensure` |
| GET | `/kyc/status` |
| POST | `/kyc/start` |
| GET | `/wallet` |
| POST | `/buy/preview`, `/buy` |
| POST | `/sell/preview`, `/sell` |
| POST | `/receive` |
| POST | `/send/preview`, `/send` |
| GET | `/trades`, `/trades/:id` |
| POST | `/trades/:id/refresh` |

Admin lab: `/api/admin/busha/*`

Mobile:

- `utils/bushaApi.ts`  
- `hooks/useBushaKycGate.ts`  
- `app/bushakyc.tsx`  
- buy/sell/receive/send/selectasset check status / gate  

USDT network mapping helper: Tron→`TRX`, Ethereum→`ETH`, BSC→`BSC`, etc.

---

## 13. Error handling

Busha client must map HTTP status:

| Busha | Your API |
|-------|----------|
| 400 / 422 | 400 badRequest (include Busha message/body) |
| 401 / 403 | 401 |
| 404 | 404 |
| 5xx | 500 |

Never throw bare `Error` from Busha 4xx — controllers turn unknown errors into 500.

---

## 14. Status machines

### 14.1 Busha customer

`inactive` → (submit+verify) → `in_review` → `active`  
↘ `rejected`

### 14.2 Buy trade (app)

```
awaiting_palmpay → awaiting_busha → settling → completed
       ↓                  ↓
 palmpay_failed      busha_failed → buy_reversed (refund)
```

### 14.3 Sell trade (app)

```
(prepare PalmPay VA + recipient)
→ awaiting_busha | awaiting_crypto_deposit → settling → wallet_credited
                                              ↓
                                         busha_failed
```

### 14.4 Receive

`awaiting_crypto_deposit` → `completed` | `busha_failed`

### 14.5 KYC application

`pending` → `processing` → `submitted` / `in_review` → `active`  
↘ `failed` (retry) · `rejected`

---

## 15. Code map

| Concern | File |
|---------|------|
| HTTP client | `src/services/busha/busha.client.ts` |
| Env config | `src/services/busha/busha.config.ts` |
| Shared quote/buy/sell/receive/send | `src/services/admin/busha.admin.service.ts` + re-export `busha.trade.service.ts` |
| App orchestration + wallet debit/credit | `src/services/busha/busha.app.service.ts` |
| KYC sync worker | `src/services/busha/busha.kyc.service.ts` |
| Load Tier 2 for Busha | `src/services/kyc/terescrow.kyc.profile.service.ts` |
| Settlement | `src/services/busha/busha.settlement.service.ts` |
| Bank code mapping | `src/services/busha/busha.bank.mapper.ts` |
| PalmPay VA create | `src/services/palmpay/palmpay.virtual.account.service.ts` |
| PalmPay payout | `src/services/palmpay/palmpay.payout.service.ts` |
| Customer routes | `src/routes/cutomer/busha.router.ts` |
| Busha webhook | `src/controllers/webhooks/busha.webhook.controller.ts` |
| Pollers | `src/jobs/busha/*` |
| Schema | `prisma/schema.prisma` |
| This doc’s sibling guide (shorter) | replaced by this file |

---

## 16. Rebuild checklist

1. [ ] Busha business account + API keys (sandbox → live)  
2. [ ] PalmPay merchant with **payout** + **VA/checkout** enabled  
3. [ ] Env vars (Busha + PalmPay + webhook secrets)  
4. [ ] Tables: Config, Customer, KycApplication, TradeLog  
5. [ ] App KYC storage (name, DOB, NIN, selfie files) + approval flag  
6. [ ] KYC start from stored profile → Busha create/update/verify  
7. [ ] KYC poller + webhook customer events  
8. [ ] **Buy:** debit NGN → Busha TBA quote/transfer → PalmPay payout → settle/refund  
9. [ ] **Sell:** PalmPay VA or dashboard recipient → Busha sell → credit NGN on complete  
10. [ ] Receive / send address flows + exact amount UX  
11. [ ] Webhook `/api/v2/webhooks/busha` registered in Busha dashboard  
12. [ ] Settlement poller backup  
13. [ ] Map Busha 4xx → 400  
14. [ ] Mobile gate until `canTrade`  
15. [ ] Admin toggles: `isActive`, `sellPayoutMode`  

---

## Quick reference: buy vs sell PalmPay roles

| | **Buy** | **Sell (`palmpay_temp`)** |
|--|---------|---------------------------|
| PalmPay role | **Outgoing payout** from merchant to Busha temp bank | **Incoming VA** that Busha pays into |
| Who initiates PalmPay | Backend right after Busha transfer created | Backend before Busha sell (prepare recipient) |
| User NGN | Debited **before** Busha/PalmPay | Credited **after** Busha completes |
| Crypto | Credited on Busha when transfer completes | Debited from Busha balance (or address deposit) |
| Order id prefix | `busha_buy_` | `busha_sell_` (VA merchant order) |

---

*Source of truth: Terescrow backend services under `src/services/busha` and `src/services/palmpay`. Keep this doc updated when flows change.*
