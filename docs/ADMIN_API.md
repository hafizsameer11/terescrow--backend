# Complete Backend API Contract for Admin Frontend

**Base URL:** `https://backend.tercescrow.site`
**Auth:** Bearer token in `Authorization` header for all endpoints.
**Envelope (new endpoints):** `{ "status": "success" | "error", "message": "...", "data": { ... } }`
**Errors:** 4xx/5xx with `{ "status": "error", "message": "..." }`

This document covers **every endpoint** the admin frontend calls, organized into:

- **Section A** – Existing endpoints (already on `/api/admin/operations/*` and `/api/agent/*`)
- **Section B** – New admin endpoints (built on `/api/admin/*`)
- **Section C** – Missing fields added to existing endpoints
- **Section D** – Implementation summary (what was built and where)

---

## Section A: Existing Endpoints

These endpoints are already called by the frontend. Listed for backend team verification.

---

### A1. Dashboard

**Page:** `/dashboard`

#### GET `/api/admin/operations/get-dashboard-stats`

Response:

```json
{
  "status": "success",
  "message": "...",
  "data": {
    "totalUsers":          { "count": 1500,  "change": "positive", "percentage": 12 },
    "totalTransactions":   { "count": 8200,  "change": "positive", "percentage": 8 },
    "totalDepartments":    { "count": 5 },
    "totalAgents":         { "count": 25,    "change": "positive", "percentage": 5 },
    "totalVerifiedUsers":  { "count": 1200,  "change": "positive", "percentage": 10 },
    "totalInflow":         { "current": 50000000, "change": "positive", "percentage": 15 },
    "totalOutflow":        { "current": 30000000, "change": "negative", "percentage": 3 },
    "totalRevenue":        { "current": 20000000, "change": "positive", "percentage": 20 }
  }
}
```

Notes:
- `totalInflow.current`, `totalOutflow.current`, `totalRevenue.current` are numbers in Naira.
- `change` is `"positive"` or `"negative"`. `percentage` is a number.

#### GET `/api/admin/operations/get-all-transactions` (OLD — gift card sale only)

> **WARNING:** This endpoint only returns gift card sale transactions. Dashboard should migrate to `GET /api/admin/transactions` (see B9.1) to show all transaction types.

---

### A2. Transactions (OLD — GIFT CARD SALE ONLY)

> **CRITICAL:** `GET /api/admin/operations/get-all-transactions` only returns gift card sale transactions. New endpoints cover ALL types. See **Section B9**.

#### GET `/api/admin/operations/get-all-transactions` (KEEP — backward compat)

Response: `{ "data": [ GiftCardSaleTransaction, ... ] }`

#### GET `/api/admin/operations/get-transaction-stats`

Response:

```json
{
  "status": "success",
  "message": "...",
  "data": {
    "totalTransactions": { "count": 8200, "change": "positive", "percentage": 8 },
    "totalTransactionAmountSum": {
      "_sum": { "amount": 500000, "amountNaira": 200000000 },
      "change": "positive", "percentage": 12
    },
    "cryptoTransactions": {
      "_count": 3000, "_sum": { "amount": 250000, "amountNaira": 100000000 },
      "change": "positive", "percentage": 10
    },
    "giftCardTransactions": {
      "_count": 2000, "_sum": { "amount": 150000, "amountNaira": 60000000 },
      "change": "positive", "percentage": 5
    }
  }
}
```

> This old stats endpoint does NOT include bill payment or naira stats. Use `GET /api/admin/transactions/stats` (B9.3) for the complete version.

---

### Transaction Object Shape (Base — all types share these fields)

```json
{
  "id": 123,
  "transactionId": "TXN-ABC123",
  "status": "successful",
  "amount": 250.00,
  "amountNaira": 100000,
  "createdAt": "2025-11-06T10:30:00.000Z",
  "updatedAt": "2025-11-06T10:35:00.000Z",
  "profit": 15.50,
  "department": {
    "id": 1, "title": "Buy Crypto", "niche": "crypto", "Type": "buy"
  },
  "category": {
    "id": 10, "title": "Bitcoin", "subTitle": "BTC", "image": "btc.png"
  },
  "subCategory": { "id": 100, "title": "Buy BTC with Naira" },
  "customer": {
    "id": 50, "username": "john_doe", "firstname": "John", "lastname": "Doe",
    "profilePicture": "avatar.jpg", "country": "Nigeria"
  },
  "agent": null,
  "fromAddress": null,
  "toAddress": null,
  "cardType": null,
  "cardNumber": null,
  "giftCardSubType": null,
  "billType": null,
  "billReference": null,
  "billProvider": null,
  "nairaType": null,
  "nairaChannel": null,
  "nairaReference": null
}
```

**Type-specific fields** are non-null only for the matching niche. `department.niche` determines classification:
- `"crypto"` → `fromAddress`, `toAddress`
- `"giftcard"` → `cardType`, `cardNumber`, `giftCardSubType`
- `"billpayment"` → `billType`, `billReference`, `billProvider`
- `"naira"` → `nairaType`, `nairaChannel`, `nairaReference`

---

### A3. Customer Transaction Details (OLD)

> Same issue: `GET /api/admin/operations/get-customer-transactions/:id` only returns gift card sales. Use `GET /api/admin/transactions/by-customer/:customerId` (B9.2) instead.

---

### A4. Customers List

**Page:** `/customers`

