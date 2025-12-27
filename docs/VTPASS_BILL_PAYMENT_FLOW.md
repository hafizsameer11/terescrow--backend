# VTpass Bill Payment Flow - Complete Guide

This document explains how to use the VTpass bill payment endpoints for each service type.

## Base URL
All endpoints are prefixed with: `/api/v2/bill-payments/vtpass`

---

## 1. AIRTIME Service

### Step 1: Get Available Networks (Billers)
```http
GET /api/v2/bill-payments/vtpass/billers?sceneCode=airtime
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "airtime",
    "provider": "vtpass",
    "billers": [
      {
        "billerId": "MTN",
        "billerName": "MTN",
        "serviceID": "mtn"
      },
      {
        "billerId": "GLO",
        "billerName": "GLO",
        "serviceID": "glo"
      },
      {
        "billerId": "AIRTEL",
        "billerName": "Airtel",
        "serviceID": "airtel"
      },
      {
        "billerId": "9MOBILE",
        "billerName": "9mobile",
        "serviceID": "etisalat"
      }
    ]
  }
}
```

### Step 2: Query Items (Optional - Returns Empty for Airtime)
```http
GET /api/v2/bill-payments/vtpass/items?sceneCode=airtime&billerId=MTN
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "airtime",
    "provider": "vtpass",
    "billerId": "MTN",
    "items": []  // Empty for airtime (amount is user-specified)
  }
}
```

### Step 3: Verify Account (Optional - Basic Phone Validation)
```http
POST /api/v2/bill-payments/vtpass/verify-account
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
    "provider": "vtpass",
    "rechargeAccount": "08154462953",
    "biller": "MTN",
    "valid": true,
    "result": {
      "biller": "MTN",
      "billerId": "MTN",
      "valid": true
    }
  }
}
```

### Step 4: Create Airtime Order
```http
POST /api/v2/bill-payments/vtpass/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "airtime",
  "billerId": "MTN",
  "rechargeAccount": "08154462953",
  "amount": 500.00,
  "phone": "08011111111",
  "pin": "1234"
}
```

**Note:** `itemId` is **optional** for airtime.

**Response:**
```json
{
  "status": 200,
  "data": {
    "billPaymentId": "uuid-here",
    "transactionId": "tx-uuid-here",
    "orderNo": "vtpass-transaction-id",
    "requestId": "202512212125onzdvhskkb",
    "sceneCode": "airtime",
    "provider": "vtpass",
    "billerId": "MTN",
    "itemId": null,
    "rechargeAccount": "08154462953",
    "amount": 500.00,
    "currency": "NGN",
    "orderStatus": 2,
    "status": "completed",
    "message": "TRANSACTION SUCCESSFUL"
  }
}
```

### Step 5: Check Order Status
```http
GET /api/v2/bill-payments/vtpass/order-status?billPaymentId=uuid-here
Authorization: Bearer <token>
```

---

## 2. DATA Service

### Step 1: Get Available Networks
```http
GET /api/v2/bill-payments/vtpass/billers?sceneCode=data
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "data",
    "provider": "vtpass",
    "billers": [
      {
        "billerId": "MTN",
        "billerName": "MTN Data",
        "serviceID": "mtn-data"
      },
      {
        "billerId": "GLO",
        "billerName": "GLO Data",
        "serviceID": "glo-data"
      },
      {
        "billerId": "SMILE",
        "billerName": "Smile",
        "serviceID": "smile-direct"
      }
      // ... more
    ]
  }
}
```

### Step 2: Get Data Plans (Items)
```http
GET /api/v2/bill-payments/vtpass/items?sceneCode=data&billerId=MTN
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "data",
    "provider": "vtpass",
    "billerId": "MTN",
    "items": [
      {
        "billerId": "MTN",
        "itemId": "mtn-500mb",
        "itemName": "MTN Data 500MB - 30 Days",
        "amount": 150.00,
        "serviceID": "mtn-data"
      },
      {
        "billerId": "MTN",
        "itemId": "mtn-1gb",
        "itemName": "MTN Data 1GB - 30 Days",
        "amount": 250.00,
        "serviceID": "mtn-data"
      }
      // ... more plans
    ]
  }
}
```

