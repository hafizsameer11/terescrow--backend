# Bill Payment - Current Implementation Summary

## ✅ Current Implementation (PalmPay)

**DO NOT REMOVE OR CHANGE** - This is the existing PalmPay integration that is working.

---

## 📋 Current Endpoints

All endpoints are under `/api/v2/bill-payments`

### 1. GET `/billers?sceneCode={sceneCode}`
**Purpose**: Get list of operators/providers for a scene code

**Query Parameters**:
- `sceneCode` (required): Currently supports `airtime`, `data`, `betting`

**Response**:
```json
{
  "status": "success",
  "message": "Request successful",
  "data": {
    "sceneCode": "airtime",
    "billers": [
      {
        "billerId": "MTN",
        "billerName": "MTN",
        "billerIcon": "https://xxx/MTN.png",
        "minAmount": 100,
        "maxAmount": 100000,
        "status": 1
      },
      {
        "billerId": "GLO",
        "billerName": "GLO",
        "billerIcon": "https://xxx/GLO.png",
        "minAmount": 100,
        "maxAmount": 100000,
        "status": 1
      }
    ]
  }
}
```

---

### 2. GET `/items?sceneCode={sceneCode}&billerId={billerId}`
**Purpose**: Get list of packages/plans for a specific operator

**Query Parameters**:
- `sceneCode` (required): `airtime`, `data`, or `betting`
- `billerId` (required): Operator ID (e.g., "MTN", "GLO")

**Response**:
```json
{
  "status": "success",
  "message": "Request successful",
  "data": {
    "sceneCode": "airtime",
    "billerId": "MTN",
    "items": [
      {
        "billerId": "MTN",
        "itemId": "5267001812",
        "itemName": "MTN Airtime",
        "amount": null,
        "minAmount": 100,
        "maxAmount": 100000,
        "isFixAmount": 0,
        "status": 1,
        "extInfo": {
          "validityDate": null,
          "itemSize": null,
          "itemDescription": {}
        }
      }
    ]
  }
}
```

---

### 3. POST `/verify-account`
**Purpose**: Verify recipient account (phone number, meter number, etc.)

**Request Body**:
```json
{
  "sceneCode": "airtime",
  "rechargeAccount": "08154462953",
  "billerId": "MTN",  // Required for betting
  "itemId": "5267001812"  // Required for betting
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Request successful",
  "data": {
    "sceneCode": "airtime",
    "rechargeAccount": "08154462953",
    "biller": "GLO",
    "valid": true,
    "result": {
      "biller": "GLO"
    }
  }
}
```

**Error Response** (invalid account):
```json
{
  "status": "success",
  "message": "Request successful",
  "data": {
    "valid": false,
    "error": "INVALID_RECHARGE_ACCOUNT"
  }
}
```

---

### 4. POST `/create-order`
**Purpose**: Create a bill payment order (debits wallet first, then creates PalmPay order)

**Request Body**:
```json
{
  "sceneCode": "airtime",
  "billerId": "MTN",
  "itemId": "5267001812",
  "rechargeAccount": "08154462953",
  "amount": 1000.00,
  "pin": "1234"
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Request successful",
  "data": {
    "billPaymentId": "uuid-here",
    "transactionId": "uuid-here",
    "orderNo": "palmpay-order-number",
    "outOrderNo": "bill_xxxxxxxx",
    "sceneCode": "airtime",
    "billerId": "MTN",
    "itemId": "5267001812",
    "rechargeAccount": "08154462953",
    "amount": 1000.00,
    "currency": "NGN",
    "orderStatus": 1,
    "status": "pending",
    "message": null
  }
}
```

**Note**: 
- `orderStatus`: 1 = PENDING, 2 = SUCCESS, 3 = FAILED
- Wallet is debited BEFORE PalmPay order creation
- If PalmPay order fails, wallet is automatically refunded

---

### 5. GET `/order-status?billPaymentId={id}`
**Alternative**: `GET /order-status?sceneCode={sceneCode}&outOrderNo={orderNo}`

**Purpose**: Query bill payment order status from database

**Query Parameters**:
- `billPaymentId` (preferred): Bill payment UUID
- OR `sceneCode` + `outOrderNo` / `orderNo`

**Response**:
```json
{
  "status": "success",
  "message": "Request successful",
  "data": {
    "orderStatus": {
      "outOrderNo": "bill_xxxxxxxx",
      "orderNo": "palmpay-order-number",
      "billerId": "MTN",
      "itemId": "5267001812",
      "orderStatus": 2,
      "amount": 1000.00,
      "sceneCode": "airtime",
      "currency": "NGN",
      "errorMsg": null,
      "completedTime": 1738245123000
    },
    "billPayment": {
      "id": "uuid-here",
      "transactionId": "uuid-here",
      "status": "completed",
      "sceneCode": "airtime",
      "billType": "AIRTIME",
      "billerId": "MTN",
      "billerName": null,
      "itemId": "5267001812",
      "itemName": null,
      "rechargeAccount": "08154462953",
      "amount": "1000.00",
      "currency": "NGN",
      "palmpayOrderId": "bill_xxxxxxxx",
      "palmpayOrderNo": "palmpay-order-number",
      "palmpayStatus": "2",
      "billReference": "palmpay-order-number",
      "errorMessage": null,
      "createdAt": "2025-01-30T10:00:00.000Z",
      "completedAt": "2025-01-30T10:05:00.000Z"
    }
  }
}
```

---

### 6. GET `/history?page=1&limit=20&sceneCode={sceneCode}&billerId={billerId}&status={status}`
**Purpose**: Get user's bill payment history with pagination and filters