#### GET `/api/admin/operations/get-all-customers`

Response: `{ "data": [ Customer, ... ] }`

#### GET `/api/admin/operations/get-customer-stats`

Response:

```json
{
  "data": {
    "totalCustomers":     { "count": 1500, "change": "positive", "percentage": 12 },
    "verifiedCustomers":  { "count": 1200, "change": "positive", "percentage": 10 },
    "offlineNow":         { "count": 300,  "change": "negative", "percentage": 2 },
    "totalCustomerChats": { "count": 5000, "change": "positive", "percentage": 8 }
  }
}
```

---

### A5. Customer Detail

**Page:** `/customers/:id`

#### GET `/api/admin/operations/get-customer-details/:id`

Response now includes additional fields (see Section C):

```json
{
  "status": "success",
  "message": "Customer details fetched successfully",
  "data": {
    "id": 50,
    "firstname": "John",
    "lastname": "Doe",
    "username": "john_doe",
    "email": "john@example.com",
    "phoneNumber": "+2348012345678",
    "gender": "Male",
    "country": "Nigeria",
    "role": "customer",
    "isVerified": true,
    "status": "active",
    "profilePicture": "avatar.jpg",
    "KycStateTwo": { "id": 1, "bvn": "...", "state": "verified", "..." : "..." },
    "AccountActivity": [ { "id": 1, "description": "...", "createdAt": "..." } ],
    "ipAddress": null,
    "tier": "Tier 2",
    "nairaBalance": 200000,
    "cryptoBalance": 25.50,
    "referralCode": "REF123",
    "cryptoAssets": [
      { "symbol": "BTC", "name": "bitcoin", "balance": "0.005", "usdEquivalent": 25.50 }
    ],
    "frozenFeatures": ["withdrawal"]
  }
}
```

#### GET `/api/agent/utilities/get-notes/:customerId`
#### POST `/api/agent/utilities/create-note`
#### POST `/api/admin/operations/update-kycstatus/:userId`
#### POST `/api/admin/operations/update-customer/:id`

---

### A6. Chats

**Page:** `/chats`

#### GET `/api/admin/operations/get-all-agent-to-customer-chats`

Query: `page`, `limit`, `status?`, `type?`, `category?`, `q?`, `start?`, `end?`

#### GET `/api/admin/operations/get-chat-stats`
#### GET `/api/admin/operations/get-agent-customer-chatdetails/:chatId`
#### POST `/api/agent/send-to-customer` (FormData: chatId, message, image?)
#### POST `/api/agent/change-chat-status` (Body: chatId, status)

---

### A7. Other Existing Endpoints

| Page | Method | Endpoint | Notes |
|------|--------|----------|-------|
| Rates | GET | `/api/admin/operations/get-rate` | Rate list |
| Departments | GET | `/api/admin/operations/get-all-department` | Department list |
| Create dept | POST | `/api/admin/operations/create-department` | FormData |
| Update dept | POST | `/api/admin/operations/update-department` | FormData |
| Delete dept | POST | `/api/admin/operations/delete-department` | Department id |
| Single dept | GET | `/api/admin/operations/get-department/:id` | Single |
| Categories | GET | `/api/admin/operations/get-all-categories` | Array |
| Single cat | GET | `/api/admin/operations/get-single-category/:id` | Single |
| Create cat | POST | `/api/admin/operations/create-category` | FormData |
| Update cat | POST | `/api/admin/operations/update-category` | FormData |
| Delete cat | POST | `/api/admin/operations/delete-category` | Id |
| Subcategories | GET | `/api/admin/operations/get-all-subcategories` | Array |
| Create subcat | POST | `/api/admin/operations/create-subcategory` | FormData |
| Update subcat | POST | `/api/admin/operations/update-subcategory` | FormData |
| Teams | GET | `/api/admin/operations/get-team-members-2` | Team list |
| Team stats | GET | `/api/admin/operations/get-team-stats` | Stats |
| All agents | GET | `/api/admin/operations/get-all-agents` | Agents |
| Agent by dept | GET | `/api/admin/operations/get-agent-by-department` | Filtered |
| KYC requests | GET | `/api/admin/operations/kyc-users` | KYC list |
| KYC limits | GET | `/api/admin/operations/get-kyc-limits` | Limits |
| SMTP get | GET | `/api/admin/operations/get-smtp` | SMTP config |
| SMTP create | POST | `/api/admin/operations/create-smtp` | SMTP fields |
| Quick replies | GET | `/api/agent/utilities/get-all-quick-replies` | Replies |
| Create reply | POST | `/api/agent/utilities/create-quick-reply` | Message |
| Update reply | PUT | `/api/agent/utilities/update-quick-reply` | Id + message |
| Delete reply | DELETE | `/api/agent/utilities/delete-quick-reply` | Id |
| Ways of hearing | GET | `/api/admin/operations/get-all-ways-of-hearing` | List |
| Create way | POST | `/api/admin/operations/create-ways-of-hearing` | Means |
| Team notifs | GET | `/api/agent/utilities/get-team-notifications` | Notifs |
| Customer notifs | GET | `/api/agent/utilities/get-customer-notifications` | Notifs |
| All notifs | GET | `/api/admin/operations/get-all-notifications` | List |
| Create notif | POST | `/api/admin/operations/create-notification` | Fields |
| Delete notif | POST | `/api/admin/operations/delete-notification` | Id |
| Banners | GET | `/api/admin/operations/get-all-banners` | List |
| Create banner | POST | `/api/admin/operations/create-banner` | FormData |
| Delete banner | POST | `/api/admin/operations/delete-banner` | Id |
| Create role | POST | `/api/admin/operations/create-role` | Name |
| Roles list | GET | `/api/admin/operations/get-roles-list` | Array |
| Block/Unblock | POST | `/api/admin/operations/change-status` | Id + status |
| Create agent | POST | `/api/admin/create-agent` | Agent fields |
| Create team | POST | `/api/admin/create-team-member` | Fields |
| Update agent | POST | `/api/admin/operations/update-agent` | Fields |
| User activity | GET | `/api/admin/operations/get-user-activity` | List |
| All users | GET | `/api/admin/operations/get-all-users` | List |
| Pending chats | GET | `/api/agent/utilities/get-all-default-chats` | Pending |
| Take over | POST | `/api/agent/utilities/take-over-chat` | Chat id |
| Unread count | GET | `/api/public/get-unread-count` | Count |
| Mark all read | POST | `/api/public/mark-all-messages-read` | — |
| Login | POST | `/api/agent/auth/login` | Credentials |
| Change pwd | POST | `/api/auth/change-password` | Passwords |