### Step 3: Verify Account
**For Regular Networks (MTN, GLO, Airtel, 9mobile):**
```http
POST /api/v2/bill-payments/vtpass/verify-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "data",
  "rechargeAccount": "08154462953",
  "billerId": "MTN"
}
```

**For Smile (Email Verification Required):**
```http
POST /api/v2/bill-payments/vtpass/verify-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "data",
  "rechargeAccount": "user@example.com",
  "billerId": "SMILE"
}
```

**Response (Smile):**
```json
{
  "status": 200,
  "data": {
    "valid": true,
    "biller": "Smile",
    "result": {
      "billerId": "SMILE",
      "valid": true,
      "customerName": "John Doe",
      "accountList": {
        "numberOfAccounts": 1,
        "accounts": [...]
      }
    }
  }
}
```

### Step 4: Create Data Order
```http
POST /api/v2/bill-payments/vtpass/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "data",
  "billerId": "MTN",
  "itemId": "mtn-1gb",
  "rechargeAccount": "08154462953",
  "phone": "08011111111",
  "amount": 250.00,
  "pin": "1234"
}
```

**Note:** `itemId` (variation_code) is **required** for data. The `amount` is determined by the plan, but you still need to provide it.

---

## 3. CABLE TV Service

### Step 1: Get Available Providers
```http
GET /api/v2/bill-payments/vtpass/billers?sceneCode=cable
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "cable",
    "provider": "vtpass",
    "billers": [
      {
        "billerId": "DSTV",
        "billerName": "DSTV",
        "serviceID": "dstv"
      },
      {
        "billerId": "GOTV",
        "billerName": "GOTV",
        "serviceID": "gotv"
      },
      {
        "billerId": "STARTIMES",
        "billerName": "Startimes",
        "serviceID": "startimes"
      },
      {
        "billerId": "SHOWMAX",
        "billerName": "Showmax",
        "serviceID": "showmax"
      }
    ]
  }
}
```

### Step 2: Get Bouquet Plans
```http
GET /api/v2/bill-payments/vtpass/items?sceneCode=cable&billerId=DSTV
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "cable",
    "provider": "vtpass",
    "billerId": "DSTV",
    "items": [
      {
        "billerId": "DSTV",
        "itemId": "dstv-padi",
        "itemName": "DSTV Padi",
        "amount": 2900.00,
        "serviceID": "dstv"
      },
      {
        "billerId": "DSTV",
        "itemId": "dstv-yanga",
        "itemName": "DSTV Yanga",
        "amount": 3500.00,
        "serviceID": "dstv"
      }
      // ... more bouquets
    ]
  }
}
```

### Step 3: Verify Smartcard Number
```http
POST /api/v2/bill-payments/vtpass/verify-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "cable",
  "rechargeAccount": "1212121212",
  "billerId": "DSTV"
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "valid": true,
    "biller": "DSTV",
    "result": {
      "billerId": "DSTV",
      "valid": true,
      "customerName": "John Doe",
      "status": "ACTIVE",
      "dueDate": "2025-02-15",
      "currentBouquet": "DSTV Compact"
    }
  }
}
```

### Step 4: Create Cable Subscription Order
```http
POST /api/v2/bill-payments/vtpass/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "cable",
  "billerId": "DSTV",
  "itemId": "dstv-padi",
  "rechargeAccount": "1212121212",
  "phone": "08011111111",
  "amount": 2900.00,
  "pin": "1234"
}
```

**Note:** `itemId` (bouquet variation_code) is **required**. Amount is determined by the bouquet.

---

## 4. ELECTRICITY Service

### Step 1: Get Available DISCOs
```http
GET /api/v2/bill-payments/vtpass/billers?sceneCode=electricity
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "electricity",
    "provider": "vtpass",
    "billers": [
      {
        "billerId": "IKEDC",
        "billerName": "Ikeja Electric",
        "serviceID": "ikeja-electric"
      },
      {
        "billerId": "EKEDC",
        "billerName": "Eko Electric",
        "serviceID": "eko-electric"
      },
      {
        "billerId": "AEDC",
        "billerName": "Abuja Electric",
        "serviceID": "abuja-electric"
      }
      // ... 13 total DISCOs
    ]
  }
}
```

