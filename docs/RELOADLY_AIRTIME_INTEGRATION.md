# Reloadly Airtime Integration

## Overview

Reloadly has been integrated for **airtime** bill payments. When users call the bill payment API with `sceneCode=airtime`, the system automatically uses Reloadly instead of PalmPay.

## Key Points

- **Automatic Provider Selection**: When `sceneCode=airtime`, Reloadly is used automatically (regardless of the `provider` parameter)
- **Same API Structure**: Uses the same endpoints and request/response format as existing bill payments
- **Same Database**: All transactions are stored in the same `BillPayment` table with `provider='reloadly'`
- **Same Wallet Flow**: Debits wallet first, refunds on failure

## Environment Variables Required

Add these to your `.env` file:

```env
# Reloadly Configuration
RELOADLY_ENVIRONMENT=sandbox  # or "production"
RELOADLY_CLIENT_ID=your_client_id_here
RELOADLY_CLIENT_SECRET=your_client_secret_here

# Optional (defaults provided)
RELOADLY_BASE_URL=https://topups.reloadly.com
RELOADLY_SANDBOX_URL=https://topups-sandbox.reloadly.com
RELOADLY_AUTH_URL=https://auth.reloadly.com
RELOADLY_AUDIENCE=https://topups.reloadly.com  # or sandbox URL
```

## API Usage

### 1. Get Airtime Networks (Billers)

```http
GET /api/v2/bill-payments/billers?sceneCode=airtime
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "airtime",
    "provider": "reloadly",
    "billers": [
      {
        "billerId": "MTN",
        "billerName": "MTN Nigeria",
        "operatorId": 341
      },
      {
        "billerId": "GLO",
        "billerName": "Glo Nigeria",
        "operatorId": 382
      },
      {
        "billerId": "AIRTEL",
        "billerName": "Airtel Nigeria",
        "operatorId": 496
      },
      {
        "billerId": "9MOBILE",
        "billerName": "9mobile Nigeria",
        "operatorId": 498
      }
    ]
  }
}
```

### 2. Get Items (Always Empty for Airtime)

```http
GET /api/v2/bill-payments/items?sceneCode=airtime&billerId=MTN
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "airtime",
    "billerId": "MTN",
    "provider": "reloadly",
    "items": []  // Empty - user-specified amounts
  }
}
```

### 3. Verify Account (Optional)

```http
POST /api/v2/bill-payments/verify-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "airtime",
  "rechargeAccount": "08154462953",
  "billerId": "MTN"
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "airtime",
    "provider": "reloadly",
    "rechargeAccount": "08154462953",
    "biller": "MTN Nigeria",
    "valid": true
  }
}
```

### 4. Create Airtime Order

```http
POST /api/v2/bill-payments/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "airtime",
  "billerId": "MTN",
  "rechargeAccount": "08154462953",
  "amount": 500.00,
  "pin": "1234"
}
```

**Note:** `itemId` is **not required** for airtime.

**Response:**
```json
{
  "status": 200,
  "data": {
    "billPaymentId": "uuid-here",
    "transactionId": "tx-uuid-here",
    "orderNo": "4602843",
    "requestId": "tx-uuid-here",
    "sceneCode": "airtime",
    "provider": "reloadly",
    "billerId": "MTN",
    "itemId": null,
    "rechargeAccount": "08154462953",
    "amount": 500.00,
    "currency": "NGN",
    "orderStatus": 2,
    "status": "completed",
    "message": "SUCCESSFUL"
  }
}
```

## How It Works

### Operator Mapping

Reloadly uses numeric operator IDs, but our system uses billerIds (MTN, GLO, etc.). The service automatically maps:

- **MTN Nigeria** → `MTN`
- **Glo Nigeria** → `GLO`
- **Airtel Nigeria** → `AIRTEL`
- **9mobile Nigeria** → `9MOBILE`

### Status Mapping

Reloadly status values are mapped to our order status:
- `SUCCESSFUL` → `2` (completed)
- `PENDING` → `1` (pending)
- `FAILED` → `3` (failed)
- `REFUNDED` → `3` (failed)

### Database Storage

Reloadly transactions are stored in `BillPayment` table:
- `provider`: `"reloadly"`
- `palmpayOrderId`: Reloadly custom identifier (transaction ID)
- `palmpayOrderNo`: Reloadly transaction ID
- `palmpayStatus`: Reloadly status (SUCCESSFUL, PENDING, etc.)
- `billReference`: Reloadly operator transaction ID

## Features

1. **OAuth 2.0 Token Management**: Automatic token generation and caching
2. **Operator Auto-Detection**: Can detect operator from phone number
3. **Operator Caching**: Operators are cached for 1 hour to reduce API calls
4. **Nigeria Focus**: Currently configured for Nigeria (NG) operators
5. **Error Handling**: Comprehensive error handling with wallet refund on failure

## Transaction Flow

1. User calls `/create-order` with `sceneCode=airtime`
2. System automatically uses Reloadly (ignores `provider` parameter for airtime)
3. Wallet is debited
4. Reloadly top-up API is called
5. Transaction status is stored in database
6. If Reloadly fails, wallet is automatically refunded

## Notes

- Reloadly is **only** used for `sceneCode=airtime`
- Other scene codes (data, cable, electricity, education, betting) continue to use PalmPay or VTpass as specified
- Reloadly supports international top-ups, but current implementation is focused on Nigeria
- All transactions maintain the same database structure and wallet flow