---

## Section B: New Admin Endpoints (BUILT)

All endpoints below use base `/api/admin`. All return: `{ "status": "success", "message": "...", "data": { ... } }`.

Auth: `authenticateUser` + `authenticateAdmin` middleware (Bearer token, admin role required).

---

### B1. User Balances

**Page:** `/user-balances`
**File:** `src/services/admin/user.balances.service.ts`, `src/controllers/admin/user.balances.controller.ts`, `src/routes/admin/user.balances.router.ts`
**Route mount:** `app.use('/api/admin/user-balances', userBalancesRouter)`

#### GET `/api/admin/user-balances`

Query: `sort?`, `startDate?`, `endDate?`, `dateRange?`, `search?`, `page` (default 1), `limit` (default 20)

Response:

```json
{
  "status": "success",
  "message": "User balances retrieved successfully",
  "data": {
    "rows": [
      {
        "id": 50,
        "name": "John Doe",
        "email": "john@example.com",
        "totalBalanceUsd": 5000,
        "totalBalanceN": 20005000,
        "cryptoBalanceUsd": 250,
        "cryptoBalanceN": 200000,
        "nairaBalance": 500000
      }
    ],
    "total": 150, "page": 1, "limit": 20, "totalPages": 8
  }
}
```

**Implementation:** Queries `User` with `fiatWallets` (NGN balance) and `virtualAccounts` + `walletCurrency` (crypto USD/NGN). All balance fields are numbers.

---

### B2. Master Wallet

**Page:** `/master-wallet`
**Files:** `src/services/admin/master.wallet.admin.service.ts`, `src/controllers/admin/master.wallet.controller.ts`, `src/routes/admin/master.wallet.router.ts`
**Route mount:** `app.use('/api/admin/master-wallet', masterWalletRouter)`

#### GET `/api/admin/master-wallet/balances/summary`

Response:

```json
{
  "status": "success",
  "message": "Balance summary retrieved",
  "data": {
    "summary": [
      { "walletId": "tercescrow", "label": "Tercescrow Master Wallet", "totalUsd": 50000, "totalNgn": 20000000000, "totalBtc": 10 },
      { "walletId": "yellowcard", "label": "Yellow Card Wallet", "totalUsd": 25000, "totalNgn": 10000000000, "totalBtc": 5 },
      { "walletId": "palmpay", "label": "Palmpay Wallet", "totalUsd": 30000, "totalNgn": 5000000, "accountName": "Tercescrow", "accountNumber": "0123453234" }
    ]
  }
}
```

#### GET `/api/admin/master-wallet/assets`

Query: `walletId?`

Response:

```json
{
  "status": "success",
  "message": "...",
  "data": {
    "assets": [
      {
        "symbol": "BTC", "name": "Bitcoin", "balance": "10 BTC",
        "usdValue": "$10,000,000", "masterBalance": "10 BTC", "masterUsd": "$10,000,000",
        "yellowCard": "5 BTC", "yellowCardUsd": "$5,000,000",
        "tatum": "5 BTC", "tatumUsd": "$5,000,000",
        "tercescrowBalance": "10 BTC", "tercescrowUsd": "$10,000,000",
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
      }
    ]
  }
}
```

#### GET `/api/admin/master-wallet/transactions`

Query: `walletId?`, `assetSymbol?`

#### POST `/api/admin/master-wallet/send`

Body: `{ "address", "amountCrypto", "amountDollar", "network", "symbol", "vendorId?" }`

#### POST `/api/admin/master-wallet/swap`

Body: `{ "fromSymbol", "toSymbol", "fromAmount", "toAmount", "receivingWallet" }`

---

### B3. Vendors

**Page:** `/settings/vendors` and Master Wallet Send modal
**Files:** `src/controllers/admin/vendors.controller.ts`, `src/routes/admin/vendors.router.ts`
**Route mount:** `app.use('/api/admin/vendors', vendorsRouter)`

#### GET `/api/admin/vendors`

Query: `currency?`

Response:

```json
{
  "status": "success",
  "message": "Vendors retrieved",
  "data": [
    {
      "id": 1, "name": "Yellow Card Withdrawal", "network": "Ethereum",
      "currency": "USDT", "walletAddress": "0xabc123...",
      "notes": "Primary USDT payout", "createdAt": "...", "updatedAt": "..."
    }
  ]
}
```