### Step 2: Get Meter Types (Items)
```http
GET /api/v2/bill-payments/vtpass/items?sceneCode=electricity&billerId=IKEDC
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "electricity",
    "provider": "vtpass",
    "billerId": "IKEDC",
    "items": [
      {
        "billerId": "IKEDC",
        "itemId": "prepaid",
        "itemName": "Prepaid",
        "amount": 0,
        "serviceID": "ikeja-electric"
      },
      {
        "billerId": "IKEDC",
        "itemId": "postpaid",
        "itemName": "Postpaid",
        "amount": 0,
        "serviceID": "ikeja-electric"
      }
    ]
  }
}
```

### Step 3: Verify Meter Number
```http
POST /api/v2/bill-payments/vtpass/verify-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "electricity",
  "rechargeAccount": "12345678901",
  "billerId": "IKEDC",
  "itemId": "prepaid"  // REQUIRED: "prepaid" or "postpaid"
}
```

**Response (Prepaid):**
```json
{
  "status": 200,
  "data": {
    "valid": true,
    "biller": "Ikeja Electric",
    "result": {
      "billerId": "IKEDC",
      "valid": true,
      "customerName": "John Doe",
      "meterType": "PREPAID",
      "address": "123 Main Street, Lagos"
    }
  }
}
```

**Response (Postpaid):**
```json
{
  "status": 200,
  "data": {
    "valid": true,
    "biller": "Ikeja Electric",
    "result": {
      "billerId": "IKEDC",
      "valid": true,
      "customerName": "Jane Smith",
      "meterType": "POSTPAID",
      "address": "456 Oak Avenue, Lagos",
      "balance": "1500.00",
      "minimumPurchase": "500.00"
    }
  }
}
```

### Step 4: Create Electricity Purchase Order

**For Prepaid (Token Purchase):**
```http
POST /api/v2/bill-payments/vtpass/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "electricity",
  "billerId": "IKEDC",
  "itemId": "prepaid",
  "rechargeAccount": "12345678901",
  "amount": 1000.00,
  "phone": "08011111111",
  "pin": "1234"
}
```

**For Postpaid (Bill Payment):**
```http
POST /api/v2/bill-payments/vtpass/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "electricity",
  "billerId": "IKEDC",
  "itemId": "postpaid",
  "rechargeAccount": "12345678901",
  "amount": 5000.00,
  "phone": "08011111111",
  "pin": "1234"
}
```

**Response (Prepaid - Token Generated):**
```json
{
  "status": 200,
  "data": {
    "billPaymentId": "uuid-here",
    "transactionId": "tx-uuid-here",
    "orderNo": "vtpass-transaction-id",
    "requestId": "202512212125onzdvhskkb",
    "sceneCode": "electricity",
    "provider": "vtpass",
    "billerId": "IKEDC",
    "itemId": "prepaid",
    "rechargeAccount": "12345678901",
    "amount": 1000.00,
    "currency": "NGN",
    "orderStatus": 2,
    "status": "completed",
    "message": "TRANSACTION SUCCESSFUL",
    "token": "1234-5678-9012-3456",  // Prepaid token
    "units": "52.5 kWh"
  }
}
```

---

## 5. EDUCATION Service

### Step 1: Get Available Education Services
```http
GET /api/v2/bill-payments/vtpass/billers?sceneCode=education
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "education",
    "provider": "vtpass",
    "billers": [
      {
        "billerId": "WAEC_REGISTRATION",
        "billerName": "WAEC Registration",
        "serviceID": "waec-registration"
      },
      {
        "billerId": "JAMB",
        "billerName": "JAMB",
        "serviceID": "jamb"
      },
      {
        "billerId": "WAEC_RESULT",
        "billerName": "WAEC Result Checker",
        "serviceID": "waec"
      }
    ]
  }
}
```

### Step 2: Get PIN/Token Types
```http
GET /api/v2/bill-payments/vtpass/items?sceneCode=education&billerId=JAMB
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "sceneCode": "education",
    "provider": "vtpass",
    "billerId": "JAMB",
    "items": [
      {
        "billerId": "JAMB",
        "itemId": "utme-mock",
        "itemName": "JAMB UTME with Mock",
        "amount": 4700.00,
        "serviceID": "jamb"
      },
      {
        "billerId": "JAMB",
        "itemId": "utme-no-mock",
        "itemName": "JAMB UTME without Mock",
        "amount": 4700.00,
        "serviceID": "jamb"
      }
    ]
  }
}
```

