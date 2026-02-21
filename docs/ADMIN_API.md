# Admin Panel API Documentation

All admin endpoints require authentication (Bearer token or session) and **admin** role unless stated otherwise. Some daily-report endpoints allow **agent** for own check-in/check-out and **admin** for shift settings and report approval.

**Base URL:** `/api/admin`

---

## Response format

Success responses use this envelope. The HTTP status code is in the response **headers** (200, 201, or 204). The **body** is JSON:

```json
{
  "status": "success",
  "message": "string",
  "data": { ... },
  "token": "string"
}
```

- **status:** Always `"success"` for 2xx responses.
- **message:** Human-readable success message.
- **data:** Response payload (object or array). Present for 200/201; may be null for 204.
- **token:** Optional; only when a new token is returned (e.g. login).

For **DELETE** vendors, the server may respond with HTTP **204 No Content** and an empty body.

Error responses use HTTP 4xx/5xx with a body such as:

```json
{
  "status": "error",
  "message": "Error description",
  "data": null
}
```

Common HTTP status codes: `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `500` Internal Server Error.

---

## Auth

- Use the existing admin auth (e.g. login returns JWT). Send `Authorization: Bearer <token>` or cookie.
- All routes under `/api/admin/transactions`, `/api/admin/user-balances`, `/api/admin/vendors`, `/api/admin/daily-report`, `/api/admin/transaction-tracking`, `/api/admin/referrals`, `/api/admin/support`, `/api/admin/customers` use `authenticateUser` + `authenticateAdmin` (admin only).
- Daily report: check-in/check-out allow agent or admin; shift-settings PUT and report approve require admin.

---

## 1. Transaction Menus

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/transactions` | Admin | List transactions with optional type filter |

**Query:** `transactionType` (giftCards \| crypto \| billPayments \| naira), `status`, `startDate`, `endDate`, `search`, `page`, `limit`

**Response (200):** HTTP 200; body:
```json
{
  "status": "success",
  "message": "Transactions retrieved successfully",
  "data": {
    "transactions": [
      {
        "id": "string",
        "transactionType": "giftCards | crypto | billPayments | naira",
        "status": "string",
        "createdAt": "ISO8601",
        "department": { "title": "string", "niche": "string" },
        "category": { "title": "string" },
        "customer": { "id": 0, "name": "string", "email": "string" },
        "amount": "string",
        "amountNaira": "string",
        "amountUsd": "string",
        "currency": "string",
        "metadata": {}
      }
    ],
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  }
}
```

---

## 2. User Balances

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/user-balances` | Admin | Paginated list of users with balance summary |

**Query:** `sort`, `startDate`, `endDate`, `dateRange`, `search`, `page`, `limit`

**Response (200):** HTTP 200; body:
```json
{
  "status": "success",
  "message": "User balances retrieved successfully",
  "data": {
    "rows": [
      {
        "id": 0,
        "name": "string",
        "email": "string",
        "totalBalanceUsd": 0,
        "totalBalanceN": 0,
        "cryptoBalanceUsd": 0,
        "cryptoBalanceN": 0,
        "nairaBalance": 0
      }
    ],
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  }
}
```

---

## 3. Master Wallet

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/master-wallet/balances` | Admin | Per-blockchain wallet balances (existing) |
| GET | `/api/admin/master-wallet/balances/summary` | Admin | Balance summary per wallet id (tercescrow, yellowcard, palmpay) |
| GET | `/api/admin/master-wallet/assets` | Admin | List assets; optional `walletId` |
| GET | `/api/admin/master-wallet/transactions` | Admin | List master wallet transactions; optional `assetSymbol`, `walletId` |
| POST | `/api/admin/master-wallet/send` | Admin | Send from master wallet |
| POST | `/api/admin/master-wallet/swap` | Admin | Swap on master wallet |

**Send body:** `address`, `amountCrypto?`, `amountDollar?`, `network`, `symbol`, `vendorId?`

**Swap body:** `fromSymbol`, `toSymbol`, `fromAmount`, `toAmount`, `receivingWallet?`

**Response (200) – GET balances:** `data.wallets`: array of `{ id, blockchain, address, balance, error?, createdAt, updatedAt }`.

**Response (200) – GET balances/summary:** HTTP 200; body:
```json
{
  "status": "success",
  "message": "Balance summary retrieved",
  "data": {
    "summary": [
      {
        "walletId": "tercescrow | yellowcard | palmpay",
        "label": "string",
        "totalUsd": 0,
        "totalNgn": 0,
        "totalBtc": 0,
        "accountName": "string",
        "accountNumber": "string"
      }
    ]
  }
}
```

**Response (200) – GET assets:** `data.assets`: array of `{ symbol, name, balance, usdValue, address?, blockchain?, tercescrowBalance?, tercescrowUsd? }`.

**Response (200) – GET transactions:** `data.transactions`: array of `{ id, to, status, type, wallet, amount, date, assetSymbol, walletId }`.

