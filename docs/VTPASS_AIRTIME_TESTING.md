# VTpass Airtime Integration - Testing Guide

## 🚀 Quick Start

### Base URL
```
http://localhost:5000/api/v2/test/vtpass
```

### Environment Setup

Add these to your `.env` file:

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

**Endpoint:** `GET /api/v2/test/vtpass/info`

**No authentication required**

**Example:**
```bash
curl http://localhost:5000/api/v2/test/vtpass/info
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "providers": [
      { "id": "mtn", "name": "MTN", "serviceID": "mtn" },
      { "id": "glo", "name": "GLO", "serviceID": "glo" },
      { "id": "airtel", "name": "Airtel", "serviceID": "airtel" },
      { "id": "etisalat", "name": "9mobile", "serviceID": "etisalat" }
    ],
    "testScenarios": [...],
    "endpoints": {...}
  }
}
```

---

### 2. **Generate Request ID**
Generate a valid VTpass request_id for live API key requests.

**Endpoint:** `GET /api/v2/test/vtpass/generate-request-id`

**Example:**
```bash
curl http://localhost:5000/api/v2/test/vtpass/generate-request-id
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "requestId": "202503101430YUs83meikd",
    "breakdown": {
      "dateTimePart": "202503101430",
      "suffixPart": "YUs83meikd",
      "dateTime": {
        "formatted": "2025-03-10 14:30 (Lagos Time)"
      }
    }
  }
}
```

**⚠️ Important:** Use this `requestId` when requesting live API keys from VTpass.

---

### 3. **Purchase Airtime**
Purchase airtime for any provider (MTN, GLO, Airtel, 9mobile).

**Endpoint:** `POST /api/v2/test/vtpass/purchase`

**Request Body:**
```json
{
  "provider": "mtn",
  "phone": "08011111111",
  "amount": 100,
  "request_id": "optional_custom_request_id"
}
```

**Valid Providers:**
- `mtn` - MTN Nigeria
- `glo` - GLO Mobile
- `airtel` - Airtel Nigeria
- `etisalat` - 9mobile (formerly Etisalat)

**Phone Number:**
- Must be 11 digits
- Must start with `0`
- Format: `0XXXXXXXXXX`

**Amount:**
- Minimum: 50 NGN
- Must be a number

**Example Requests:**

**MTN:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "mtn",
    "phone": "08011111111",
    "amount": 100
  }'
```

**GLO:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "glo",
    "phone": "08011111111",
    "amount": 150
  }'
```

**Airtel:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "airtel",
    "phone": "08011111111",
    "amount": 100
  }'
```

**9mobile:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "etisalat",
    "phone": "08011111111",
    "amount": 150
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
      "transactionId": "17415980564672211596777904",
      "status": "delivered",
      "amount": 100,
      "phone": "08011111111",
      "productName": "MTN Airtime VTU",
      "commission": 0.7,
      "totalAmount": 99.3
    },
    "fullResponse": {...}
  }
}
```

---

### 4. **Query Transaction Status**
Query the status of a transaction using the request_id.

**Endpoint:** `POST /api/v2/test/vtpass/query`

**Request Body:**
```json
{
  "request_id": "202503101430YUs83meikd"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/query \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "202503101430YUs83meikd"
  }'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "success": true,
    "code": "000",
    "message": "TRANSACTION SUCCESSFUL",
    "transaction": {
      "requestId": "202503101430YUs83meikd",
      "transactionId": "17415980564672211596777904",
      "status": "delivered",
      "amount": 100,
      "phone": "08011111111"
    }
  }
}
```

---

### 5. **Test Sandbox Scenarios**
Test different sandbox scenarios provided by VTpass.

**Endpoint:** `POST /api/v2/test/vtpass/test-scenarios`

**Request Body:**
```json
{
  "scenario": "success",
  "provider": "mtn"
}
```

**Available Scenarios:**
- `success` - Phone: `08011111111` - Returns successful response
- `pending` - Phone: `201000000000` - Simulates pending response
- `unexpected` - Phone: `500000000000` - Simulates unexpected response
- `noResponse` - Phone: `400000000000` - Simulates no response
- `timeout` - Phone: `300000000000` - Simulates timeout

**Valid Providers (optional, defaults to MTN):**
- `mtn`, `glo`, `airtel`, `etisalat`

**Example:**
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/test-scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "success",
    "provider": "glo"
  }'
```

---

## 🧪 Testing Examples

### Test 1: Purchase MTN Airtime (Success)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "mtn",
    "phone": "08011111111",
    "amount": 100
  }'
```

