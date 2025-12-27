# VTpass Data Subscription - Testing Guide

## 🚀 Quick Start

### Base URL
```
http://localhost:5000/api/v2/test/vtpass/data
```

### Environment Setup

Add these to your `.env` file (same as airtime):

```env
# VTpass Configuration
VTPASS_API_KEY=your_sandbox_api_key_here
VTPASS_PUBLIC_KEY=your_sandbox_public_key_here
VTPASS_ENVIRONMENT=sandbox  # or "production" for live
```

---

## 📋 Available Endpoints

### 1. **Get Test Information**
Get comprehensive information about providers, scenarios, and endpoints.

**Endpoint:** `GET /api/v2/test/vtpass/data/info`

**Example:**
```bash
curl http://localhost:5000/api/v2/test/vtpass/data/info
```

---

### 2. **Get Service Variations (Data Plans)**
Get available data subscription plans for a provider.

**Endpoint:** `GET /api/v2/test/vtpass/data/variations?provider={provider}`

**Valid Providers:**
- `mtn` - MTN Data
- `glo` - GLO Data
- `airtel` - Airtel Data
- `etisalat` - 9mobile Data
- `glo-sme` - GLO SME Data
- `smile` - Smile Network

**Example Requests:**

**MTN Data:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=mtn"
```

**GLO Data:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=glo"
```

**Airtel Data:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=airtel"
```

**9mobile Data:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=etisalat"
```

**GLO SME Data:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=glo-sme"
```

**Smile Network:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=smile"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "provider": "MTN",
    "serviceID": "mtn-data",
    "serviceName": "MTN Data",
    "convenienceFee": "0 %",
    "variationsCount": 40,
    "variations": [
      {
        "variation_code": "mtn-10mb-100",
        "name": "N100 100MB - 24 hrs",
        "variation_amount": "100.00",
        "fixedPrice": "Yes"
      },
      {
        "variation_code": "mtn-50mb-200",
        "name": "N200 200MB - 2 days",
        "variation_amount": "200.00",
        "fixedPrice": "Yes"
      }
      // ... more plans
    ]
  }
}
```

---

### 3. **Purchase Data Bundle**
Purchase data subscription for any provider.

**Endpoint:** `POST /api/v2/test/vtpass/data/purchase`

**Request Body:**
```json
{
  "provider": "mtn",
  "billersCode": "08011111111",
  "variation_code": "mtn-10mb-100",
  "phone": "08011111111",
  "amount": 100,
  "request_id": "optional_custom_request_id"
}
```

**Required Fields:**
- `provider` - Provider name (mtn, glo, airtel, etisalat, glo-sme, smile)
- `billersCode` - Phone number or account ID for subscription
- `variation_code` - Variation code from variations endpoint
- `phone` - Phone number of customer/recipient

**Optional Fields:**
- `amount` - Ignored (variation_code determines price)
- `request_id` - Custom request ID (auto-generated if not provided)

**Example Requests:**

**MTN Data:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "mtn",
    "billersCode": "08011111111",
    "variation_code": "mtn-10mb-100",
    "phone": "08011111111"
  }'
```

**GLO Data:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "glo",
    "billersCode": "08011111111",
    "variation_code": "glo100",
    "phone": "08011111111"
  }'
```

**Airtel Data:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "airtel",
    "billersCode": "08011111111",
    "variation_code": "airt-100",
    "phone": "08011111111"
  }'
```

**9mobile Data:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "etisalat",
    "billersCode": "08011111111",
    "variation_code": "eti-100",
    "phone": "08011111111"
  }'
```

**GLO SME Data:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "glo-sme",
    "billersCode": "08011111111",
    "variation_code": "glo-dg-70",
    "phone": "08011111111"
  }'
```

**Smile Network:**
```bash
# First verify email, then use AccountId from response as billersCode
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "smile",
    "billersCode": "08011111111",
    "variation_code": "516",
    "phone": "08011111111"
  }'
```

**Success Response:**
```json
{
  "status": "success",
  "message": "Purchase request completed",
  "data": {
    "success": true,
    "code": "000",
    "message": "TRANSACTION SUCCESSFUL",
    "provider": "MTN",
    "transaction": {
      "requestId": "202503101430YUs83meikd",
      "transactionId": "17415991578739548187285972",
      "status": "delivered",
      "amount": 100,
      "billersCode": "08011111111",
      "productName": "MTN Data",
      "commission": 4,
      "totalAmount": 96
    },
    "fullResponse": {...}
  }
}
```

---

### 4. **Verify Smile Email (Smile Only)**
Verify Smile email and get account list before purchasing.

**Endpoint:** `POST /api/v2/test/vtpass/data/verify-smile-email`

**Request Body:**
```json
{
  "email": "tester@sandbox.com"
}
```

**Sandbox Email:** `tester@sandbox.com`

**Example:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/verify-smile-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tester@sandbox.com"
  }'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "success": true,
    "code": "000",
    "customerName": "THE TESTER ITSELF",
    "accounts": [
      {
        "AccountId": "08011111111",
        "FriendlyName": "TESTER1"
      },
      {
        "AccountId": "08011111111",
        "FriendlyName": "TESTER2"
      }
    ],
    "accountsCount": 2
  }
}
```

