# PalmPay Checkout - Detailed Implementation Guide

## 📚 Official Documentation

**Checkout Instructions**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction)

**Main API Docs**: [https://docs.palmpay.com/#/](https://docs.palmpay.com/#/)

---

## 🎯 PalmPay Checkout for Wallet Top-up

### **Overview**

PalmPay Checkout is a hosted payment page that allows users to top up their wallets. The flow is:

1. **Create Payment Order** → Call PalmPay API
2. **Get Checkout URL** → Receive URL from PalmPay
3. **Redirect User** → Open checkout URL
4. **User Pays** → Complete payment on PalmPay
5. **Webhook Notification** → PalmPay notifies your backend
6. **Credit Wallet** → Update user balance

---

## 🔌 PalmPay API Endpoints

### **1. Create Payment Order (Pay-In)**

**📚 Official Documentation**: [Create Order](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order)

**Endpoint**: `/api/v2/payment/merchant/createorder`  
**Method**: `POST`  
**Base URL**: `https://open-gw-daily.palmpay-inc.com` (sandbox) or production URL  
**Purpose**: Create a payment order for wallet top-up

**Request Headers**:
```
Accept: application/json, text/plain, */*
CountryCode: NG
Authorization: Bearer <access_token>
Signature: <calculated_signature>
Content-Type: application/json
```

**Request Body**:
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

**Important Notes**:
- `amount` is in **cents** (2500000 = 25,000.00 NGN)
- Minimum amount: 100 cents (1 NGN)
- `orderId` must be unique (32 chars max)
- `orderExpireTime` in seconds (1800-86400, default 3600)
- `nonceStr` should be random string
- `requestTime` is timestamp in milliseconds

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

**Order Status Codes**:
- `1` = PENDING
- `2` = SUCCESS
- `3` = FAILED
- `4` = CANCELLED

### **2. Query Payment Status**

**📚 Official Documentation**: [Query Order Result](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result)

**Endpoint**: `/api/v2/payment/merchant/order/queryStatus`  
**Method**: `POST`  
**Base URL**: `https://open-gw-daily.palmpay-inc.com` (sandbox) or production URL  
**Purpose**: Check payment status without webhook

**Request Headers**:
```
Accept: application/json, text/plain, */*
CountryCode: NG
Authorization: Bearer <access_token>
Signature: <calculated_signature>
Content-Type: application/json
```

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

**Note**: Provide either `orderId` (merchant's order ID) or `orderNo` (PalmPay's order number)

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

### **3. Webhook Endpoint (Payment Result Notify)**

**📚 Official Documentation**: [Payment Result Notify](https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify)

**Your Endpoint**: `POST /api/v2/webhooks/palmpay`  
(This is the `notifyUrl` you provided when creating the order)

**PalmPay sends webhook when**:
- Payment is completed
- Payment fails
- Payment is cancelled
- Payment status changes

**Webhook Request** (POST to your notifyUrl):
```
Content-Type: application/json
```

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

**Important Notes**:
- `amount` is in **cents** (2500000 = 25,000.00 NGN)
- `orderStatus`: `1`=PENDING, `2`=SUCCESS, `3`=FAILED, `4`=CANCELLED
- `sign` is **URL encoded** - must decode with `URLDecoder.decode(sign, "UTF-8")` before verification
- `completeTime` is timestamp in milliseconds (only present when orderStatus = 2)

**Webhook Response** (CRITICAL):
You **MUST** return a plain string `success` (not JSON):
```
HTTP 200 OK
Content-Type: text/plain

success
```

**Retry Mechanism**:
- If you don't return "success", PalmPay will retry 8 times
- Retry intervals: 5s, 30s, 4m, 10m, 1h, 2h, 6h, 15h
- Always return "success" immediately after processing (even if processing fails internally)

---

## 🔐 Security Implementation

### **1. Webhook Signature Verification**

**Important**: The `sign` parameter in webhook is **URL encoded**. You must decode it first!

```typescript
import crypto from 'crypto';
import { URLDecoder } from 'url'; // or use decodeURIComponent

function verifyPalmPayWebhook(
  payload: Record<string, any>,
  signature: string,
  publicKey: string // PalmPay's public key for signature verification
): boolean {
  // Step 1: URL decode the signature
  const decodedSign = decodeURIComponent(signature);
  
  // Step 2: Build signature string from payload (excluding 'sign' field)
  // Format: key1=value1&key2=value2 (sorted by key, exclude null values)
  const signParams: string[] = [];
  Object.keys(payload)
    .filter(key => key !== 'sign' && payload[key] !== null && payload[key] !== undefined)
    .sort()
    .forEach(key => {
      signParams.push(`${key}=${payload[key]}`);
    });
  const signString = signParams.join('&');
  
  // Step 3: Verify signature using RSA public key (verify method with PalmPay docs)
  // Note: Check PalmPay docs for exact signature algorithm (RSA, HMAC, etc.)
  // This is a placeholder - verify with actual PalmPay signature method
  
  return true; // Placeholder
}
```

**Note**: Check PalmPay documentation for exact signature verification method (RSA public key, HMAC, etc.)

### **2. Idempotency**

Always check if transaction already processed:
```typescript
const existingTransaction = await prisma.fiatTransaction.findUnique({
  where: { palmpayPaymentId: orderId }
});

if (existingTransaction && existingTransaction.status === 'completed') {
  return; // Already processed
}
```

---

## 📱 Frontend Integration

### **Option 1: Webview (Recommended for Mobile)**

```typescript
// Open checkout URL in webview
const checkoutUrl = response.checkoutUrl;
// Use WebView component to open URL
// Listen for returnUrl redirect
```

### **Option 2: External Browser**

```typescript
// Open in external browser
window.open(checkoutUrl, '_blank');
// User returns via returnUrl
// Check payment status on return
```

### **Option 3: In-App Browser**

```typescript
// Use in-app browser component
// Better UX, can handle redirects
```

---

## 🔄 Complete Flow Diagram

```
┌─────────┐
│  User   │
└────┬────┘
     │ 1. Enters amount
     ▼
┌─────────────────┐
│  Frontend App   │
└────┬────────────┘
     │ 2. POST /api/v2/payments/palmpay/deposit/initiate
     ▼
┌─────────────────┐
│  Backend API    │
└────┬────────────┘
     │ 3. Create FiatTransaction
     │ 4. Call PalmPay API
     ▼
┌─────────────────┐
│   PalmPay API   │
└────┬────────────┘
     │ 5. Returns checkoutUrl
     ▼
┌─────────────────┐
│  Backend API    │
└────┬────────────┘
     │ 6. Returns checkoutUrl
     ▼
┌─────────────────┐
│  Frontend App   │
└────┬────────────┘
     │ 7. Opens checkoutUrl
     ▼
┌─────────────────┐
│ PalmPay Checkout│
└────┬────────────┘
     │ 8. User completes payment
     ▼
┌─────────────────┐
│   PalmPay API   │
└────┬────────────┘
     │ 9. Sends webhook
     ▼
┌─────────────────┐
│  Backend API    │
│  (Webhook)      │
└────┬────────────┘
     │ 10. Verifies signature
     │ 11. Credits wallet
     │ 12. Sends push notification
     ▼
┌─────────────────┐
│  Frontend App   │
│  (Poll/Push)    │
└────┬────────────┘
     │ 13. Shows success
     ▼
┌─────────┐
│  User   │
└─────────┘
```

---

## 📋 Implementation Checklist

### **Backend**
- [ ] Set up PalmPay API credentials
- [ ] Create `PalmPayConfig` model
- [ ] Implement `palmpay.checkout.service.ts` (create order, query status)
- [ ] Implement webhook handler with signature verification
- [ ] Create `fiat.wallet.service.ts` (credit/debit operations)
- [ ] Create deposit controller
- [ ] Add idempotency checks
- [ ] Implement error handling

### **Frontend**
- [ ] Integrate checkout URL opening
- [ ] Handle returnUrl redirects
- [ ] Implement status polling
- [ ] Handle push notifications
- [ ] Show success/error screens

### **Testing**
- [ ] Test in PalmPay sandbox
- [ ] Test webhook delivery
- [ ] Test signature verification
- [ ] Test idempotency
- [ ] Test error scenarios

---

## 🔧 Configuration

### **Environment Variables**

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

### **API Request Structure**

All PalmPay API requests require:
- `requestTime`: Current timestamp in milliseconds
- `version`: API version (e.g., "V1.1")
- `nonceStr`: Random string for each request
- `Signature`: Calculated signature (check PalmPay docs for signature algorithm)

---

## 📝 Important Notes

1. **Always verify webhook signatures** - Never process unsigned webhooks
2. **Implement idempotency** - Handle duplicate webhooks gracefully
3. **Use HTTPS** - All webhook URLs must use HTTPS
4. **Test thoroughly** - Use sandbox environment before production
5. **Monitor webhooks** - Set up logging and alerts for failed webhooks
6. **Handle timeouts** - Checkout URLs may expire, handle gracefully
7. **User experience** - Provide clear feedback during payment process

---

## 🔗 References

- **Create Order**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/create-order)
- **Query Order Result**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/query-order-result)
- **Payment Result Notify**: [https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify](https://docs.palmpay.com/#/en-us/pay-ins/common-apis/payment-result-notify)
- **Checkout Instructions**: [https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction](https://docs.palmpay.com/#/en-us/pay-ins/palmpay-checkout/instruction)
- **Main Documentation**: [https://docs.palmpay.com/#/](https://docs.palmpay.com/#/)
- **Checkout URL**: [https://checkout.palmpay.com/h5-checkout](https://checkout.palmpay.com/h5-checkout)

---

**Last Updated**: January 2025  
**Status**: 📋 Ready for Implementation (verify endpoints with official docs)

