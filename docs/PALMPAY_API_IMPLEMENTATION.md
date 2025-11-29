# PalmPay API Implementation - Complete Guide

## 📚 Official Documentation Links

- **Create Order**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order)
- **Query Order Result**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result)
- **Payment Result Notify**: [https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify](https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify)

---

## 🔌 API Endpoints

### **1. Create Order**

**Endpoint**: `/api/v2/payment/merchant/createorder`  
**Method**: `POST`  
**Base URL**: 
- Sandbox: `https://open-gw-daily.palmpay-inc.com`
- Production: `https://open-gw.palmpay-inc.com`

**Request Headers**:
```
Accept: application/json, text/plain, */*
CountryCode: NG
Authorization: Bearer <access_token>
Signature: <calculated_signature>
Content-Type: application/json
```

**Request Body Parameters**:

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| requestTime | Long | Yes | Timestamp in milliseconds | 1662171389940 |
| version | String | Yes | API version | "V1.1" |
| nonceStr | String | Yes | Random string (32 chars) | "IBJGAeTa4ZJQv4Z2qufomVo9eI1YnJ9Y" |
| orderId | String(32) | Yes | Unique merchant order ID | "tx_789_1234567890" |
| title | String(100) | No | Order title | "Wallet Top-up" |
| description | String(200) | No | Order description | "Deposit to NGN wallet" |
| amount | Long | Yes | Amount in **cents** (100 = 1 NGN) | 2500000 (means 25,000.00 NGN) |
| currency | String(10) | Yes | Currency code | "NGN", "GHS", "TZS", "KES", "ZAR" |
| notifyUrl | String(200) | Yes | Webhook callback URL | "https://api.terescrow.com/api/v2/webhooks/palmpay" |
| callBackUrl | String(200) | Yes | Return URL after payment | "https://app.terescrow.com/deposit/success" |
| orderExpireTime | Integer | No | Order expiry in seconds (1800-86400) | 3600 (default) |
| goodsDetails | String | Yes/No | JSONArray string (required for global merchants) | "[{\"goodsId\": \"1\"}]" |
| customerInfo | String | No | JSON string with customer info | "{\"userId\":\"123\",\"userName\":\"John\",\"phone\":\"08123456789\",\"email\":\"user@example.com\"}" |
| remark | String(200) | No | Remarks | "Wallet top-up transaction" |
| splitDetail | String | No | JSON string for split payments | See PalmPay docs |

**Request Example**:
```json
{
  "requestTime": 1662171389940,
  "version": "V1.1",
  "nonceStr": "IBJGAeTa4ZJQv4Z2qufomVo9eI1YnJ9Y",
  "orderId": "tx_789_1234567890",
  "title": "Wallet Top-up",
  "description": "Deposit to NGN wallet",
  "amount": 2500000,
  "currency": "NGN",
  "notifyUrl": "https://api.terescrow.com/api/v2/webhooks/palmpay",
  "callBackUrl": "https://app.terescrow.com/deposit/success",
  "orderExpireTime": 3600,
  "customerInfo": "{\"userId\":\"123\",\"userName\":\"John Doe\",\"phone\":\"08123456789\",\"email\":\"user@example.com\"}",
  "remark": "Wallet top-up transaction"
}
```

**Response Structure**:
```json
{
  "respCode": "00000000",
  "respMsg": "success",
  "data": {
    "orderNo": "2424220903032435363613",
    "orderStatus": 1,
    "message": "success",
    "checkoutUrl": "https://openapi.transspay.net/open-api/api/v1/payment/h5/redirect?orderNo=...",
    "payToken": "eyJvcmRlck5vIjoi...",
    "sdkSessionId": "3032435363613",
    "sdkSignKey": "110",
    "orderAmount": 2500000,
    "currency": "NGN"
  }
}
```

**Response Fields**:
- `respCode`: "00000000" = success, other codes = error
- `orderNo`: PalmPay's order number (store this!)
- `orderStatus`: 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
- `checkoutUrl`: URL to redirect user for payment
- `payToken`: Token for SDK payment (if using SDK)
- `orderAmount`: Amount in cents

---

### **2. Query Order Status**

**Endpoint**: `/api/v2/payment/merchant/order/queryStatus`  
**Method**: `POST`  
**Base URL**: Same as Create Order

**Request Headers**: Same as Create Order

**Request Body**:
```json
{
  "requestTime": 1662171389940,
  "version": "V1.1",
  "nonceStr": "IBJGAeTa4ZJQv4Z2qufomVo9eI1YnJ9Y",
  "orderId": "tx_789_1234567890",
  "orderNo": "2424220903032435363613"
}
```