#### POST `/api/admin/vendors`

Body: `{ "name", "network", "currency", "walletAddress", "notes?" }`

#### PATCH `/api/admin/vendors/:id`

Body: Partial vendor fields.

#### DELETE `/api/admin/vendors/:id`

Response: `{ "status": "success", "message": "Vendor deleted", "data": null }`

**Implementation:** CRUD on the `Vendor` Prisma model.

---

### B4. Daily Report

**Page:** `/daily-report`
**Files:** `src/services/admin/daily.report.service.ts`, `src/controllers/admin/daily.report.controller.ts`, `src/routes/admin/daily.report.router.ts`
**Route mount:** `app.use('/api/admin/daily-report', dailyReportRouter)`

#### GET `/api/admin/daily-report/shift-settings`

Response:

```json
{
  "status": "success",
  "message": "Shift settings retrieved",
  "data": {
    "day": { "checkIn": "09:00", "checkOut": "17:00", "gracePeriod": 15 },
    "night": { "checkIn": "22:00", "checkOut": "06:00", "gracePeriod": 15 }
  }
}
```

#### PUT `/api/admin/daily-report/shift-settings`

Body: Same shape as response data. Auth: Admin only.

#### GET `/api/admin/daily-report/logs`

Query: `startDate?`, `endDate?`, `shift?` (Day/Night), `agentId?`

Response:

```json
{
  "status": "success",
  "message": "Logs retrieved",
  "data": {
    "logs": [
      {
        "id": "1", "employeeId": 5, "employeeName": "Qamardeen",
        "day": "2025-10-06", "shift": "Day", "date": "2025-10-06",
        "checkInTime": "2025-10-06T08:55:00.000Z",
        "checkOutTime": "2025-10-06T16:30:00.000Z",
        "status": "checked_out", "amountMade": 11234,
        "reportPreview": "I have something to...", "reportId": 1
      }
    ]
  }
}
```

#### GET `/api/admin/daily-report/summary`

Query: `agentId?`

Response:

```json
{
  "status": "success",
  "message": "Summary retrieved",
  "data": {
    "activeHours": 160, "activeHoursTrend": 0,
    "amountEarned": 50000, "department": "Support"
  }
}
```

#### GET `/api/admin/daily-report/charts/avg-work-hours`

Query: `days` (default 7)

Response: `{ "data": { "data": [ { "day": "2025-10-01", "hours": 8 }, ... ] } }`

#### GET `/api/admin/daily-report/charts/work-hours-per-month`

Query: `months` (default 3)

Response: `{ "data": { "data": [ { "month": "2025-10", "workHrs": 160, "overTimeHrs": 20 } ] } }`

#### GET `/api/admin/daily-report/reports/:reportId`

Response: Full report detail including agent info, clock times, active hours, status, myReport, auditorsReport.

#### PATCH `/api/admin/daily-report/reports/:reportId`

Body: `{ "status?": "approved"|"not_approved", "auditorsReport?", "myReport?" }`

#### POST `/api/admin/daily-report/check-in`

Body: `{ "shift": "Day"|"Night", "timestamp?" }` Auth: Agent/Admin.

#### POST `/api/admin/daily-report/check-out`

Body: `{ "timestamp?" }` Auth: Agent/Admin.

**Implementation:** Uses `ShiftSettings` model (upsert with defaults) and `AttendanceLog` model with `@@unique([userId, date])`.

---

### B5. Transaction Tracking

**Page:** `/transaction-tracking`
**Files:** `src/services/admin/transaction.tracking.service.ts`, `src/controllers/admin/transaction.tracking.controller.ts`, `src/routes/admin/transaction.tracking.router.ts`
**Route mount:** `app.use('/api/admin/transaction-tracking', transactionTrackingRouter)`

#### GET `/api/admin/transaction-tracking`

Query: `txType?` (Send/Receive/Buy/Sell/Swap), `startDate?`, `endDate?`, `search?`, `page?`, `limit?`

Response:

```json
{
  "status": "success",
  "message": "Transaction tracking list retrieved",
  "data": {
    "items": [
      {
        "id": "031pxtg2c101", "name": "Qamar Malik",
        "status": "successful", "txId": "031pxtg2c101",
        "type": "BUY", "amount": "250",
        "date": "2025-11-06T10:30:00.000Z", "txType": "BUY"
      }
    ],
    "total": 100, "page": 1, "limit": 20, "totalPages": 5
  }
}
```

#### GET `/api/admin/transaction-tracking/:txId/steps`

Response:

```json
{
  "status": "success",
  "message": "Steps retrieved",
  "data": {
    "steps": [
      {
        "title": "Transaction created", "crypto": "BTC",
        "network": "bitcoin", "date": "...", "status": "successful"
      },
      {
        "title": "Send", "fromAddress": "bc1q...", "toAddress": "bc1q...",
        "transactionHash": "0xabc123...", "txHash": "0xabc123...",
        "status": "successful", "date": "..."
      }
    ]
  }
}
```

#### GET `/api/admin/transaction-tracking/:txId/details`

Response:

```json
{
  "status": "success",
  "message": "Details retrieved",
  "data": {
    "amountDollar": "250", "amountNaira": "100000",
    "serviceType": "BUY", "cryptoType": "BTC",
    "cryptoChain": "bitcoin", "cryptoAmount": "0.005",
    "sendAddress": "bc1q...", "receiverAddress": "bc1q...",
    "transactionHash": "0xabc...", "transactionId": "031pxtg2c101",
    "transactionStatus": "successful"
  }
}
```

**Implementation:** Queries `CryptoTransaction` with all child relations (cryptoBuy, cryptoSell, cryptoSend, cryptoReceive, cryptoSwap).

---

### B6. Referrals

**Page:** `/referrals`
**Files:** `src/services/admin/referrals.admin.service.ts`, `src/controllers/admin/referrals.admin.controller.ts`, `src/routes/admin/referrals.admin.router.ts`
**Route mount:** `app.use('/api/admin/referrals', referralsAdminRouter)`

#### GET `/api/admin/referrals/summary`

Query: `startDate?`, `endDate?`

Response:

```json
{
  "status": "success",
  "message": "Referrals summary retrieved",
  "data": {
    "allUsers": 150, "allUsersTrend": null,
    "totalReferred": 100, "amountPaidOut": 0
  }
}
```

#### GET `/api/admin/referrals`

Query: `type?`, `search?`, `startDate?`, `endDate?`, `page?`, `limit?`

Response:

```json
{
  "status": "success",
  "message": "Referrals list retrieved",
  "data": {
    "rows": [
      {
        "id": 1, "name": "Qamardeen Abdulmalik", "email": "qamar@gmail.com",
        "joined": "2024-11-07T00:00:00.000Z", "noOfReferrals": 10,
        "downlineReferrals": 0, "amountEarned": 0
      }
    ],
    "total": 50, "page": 1, "limit": 20, "totalPages": 3
  }
}
```

#### GET `/api/admin/referrals/by-user/:userId`

Response:

```json
{
  "status": "success",
  "message": "Referrals by user retrieved",
  "data": {
    "referrals": [
      {
        "referredName": "Chris Adewale",
        "referredAt": "2025-06-16T07:22:00.000Z",
        "stats": { "giftCardBuy": 5, "giftCardSell": 0, "cryptoTrades": 3, "noOfUsersReferred": 2 },
        "earned": { "amountEarnedFromTrades": 0, "fromGcTrades": 0, "fromCryptoTrades": 0, "fromDownlines": 0 }
      }
    ]
  }
}
```

#### GET `/api/admin/referrals/earn-settings`

Response:

```json
{
  "status": "success",
  "message": "Earn settings retrieved",
  "data": {
    "firstTimeDepositBonusPct": 100,
    "commissionReferralTradesPct": 5,
    "commissionDownlineTradesPct": 2
  }
}
```

#### PUT `/api/admin/referrals/earn-settings`

Body: `{ "firstTimeDepositBonusPct", "commissionReferralTradesPct", "commissionDownlineTradesPct" }`

**Implementation:** Queries `User` with `referralCode` and `referrals` relation. Uses `ReferralEarnSettings` model.

---

### B7. Support

**Page:** `/support`
**Files:** `src/controllers/admin/support.admin.controller.ts`, `src/routes/admin/support.admin.router.ts`
**Route mount:** `app.use('/api/admin/support', supportAdminRouter)`

#### GET `/api/admin/support/chats`

Query:
- `filter?`: `"processing"` (Active), `"completed"` (Closed), `"unread"` (Unread), or omit for All. **Case-insensitive.**
- `search?`, `page?`, `limit?`

Response:

```json
{
  "status": "success",
  "message": "Chats retrieved",
  "data": {
    "chats": [
      {
        "id": 1, "participantName": "John Doe",
        "participantAvatar": "avatar.jpg",
        "lastMessage": "I need help with payments",
        "lastMessageSender": "user",
        "lastMessageTime": "2025-06-16T10:00:00.000Z",
        "unreadCount": 3, "status": "processing"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 }
  }
}
```

#### GET `/api/admin/support/chats/:chatId/messages`

Query: `before?` (ISO timestamp), `limit?`

Response:

```json
{
  "status": "success",
  "message": "Messages retrieved",
  "data": {
    "messages": [
      { "id": 1, "sender": "user", "text": "I need help", "imageUrl": null, "time": "2025-06-16T10:00:00.000Z" },
      { "id": 2, "sender": "agent", "text": "How can we help?", "imageUrl": null, "time": "2025-06-16T10:01:00.000Z" }
    ]
  }
}
```

#### POST `/api/admin/support/chats/:chatId/messages`

Body: `{ "text": "Hello!" }` or FormData with `text` + `image` file.

Response: `{ "data": { "id": 3, "sender": "agent", "text": "Hello!", "imageUrl": null, "time": "..." } }`

#### PATCH `/api/admin/support/chats/:chatId`

Body: `{ "status?": "completed", "markRead?": true }`

**Implementation:** Queries `SupportChat` and `SupportChatMessage` models. Messages include `imageUrl`. Filter handles lowercase values and maps: `"active"`/`"processing"` → pending+processing chats, `"closed"`/`"completed"` → completed chats, `"unread"` → chats with unread user messages.

---

### B8. Customer Freeze/Ban

**Files:** `src/controllers/admin/customers.freeze.controller.ts`, `src/routes/admin/customers.freeze.router.ts`
**Route mount:** `app.use('/api/admin/customers', customersFreezeRouter)`

#### POST `/api/admin/customers/:customerId/freeze`