**Note:** Use the `AccountId` from the response as `billersCode` when purchasing Smile data.

---

### 5. **Query Transaction Status**
Query the status of a data transaction.

**Endpoint:** `POST /api/v2/test/vtpass/data/query`

**Request Body:**
```json
{
  "request_id": "202503101430YUs83meikd"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/query \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "202503101430YUs83meikd"
  }'
```

---

## 🧪 Complete Testing Flow Examples

### Flow 1: Purchase MTN Data

**Step 1:** Get available MTN data plans
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=mtn"
```

**Step 2:** Purchase a data plan
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "mtn",
    "billersCode": "08011111111",
    "variation_code": "mtn-100mb-1000",
    "phone": "08011111111"
  }'
```

**Step 3:** Query transaction status (use requestId from Step 2)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/query \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "YOUR_REQUEST_ID_HERE"
  }'
```

### Flow 2: Purchase GLO Data

**Step 1:** Get available GLO data plans
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=glo"
```

**Step 2:** Purchase a data plan
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "glo",
    "billersCode": "08011111111",
    "variation_code": "glo1000",
    "phone": "08011111111"
  }'
```

### Flow 3: Purchase Airtel Data

**Step 1:** Get available Airtel data plans
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=airtel"
```

**Step 2:** Purchase a data plan
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "airtel",
    "billersCode": "08011111111",
    "variation_code": "airt-1000",
    "phone": "08011111111"
  }'
```

### Flow 4: Purchase Smile Data (Special Flow)

**Step 1:** Verify Smile email
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/verify-smile-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tester@sandbox.com"
  }'
```

**Step 2:** Get available Smile data plans
```bash
curl "http://localhost:5000/api/v2/test/vtpass/data/variations?provider=smile"
```

**Step 3:** Purchase a data plan (use AccountId from Step 1 as billersCode)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/data/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "smile",
    "billersCode": "08011111111",
    "variation_code": "516",
    "phone": "08011111111"
  }'
```

---

## 📝 Postman Collection

### Environment Variables
Create a Postman environment with:
- `base_url`: `http://localhost:5000/api/v2/test/vtpass/data`

### Collection Structure

1. **Get Test Info**
   - Method: `GET`
   - URL: `{{base_url}}/info`

2. **Get MTN Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=mtn`

3. **Get GLO Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=glo`

4. **Get Airtel Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=airtel`

5. **Get 9mobile Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=etisalat`

6. **Get GLO SME Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=glo-sme`

7. **Get Smile Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=smile`

8. **Verify Smile Email**
   - Method: `POST`
   - URL: `{{base_url}}/verify-smile-email`
   - Body:
     ```json
     {
       "email": "tester@sandbox.com"
     }
     ```

9. **Purchase MTN Data**
   - Method: `POST`
   - URL: `{{base_url}}/purchase`
   - Body:
     ```json
     {
       "provider": "mtn",
       "billersCode": "08011111111",
       "variation_code": "mtn-10mb-100",
       "phone": "08011111111"
     }
     ```

10. **Query Transaction**
    - Method: `POST`
    - URL: `{{base_url}}/query`
    - Body:
      ```json
      {
        "request_id": "{{requestId}}"
      }
      ```

---

## 🔗 Swagger Documentation

Once the server is running, visit:
```
http://localhost:5000/api-docs
```

Navigate to **"V2 - Test - VTpass Data"** section to see interactive API documentation.

---

## ⚠️ Important Notes

1. **Variation Codes:**
   - Always get variations first to see available plans
   - Use `variation_code` from variations response to purchase
   - Variation codes are provider-specific

2. **Phone Number Format:**
   - Must start with `0`
   - Must be exactly 11 digits
   - Format: `0XXXXXXXXXX`
   - Exception: Smile uses email for verification, then AccountId for purchase

3. **Smile Special Requirements:**
   - Must verify email first using `/verify-smile-email` endpoint
   - Use `AccountId` from verification response as `billersCode` when purchasing
   - Sandbox email: `tester@sandbox.com`

4. **Sandbox Test Numbers:**
   - `08011111111` - Success
   - `201000000000` - Pending
   - `500000000000` - Unexpected
   - `400000000000` - No Response
   - `300000000000` - Timeout

5. **Request ID Format:**
   - Must be 12+ characters
   - First 12 characters must be numeric (YYYYMMDDHHII format)
   - Uses Lagos timezone (GMT +1)
   - Example: `202503101430YUs83meikd`

6. **Response Codes:**
   - `000` - Success
   - Other codes indicate errors (check `response_description`)

---

## 🐛 Troubleshooting

### Error: "variation_code is required"
- Make sure you fetched variations first
- Use the exact `variation_code` from the variations response

### Error: "Invalid phone number format"
- Phone must start with `0` and be exactly 11 digits
- Exception: Smile uses email verification first

### Error: "VARIATION CODE DOES NOT EXIST"
- Verify the variation_code exists for the selected provider
- Get fresh variations and use correct code

### Smile: "Failed to verify email"
- Make sure email format is correct
- Use `tester@sandbox.com` for sandbox testing
- Check that you're using the correct serviceID

---

## 📞 Support

For VTpass API documentation:
- Sandbox: https://sandbox.vtpass.com
- Live: https://vtpass.com

For integration issues, check the server logs for detailed error messages.