**Note**: Provide either `orderId` (your order ID) or `orderNo` (PalmPay's order number)

**Response Structure**:
```json
{
  "respCode": "00000000",
  "respMsg": "success",
  "data": {
    "orderId": "tx_789_1234567890",
    "orderNo": "2424220903032435363613",
    "merchantId": "CH1913953825",
    "currency": "NGN",
    "amount": 2500000,
    "orderStatus": 2,
    "payMethod": "pay_wallet",
    "productType": "pay_wallet",
    "remark": "Wallet top-up transaction",
    "errorMsg": null,
    "createdTime": 1662171389940,
    "completedTime": 1662171450000,
    "payerBankName": null,
    "payerAccountName": null,
    "payerVirtualAccNo": null
  }
}
```

**Order Status Codes**:
- `1` = PENDING
- `2` = SUCCESS
- `3` = FAILED
- `4` = CANCELLED

**Payment Methods**:
- `pay_wallet` = PalmPay wallet
- `bank_transfer` = Bank transfer
- `mmo` = Mobile money

---

### **3. Payment Result Notify (Webhook)**

**Your Endpoint**: `POST /api/v2/webhooks/palmpay`  
(This is the `notifyUrl` you provided when creating the order)

**Webhook Payload**:
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

**Critical Webhook Response**:
You **MUST** return plain text `success` (not JSON):
```
HTTP 200 OK
Content-Type: text/plain

success
```

**Retry Mechanism**:
- If response is not "success", PalmPay retries 8 times
- Retry intervals: 5s, 30s, 4m, 10m, 1h, 2h, 6h, 15h
- Always return "success" immediately after receiving webhook

**Signature Verification**:
- `sign` parameter is **URL encoded**
- Must decode: `decodeURIComponent(sign)`
- Verify signature using PalmPay's public key
- Check PalmPay docs for exact signature algorithm

---

## 🔐 Authentication & Signature

### **Request Signature**

All requests require a `Signature` header. Check PalmPay documentation for:
- Signature algorithm (RSA, HMAC, etc.)
- Which parameters to include in signature
- How to calculate signature

### **Headers Required**

```
Accept: application/json, text/plain, */*
CountryCode: NG  (or GHS, TZS, KES, ZAR)
Authorization: Bearer <access_token>
Signature: <calculated_signature>
Content-Type: application/json
```

---

## 💰 Amount Handling

**CRITICAL**: PalmPay uses **cents** as the unit:
- 100 cents = 1 NGN
- 2500000 cents = 25,000.00 NGN
- Minimum: 100 cents (1 NGN)

**Conversion**:
```typescript
// Convert NGN to cents
const ngnAmount = 25000.00;
const centsAmount = Math.round(ngnAmount * 100); // 2500000

// Convert cents to NGN
const cents = 2500000;
const ngnAmount = cents / 100; // 25000.00
```

---

## 🔄 Complete Implementation Flow

### **Deposit Flow**

```
1. User enters amount (e.g., 25,000 NGN)
   ↓
2. Backend converts to cents (2,500,000)
   ↓
3. Generate unique orderId
   ↓
4. Call Create Order API
   POST /api/v2/payment/merchant/createorder
   ↓
5. Receive checkoutUrl from PalmPay
   ↓
6. Return checkoutUrl to frontend
   ↓
7. Frontend opens checkoutUrl
   ↓
8. User completes payment on PalmPay
   ↓
9. PalmPay sends webhook to notifyUrl
   POST /api/v2/webhooks/palmpay
   ↓
10. Backend:
    - Decode and verify signature
    - Check orderStatus (2 = SUCCESS)
    - Credit wallet (convert cents to NGN)
    - Return "success" to PalmPay
   ↓
11. Frontend polls or receives push notification
   ↓
12. Show success screen
```

---

## 📋 Implementation Checklist

### **Service Layer**
- [ ] Create `palmpay.config.ts` (API configuration)
- [ ] Create `palmpay.auth.service.ts` (signature generation)
- [ ] Create `palmpay.checkout.service.ts` (create order, query status)
- [ ] Create `palmpay.webhook.service.ts` (webhook verification)

### **Controllers**
- [ ] Create `palmpay.deposit.controller.ts` (initiate deposit)
- [ ] Create `palmpay.webhook.controller.ts` (handle webhook)

### **Utilities**
- [ ] Amount conversion (NGN ↔ cents)
- [ ] Signature generation
- [ ] Signature verification
- [ ] Nonce generation

### **Database**
- [ ] Store `orderNo` (PalmPay's order number)
- [ ] Store `orderId` (your order ID)
- [ ] Track order status
- [ ] Handle idempotency

---

## 🚨 Important Notes

1. **Amount is in cents** - Always convert NGN to cents before sending
2. **Webhook response must be "success"** - Plain text, not JSON
3. **Signature is URL encoded** - Decode before verification
4. **Always verify webhook signature** - Never trust unsigned webhooks
5. **Implement idempotency** - Handle duplicate webhooks
6. **Return "success" immediately** - Process asynchronously if needed
7. **Store orderNo** - Use it for querying status

---

## 🔗 References

- **Create Order**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order)
- **Query Order Result**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result)
- **Payment Result Notify**: [https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify](https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify)

---

**Last Updated**: January 2025  
**Status**: 📋 Ready for Implementation