Body: `{ "feature": "withdrawal" }`

Allowed features (case-insensitive): `deposit`, `withdrawal`, `send/receive/swap/buy/sell crypto`, `buy/sell gift card`

Response: `{ "data": { "frozenFeatures": ["withdrawal"] } }`

#### POST `/api/admin/customers/:customerId/unfreeze`

Body: `{ "feature": "withdrawal" }`

Response: `{ "data": { "frozenFeatures": [] } }`

#### POST `/api/admin/customers/:customerId/ban`

Body: `{ "reason?": "Fraud suspected", "permanent?": true }`

Response: `{ "data": { "status": "banned" } }`

**Implementation:** Uses `UserFeatureFreeze` model with `@@unique([userId, feature])`. Ban updates `User.status` to `"banned"` and logs to `AccountActivity`. Feature names are **normalized to lowercase** before storage.

---

### B9. Transactions (NEW — All Transaction Types)

**Files:** `src/services/admin/transactions.admin.service.ts`, `src/controllers/admin/transactions.admin.controller.ts`, `src/routes/admin/transactions.router.ts`
**Route mount:** `app.use('/api/admin/transactions', transactionsAdminRouter)`

#### B9.1 GET `/api/admin/transactions`

Returns all transactions across all types with server-side filtering.

Query params:
- `niche?` — `"crypto"`, `"giftcard"`, `"billpayment"`, `"naira"`. Omit for all.
- `type?` — `"buy"`, `"sell"`. Omit for all.
- `status?` — `"successful"`, `"pending"`, `"declined"`. Omit for all.
- `search?` — Searches customer name/username, transaction ID, category.
- `startDate?` — YYYY-MM-DD
- `endDate?` — YYYY-MM-DD
- `page?` (default 1), `limit?` (default 20)

Response:

```json
{
  "status": "success",
  "message": "Transactions retrieved",
  "data": {
    "transactions": [
      {
        "id": 123,
        "transactionId": "TXN-ABC123",
        "status": "successful",
        "amount": 250.00,
        "amountNaira": 100000,
        "createdAt": "2025-11-06T10:30:00.000Z",
        "updatedAt": "2025-11-06T10:35:00.000Z",
        "profit": 0,
        "department": { "id": 0, "title": "Buy Crypto", "niche": "crypto", "Type": "buy" },
        "category": { "id": 0, "title": "BTC", "subTitle": "BTC", "image": null },
        "subCategory": null,
        "customer": {
          "id": 50, "username": "john_doe", "firstname": "John", "lastname": "Doe",
          "profilePicture": "avatar.jpg", "country": "Nigeria"
        },
        "agent": null,
        "fromAddress": "0xabc...",
        "toAddress": "0xdef...",
        "cardType": null, "cardNumber": null, "giftCardSubType": null,
        "billType": null, "billReference": null, "billProvider": null,
        "nairaType": null, "nairaChannel": null, "nairaReference": null
      }
    ],
    "total": 500, "page": 1, "limit": 20, "totalPages": 25
  }
}
```

**Status normalization:** DB values `"completed"` → `"successful"`, `"cancelled"`/`"refunded"` → `"declined"`. Status filter `"successful"` matches both DB `"successful"` and `"completed"`.

**Frontend usage per page:**

| Page route | Query sent |
|---|---|
| `/transactions` (All tab) | No `niche` param |
| `/transactions/crypto` | `niche=crypto` |
| `/transactions/gift-card-buy` | `niche=giftcard&type=buy` |
| `/transactions` Gift Cards tab | `niche=giftcard` |
| `/transactions/bill-payments` | `niche=billpayment` |
| `/transactions/naira` | `niche=naira` |

**Data sources:**
| Niche | Prisma Model | Type-specific fields |
|---|---|---|
| `giftcard` | `GiftCardOrder` | cardType, cardNumber |
| `crypto` | `CryptoTransaction` + child tables | fromAddress, toAddress |
| `billpayment` | `BillPayment` | billType, billReference, billProvider |
| `naira` | `FiatTransaction` (where billType IS NULL) | nairaType, nairaChannel, nairaReference |

**All-types mode:** When `niche` is omitted, queries all 4 models in parallel, merges results, sorts by `createdAt` descending, and returns the correct page.

---

#### B9.2 GET `/api/admin/transactions/by-customer/:customerId`

Same response shape and query params as B9.1, scoped to one customer.

---

#### B9.3 GET `/api/admin/transactions/stats`

Query: `niche?`, `startDate?`, `endDate?`

Response:

```json
{
  "status": "success",
  "message": "Transaction stats retrieved",
  "data": {
    "totalTransactions": { "count": 8200, "change": "positive", "percentage": 8 },
    "totalTransactionAmountSum": {
      "_sum": { "amount": 500000, "amountNaira": 200000000 },
      "change": "positive", "percentage": 12
    },
    "cryptoTransactions": {
      "_count": 3000, "_sum": { "amount": 250000, "amountNaira": 100000000 },
      "change": "positive", "percentage": 10
    },
    "giftCardTransactions": {
      "_count": 2000, "_sum": { "amount": 150000, "amountNaira": 0 },
      "change": "positive", "percentage": 5
    },
    "billPaymentTransactions": {
      "_count": 1500, "_sum": { "amount": 0, "amountNaira": 20000000 },
      "change": "positive", "percentage": 3
    },
    "nairaTransactions": {
      "_count": 1700, "_sum": { "amount": 0, "amountNaira": 80000000 },
      "change": "positive", "percentage": 7
    }
  }
}
```

