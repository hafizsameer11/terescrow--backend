# PalmPay Signature Implementation

This document explains how PalmPay signature generation and verification is implemented in this codebase.

## Signature Algorithm

PalmPay uses **MD5 + SHA1WithRSA** for signing API requests and webhook verification.

### Process Overview

1. **Sort parameters** by ASCII order (key=value format)
2. **MD5 hash** the concatenated string and convert to uppercase
3. **Sign** the MD5 hash with SHA1WithRSA using merchant's private key (Base64)

---

## Request Signature Generation

### Step 1: Build Signature String

```typescript
// Filter non-empty parameters
const sortedKeys = Object.keys(params)
  .filter(key => {
    const value = params[key];
    return value !== null && value !== undefined && value !== '';
  })
  .sort(); // ASCII alphabetical order

// Build key=value string (trim values)
const signString = sortedKeys
  .map(key => {
    const value = String(params[key]).trim();
    return `${key}=${value}`;
  })
  .join('&');
```

**Example:**
```
Input params:
{
  requestTime: 1662171389940,
  version: "V1.1",
  nonceStr: "IBJGAeTa4ZJQv4Z2qufomVo9eI1YnJ9Y",
  amount: 200,
  orderId: "testc9ffae997fc4"
}

Output signString:
"amount=200&nonceStr=IBJGAeTa4ZJQv4Z2qufomVo9eI1YnJ9Y&orderId=testc9ffae997fc4&requestTime=1662171389940&version=V1.1"
```

### Step 2: MD5 Hash (Uppercase)

```typescript
const md5Str = crypto.createHash('md5')
  .update(signString, 'utf8')
  .digest('hex')
  .toUpperCase();
```

**Example:**
```
Input: "amount=200&nonceStr=IBJGAeTa4ZJQv4Z2qufomVo9eI1YnJ9Y&orderId=testc9ffae997fc4&requestTime=1662171389940&version=V1.1"
Output: "B43F98EC214118A136077FD49CD70804"
```

### Step 3: RSA Sign with SHA1

```typescript
const privateKey = palmpayConfig.getPrivateKey(); // Base64 encoded from .env

// Convert to PEM format if needed
let pemKey = privateKey;
if (!privateKey.includes('-----BEGIN')) {
  const cleanKey = privateKey.replace(/\s/g, '');
  const keyLines = cleanKey.match(/.{1,64}/g) || [];
  pemKey = `-----BEGIN RSA PRIVATE KEY-----\n${keyLines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
}

const signature = crypto
  .createSign('RSA-SHA1')
  .update(md5Str, 'utf8')
  .sign(pemKey, 'base64');
```

**Example:**
```
Input md5Str: "B43F98EC214118A136077FD49CD70804"
Output signature: "gqJkWR5SCvAdzu5ISXckYOXkttKb5LXarOItoSPSJizfS..."
```

---

## Webhook Signature Verification

### Process

1. **Extract signature** from webhook payload (URL decode it)
2. **Build signature string** (exclude 'sign' field, sort by ASCII order)
3. **MD5 hash** the string (uppercase)
4. **Verify** using PalmPay's public key with SHA1WithRSA

### Implementation

```typescript
// Step 1: Decode URL encoded signature
const decodedSign = decodeURIComponent(signature);

// Step 2: Build signature string (exclude 'sign' field)
const sortedKeys = Object.keys(payload)
  .filter(key => {
    if (key === 'sign') return false;
    const value = payload[key];
    return value !== null && value !== undefined && value !== '';
  })
  .sort();

const signString = sortedKeys
  .map(key => {
    const value = String(payload[key]).trim();
    return `${key}=${value}`;
  })
  .join('&');

// Step 3: MD5 hash (uppercase)
const md5Str = crypto.createHash('md5')
  .update(signString, 'utf8')
  .digest('hex')
  .toUpperCase();

// Step 4: Verify with PalmPay's public key
const verify = crypto.createVerify('RSA-SHA1');
verify.update(md5Str, 'utf8');
const isValid = verify.verify(pemPublicKey, decodedSign, 'base64');
```

---

## Key Format Handling

The implementation handles multiple key formats:

### Private Key (Merchant)

- **Base64 encoded** (provided by PalmPay)
- Automatically converted to PEM format if needed
- Supports both PKCS#1 and PKCS#8 formats

```env
PALMPAY_PRIVATE_KEY=your_base64_encoded_private_key
```

### Public Key (PalmPay)

- **Base64 encoded** (provided by PalmPay)
- Used for webhook signature verification
- Automatically converted to PEM format if needed
- Supports both PKCS#1 and PKCS#8 formats

```env
PALMPAY_PUBLIC_KEY=your_base64_encoded_public_key
```

---

## Usage in Code

### Generating Request Signature

```typescript
import { palmpayAuth } from './services/palmpay/palmpay.auth.service';

const params = {
  requestTime: Date.now(),
  version: 'V1.1',
  nonceStr: palmpayAuth.generateNonce(),
  amount: 20000,
  orderId: 'unique-order-id',
};

const signature = palmpayAuth.generateSignature(params);
```

### Verifying Webhook Signature

```typescript
import { palmpayAuth } from './services/palmpay/palmpay.auth.service';

const webhookData = req.body;
const signature = webhookData.sign;

const isValid = palmpayAuth.verifyWebhookSignature(webhookData, signature);
if (!isValid) {
  // Handle invalid signature
}
```

---

## Important Notes

1. **Parameter Sorting**: Must be sorted by ASCII order (lexicographic)
2. **Value Trimming**: Remove leading/trailing spaces from parameter values
3. **Empty Values**: Exclude null, undefined, and empty string values
4. **MD5 Uppercase**: MD5 hash must be converted to uppercase
5. **Base64 Encoding**: Signature is Base64 encoded
6. **URL Encoding**: Webhook signatures are URL encoded and must be decoded
7. **Key Format**: Keys are Base64 encoded but Node.js crypto expects PEM format

---

## Testing

To test signature generation:

```typescript
const testParams = {
  requestTime: 1662171389940,
  version: 'V1.1',
  nonceStr: 'IBJGAeTa4ZJQv4Z2qufomVo9eI1YnJ9Y',
  amount: 200,
  orderId: 'testc9ffae997fc4',
};

const signature = palmpayAuth.generateSignature(testParams);
console.log('Signature:', signature);
```

Expected signature string:
```
"amount=200&nonceStr=IBJGAeTa4ZJQv4Z2qufomVo9eI1YnJ9Y&orderId=testc9ffae997fc4&requestTime=1662171389940&version=V1.1"
```

---

## Troubleshooting

### Signature Verification Fails

1. **Check key format**: Ensure keys are Base64 encoded
2. **Check parameter order**: Must be ASCII sorted
3. **Check value trimming**: Remove spaces from values
4. **Check MD5 case**: Must be uppercase
5. **Check URL decoding**: Webhook signatures must be URL decoded

### Key Format Errors

If you get key format errors:
- Ensure `PALMPAY_PRIVATE_KEY` is Base64 encoded
- Ensure `PALMPAY_PUBLIC_KEY` is Base64 encoded
- The code automatically converts to PEM format

---

## References

- [PalmPay Signature Documentation](https://docs.palmpay.com/)
- Implementation: `src/services/palmpay/palmpay.auth.service.ts`
- Configuration: `src/services/palmpay/palmpay.config.ts`

