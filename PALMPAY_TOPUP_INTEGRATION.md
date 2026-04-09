# PalmPay wallet top-up (virtual account) — integration guide

This document describes how Terescrow integrates PalmPay for NGN wallet deposits via **bank transfer / virtual account**, and how to reproduce the same flow in another application (direct PalmPay API or via this backend).

---

## 1. Integration options

| Approach | When to use |
|----------|-------------|
| **Call PalmPay directly** | New service, Postman tests, or a separate backend that owns credentials. |
| **Call Terescrow API** | Mobile/web clients that already authenticate to this backend; credentials stay server-side. |

---

## 2. Environment variables

| Variable | Purpose |
|----------|---------|
| `PALMPAY_APP_ID` | Sent as `Authorization: Bearer <value>` on PalmPay requests. |
| `PALMPAY_PRIVATE_KEY` | RSA private key (PEM or Base64) used to **sign** API request bodies. |
| `PALMPAY_PUBLIC_KEY` | PalmPay public key — used to **verify** webhook `sign`. |
| `PALMPAY_COUNTRY_CODE` | HTTP header `CountryCode` (default `NG`). |
| `PALMPAY_VERSION` | API version string (default `V2`). |
| `PALMPAY_WEBHOOK_URL` | Full HTTPS URL PalmPay POSTs to (e.g. `https://your-domain.com/api/v2/webhooks/palmpay`). |

**Production base URL (as configured in this repo):**  
`https://open-gw-prod.palmpay-inc.com`

**Sandbox (commented in code, confirm with PalmPay):**  
`https://open-gw-daily.palmpay-inc.com`

Implementation reference: `src/services/palmpay/palmpay.config.ts`

---

## 3. Create order (virtual account / bank transfer)

**PalmPay endpoint:**  
`POST {baseUrl}/api/v2/payment/merchant/createorder`

**Content-Type:** `application/json`

### 3.1 Required HTTP headers

| Header | Value |
|--------|--------|
| `Accept` | `application/json, text/plain, */*` |
| `Content-Type` | `application/json` |
| `CountryCode` | e.g. `NG` |
| `Authorization` | `Bearer <PALMPAY_APP_ID>` |
| `Signature` | Base64 RSA-SHA1 signature of the body (see §3.3) |

Implementation reference: `src/services/palmpay/palmpay.auth.service.ts` (`getRequestHeaders`)

### 3.2 JSON body fields

Add **`requestTime`**, **`version`**, and **`nonceStr`** before signing. Any key with `null`, `undefined`, or empty string is **excluded** from the signature string.

| Field | Required | Notes |
|-------|----------|--------|
| `requestTime` | Yes | Milliseconds since epoch (`Date.now()`). |
| `version` | Yes | e.g. `V2`. |
| `nonceStr` | Yes | Random string (this codebase uses 32 hex characters). |
| `orderId` | Yes | Unique merchant order ID, **max 32 characters**. |
| `amount` | Yes | Integer in **minor units (kobo/cents)**. `10000` = ₦100.00. |
| `currency` | Yes | e.g. `NGN`. |
| `notifyUrl` | Yes | Server webhook URL (HTTPS). |
| `callBackUrl` | Yes | User browser redirect after payment. |
| `productType` | For VA flow | `bank_transfer`. |
| `goodsDetails` | For VA flow | JSON **string**: `[{"goodsId":"-1"}]` — triggers virtual account for many merchants. |
| `title`, `description`, `remark` | Optional | Strings. |
| `userId`, `userMobileNo` | Optional | Shown on cashier; formats per PalmPay docs. |
| `orderExpireTime` | Optional | Expiry in seconds (typical ranges per PalmPay docs). |

Types reference: `src/types/palmpay.types.ts` (`PalmPayCreateOrderRequest`, `PalmPayCreateOrderResponse`)

### 3.3 Outbound signature algorithm