**Response (200) – POST send / POST swap:** HTTP 200; body: `{ "status": "success", "message": "Send initiated", "data": { "success": true, "txId": 0 } }`.

---

## 4. Vendors

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/vendors` | Admin | List vendors; optional query `currency` |
| POST | `/api/admin/vendors` | Admin | Create vendor |
| PATCH | `/api/admin/vendors/:id` | Admin | Update vendor |
| DELETE | `/api/admin/vendors/:id` | Admin | Delete vendor |

**Create body:** `name`, `network`, `currency`, `walletAddress`, `notes?`

**Response (200) – GET vendors:** `data`: array of vendor objects.

**Response (201) – POST vendors:** HTTP 201; body:
```json
{
  "status": "success",
  "message": "Vendor created",
  "data": {
    "id": 0,
    "name": "string",
    "network": "string",
    "currency": "string",
    "walletAddress": "string",
    "notes": "string",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

**Response (200) – PATCH vendors:** same vendor object shape as above.

**Response (204) – DELETE vendors:** no body.

---

## 5. Daily Report

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/daily-report/shift-settings` | User | Get shift settings (day/night check-in, check-out, grace period) |
| PUT | `/api/admin/daily-report/shift-settings` | Admin | Update shift settings |
| GET | `/api/admin/daily-report/logs` | User | List attendance logs; query `startDate`, `endDate`, `shift`, `agentId` |
| GET | `/api/admin/daily-report/reports/:reportId` | User | Full report detail by report id |
| GET | `/api/admin/daily-report/summary` | User | Summary; optional query `agentId` |
| GET | `/api/admin/daily-report/charts/avg-work-hours` | User | Chart data; query `days` (default 7) |
| GET | `/api/admin/daily-report/charts/work-hours-per-month` | User | Chart data; query `months` (default 3) |
| POST | `/api/admin/daily-report/check-in` | Agent/Admin | Check in; body `shift` (Day\|Night), `timestamp?` |
| POST | `/api/admin/daily-report/check-out` | Agent/Admin | Check out; body `timestamp?` |
| PATCH | `/api/admin/daily-report/reports/:reportId` | User | Update report; body `status`, `auditorsReport`, `myReport` (admin for status/auditorsReport) |

**Response (200) – GET shift-settings:** HTTP 200; body:
```json
{
  "status": "success",
  "message": "Shift settings retrieved",
  "data": {
    "day": { "checkIn": "09:00", "checkOut": "18:00", "gracePeriod": 15 },
    "night": { "checkIn": "18:00", "checkOut": "02:00", "gracePeriod": 15 }
  }
}
```

**Response (200) – PUT shift-settings:** same shape as GET shift-settings.

**Response (200) – GET logs:** `data.logs`: array of `{ id, employeeId, employeeName, day, shift, date, checkInTime, checkOutTime, status, amountMade, reportPreview, reportId }`.

**Response (200) – GET reports/:reportId:** `data`: `{ id, date, agentName, position, shift, clockInTime, clockOutTime, activeHours, totalChatSessions, avgResponseTimeSec, giftCard, crypto, billPayments, chat, financials, status, myReport, auditorsReport }`.

**Response (200) – GET summary:** `data`: `{ activeHours, activeHoursTrend, amountEarned, department }`.

**Response (200) – GET charts/avg-work-hours:** `data.data`: array of `{ day, hours }`.

**Response (200) – GET charts/work-hours-per-month:** `data.data`: array of `{ month, workHrs, overTimeHrs }`.

**Response (200) – POST check-in / check-out:** `data.log`: attendance log object.

**Response (200) – PATCH reports/:reportId:** updated attendance log object.

---

## 6. Transaction Tracking (Crypto)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/transaction-tracking` | Admin | List crypto transactions; query `txType`, `startDate`, `endDate`, `search`, `page`, `limit` |
| GET | `/api/admin/transaction-tracking/:txId/steps` | Admin | Tracking steps for a transaction |
| GET | `/api/admin/transaction-tracking/:txId/details` | Admin | Transaction details |

**txType:** Send \| Receive \| Buy \| Sell \| Swap

**Response (200) – GET transaction-tracking:** HTTP 200; body:
```json
{
  "status": "success",
  "message": "Transaction tracking list retrieved",
  "data": {
    "items": [
      { "id": "string", "name": "string", "status": "string", "txId": "string", "type": "string", "amount": "string", "date": "ISO8601", "txType": "string" }
    ],
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  }
}
```

**Response (200) – GET :txId/steps:** `data.steps`: array of `{ title, crypto?, network?, route?, action?, date?, fromAddress?, address?, toAddress?, transactionHash?, txHash?, status? }`.

**Response (200) – GET :txId/details:** `data`: `{ amountDollar, amountNaira, serviceType, cryptoType, cryptoChain, cryptoAmount, sendAddress, receiverAddress, transactionHash, transactionId, transactionStatus }`.

---

## 7. Referrals

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/referrals/summary` | Admin | Summary: allUsers, totalReferred, amountPaidOut; optional `startDate`, `endDate` |
| GET | `/api/admin/referrals` | Admin | List referral rows; query `type`, `search`, `startDate`, `endDate`, `page`, `limit` |
| GET | `/api/admin/referrals/by-user/:userId` | Admin | Referrals by referrer user id |
| GET | `/api/admin/referrals/earn-settings` | Admin | Get earn settings (firstTimeDepositBonusPct, commissionReferralTradesPct, commissionDownlineTradesPct) |
| PUT | `/api/admin/referrals/earn-settings` | Admin | Update earn settings (same three fields in body) |

**Response (200) – GET summary:** `data`: `{ allUsers, allUsersTrend?, totalReferred, amountPaidOut }`.

**Response (200) – GET referrals:** `data`: `{ rows: [{ id, name, email, joined, noOfReferrals, downlineReferrals, amountEarned }], total, page, limit, totalPages }`.

**Response (200) – GET by-user/:userId:** `data.referrals`: array of `{ referredName, referredAt, stats: { giftCardBuy, giftCardSell, cryptoTrades, noOfUsersReferred }, earned: { amountEarnedFromTrades, fromGcTrades, fromCryptoTrades, fromDownlines } }`.

**Response (200) – GET earn-settings:** `data`: `{ firstTimeDepositBonusPct, commissionReferralTradesPct, commissionDownlineTradesPct }`.

**Response (200) – PUT earn-settings:** same shape as GET earn-settings.

---

## 8. Support (Chat)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/admin/support/chats` | Admin | List all support chats; query `filter` (All \| Active \| Unread \| Closed), `search`, `page`, `limit` |
| GET | `/api/admin/support/chats/:chatId/messages` | Admin | Messages for a chat; query `before`, `limit` |
| POST | `/api/admin/support/chats/:chatId/messages` | Admin | Send message as agent; body `text`, optional file `image` |
| PATCH | `/api/admin/support/chats/:chatId` | Admin | Update chat; body `status` (e.g. completed), `markRead` (boolean) |

**Response (200) – GET chats:** HTTP 200; body:
```json
{
  "status": "success",
  "message": "Chats retrieved",
  "data": {
    "chats": [
      {
        "id": 0,
        "participantName": "string",
        "participantAvatar": "string",
        "lastMessage": "string",
        "lastMessageSender": "user | agent",
        "lastMessageTime": "ISO8601",
        "unreadCount": 0,
        "status": "pending | processing | completed"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  }
}
```

**Response (200) – GET chats/:chatId/messages:** `data.messages`: array of `{ id, sender: "user"|"agent", text, imageUrl?, time }`.

**Response (201) – POST chats/:chatId/messages:** `data`: `{ id, sender: "agent", text, imageUrl?, time }`.

**Response (200) – PATCH chats/:chatId:** `data`: updated SupportChat object.

---

## 9. Customer Freeze & Ban

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/admin/customers/:customerId/freeze` | Admin | Freeze a feature for customer; body `feature` |
| POST | `/api/admin/customers/:customerId/unfreeze` | Admin | Unfreeze a feature; body `feature` |
| POST | `/api/admin/customers/:customerId/ban` | Admin | Ban customer; body `reason?`, `permanent?` |

**Feature values:** Deposit, Withdrawal, Send/Receive/Swap/Buy/Sell Crypto, Buy/Sell Gift Card

**Response (200) – POST freeze / POST unfreeze:** HTTP 200; body: `{ "status": "success", "message": "Feature frozen", "data": { "frozenFeatures": ["Deposit", "Withdrawal"] } }`.

**Response (200) – POST ban:** HTTP 200; body: `{ "status": "success", "message": "Customer banned", "data": { "status": "banned" } }`.

**Enforcement:** Customer-facing deposit, withdrawal, crypto (buy/sell/send/swap), and gift card purchase endpoints return 403 when the account is banned or the relevant feature is frozen.

---

## Summary Table

| Feature | GET | Mutations |
|---------|-----|-----------|
| Transactions | GET /api/admin/transactions | — |
| User Balances | GET /api/admin/user-balances | — |
| Master Wallet | balances, balances/summary, assets, transactions | POST send, POST swap |
| Vendors | GET /api/admin/vendors | POST, PATCH, DELETE |
| Daily Report | shift-settings, logs, reports/:id, summary, charts | PUT shift-settings, POST check-in/check-out, PATCH reports/:id |
| Transaction Tracking | list, :txId/steps, :txId/details | — |
| Referrals | summary, list, by-user/:userId, earn-settings | PUT earn-settings |
| Support | chats, chats/:id/messages | POST messages, PATCH chats/:id |
| Freeze/Ban | — | POST freeze, unfreeze, ban |
