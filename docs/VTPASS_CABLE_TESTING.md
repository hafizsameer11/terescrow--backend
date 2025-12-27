# VTpass Cable TV Subscription - Testing Guide

## 🚀 Quick Start

### Base URL
```
http://localhost:5000/api/v2/test/vtpass/cable
```

### Environment Setup

Add these to your `.env` file (same as airtime/data):

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

**Endpoint:** `GET /api/v2/test/vtpass/cable/info`

**Example:**
```bash
curl http://localhost:5000/api/v2/test/vtpass/cable/info
```

---

### 2. **Get Service Variations (Bouquet Plans)**
Get available bouquet plans for a provider.

**Endpoint:** `GET /api/v2/test/vtpass/cable/variations?provider={provider}`

**Valid Providers:**
- `dstv` - DSTV
- `gotv` - GOTV
- `startimes` - Startimes
- `showmax` - Showmax

**Example Requests:**

**DSTV:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/cable/variations?provider=dstv"
```

**GOTV:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/cable/variations?provider=gotv"
```

**Startimes:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/cable/variations?provider=startimes"
```

**Showmax:**
```bash
curl "http://localhost:5000/api/v2/test/vtpass/cable/variations?provider=showmax"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "provider": "DSTV",
    "serviceID": "dstv",
    "serviceName": "DSTV Subscription",
    "variationsCount": 80,
    "variations": [
      {
        "variation_code": "dstv-padi",
        "name": "DStv Padi N1,850",
        "variation_amount": "1850.00",
        "fixedPrice": "Yes"
      }
      // ... more bouquets
    ]
  }
}
```

---

### 3. **Verify Smartcard Number (DSTV, GOTV, Startimes)**
Verify smartcard number before purchasing.

**Endpoint:** `POST /api/v2/test/vtpass/cable/verify-smartcard`

**Request Body:**
```json
{
  "provider": "dstv",
  "smartcardNumber": "1212121212"
}
```

**Sandbox Smartcard:** `1212121212`

**Example:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/verify-smartcard \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dstv",
    "smartcardNumber": "1212121212"
  }'
```

**Response (DSTV/GOTV):**
```json
{
  "status": "success",
  "data": {
    "success": true,
    "code": "000",
    "provider": "DSTV",
    "customerName": "TEST METER",
    "status": "ACTIVE",
    "dueDate": "2025-02-06T00:00:00",
    "customerNumber": "8061522780",
    "customerType": "DSTV",
    "currentBouquet": null,
    "renewalAmount": "1850.00"
  }
}
```

**Response (Startimes):**
```json
{
  "status": "success",
  "data": {
    "success": true,
    "code": "000",
    "provider": "STARTIMES",
    "customerName": "TestMan Decoder",
    "balance": 54.82,
    "smartcardNumber": "1212121212",
    "wrongBillersCode": false
  }
}
```

---

### 4. **Purchase/Change Bouquet (DSTV, GOTV)**
Change or purchase a new bouquet.

**Endpoint:** `POST /api/v2/test/vtpass/cable/purchase-change`

**Request Body:**
```json
{
  "provider": "dstv",
  "smartcardNumber": "1212121212",
  "variation_code": "dstv-padi",
  "phone": "08011111111",
  "amount": 1850,
  "quantity": 1,
  "request_id": "optional_custom_request_id"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase-change \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dstv",
    "smartcardNumber": "1212121212",
    "variation_code": "dstv-padi",
    "phone": "08011111111"
  }'
```

---

### 5. **Renew Bouquet (DSTV, GOTV)**
Renew the current bouquet.

**Endpoint:** `POST /api/v2/test/vtpass/cable/purchase-renew`

**Request Body:**
```json
{
  "provider": "dstv",
  "smartcardNumber": "1212121212",
  "amount": 1850,
  "phone": "08011111111",
  "request_id": "optional_custom_request_id"
}
```

**Note:** Use `Renewal_Amount` from verify smartcard response (may have discount).