1. Take all body keys whose values are not `null`, `undefined`, or `''`.
2. Sort keys in **ASCII** order.
3. Build `key1=value1&key2=value2&...` with each value **trimmed** as a string.
4. **MD5** that string → hexadecimal → **uppercase** → call this `md5Str`.
5. **RSA-SHA1 sign** `md5Str` with the merchant **private key** → **base64** → HTTP header `Signature`.

Implementation: `src/services/palmpay/palmpay.auth.service.ts` → `generateSignature`

### 3.4 Example request body (₦100.00 = 10000 kobo)

```json
{
  "requestTime": 1775580120000,
  "version": "V2",
  "nonceStr": "9f3b7a1cd4e2400a91b7f6fcd2e8a321",
  "orderId": "deposit_test_1775189999",
  "title": "Wallet Top-up",
  "description": "Deposit to NGN wallet",
  "amount": 10000,
  "currency": "NGN",
  "notifyUrl": "https://your-backend.com/api/v2/webhooks/palmpay",
  "callBackUrl": "https://your-app.com/deposit/success",
  "productType": "bank_transfer",
  "goodsDetails": "[{\"goodsId\":\"-1\"}]",
  "userId": "14",
  "userMobileNo": "2348012345678",
  "remark": "Topup test"
}
```

Service that performs the HTTP call: `src/services/palmpay/palmpay.checkout.service.ts` → `createOrder`

---

## 4. Create-order response (PalmPay)

Wrapper:

```json
{
  "respCode": "00000000",
  "respMsg": "success",
  "data": { }
}
```

- **`respCode === "00000000"`** means success.
- **`data`** contains order and payment details.

Typical `data` fields for bank transfer / virtual account:

| Field | Meaning |
|-------|---------|
| `orderNo` | PalmPay platform order number — **store this**. |
| `orderStatus` | See §7 (`1` pending, `2` success, …). |
| `orderAmount` | Amount in **cents/kobo**. |
| `currency` | e.g. `NGN`. |
| `payMethod` | e.g. `bank_transfer`. |
| `payerVirtualAccNo` | Virtual account number for the payer to transfer to. |
| `payerBankName` | Bank name. |
| `payerAccountName` | Display name on the account. |
| `payerAccountId` | PalmPay account / VA id. |
| `payerAccountType` | Often `-1` for this flow. |
| `checkoutUrl` | H5 checkout URL (optional UX path). |
| `payToken`, `sdkSessionId`, `sdkSignKey` | Checkout / SDK helpers. |

---

## 5. Query order status

**PalmPay endpoint:**  
`POST {baseUrl}/api/v2/payment/merchant/order/queryStatus`

Same headers and signature pattern as create order.

**Body** (after adding `requestTime`, `version`, `nonceStr`):

- Provide **`orderId`** (merchant) and/or **`orderNo`** (PalmPay) — at least one required.

Implementation: `src/services/palmpay/palmpay.checkout.service.ts` → `queryOrderStatus`

Typical `data` fields: `orderId`, `orderNo`, `amount` (cents), `currency`, `orderStatus`, `payMethod`, `productType`, `createdTime`, `completedTime`, optional VA fields, `errorMsg`, etc.

---

## 6. Webhook (`notifyUrl`)

PalmPay sends payment results to **`notifyUrl`** via **POST**.

### 6.1 Expected JSON fields (deposit / pay-in)

| Field | Notes |
|-------|--------|
| `orderId` | Merchant order id (same as create request). |
| `orderNo` | PalmPay order number. |
| `appId` | Merchant app id. |
| `currency` | e.g. `NGN`. |
| `amount` | **Cents/kobo** (same unit as API). |
| `orderStatus` | Integer; see §7. |
| `completeTime` | Completion time in ms (this backend also accepts `completedTime`). |
| `sign` | Request signature (often URL-encoded). |
| `payMethod` | Optional. |
| `payer` | Optional; may be limited to whitelisted merchants. |

Types reference: `src/types/palmpay.types.ts` → `PalmPayDepositWebhook`