### Step 3: Verify JAMB Profile (Optional - Only for JAMB)
```http
POST /api/v2/bill-payments/vtpass/verify-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "education",
  "rechargeAccount": "1234567890AB",
  "billerId": "JAMB",
  "itemId": "utme-mock"
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "valid": true,
    "biller": "JAMB",
    "result": {
      "billerId": "JAMB",
      "valid": true,
      "customerName": "John Doe"
    }
  }
}
```

### Step 4: Create Education PIN Purchase Order

**For JAMB (with Profile ID):**
```http
POST /api/v2/bill-payments/vtpass/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "education",
  "billerId": "JAMB",
  "itemId": "utme-mock",
  "rechargeAccount": "1234567890AB",
  "phone": "08011111111",
  "amount": 4700.00,
  "pin": "1234"
}
```

**For WAEC (PIN Count):**
```http
POST /api/v2/bill-payments/vtpass/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "sceneCode": "education",
  "billerId": "WAEC_RESULT",
  "itemId": "waec-1-pin",
  "rechargeAccount": "1",  // Number of PINs
  "phone": "08011111111",
  "amount": 1000.00,
  "pin": "1234"
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "billPaymentId": "uuid-here",
    "transactionId": "tx-uuid-here",
    "orderNo": "vtpass-transaction-id",
    "requestId": "202512212125onzdvhskkb",
    "sceneCode": "education",
    "provider": "vtpass",
    "billerId": "JAMB",
    "itemId": "utme-mock",
    "rechargeAccount": "1234567890AB",
    "amount": 4700.00,
    "currency": "NGN",
    "orderStatus": 2,
    "status": "completed",
    "message": "TRANSACTION SUCCESSFUL",
    "pin": "1234567890"  // Generated PIN
  }
}
```

---

## Common Flow Summary

### All Services Follow This Pattern:

1. **Get Billers** → `GET /vtpass/billers?sceneCode={type}`
2. **Get Items** → `GET /vtpass/items?sceneCode={type}&billerId={id}` (optional for airtime)
3. **Verify Account** → `POST /vtpass/verify-account` (optional but recommended)
4. **Create Order** → `POST /vtpass/create-order` (requires PIN, debits wallet)
5. **Check Status** → `GET /vtpass/order-status?billPaymentId={id}`
6. **View History** → `GET /vtpass/history`

### Key Differences:

| Service | itemId Required? | Verification | Special Fields |
|---------|-----------------|--------------|----------------|
| Airtime | ❌ No | Basic phone validation | - |
| Data | ✅ Yes (variation_code) | Phone/Email (Smile) | - |
| Cable | ✅ Yes (bouquet_code) | Smartcard verification | - |
| Electricity | ✅ Yes (prepaid/postpaid) | Meter verification | Meter type required |
| Education | ✅ Yes (pin_type) | Profile verification (JAMB only) | Profile ID for JAMB |

### Amount Handling:

- **Airtime**: User-specified amount (minimum usually 50 NGN)
- **Data**: Fixed by plan (from itemId), but amount still required
- **Cable**: Fixed by bouquet (from itemId), but amount still required
- **Electricity**: User-specified amount (minimum varies by DISCO)
- **Education**: Fixed by PIN type (from itemId), but amount still required

---

## Error Handling

All endpoints return standard error responses:
```json
{
  "status": 400,
  "message": "Error message here",
  "data": null
}
```

Common errors:
- `400`: Invalid input, missing fields, insufficient balance
- `401`: Invalid PIN or unauthorized
- `404`: Bill payment not found
- `500`: Server error

---

## Important Notes

1. **Wallet Balance**: All orders debit the wallet **BEFORE** creating the VTpass order. If VTpass fails, wallet is automatically refunded.

2. **PIN Required**: All `create-order` requests require the user's 4-digit PIN.

3. **Phone Field**: Always required for VTpass (used for transaction notifications).

4. **Request ID**: VTpass generates request IDs automatically (format: YYYYMMDDHHII + random string).

5. **Order Status**: 
   - `1` = Pending
   - `2` = Success/Delivered
   - `3` = Failed

6. **Database**: All payments are stored in `BillPayment` table with `provider='vtpass'`.