**Example:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase-renew \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dstv",
    "smartcardNumber": "1212121212",
    "amount": 1850,
    "phone": "08011111111"
  }'
```

---

### 6. **Purchase Subscription (Startimes, Showmax)**
Purchase subscription for Startimes or Showmax.

**Endpoint:** `POST /api/v2/test/vtpass/cable/purchase`

**Request Body:**
```json
{
  "provider": "startimes",
  "billersCode": "1212121212",
  "variation_code": "nova",
  "phone": "08011111111",
  "amount": 900,
  "request_id": "optional_custom_request_id"
}
```

**Example - Startimes:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "startimes",
    "billersCode": "1212121212",
    "variation_code": "nova",
    "phone": "08011111111"
  }'
```

**Example - Showmax:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "showmax",
    "billersCode": "08011111111",
    "variation_code": "full_3",
    "phone": "08011111111"
  }'
```

**Note:** For Showmax, `billersCode` is the phone number.

---

### 7. **Query Transaction Status**
Query the status of a transaction.

**Endpoint:** `POST /api/v2/test/vtpass/cable/query`

**Request Body:**
```json
{
  "request_id": "202503101430YUs83meikd"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/query \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "202503101430YUs83meikd"
  }'
```

---

## 🧪 Complete Testing Flow Examples

### Flow 1: DSTV - Change Bouquet

**Step 1:** Get available DSTV bouquets
```bash
curl "http://localhost:5000/api/v2/test/vtpass/cable/variations?provider=dstv"
```

**Step 2:** Verify smartcard (optional but recommended)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/verify-smartcard \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dstv",
    "smartcardNumber": "1212121212"
  }'
```

**Step 3:** Purchase/Change bouquet
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase-change \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dstv",
    "smartcardNumber": "1212121212",
    "variation_code": "dstv-padi",
    "phone": "08011111111"
  }'
```

### Flow 2: DSTV - Renew Bouquet

**Step 1:** Verify smartcard to get renewal amount
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/verify-smartcard \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dstv",
    "smartcardNumber": "1212121212"
  }'
```

**Step 2:** Renew using renewal amount from Step 1
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase-renew \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dstv",
    "smartcardNumber": "1212121212",
    "amount": 1850,
    "phone": "08011111111"
  }'
```

### Flow 3: GOTV - Change Bouquet

**Step 1:** Get available GOTV bouquets
```bash
curl "http://localhost:5000/api/v2/test/vtpass/cable/variations?provider=gotv"
```

**Step 2:** Purchase/Change bouquet
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase-change \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gotv",
    "smartcardNumber": "1212121212",
    "variation_code": "gotv-lite",
    "phone": "08011111111"
  }'
```

### Flow 4: Startimes - Purchase

**Step 1:** Get available Startimes bouquets
```bash
curl "http://localhost:5000/api/v2/test/vtpass/cable/variations?provider=startimes"
```

**Step 2:** Verify smartcard (optional)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/verify-smartcard \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "startimes",
    "smartcardNumber": "1212121212"
  }'
```

**Step 3:** Purchase subscription
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "startimes",
    "billersCode": "1212121212",
    "variation_code": "nova",
    "phone": "08011111111"
  }'
```

### Flow 5: Showmax - Purchase

**Step 1:** Get available Showmax plans
```bash
curl "http://localhost:5000/api/v2/test/vtpass/cable/variations?provider=showmax"
```

**Step 2:** Purchase subscription (no verification needed)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/cable/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "showmax",
    "billersCode": "08011111111",
    "variation_code": "full_3",
    "phone": "08011111111"
  }'
```

---

## 📝 Postman Collection

### Environment Variables
Create a Postman environment with:
- `base_url`: `http://localhost:5000/api/v2/test/vtpass/cable`

### Collection Structure

1. **Get Test Info**
   - Method: `GET`
   - URL: `{{base_url}}/info`

2. **Get DSTV Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=dstv`

3. **Get GOTV Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=gotv`