### Test 2: Purchase GLO Airtime (Success)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "glo",
    "phone": "08011111111",
    "amount": 150
  }'
```

### Test 3: Purchase Airtel Airtime (Success)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "airtel",
    "phone": "08011111111",
    "amount": 100
  }'
```

### Test 4: Purchase 9mobile Airtime (Success)
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "etisalat",
    "phone": "08011111111",
    "amount": 150
  }'
```

### Test 5: Query Transaction Status
```bash
# First, make a purchase and copy the requestId from response
# Then query it:
curl -X POST http://localhost:5000/api/v2/test/vtpass/query \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "YOUR_REQUEST_ID_HERE"
  }'
```

### Test 6: Test Pending Scenario
```bash
curl -X POST http://localhost:5000/api/v2/test/vtpass/test-scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "pending",
    "provider": "mtn"
  }'
```

---

## 📝 Postman Collection

### Environment Variables
Create a Postman environment with:
- `base_url`: `http://localhost:5000/api/v2/test/vtpass`

### Collection Structure

1. **Get Test Info**
   - Method: `GET`
   - URL: `{{base_url}}/info`

2. **Generate Request ID**
   - Method: `GET`
   - URL: `{{base_url}}/generate-request-id`

3. **Purchase MTN Airtime**
   - Method: `POST`
   - URL: `{{base_url}}/purchase`
   - Body:
     ```json
     {
       "provider": "mtn",
       "phone": "08011111111",
       "amount": 100
     }
     ```

4. **Purchase GLO Airtime**
   - Method: `POST`
   - URL: `{{base_url}}/purchase`
   - Body:
     ```json
     {
       "provider": "glo",
       "phone": "08011111111",
       "amount": 150
     }
     ```

5. **Purchase Airtel Airtime**
   - Method: `POST`
   - URL: `{{base_url}}/purchase`
   - Body:
     ```json
     {
       "provider": "airtel",
       "phone": "08011111111",
       "amount": 100
     }
     ```

6. **Purchase 9mobile Airtime**
   - Method: `POST`
   - URL: `{{base_url}}/purchase`
   - Body:
     ```json
     {
       "provider": "etisalat",
       "phone": "08011111111",
       "amount": 150
     }
     ```

7. **Query Transaction**
   - Method: `POST`
   - URL: `{{base_url}}/query`
   - Body:
     ```json
     {
       "request_id": "{{requestId}}"
     }
     ```

8. **Test Success Scenario**
   - Method: `POST`
   - URL: `{{base_url}}/test-scenarios`
   - Body:
     ```json
     {
       "scenario": "success",
       "provider": "mtn"
     }
     ```

---

## 🔗 Swagger Documentation

Once the server is running, visit:
```
http://localhost:5000/api-docs
```

Navigate to **"V2 - Test - VTpass"** section to see interactive API documentation.

---

## ⚠️ Important Notes

1. **Request ID Format:**
   - Must be 12+ characters
   - First 12 characters must be numeric (YYYYMMDDHHII format)
   - Uses Lagos timezone (GMT +1)
   - Example: `202503101430YUs83meikd`

2. **Phone Number Format:**
   - Must start with `0`
   - Must be exactly 11 digits
   - Format: `0XXXXXXXXXX`

3. **Minimum Amount:**
   - 50 NGN minimum for all providers

4. **Sandbox Test Numbers:**
   - `08011111111` - Success
   - `201000000000` - Pending
   - `500000000000` - Unexpected
   - `400000000000` - No Response
   - `300000000000` - Timeout

5. **Response Codes:**
   - `000` - Success
   - Other codes indicate errors (check `response_description`)

---

## 🐛 Troubleshooting

### Error: "VTPASS_API_KEY is required"
- Make sure `VTPASS_API_KEY` is set in your `.env` file

### Error: "VTPASS_PUBLIC_KEY is required"
- Make sure `VTPASS_PUBLIC_KEY` is set in your `.env` file

### Error: "Invalid phone number format"
- Phone must start with `0` and be exactly 11 digits
- Example: `08011111111`

### Error: "Minimum amount is 50 NGN"
- Amount must be at least 50

### Transaction Status: "pending"
- This is normal for sandbox testing
- Use the query endpoint to check status later

---

## 📞 Support

For VTpass API documentation:
- Sandbox: https://sandbox.vtpass.com
- Live: https://vtpass.com

For integration issues, check the server logs for detailed error messages.