**Change calculation:** Compares current period to previous period of equal duration. Default: current month vs previous month.

**Crypto amounts:** Aggregated from `CryptoBuy._sum.amountUsd/amountNaira` + `CryptoSell._sum.amountUsd/amountNaira`.

---

#### B9.4 Old endpoint migration

| Old Endpoint | Status | Migration |
|---|---|---|
| `GET /api/admin/operations/get-all-transactions` | **Kept** (gift card sale only) | Frontend migrates to `GET /api/admin/transactions` |
| `GET /api/admin/operations/get-customer-transactions/:id` | **Kept** | Frontend migrates to `GET /api/admin/transactions/by-customer/:customerId` |
| `GET /api/admin/operations/get-transaction-stats` | **Kept** (crypto + gift card only) | Frontend migrates to `GET /api/admin/transactions/stats` |

---

## Section C: Missing Fields Added to Existing Endpoints

The following fields were **added** to `GET /api/admin/operations/get-customer-details/:id`:

| Field | Type | Description | Source |
|---|---|---|---|
| `ipAddress` | null | Not tracked in DB (reserved for future) | — |
| `tier` | string | `"Tier 1"` / `"Tier 2"` / `"Tier 3"` / `"Tier 4"` | Computed from `kycTier{N}Verified` flags |
| `nairaBalance` | number | NGN wallet balance | `FiatWallet` where currency=NGN |
| `cryptoBalance` | number | Crypto portfolio value in USD | `VirtualAccount` × `WalletCurrency.price` |
| `referralCode` | string \| null | Customer's referral code | `User.referralCode` |
| `cryptoAssets` | array | Per-asset breakdown | `[{ symbol, name, balance, usdEquivalent }]` |
| `frozenFeatures` | string[] | Currently frozen features | `UserFeatureFreeze` |

**Implementation:** Added `fiatWallets`, `virtualAccounts` (with walletCurrency), and `featureFreezes` includes to the Prisma query. Computed derived fields in the controller response.

---

## Section D: Implementation Summary

### New Prisma Models (added to `prisma/schema.prisma`)

| Model | Purpose |
|---|---|
| `Vendor` | Vendor management for Master Wallet Send |
| `ShiftSettings` | Day/Night shift config for Daily Report |
| `AttendanceLog` | Agent attendance and daily report entries |
| `ReferralEarnSettings` | Global referral commission rates |
| `UserFeatureFreeze` | Per-customer feature freezes |
| `MasterWalletTransaction` | Master wallet send/swap action log |

### New Files Created

| File | Purpose |
|---|---|
| `src/middlewares/authenticate.admin.ts` | Admin role check middleware |
| `src/services/admin/transactions.admin.service.ts` | Unified transaction queries (4 models → 1 response shape) |
| `src/controllers/admin/transactions.admin.controller.ts` | Transaction list, by-customer, stats controllers |
| `src/routes/admin/transactions.router.ts` | GET /, GET /stats, GET /by-customer/:customerId |
| `src/services/admin/user.balances.service.ts` | User balance aggregation |
| `src/controllers/admin/user.balances.controller.ts` | User balances controller |
| `src/routes/admin/user.balances.router.ts` | GET /api/admin/user-balances |
| `src/services/admin/master.wallet.admin.service.ts` | Master wallet balance/asset/tx logic |
| `src/controllers/admin/master.wallet.controller.ts` | Master wallet endpoints |
| `src/routes/admin/master.wallet.router.ts` | Master wallet routes |
| `src/controllers/admin/vendors.controller.ts` | Vendor CRUD |
| `src/routes/admin/vendors.router.ts` | Vendor routes |
| `src/services/admin/daily.report.service.ts` | Daily report logic (shifts, logs, charts) |
| `src/controllers/admin/daily.report.controller.ts` | Daily report endpoints |
| `src/routes/admin/daily.report.router.ts` | Daily report routes |
| `src/services/admin/transaction.tracking.service.ts` | Crypto transaction tracking |
| `src/controllers/admin/transaction.tracking.controller.ts` | Tracking endpoints |
| `src/routes/admin/transaction.tracking.router.ts` | Tracking routes |
| `src/services/admin/referrals.admin.service.ts` | Referral list, summary, earn settings |
| `src/controllers/admin/referrals.admin.controller.ts` | Referral endpoints |
| `src/routes/admin/referrals.admin.router.ts` | Referral routes |
| `src/controllers/admin/support.admin.controller.ts` | Admin support chat endpoints |
| `src/routes/admin/support.admin.router.ts` | Support routes |
| `src/controllers/admin/customers.freeze.controller.ts` | Freeze/unfreeze/ban endpoints |
| `src/routes/admin/customers.freeze.router.ts` | Customer restriction routes |
| `src/utils/customer.restrictions.ts` | Utility to check banned/frozen status |