**Query Parameters** (all optional):
- `page`: Default 1
- `limit`: Default 20
- `sceneCode`: Filter by scene code (airtime, data, betting)
- `billerId`: Filter by biller ID (MTN, GLO, etc.)
- `status`: Filter by status (pending, processing, completed, failed, cancelled)

**Response**:
```json
{
  "status": "success",
  "message": "Request successful",
  "data": {
    "billPayments": [
      {
        "id": "uuid-here",
        "transactionId": "uuid-here",
        "sceneCode": "airtime",
        "billType": "AIRTIME",
        "billerId": "MTN",
        "billerName": null,
        "itemId": "5267001812",
        "itemName": null,
        "rechargeAccount": "08154462953",
        "amount": 1000.00,
        "currency": "NGN",
        "status": "completed",
        "palmpayOrderId": "bill_xxxxxxxx",
        "palmpayOrderNo": "palmpay-order-number",
        "palmpayStatus": "2",
        "billReference": "palmpay-order-number",
        "errorMessage": null,
        "createdAt": "2025-01-30T10:00:00.000Z",
        "completedAt": "2025-01-30T10:05:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

---

## 🔄 Current Scene Codes (PalmPay)

Currently supported:
- `airtime` - Mobile airtime top-up
- `data` - Mobile data plans
- `betting` - Betting account top-up

**TypeScript Type**:
```typescript
export type PalmPaySceneCode = 'airtime' | 'data' | 'betting';
```

---

## 🗄️ Database Schema

### BillPayment Model
```prisma
model BillPayment {
  id               String          @id @default(uuid())
  userId           Int
  walletId         String
  transactionId    String          @unique
  sceneCode        String          @db.VarChar(20)  // "airtime", "data", "betting"
  billType         String          @db.VarChar(50)  // "AIRTIME", "DATA", "BETTING"
  billerId         String          @db.VarChar(100) // "MTN", "GLO", etc.
  billerName       String?         @db.VarChar(200)
  itemId           String          @db.VarChar(100)
  itemName         String?         @db.VarChar(200)
  rechargeAccount  String          @db.VarChar(50)  // Phone number, meter number, etc.
  amount           Decimal         @db.Decimal(15, 2)
  currency         String          @default("NGN") @db.VarChar(10)
  status           String          @default("pending") // "pending", "processing", "completed", "failed", "cancelled"
  palmpayOrderId   String?         @unique
  palmpayOrderNo   String?         @unique
  palmpayStatus    String?         // "1", "2", "3" (PENDING, SUCCESS, FAILED)
  billReference    String?         @db.VarChar(200)
  providerResponse String?         @db.LongText
  errorMessage     String?         @db.Text
  retryCount       Int             @default(0)
  refunded         Boolean         @default(false)
  refundedAt       DateTime?
  refundReason     String?
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  completedAt      DateTime?
  user             User            @relation(fields: [userId], references: [id])
  wallet           FiatWallet      @relation(fields: [walletId], references: [id])
  transaction      FiatTransaction @relation(fields: [transactionId], references: [id])
}
```

---

## 🔔 Webhook Endpoint

**Endpoint**: `POST /api/v2/webhooks/palmpay/bill-payment`

**Webhook Payload** (from PalmPay):
```json
{
  "outOrderNo": "bill_xxxxxxxx",
  "orderNo": "palmpay-order-number",
  "appId": "merchant-app-id",
  "amount": 100000,
  "rechargeAccount": "08154462953",
  "orderStatus": 2,
  "completedTime": 1738245123000,
  "sign": "url-encoded-signature",
  "errorMsg": null,
  "country": "NG"
}
```

**Response**: Must return plain text `"success"` (not JSON)

---

## 📝 Notes for New Provider Integration

### Required Information for New Providers:

1. **Scene Codes to Add**:
   - `electricity` - Electricity bill payments
   - `cable` or `cable_tv` - Cable TV bill payments

2. **Current Scene Codes** (may need new providers):
   - `airtime` - Mobile airtime (currently PalmPay)
   - `data` - Mobile data (currently PalmPay)

3. **Provider Details Needed**:
   - API base URL
   - Authentication method (API key, OAuth, etc.)
   - Endpoints for:
     - Query providers/operators
     - Query packages/plans
     - Verify account
     - Create order
     - Query order status
   - Webhook format and signature verification
   - Request/response formats
   - Error handling

4. **Database Considerations**:
   - The `BillPayment` model is provider-agnostic (uses `palmpayOrderId`, `palmpayOrderNo`, `palmpayStatus`)
   - May need to add generic provider fields or a separate provider field
   - Consider adding a `provider` field to identify which provider was used

5. **Integration Points**:
   - Service layer: `src/services/palmpay/palmpay.billpayment.service.ts`
   - Controller: `src/controllers/customer/billpayment.controller.ts`
   - Router: `src/routes/cutomer/billpayment.router.ts`
   - Types: `src/types/palmpay.types.ts`

---

## 🎯 Next Steps

1. **Do not modify** existing PalmPay implementation
2. **Design** a provider-agnostic structure (or keep PalmPay separate)
3. **Add** new scene codes (`electricity`, `cable`) to types
4. **Create** new service files for new providers (or extend existing structure)
5. **Update** controllers to handle multiple providers
6. **Update** database schema if needed to support multiple providers
7. **Maintain** the same endpoint response format for consistency

---

## ⚠️ Important

- **PalmPay implementation is working and should NOT be changed**
- All endpoints currently return the same response structure
- The system debits wallet BEFORE creating provider order
- Webhook handling is critical for status updates
- PIN validation is required for order creation