4. **Get Startimes Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=startimes`

5. **Get Showmax Variations**
   - Method: `GET`
   - URL: `{{base_url}}/variations?provider=showmax`

6. **Verify DSTV Smartcard**
   - Method: `POST`
   - URL: `{{base_url}}/verify-smartcard`
   - Body:
     ```json
     {
       "provider": "dstv",
       "smartcardNumber": "1212121212"
     }
     ```

7. **Purchase DSTV Change Bouquet**
   - Method: `POST`
   - URL: `{{base_url}}/purchase-change`
   - Body:
     ```json
     {
       "provider": "dstv",
       "smartcardNumber": "1212121212",
       "variation_code": "dstv-padi",
       "phone": "08011111111"
     }
     ```

8. **Purchase DSTV Renew Bouquet**
   - Method: `POST`
   - URL: `{{base_url}}/purchase-renew`
   - Body:
     ```json
     {
       "provider": "dstv",
       "smartcardNumber": "1212121212",
       "amount": 1850,
       "phone": "08011111111"
     }
     ```

9. **Purchase Startimes**
   - Method: `POST`
   - URL: `{{base_url}}/purchase`
   - Body:
     ```json
     {
       "provider": "startimes",
       "billersCode": "1212121212",
       "variation_code": "nova",
       "phone": "08011111111"
     }
     ```

10. **Purchase Showmax**
    - Method: `POST`
    - URL: `{{base_url}}/purchase`
    - Body:
      ```json
      {
        "provider": "showmax",
        "billersCode": "08011111111",
        "variation_code": "full_3",
        "phone": "08011111111"
      }
      ```

11. **Query Transaction**
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

Navigate to **"V2 - Test - VTpass Cable TV"** section to see interactive API documentation.

---

## ⚠️ Important Notes

1. **Provider Differences:**

   **DSTV & GOTV:**
   - Support both "change" and "renew" subscription types
   - Require smartcard verification before purchase
   - Use `Renewal_Amount` from verify response for renew
   - Use `variation_code` for change bouquet

   **Startimes:**
   - Only supports purchase (no separate change/renew)
   - Requires smartcard verification
   - Uses `variation_code` for purchase

   **Showmax:**
   - Only supports purchase
   - Does NOT require verification
   - Uses phone number as `billersCode`
   - Uses `variation_code` for purchase

2. **Smartcard Number Format:**
   - Usually 10-12 digits
   - Sandbox: `1212121212`
   - No specific format requirement (provider-specific)

3. **Phone Number Format:**
   - Must start with `0`
   - Must be exactly 11 digits
   - Format: `0XXXXXXXXXX`

4. **Sandbox Test Numbers:**
   - Smartcard: `1212121212` - Success
   - `201000000000` - Pending
   - `500000000000` - Unexpected
   - `400000000000` - No Response
   - `300000000000` - Timeout

5. **Request ID Format:**
   - Must be 12+ characters
   - First 12 characters must be numeric (YYYYMMDDHHII format)
   - Uses Lagos timezone (GMT +1)
   - Example: `202503101430YUs83meikd`

6. **Showmax Response:**
   - Includes `purchased_code` and `Voucher` array
   - These are activation codes for Showmax subscription

---

## 🐛 Troubleshooting

### Error: "variation_code is required"
- Make sure you fetched variations first
- Use the exact `variation_code` from the variations response

### Error: "Invalid phone number format"
- Phone must start with `0` and be exactly 11 digits

### Error: "Renewal_Amount not found"
- Make sure you verified the smartcard first
- For renew, use the `Renewal_Amount` from verify response

### DSTV/GOTV: "subscription_type must be 'change' or 'renew'"
- Use `/purchase-change` endpoint for change bouquet
- Use `/purchase-renew` endpoint for renew bouquet

### Showmax: "Failed to purchase"
- Make sure `billersCode` is the phone number (not smartcard)
- Phone number must be 11 digits starting with 0

---

## 📞 Support

For VTpass API documentation:
- Sandbox: https://sandbox.vtpass.com
- Live: https://vtpass.com

For integration issues, check the server logs for detailed error messages.