### Existing Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added 6 new models + `featureFreezes`/`attendanceLogs` relations on User |
| `src/index.ts` | Mounted all new admin routers under `/api/admin/*`; added PUT/PATCH/DELETE to CORS methods |
| `src/controllers/admin/admin.operation.controller.ts` | Added `nairaBalance`, `cryptoBalance`, `tier`, `referralCode`, `cryptoAssets`, `frozenFeatures` to customer details response |
| `src/controllers/admin/support.admin.controller.ts` | Normalized filter values to lowercase (processing/completed/unread) |
| `src/controllers/admin/customers.freeze.controller.ts` | Made feature name matching case-insensitive |
| `src/controllers/admin/vendors.controller.ts` | Changed delete response from 204 to standard envelope |
| `src/config/swagger.config.ts` | Added "Admin Panel" tag |
| Customer-facing controllers | Added banned/frozen feature checks (deposit, withdrawal, crypto, giftcard) |

### Route Mount Summary (in `src/index.ts`)

```
app.use('/api/admin/transactions', transactionsAdminRouter);
app.use('/api/admin/user-balances', userBalancesRouter);
app.use('/api/admin/master-wallet', masterWalletRouter);
app.use('/api/admin/vendors', vendorsRouter);
app.use('/api/admin/daily-report', dailyReportRouter);
app.use('/api/admin/transaction-tracking', transactionTrackingRouter);
app.use('/api/admin/referrals', referralsAdminRouter);
app.use('/api/admin/support', supportAdminRouter);
app.use('/api/admin/customers', customersFreezeRouter);
```

### Quick Reference: All 38 New Endpoints

| # | Method | Path | Page |
|---|--------|------|------|
| 1 | GET | `/api/admin/user-balances` | User Balances |
| 2 | GET | `/api/admin/master-wallet/balances/summary` | Master Wallet |
| 3 | GET | `/api/admin/master-wallet/assets` | Master Wallet |
| 4 | GET | `/api/admin/master-wallet/transactions` | Master Wallet |
| 5 | POST | `/api/admin/master-wallet/send` | Master Wallet |
| 6 | POST | `/api/admin/master-wallet/swap` | Master Wallet |
| 7 | GET | `/api/admin/vendors` | Settings + MW Send |
| 8 | POST | `/api/admin/vendors` | Settings |
| 9 | PATCH | `/api/admin/vendors/:id` | Settings |
| 10 | DELETE | `/api/admin/vendors/:id` | Settings |
| 11 | GET | `/api/admin/daily-report/shift-settings` | Daily Report |
| 12 | PUT | `/api/admin/daily-report/shift-settings` | Daily Report |
| 13 | GET | `/api/admin/daily-report/logs` | Daily Report |
| 14 | GET | `/api/admin/daily-report/summary` | Daily Report |
| 15 | GET | `/api/admin/daily-report/charts/avg-work-hours` | Daily Report |
| 16 | GET | `/api/admin/daily-report/charts/work-hours-per-month` | Daily Report |
| 17 | GET | `/api/admin/daily-report/reports/:reportId` | Daily Report |
| 18 | PATCH | `/api/admin/daily-report/reports/:reportId` | Daily Report |
| 19 | POST | `/api/admin/daily-report/check-in` | Daily Report |
| 20 | POST | `/api/admin/daily-report/check-out` | Daily Report |
| 21 | GET | `/api/admin/transaction-tracking` | Transaction Tracking |
| 22 | GET | `/api/admin/transaction-tracking/:txId/steps` | Transaction Tracking |
| 23 | GET | `/api/admin/transaction-tracking/:txId/details` | Transaction Tracking |
| 24 | GET | `/api/admin/referrals/summary` | Referrals |
| 25 | GET | `/api/admin/referrals` | Referrals |
| 26 | GET | `/api/admin/referrals/by-user/:userId` | Referrals |
| 27 | GET | `/api/admin/referrals/earn-settings` | Referrals |
| 28 | PUT | `/api/admin/referrals/earn-settings` | Referrals |
| 29 | GET | `/api/admin/support/chats` | Support |
| 30 | GET | `/api/admin/support/chats/:chatId/messages` | Support |
| 31 | POST | `/api/admin/support/chats/:chatId/messages` | Support |
| 32 | PATCH | `/api/admin/support/chats/:chatId` | Support |
| 33 | POST | `/api/admin/customers/:customerId/freeze` | Customer Table |
| 34 | POST | `/api/admin/customers/:customerId/unfreeze` | Customer Table |
| 35 | POST | `/api/admin/customers/:customerId/ban` | Customer Table |
| 36 | GET | `/api/admin/transactions` | Transactions (all types) |
| 37 | GET | `/api/admin/transactions/by-customer/:customerId` | Customer Txn Details |
| 38 | GET | `/api/admin/transactions/stats` | Transaction Stats |

### CORS Fix

Added `PUT`, `PATCH`, `DELETE`, `OPTIONS` to the CORS `methods` array in `src/index.ts`. Previously only `GET` and `POST` were allowed, which would have blocked the admin panel's PATCH/PUT/DELETE requests.

### Notes on Data

- **Status normalization:** All transaction responses normalize `"completed"` → `"successful"` and `"cancelled"`/`"refunded"` → `"declined"`.
- **Feature freeze:** Feature names stored lowercase. Matching is case-insensitive.
- **Support chat filter:** Accepts both cased and lowercase values (`"Active"` and `"processing"` both work).
- **All-transactions mode:** When `niche` is omitted, merges results from 4 models sorted by `createdAt` descending. Efficient for first ~10 pages of admin usage.
- **Crypto stats:** Aggregated from `CryptoBuy` and `CryptoSell` child tables for USD and Naira amounts.
- **Customer details:** Now includes wallet balances, KYC tier, referral code, crypto asset breakdown, and frozen features list.