Handler reference: `src/controllers/webhooks/palmpay.webhook.controller.ts`

### 6.2 Inbound signature verification

1. Exclude `sign` from the payload used for verification.
2. Same canonical string as outbound: non-empty keys, sorted, `key=value&...`, MD5 → uppercase.
3. **RSA-SHA1 verify** with PalmPay’s **public** key; decode `sign` (e.g. URL decode) before verify.

Implementation: `src/services/palmpay/palmpay.auth.service.ts` → `verifyWebhookSignature`

> Production systems should verify `sign` when `PALMPAY_PUBLIC_KEY` is set. The webhook controller may skip strict verification depending on deployment choices.

### 6.3 Response PalmPay expects

**HTTP 200** with body **exactly** the plain text (not JSON):

```text
success
```

This prevents repeated retries. This codebase uses `res.status(200).send("success")`.

### 6.4 Idempotency

Webhooks can duplicate. Implementation should:

- Identify the payment by **`orderId`** / **`orderNo`** (and internal ids).
- On success (`orderStatus === 2`), credit **once**; if already processed, still return `success`.

This backend converts webhook `amount` from cents: `amount / 100` for NGN when crediting.

---

## 7. Order status codes

| Value | Meaning |
|-------|---------|
| `1` | Pending |
| `2` | Success (paid) |
| `3` | Failed |
| `4` | Cancelled |

Enum reference: `src/types/palmpay.types.ts` → `PalmPayOrderStatus`

---

## 8. Terescrow HTTP API (clients calling this backend)

Routes are mounted in `src/index.ts`.

| Purpose | Method | Path | Auth |
|---------|--------|------|------|
| Initiate top-up | `POST` | `/api/v2/payments/palmpay/deposit/initiate` | Customer Bearer |
| Check status | `GET` | `/api/v2/payments/palmpay/deposit/:transactionId` | Customer Bearer |
| User callback page | `GET` | `/api/v2/payments/palmpay/deposit/success` | Public |
| PalmPay server webhook | `POST` | `/api/v2/webhooks/palmpay` | Public |

### 8.1 `POST /api/v2/payments/palmpay/deposit/initiate`

**Body:**

```json
{
  "amount": 2500.5,
  "currency": "NGN"
}
```

- **`amount`**: decimal NGN (not cents). Minimum enforced in code: **₦100** (10,000 kobo).

**Success payload (conceptual):** `transactionId`, `merchantOrderId`, `orderNo`, `amount`, `currency`, `status`, `virtualAccount` (bank name, account number, etc.), `checkoutUrl`.

Implementation: `src/controllers/customer/palmpay.deposit.controller.ts` → `initiateDepositController`

---

## 9. Checklist for a new application

1. Persist **merchant `orderId`** and PalmPay **`orderNo`** on create.
2. Use **cents** for PalmPay API and webhook `amount`; use **decimal NGN** only if you mirror `/deposit/initiate`.
3. Sign **create** and **query** requests; verify webhook **`sign`** in production.
4. Webhook: respond **200** with plain text **`success`**; handle **`orderStatus === 2`** idempotently.
5. Use **queryStatus** as a backup if webhooks are delayed.
6. Confirm URLs, field limits, and `notifyUrl` registration with PalmPay’s current merchant documentation / portal.

---

## 10. Related source files

| Area | Path |
|------|------|
| Checkout (create + query) | `src/services/palmpay/palmpay.checkout.service.ts` |
| Auth / signatures | `src/services/palmpay/palmpay.auth.service.ts` |
| Config / env | `src/services/palmpay/palmpay.config.ts` |
| Types | `src/types/palmpay.types.ts` |
| Customer deposit | `src/controllers/customer/palmpay.deposit.controller.ts` |
| Webhook | `src/controllers/webhooks/palmpay.webhook.controller.ts` |
| Deposit routes | `src/routes/cutomer/palmpay.deposit.router.ts` |
| Webhook routes | `src/routes/webhooks/palmpay.webhook.router.ts` |
