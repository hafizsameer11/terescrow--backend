# PalmPay Integration - Deposit & Bill Payment Implementation Guide

## 📚 Overview

This document covers the complete implementation of PalmPay integration for:
1. **Wallet Deposits** (Funding NGN wallet)
2. **Bill Payments** (Airtime, Data, Electricity, Cable TV, Betting)

---

## 🔗 PalmPay API Documentation

**✅ Official Documentation**: 
- **Main Docs**: [https://docs.palmpay.com/#/](https://docs.palmpay.com/#/)
- **Create Order**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order)
- **Query Order Result**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result)
- **Payment Result Notify (Webhook)**: [https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify](https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify)
- **Checkout Instructions**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction)
- **Checkout Service**: [https://checkout.palmpay.com/h5-checkout](https://checkout.palmpay.com/h5-checkout)

**⚠️ Important**: 
1. **Review Checkout Documentation**: [Checkout Instructions](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction) for wallet top-up flow
2. Obtain API credentials (API Key, Secret, Merchant ID) from PalmPay
3. Review actual endpoint structure and request/response formats
4. Set up webhook URLs with PalmPay
5. Understand checkout flow and redirect handling

**Common PalmPay Integration Pattern** (verify with official docs):
- Authentication via API Key/Secret
- Payment initiation endpoints
- Webhook callbacks for status updates
- Transaction verification endpoints
- Checkout integration for payment processing

---

## 📱 UI Flow Analysis

### **Flow 1: Wallet Deposit (Top-up)**

**Screen 1**: Dashboard → User taps "Deposit" on NGN wallet card
**Screen 2**: Payment Method Selection Modal
- Shows "PalmPay" as payment option
- User enters amount
- Clicks "Proceed"

**Screen 3**: PalmPay Payment
- Opens PalmPay checkout (webview or external browser)
- User completes payment on PalmPay

**Screen 4**: Success/Error
- Success: Wallet credited, return to dashboard
- Error: Show error message

### **Flow 2: Bill Payment**

**Screen 1**: Dashboard → User taps "Bill Payments" card
**Screen 2**: Bill Payment Menu
- List of bill types:
  - Airtime
  - Data
  - Electricity
  - Cable TV
  - Betting

**Screen 3**: Select Bill Type (e.g., Airtime)
- User selects provider (MTN, GLO, Airtel, 9mobile, Smile)
- Enters mobile number
- Enters amount
- Shows balance: "Balance: N5000"
- "Buy airtime" button

**Screen 4**: Review Transaction Pop-up
- Shows: Network provider, Mobile number, Amount
- "Continue" button

**Screen 5**: Enter PIN
- User enters 4-digit PIN
- Validates PIN

**Screen 6**: Payment Method Selection
- Shows "PalmPay" option
- "Proceed" button

**Screen 7**: PalmPay Payment
- Opens PalmPay checkout
- User completes payment

**Screen 8**: Success/Error
- Success: "Purchase completed! You have successfully purchased..."
- Error: "Insufficient balance" or other error

---

## 🗄️ Database Schema

### **New Models Required**

```prisma
// Fiat Wallet
model FiatWallet {
  id              String   @id @default(uuid())
  userId          Int
  currency        String   // "NGN", "KES", "GHS", etc.
  balance         Decimal  @db.Decimal(15, 2) @default(0)
  isPrimary       Boolean  @default(false)
  provider        String   // "LOCAL_ADMIN", "YELLOW_CARD"
  status          String   @default("active") // "active", "frozen", "closed"
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  user            User     @relation(fields: [userId], references: [id])
  transactions    FiatTransaction[]
  
  @@unique([userId, currency])
  @@index([userId])
  @@index([currency])
}

// Fiat Transactions (Deposits, Withdrawals, Bill Payments)
model FiatTransaction {
  id              String   @id @default(uuid())
  userId          Int
  walletId        String
  type            String   // "DEPOSIT", "WITHDRAW", "BILL_PAYMENT", "TRANSFER"
  status          String   @default("pending") // "pending", "processing", "completed", "failed", "cancelled"
  currency        String
  amount          Decimal  @db.Decimal(15, 2)
  fees            Decimal  @db.Decimal(15, 2) @default(0)
  totalAmount     Decimal  @db.Decimal(15, 2) // amount + fees
  balanceBefore   Decimal? @db.Decimal(15, 2)
  balanceAfter    Decimal? @db.Decimal(15, 2)
  
  // PalmPay Integration
  palmpayPaymentId String? @unique
  palmpayReference String?
  palmpayStatus    String?
  redirectUrl      String?
  
  // Bill Payment Details
  billType        String?  // "AIRTIME", "DATA", "ELECTRICITY", "CABLE_TV", "BETTING"
  billProvider    String?  // "MTN", "GLO", "AIRTEL", "9MOBILE", "SMILE", "DSTV", "GOTV", etc.
  billAccount     String?  // Phone number, meter number, account number
  billAmount      Decimal? @db.Decimal(15, 2)
  billReference   String?  // Provider's transaction reference
  
  // Metadata
  description     String?
  metadata        Json?
  errorMessage    String?  @db.Text
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  completedAt     DateTime?
  
  user            User     @relation(fields: [userId], references: [id])
  wallet          FiatWallet @relation(fields: [walletId], references: [id])
  
  @@index([userId])
  @@index([walletId])
  @@index([palmpayPaymentId])
  @@index([status])
  @@index([type])
  @@index([createdAt])
}

// PalmPay Configuration
model PalmPayConfig {
  id              Int      @id @default(autoincrement())
  environment     String   @default("sandbox") // "sandbox" or "production"
  apiKey          String   @db.VarChar(255)
  apiSecret       String   @db.VarChar(255)
  merchantId      String?  @db.VarChar(255)
  webhookSecret  String?  @db.VarChar(255)
  baseUrl         String   // PalmPay API base URL
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([environment])
}

// Bill Payment Providers (for reference)
model BillProvider {
  id              Int      @id @default(autoincrement())
  billType        String   // "AIRTIME", "DATA", "ELECTRICITY", "CABLE_TV", "BETTING"
  providerCode    String   // "MTN", "GLO", "AIRTEL", "9MOBILE", "SMILE", "DSTV", "GOTV"
  providerName    String   // "MTN Nigeria", "GLO Mobile", etc.
  countryCode     String   @default("NG")
  isActive        Boolean  @default(true)
  minAmount       Decimal? @db.Decimal(10, 2)
  maxAmount       Decimal? @db.Decimal(10, 2)
  iconUrl         String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([billType, providerCode, countryCode])
  @@index([billType])
  @@index([countryCode])
}
```

### **Update Existing Models**

```prisma
model User {
  // ... existing fields ...
  fiatWallets     FiatWallet[]
  fiatTransactions FiatTransaction[]
}
```

---

## 🔌 API Endpoints

### **1. Fiat Wallet Endpoints**

#### **1.1 Get Wallet Overview**
```
GET /api/v2/wallets/overview
Authorization: Bearer <token>
```

**Response**:
```json
{
  "fiatWallets": [
    {
      "currency": "NGN",
      "balance": "50000.00",
      "isPrimary": true,
      "provider": "LOCAL_ADMIN"
    }
  ],
  "cryptoWallets": [...]
}
```

#### **1.2 Get Fiat Wallet Details**
```
GET /api/v2/wallets/fiat/{currency}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "currency": "NGN",
  "balance": "50000.00",
  "provider": "LOCAL_ADMIN",
  "depositMethods": ["PAMPAY"],
  "withdrawMethods": ["PAMPAY"],
  "limits": {
    "dailyDepositLimit": "2000000.00",
    "dailyWithdrawLimit": "1000000.00"
  }
}
```

#### **1.3 Get Wallet Transactions**
```
GET /api/v2/wallets/fiat/{currency}/transactions
Authorization: Bearer <token>
Query: page, limit, type, status
```

**Response**:
```json
{
  "transactions": [
    {
      "id": "tx_123",
      "type": "DEPOSIT",
      "status": "completed",
      "amount": "25000.00",
      "currency": "NGN",
      "fees": "0.00",
      "totalAmount": "25000.00",
      "description": "Wallet top-up via PalmPay",
      "createdAt": "2025-01-30T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50
  }
}
```

---

### **2. PalmPay Deposit Endpoints (Wallet Top-up)**

**📚 Official Documentation**: [PalmPay Checkout Instructions](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction)

#### **2.1 Initiate Deposit (Using PalmPay Checkout)**

**📚 Official Documentation**: [Create Order](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order)

PalmPay uses a **checkout-based flow** for wallet top-ups. The process involves:
1. Creating a payment order via API
2. Getting a checkout URL
3. Redirecting user to PalmPay checkout
4. User completes payment on PalmPay
5. Webhook notification when payment completes

```
POST /api/v2/payments/palmpay/deposit/initiate
Authorization: Bearer <token>
Content-Type: application/json
```

**Request** (Our API):
```json
{
  "amount": "25000.00",
  "currency": "NGN",
  "reason": "wallet_topup"
}
```

**Backend Flow**:
1. Create `FiatTransaction` record in database (status: "pending")
2. Convert amount from NGN to **cents** (25000.00 → 2500000)
3. Generate unique `orderId` (32 chars max)
4. Call PalmPay Create Order API:
   ```
   POST https://open-gw-daily.palmpay-inc.com/api/v2/payment/merchant/createorder
   Headers:
     CountryCode: NG
     Authorization: Bearer <token>
     Signature: <calculated_signature>
   Body:
     {
       "requestTime": 1662171389940,
       "version": "V1.1",
       "nonceStr": "random_string_32_chars",
       "orderId": "tx_789_1234567890",
       "title": "Wallet Top-up",
       "description": "Deposit to NGN wallet",
       "amount": 2500000,  // in cents!
       "currency": "NGN",
       "notifyUrl": "https://api.terescrow.com/api/v2/webhooks/palmpay",
       "callBackUrl": "https://app.terescrow.com/deposit/success",
       "orderExpireTime": 3600,
       "customerInfo": "{\"userId\":\"123\",\"userName\":\"John Doe\",\"phone\":\"08123456789\",\"email\":\"user@example.com\"}"
     }
   ```
5. Store PalmPay `orderNo` in transaction record
6. Return checkout URL to frontend

**Response** (Our API):
```json
{
  "paymentId": "tx_789_1234567890",
  "orderNo": "2424220903032435363613",
  "transactionId": "tx_789",
  "provider": "PAMPAY",
  "status": "pending",
  "amount": "25000.00",
  "currency": "NGN",
  "checkoutUrl": "https://openapi.transspay.net/open-api/api/v1/payment/h5/redirect?orderNo=...",
  "expiresAt": "2025-01-30T10:15:00Z"
}
```

**Important**:
- Amount must be in **cents** (100 = 1 NGN)
- Minimum amount: 100 cents (1 NGN)
- `orderId` must be unique (32 chars max)
- Store `orderNo` from PalmPay response

**Frontend Action**:
- Open `checkoutUrl` in webview or external browser
- User completes payment on PalmPay
- PalmPay redirects to `returnUrl` on success
- Backend receives webhook for status update

#### **2.2 Check Deposit Status**

**📚 Official Documentation**: [Query Order Result](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result)

```
GET /api/v2/payments/palmpay/deposit/{paymentId}
Authorization: Bearer <token>
```

**Backend Flow**:
1. Get transaction from database
2. Call PalmPay Query Order API:
   ```
   POST https://open-gw-daily.palmpay-inc.com/api/v2/payment/merchant/order/queryStatus
   Headers:
     CountryCode: NG
     Authorization: Bearer <token>
     Signature: <calculated_signature>
   Body:
     {
       "requestTime": 1662171389940,
       "version": "V1.1",
       "nonceStr": "random_string",
       "orderId": "tx_789_1234567890",
       "orderNo": "2424220903032435363613"
     }
   ```
3. Update transaction status based on response
4. Return status to frontend

**Response** (Our API):
```json
{
  "paymentId": "tx_789_1234567890",
  "orderNo": "2424220903032435363613",
  "transactionId": "tx_789",
  "status": "completed",
  "amount": "25000.00",
  "currency": "NGN",
  "orderStatus": 2,
  "payMethod": "pay_wallet",
  "completedAt": "2025-01-30T10:05:00Z"
}
```

**Order Status Codes**:
- `1` = PENDING
- `2` = SUCCESS
- `3` = FAILED
- `4` = CANCELLED

#### **2.3 PalmPay Webhook**

**📚 Official Documentation**: [Payment Result Notify](https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify)

```
POST /api/v2/webhooks/palmpay
Content-Type: application/json
```

**Webhook Payload** (actual structure from PalmPay docs):
```json
{
  "orderId": "tx_789_1234567890",
  "orderNo": "2424220903032435363613",
  "appId": "AppId123456",
  "currency": "NGN",
  "amount": 2500000,
  "orderStatus": 2,
  "completeTime": 1658574095184,
  "sign": "IDjwDpLTJXqbJh0PmC74R0HuEBM7oIpHdmfnIn6V14%2Bh2hZaUZCf1cbHR8M%3D",
  "payMethod": "pay_wallet",
  "payer": null
}
```

**Critical Notes**:
- `amount` is in **cents** (2500000 = 25,000.00 NGN)
- `orderStatus`: `1`=PENDING, `2`=SUCCESS, `3`=FAILED, `4`=CANCELLED
- `sign` is **URL encoded** - must decode with `decodeURIComponent(sign)` before verification
- `completeTime` is timestamp in milliseconds (only present when orderStatus = 2)

**Backend Webhook Handler**:
1. ✅ **URL decode the signature**: `decodeURIComponent(sign)`
2. ✅ Verify webhook signature using PalmPay's public key (check docs for algorithm)
3. ✅ Check if transaction already processed (idempotency - use `orderNo`)
4. ✅ Find transaction by `orderId` (merchant order ID) or `orderNo` (PalmPay order number)
5. ✅ Check `orderStatus`:
   - `1` = PENDING (do nothing, wait)
   - `2` = SUCCESS → Credit NGN wallet (convert cents to NGN: `amount / 100`)
   - `3` = FAILED → Mark transaction as failed
   - `4` = CANCELLED → Mark transaction as cancelled
6. ✅ Update transaction status in database
7. ✅ Send push notification to user (if success)
8. ✅ **Return plain text "success"** (NOT JSON) - HTTP 200 with `Content-Type: text/plain`

**CRITICAL**: Webhook response must be plain text `success`, not JSON. If you return anything else, PalmPay will retry 8 times (5s, 30s, 4m, 10m, 1h, 2h, 6h, 15h).

---

### **3. Bill Payment Endpoints**

#### **3.1 Get Bill Payment Types**
```
GET /api/v2/bill-payments/types
Authorization: Bearer <token>
```

**Response**:
```json
{
  "types": [
    {
      "code": "AIRTIME",
      "name": "Airtime",
      "description": "Buy airtime for various networks",
      "icon": "https://...",
      "providers": ["MTN", "GLO", "AIRTEL", "9MOBILE", "SMILE"]
    },
    {
      "code": "DATA",
      "name": "Data",
      "description": "Get affordable data plans",
      "icon": "https://...",
      "providers": ["MTN", "GLO", "AIRTEL", "9MOBILE", "SMILE"]
    },
    {
      "code": "ELECTRICITY",
      "name": "Electricity",
      "description": "Pay your electricity bills with ease",
      "icon": "https://...",
      "providers": ["AEDC", "EKEDC", "IKEDC", "PHED", "KEDCO"]
    },
    {
      "code": "CABLE_TV",
      "name": "Cable TV",
      "description": "Subscribe to your favorite tv plans",
      "icon": "https://...",
      "providers": ["DSTV", "GOTV", "STARTIMES"]
    },
    {
      "code": "BETTING",
      "name": "Betting",
      "description": "Fund your betting accounts",
      "icon": "https://...",
      "providers": ["BET9JA", "SPORTYBET", "NAIRABET"]
    }
  ]
}
```

#### **3.2 Get Providers for Bill Type**
```
GET /api/v2/bill-payments/{billType}/providers
Authorization: Bearer <token>
```

**Response**:
```json
{
  "billType": "AIRTIME",
  "providers": [
    {
      "code": "MTN",
      "name": "MTN Nigeria",
      "icon": "https://...",
      "minAmount": "50.00",
      "maxAmount": "10000.00"
    },
    {
      "code": "GLO",
      "name": "GLO Mobile",
      "icon": "https://...",
      "minAmount": "50.00",
      "maxAmount": "10000.00"
    }
  ]
}
```

#### **3.3 Validate Bill Payment**
```
POST /api/v2/bill-payments/validate
Authorization: Bearer <token>
Content-Type: application/json
```

**Request**:
```json
{
  "billType": "AIRTIME",
  "provider": "MTN",
  "account": "08154462953",
  "amount": "500.00",
  "currency": "NGN"
}
```

**Response**:
```json
{
  "valid": true,
  "billType": "AIRTIME",
  "provider": "MTN",
  "account": "08154462953",
  "accountName": "John Doe", // If available from provider
  "amount": "500.00",
  "currency": "NGN",
  "fees": "0.00",
  "totalAmount": "500.00",
  "walletBalance": "5000.00",
  "canProceed": true
}
```

#### **3.4 Initiate Bill Payment**
```
POST /api/v2/bill-payments/palmpay/initiate
Authorization: Bearer <token>
Content-Type: application/json
```

**Request**:
```json
{
  "billType": "AIRTIME",
  "provider": "MTN",
  "account": "08154462953",
  "amount": "500.00",
  "currency": "NGN",
  "pin": "1234" // User's 4-digit PIN
}
```

**Response**:
```json
{
  "paymentId": "pp_bill_123456",
  "transactionId": "tx_bill_789",
  "billType": "AIRTIME",
  "provider": "MTN",
  "account": "08154462953",
  "amount": "500.00",
  "currency": "NGN",
  "status": "pending",
  "redirectUrl": "https://palmpay.com/checkout?ref=pp_bill_123456",
  "expiresAt": "2025-01-30T10:15:00Z"
}
```

#### **3.5 Check Bill Payment Status**
```
GET /api/v2/bill-payments/{transactionId}
Authorization: Bearer <token>
```

**Response**:
```json
{
  "transactionId": "tx_bill_789",
  "paymentId": "pp_bill_123456",
  "status": "completed",
  "billType": "AIRTIME",
  "provider": "MTN",
  "account": "08154462953",
  "amount": "500.00",
  "currency": "NGN",
  "billReference": "MTN_REF_123456", // Provider's reference
  "completedAt": "2025-01-30T10:05:00Z"
}
```

#### **3.6 Get Bill Payment History**
```
GET /api/v2/bill-payments/history
Authorization: Bearer <token>
Query: page, limit, billType, provider, status, startDate, endDate
```

**Response**:
```json
{
  "payments": [
    {
      "transactionId": "tx_bill_789",
      "billType": "AIRTIME",
      "provider": "MTN",
      "account": "08154462953",
      "amount": "500.00",
      "status": "completed",
      "billReference": "MTN_REF_123456",
      "createdAt": "2025-01-30T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50
  }
}
```

---

## 🔐 Authentication & Security

### **PalmPay API Authentication**

**📚 Reference**: [PalmPay API Documentation](https://docs.palmpay.com/#/) - Check authentication section

**Common Methods** (verify with official docs):
1. **API Key + Secret**: Include in headers or request body
2. **OAuth Token**: Bearer token in Authorization header
3. **Merchant ID**: May be required in headers or request

**Headers** (example - verify with actual API):
```
Authorization: Bearer <palmpay_access_token>
X-API-Key: <your_api_key>
X-Merchant-Id: <merchant_id>
Content-Type: application/json
```

**Webhook Verification**:
- PalmPay sends signature in header (e.g., `X-PalmPay-Signature`)
- Verify using HMAC SHA256 with webhook secret
- Always verify signature before processing webhook
- Implement idempotency to prevent duplicate processing

---

## 🔄 Implementation Flow

### **Deposit Flow (Wallet Top-up)**

**📚 Based on**: [PalmPay Checkout Instructions](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction)

```
1. User enters amount → POST /api/v2/payments/palmpay/deposit/initiate
2. Backend:
   - Creates FiatTransaction record (status: "pending")
   - Calls PalmPay Pay-In API to create payment order
   - Gets checkout URL from PalmPay
   - Stores PalmPay orderId/reference
3. Backend returns checkoutUrl to frontend
4. Frontend opens checkoutUrl in webview or external browser
5. User completes payment on PalmPay checkout page
6. PalmPay processes payment:
   - User selects payment method (card, bank transfer, etc.)
   - User completes payment
   - PalmPay redirects to returnUrl (if provided)
7. PalmPay sends webhook → POST /api/v2/webhooks/palmpay
8. Backend:
   - Verifies webhook signature
   - Checks transaction status
   - If SUCCESS: Credits NGN wallet, updates transaction
   - Sends push notification to user
9. Frontend:
   - Option A: Polls GET /api/v2/payments/palmpay/deposit/{paymentId}
   - Option B: Receives push notification
   - Option C: User returns from returnUrl, check status
10. Show success screen with updated balance
```

### **Bill Payment Flow**

```
1. User selects bill type → GET /api/v2/bill-payments/types
2. User selects provider → GET /api/v2/bill-payments/{type}/providers
3. User enters details → POST /api/v2/bill-payments/validate
4. User reviews → Shows review pop-up
5. User enters PIN → Validates PIN
6. User confirms → POST /api/v2/bill-payments/palmpay/initiate
7. Backend validates PIN, checks balance, creates transaction
8. Backend calls PalmPay bill payment API
9. Backend returns redirectUrl
10. Frontend opens redirectUrl
11. User completes payment on PalmPay
12. PalmPay sends webhook → POST /api/v2/webhooks/palmpay
13. Backend verifies, marks transaction completed
14. Frontend shows success screen
```

---

## 📋 Bill Payment Types & Providers

### **AIRTIME**
- **Providers**: MTN, GLO, Airtel, 9mobile, Smile
- **Account Format**: Phone number (10-11 digits)
- **Min Amount**: Usually NGN 50
- **Max Amount**: Usually NGN 10,000 per transaction

### **DATA**
- **Providers**: MTN, GLO, Airtel, 9mobile, Smile
- **Account Format**: Phone number
- **Amount**: Data plan prices (varies by provider)

### **ELECTRICITY**
- **Providers**: AEDC, EKEDC, IKEDC, PHED, KEDCO, etc.
- **Account Format**: Meter number (11-12 digits)
- **Amount**: User-specified (usually min NGN 100)

### **CABLE_TV**
- **Providers**: DSTV, GOTV, STARTIMES
- **Account Format**: Smart card number or account number
- **Amount**: Subscription plan prices

### **BETTING**
- **Providers**: Bet9ja, SportyBet, Nairabet, etc.
- **Account Format**: Betting account number/username
- **Amount**: User-specified

---

## 🛠️ Implementation Checklist

### **Phase 1: Database & Models**
- [ ] Create Prisma schema for FiatWallet, FiatTransaction, PalmPayConfig, BillProvider
- [ ] Run migrations
- [ ] Seed bill providers data

### **Phase 2: PalmPay Service Layer**
- [ ] Create `palmpay.config.ts` (configuration service)
- [ ] Create `palmpay.auth.service.ts` (authentication)
- [ ] Create `palmpay.deposit.service.ts` (deposit API calls)
- [ ] Create `palmpay.billpayment.service.ts` (bill payment API calls)
- [ ] Create `palmpay.webhook.service.ts` (webhook verification)

### **Phase 3: Wallet Services**
- [ ] Create `fiat.wallet.service.ts` (wallet operations)
- [ ] Create `fiat.transaction.service.ts` (transaction management)

### **Phase 4: Controllers**
- [ ] Create `fiat.wallet.controller.ts` (wallet endpoints)
- [ ] Create `palmpay.deposit.controller.ts` (deposit endpoints)
- [ ] Create `bill.payment.controller.ts` (bill payment endpoints)
- [ ] Create `palmpay.webhook.controller.ts` (webhook handler)

### **Phase 5: Routes**
- [ ] Create `fiat.wallet.router.ts`
- [ ] Create `palmpay.router.ts`
- [ ] Create `bill.payment.router.ts`
- [ ] Add routes to main app

### **Phase 6: Validation & Security**
- [ ] Add validation middleware for all endpoints
- [ ] Implement PIN validation
- [ ] Implement webhook signature verification
- [ ] Add rate limiting

### **Phase 7: Testing**
- [ ] Test deposit flow (sandbox)
- [ ] Test bill payment flow (sandbox)
- [ ] Test webhook handling
- [ ] Test error scenarios

---

## 🔧 Environment Variables

```env
# PalmPay Configuration
PALMPAY_API_KEY=your_api_key
PALMPAY_API_SECRET=your_api_secret
PALMPAY_MERCHANT_ID=your_merchant_id
PALMPAY_APP_ID=your_app_id
PALMPAY_PUBLIC_KEY=your_public_key_for_signature_verification
PALMPAY_ENVIRONMENT=sandbox  # or "production"
PALMPAY_BASE_URL=https://open-gw-daily.palmpay-inc.com  # sandbox
# PALMPAY_BASE_URL=https://open-gw.palmpay-inc.com  # production
PALMPAY_COUNTRY_CODE=NG
PALMPAY_VERSION=V1.1
PALMPAY_WEBHOOK_URL=https://api.terescrow.com/api/v2/webhooks/palmpay
```

---

## 📝 Notes

1. **PalmPay API Documentation**: 
   - **Official Docs**: [https://docs.palmpay.com/#/](https://docs.palmpay.com/#/)
   - **Checkout**: [https://checkout.palmpay.com/h5-checkout](https://checkout.palmpay.com/h5-checkout)
   - The endpoints and request/response formats in this document are based on common payment gateway patterns and your requirements
   - **You must verify all endpoints, request/response formats, and authentication methods with the official documentation**
   - Update this implementation document once you have access to the actual API documentation

2. **Webhook Security**: Always verify webhook signatures to prevent fraud.

3. **Error Handling**: Handle all possible error scenarios:
   - Insufficient balance
   - Invalid account numbers
   - Provider downtime
   - Network errors
   - Payment timeouts

4. **PIN Validation**: Use the existing PIN validation from user account.

5. **Transaction Status**: Implement polling or webhooks for real-time status updates.

6. **Testing**: Use PalmPay sandbox environment for testing before production.

---

## 🚀 Next Steps

1. **Access Official Documentation**: 
   - Visit [https://docs.palmpay.com/#/](https://docs.palmpay.com/#/)
   - Review all available endpoints for deposits and bill payments
   - Note authentication methods and required headers
   - Check webhook payload structure

2. **Get Credentials**: 
   - Obtain API Key, Secret, Merchant ID from PalmPay
   - Set up webhook URLs
   - Get sandbox credentials for testing

3. **Review Actual API**: 
   - Compare this document with PalmPay's actual API structure
   - Update endpoint URLs if different
   - Adjust request/response formats based on actual API
   - Verify bill payment provider codes and formats

4. **Update Implementation**: 
   - Adjust database models if needed based on actual API
   - Update service layer with real endpoints
   - Implement actual authentication method
   - Add proper webhook signature verification

5. **Test Integration**: 
   - Test in PalmPay sandbox environment
   - Verify deposit flow
   - Test all bill payment types
   - Test webhook handling

6. **Deploy**: 
   - Deploy to production after thorough testing
   - Monitor webhook delivery
   - Set up error alerts

---

**Last Updated**: January 2025  
**Status**: 📋 Ready for Implementation (pending PalmPay API documentation)

