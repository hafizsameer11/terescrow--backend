# PalmPay — **complete** exact code & database (verbatim from this repo)

This document is the **full** integration pack: config, auth, signature, banks, wallet ledger, deposit, withdrawal, bill payments (full controller), webhooks, routes, and Prisma models.

**Mirror folder:** `docs/palmpay-exact-source/` — same files as `.ts` for direct copy.

### Table of contents

1. PalmPay bill scene codes & DB mapping
2. Prisma models
3. palmpay.config.ts
4. palmpay.auth.service.ts
5. palmpay.logger.ts
6. palmpay.checkout.service.ts
7. palmpay.payout.service.ts
8. palmpay.banks.service.ts
9. fiat.wallet.service.ts
10. palmpay.types (lines 1–356)
11. palmpay.deposit.controller.ts
12. palmpay.payout.controller.ts
13. palmpay.billpayment.service.ts
14. billpayment.controller.ts (full)
15. palmpay.webhook.controller.ts
16. Route files
17. External dependencies

---

## 1) PalmPay bill payment — API scene codes & DB meaning

| Item | Value |
|------|-------|
| PalmPay Biller API sceneCode | airtime, data, betting |
| BillPayment.sceneCode | Same as request |
| BillPayment.billType | sceneCode.toUpperCase() |
| Merchant order | outOrderNo stored as palmpayOrderId |
| PalmPay orderNo | palmpayOrderNo |
| Bill notify URL | PALMPAY_WEBHOOK_URL/bill-payment |
| App note | airtime is routed to Reloadly in createBillOrderController; PalmPay used for data/betting when provider=palmpay |

---

## 2) Prisma — FiatWallet, FiatTransaction, BillPayment, PalmPayUserVirtualAccount

```prisma
model FiatWallet {
  id           String            @id @default(uuid())
  userId       Int
  currency     String            @db.VarChar(10)
  balance      Decimal           @default(0.00) @db.Decimal(15, 2)
  isPrimary    Boolean           @default(false)
  status       String            @default("active")
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  transactions         FiatTransaction[]
  billPayments         BillPayment[]
  referralWithdrawals  ReferralWithdrawal[]
  user                 User              @relation(fields: [userId], references: [id])

  @@unique([userId, currency])
  @@index([userId])
  @@index([currency])
}

model FiatTransaction {
  id               String       @id @default(uuid())
  userId           Int
  walletId         String
  type             String
  status           String       @default("pending")
  currency         String       @db.VarChar(10)
  amount           Decimal      @db.Decimal(15, 2)
  fees             Decimal      @default(0.00) @db.Decimal(15, 2)
  totalAmount      Decimal      @db.Decimal(15, 2)
  balanceBefore    Decimal?     @db.Decimal(15, 2)
  balanceAfter     Decimal?     @db.Decimal(15, 2)
  palmpayOrderId   String?
  palmpayOrderNo   String?      @unique
  palmpayStatus    String?
  palmpaySessionId String?
  checkoutUrl      String?      @db.Text
  redirectUrl      String?      @db.Text
  payeeName        String?      @db.VarChar(200)
  payeeBankCode    String?      @db.VarChar(50)
  payeeBankAccNo   String?      @db.VarChar(50)
  payeePhoneNo     String?      @db.VarChar(50)
  billType         String?
  billProvider     String?
  billAccount      String?
  billAmount       Decimal?     @db.Decimal(15, 2)
  billReference    String?
  description      String?      @db.VarChar(500)
  metadata         String?      @db.LongText
  errorMessage     String?      @db.Text
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  completedAt      DateTime?
  user             User         @relation(fields: [userId], references: [id])
  wallet           FiatWallet   @relation(fields: [walletId], references: [id])
  billPayment      BillPayment?

  @@index([userId])
  @@index([walletId])
  @@index([palmpayOrderNo])
  @@index([palmpayOrderId])
  @@index([status])
  @@index([type])
  @@index([createdAt])
}

model BillPayment {
  id               String          @id @default(uuid())
  userId           Int
  walletId         String
  transactionId    String          @unique
  provider         String          @default("palmpay") @db.VarChar(20) // "palmpay" or "vtpass"
  sceneCode        String          @db.VarChar(20)
  billType         String          @db.VarChar(50)
  billerId         String          @db.VarChar(100)
  billerName       String?         @db.VarChar(200)
  itemId           String          @db.VarChar(100)
  itemName         String?         @db.VarChar(200)
  rechargeAccount  String          @db.VarChar(50)
  amount           Decimal         @db.Decimal(15, 2)
  currency         String          @default("NGN") @db.VarChar(10)
  status           String          @default("pending")
  palmpayOrderId   String?         @unique // Also used for VTpass request_id
  palmpayOrderNo   String?         @unique // Also used for VTpass transactionId
  palmpayStatus    String?         // Also used for VTpass status (delivered, pending, failed)
  billReference    String?         @db.VarChar(200)
  providerResponse String?         @db.LongText
  errorMessage     String?         @db.Text
  retryCount       Int             @default(0)
  refunded         Boolean         @default(false) // Idempotency flag to prevent double refunds
  refundedAt       DateTime?
  refundReason     String?
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  completedAt      DateTime?
  user             User            @relation(fields: [userId], references: [id])
  wallet           FiatWallet      @relation(fields: [walletId], references: [id])
  transaction      FiatTransaction @relation(fields: [transactionId], references: [id])

  @@index([userId])
  @@index([walletId])
  @@index([transactionId])
  @@index([palmpayOrderId])
  @@index([palmpayOrderNo])
  @@index([status])
  @@index([sceneCode])
  @@index([billType])
  @@index([billerId])
  @@index([provider])
  @@index([createdAt])
  @@map("BillPayment")
}

model PalmPayConfig {
  id          Int      @id @default(autoincrement())
  environment String   @unique @default("sandbox")
  apiKey      String   @db.VarChar(255)
  apiSecret   String   @db.VarChar(255)
  merchantId  String?  @db.VarChar(255)
  appId       String?  @db.VarChar(255)
  publicKey   String?  @db.Text
  baseUrl     String   @db.VarChar(500)
  countryCode String   @default("NG") @db.VarChar(10)
  version     String   @default("V1.1") @db.VarChar(10)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model PalmPayUserVirtualAccount {
  id                 Int       @id @default(autoincrement())
  userId             Int
  merchantOrderId    String    @unique @map("merchant_order_id") @db.VarChar(32)
  palmpayOrderNo     String?   @unique @map("palmpay_order_no") @db.VarChar(50)
  amount             Decimal   @db.Decimal(15, 2)
  currency           String    @default("NGN") @db.VarChar(10)
  orderStatus        Int       @default(1) @map("order_status")
  title              String?   @db.VarChar(100)
  description        String?   @db.VarChar(200)
  payerAccountType   String?   @map("payer_account_type") @db.VarChar(50)
  payerAccountId     String?   @map("payer_account_id") @db.VarChar(200)
  payerBankName      String?   @map("payer_bank_name") @db.VarChar(200)
  payerAccountName   String?   @map("payer_account_name") @db.VarChar(200)
  payerVirtualAccNo  String?   @unique @map("payer_virtual_acc_no") @db.VarChar(200)
  checkoutUrl        String?   @map("checkout_url") @db.Text
  sdkSessionId       String?   @map("sdk_session_id") @db.VarChar(50)
  sdkSignKey         String?   @map("sdk_sign_key") @db.VarChar(50)
  payMethod          String?   @map("pay_method") @db.VarChar(50)
  productType        String?   @map("product_type") @db.VarChar(50)
  notifyUrl          String?   @map("notify_url") @db.VarChar(200)
  callBackUrl        String?   @map("call_back_url") @db.VarChar(200)
  remark             String?   @db.VarChar(200)
  fiatTransactionId  String?   @map("fiat_transaction_id") @db.VarChar(255)
  metadata           String?   @db.LongText
  errorMessage       String?   @map("error_message") @db.Text
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")
  completedAt        DateTime? @map("completed_at")
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([merchantOrderId])
  @@index([palmpayOrderNo])
  @@index([payerVirtualAccNo])
  @@index([orderStatus])
  @@index([createdAt])
  @@map("PalmPayUserVirtualAccount")
}
```

### PalmPayRawWebhook

```prisma
// Raw webhook data storage for development/testing
model PalmPayRawWebhook {
  id           Int       @id @default(autoincrement())
  rawData      String    @map("raw_data") @db.LongText // JSON string of the entire webhook payload
  headers      String?   @db.Text // JSON string of request headers
  ipAddress    String?   @map("ip_address") @db.VarChar(255)
  userAgent    String?   @map("user_agent") @db.VarChar(500)
  processed    Boolean   @default(false) // Whether the webhook has been processed
  processedAt  DateTime? @map("processed_at")
  errorMessage String?   @map("error_message") @db.Text
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@index([processed])
  @@index([createdAt])
  @@map("palm_pay_raw_webhooks")
}
```

---

## 3) palmpay.config.ts

```ts
import dotenv from 'dotenv';

dotenv.config();

/**
 * PalmPay Configuration Service
 * Manages PalmPay API configuration with lazy validation
 */
class PalmPayConfigService {
  private baseUrl: string | null = null;
  private apiKey: string | null = null;
  private apiSecret: string | null = null;
  private merchantId: string | null = null;
  private appId: string | null = null;
  private publicKey: string | null = null;
  private privateKey: string | null = null;
  private countryCode: string | null = null;
  private version: string | null = null;
  private environment: string | null = null;

  /**
   * Get base URL (sandbox or production)
   */
  getBaseUrl(): string {
    if (this.baseUrl) return this.baseUrl;

    const env = this.getEnvironment();
    this.baseUrl =
      // env === 'production'?
       'https://open-gw-prod.palmpay-inc.com';
      //   : 
        // 'https://open-gw-daily.palmpay-inc.com';

    return this.baseUrl;
  }

  /**
   * Get API key
   * Used in Authorization: Bearer header for all API requests
   * 
   * Note: This is separate from the signature system.
   * For testing, you can use the merchant ID or app ID if API key is not provided.
   */
  getApiKey(): string {
    if (this.apiKey) return this.apiKey;

    this.apiKey = process.env.PALMPAY_APP_ID || '';
    console.log('apiKey palmpay config service', this.apiKey);
    // For testing: fallback to app ID first, then merchant ID if API key not set
    if (!this.apiKey) {
      const appId = this.getAppId();
      // const merchantId = this.getMerchantId();
      
      // Prioritize App ID over Merchant ID
      if (appId) {
        this.apiKey = appId;
        console.warn('PALMPAY_API_KEY not set, using PALMPAY_APP_ID as fallback for testing');
        return this.apiKey;
      }
      
      // if (merchantId) {
      //   this.apiKey = merchantId;
      //   console.warn('PALMPAY_API_KEY not set, using PALMPAY_MERCHANT_ID as fallback for testing');
      //   return this.apiKey;
      // }
      
      throw new Error(
        'PALMPAY_API_KEY is required in environment variables. Please add it to your .env file.\n' +
        'Alternatively, set PALMPAY_APP_ID or PALMPAY_MERCHANT_ID for testing.'
      );
    }

    return this.apiKey;
  }

  /**
   * Get API secret
   * 
   * Note: This is currently not used in the signature generation or API requests.
   * Signature uses PALMPAY_PRIVATE_KEY instead.
   * Making this optional for now.
   */
  getApiSecret(): string | null {
    if (this.apiSecret !== null) return this.apiSecret;

    this.apiSecret = process.env.PALMPAY_API_SECRET || null;
    // Not required - signature uses private key, not API secret
    return this.apiSecret;
  }

  /**
   * Get merchant ID
   */
  getMerchantId(): string | null {
    if (this.merchantId !== null) return this.merchantId;

    this.merchantId = process.env.PALMPAY_MERCHANT_ID || null;
    return this.merchantId;
  }

  /**
   * Get app ID
   */
  getAppId(): string | null {
    if (this.appId !== null) return this.appId;

    this.appId = process.env.PALMPAY_APP_ID || null;
    return this.appId;
  }

  /**
   * Get public key for signature verification
   */
  getPublicKey(): string | null {
    if (this.publicKey !== null) return this.publicKey;

    this.publicKey = process.env.PALMPAY_PUBLIC_KEY || null;
    return this.publicKey;
  }

  /**
   * Get private key for signature generation
   */
  getPrivateKey(): string {
    if (this.privateKey) return this.privateKey;

    this.privateKey = process.env.PALMPAY_PRIVATE_KEY || '';
    if (!this.privateKey) {
      throw new Error(
        'PALMPAY_PRIVATE_KEY is required in environment variables. Please add it to your .env file.'
      );
    }

    // Handle escaped newlines (common in .env files)
    this.privateKey = this.privateKey.replace(/\\n/g, '\n');
    
    // Remove any extra whitespace but preserve structure if it's PEM format
    if (this.privateKey.includes('-----BEGIN')) {
      // It's already in PEM format, just trim edges
      this.privateKey = this.privateKey.trim();
    } else {
      // It's Base64 encoded, remove all whitespace and newlines
      this.privateKey = this.privateKey.replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '').trim();
    }

    return this.privateKey;
  }

  /**
   * Get country code
   */
  getCountryCode(): string {
    if (this.countryCode) return this.countryCode;

    this.countryCode = process.env.PALMPAY_COUNTRY_CODE || 'NG';
    return this.countryCode;
  }

  /**
   * Get API version
   */
  getVersion(): string {
    if (this.version) return this.version;

    this.version = process.env.PALMPAY_VERSION || 'V2';
    return this.version;
  }

  /**
   * Get environment (sandbox or production)
   */
  getEnvironment(): string {
    if (this.environment) return this.environment;

    this.environment = process.env.PALMPAY_ENVIRONMENT || 'sandbox';
    return this.environment;
  }

  /**
   * Get webhook URL
   */
  getWebhookUrl(): string {
    return process.env.PALMPAY_WEBHOOK_URL || 'https://backend.tercescrow.site/api/v2/webhooks/palmpay';
  }

  /**
   * Get all configuration
   */
  getConfig() {
    return {
      baseUrl: this.getBaseUrl(),
      apiKey: this.getApiKey(),
      apiSecret: this.getApiSecret(),
      merchantId: this.getMerchantId(),
      appId: this.getAppId(),
      publicKey: this.getPublicKey(),
      privateKey: '***', // Never expose private key in config
      countryCode: this.getCountryCode(),
      version: this.getVersion(),
      environment: this.getEnvironment(),
      webhookUrl: this.getWebhookUrl(),
    };
  }
}

// Export singleton instance
export const palmpayConfig = new PalmPayConfigService();

```

---

## 4) palmpay.auth.service.ts

```ts
import crypto from 'crypto';
import { palmpayConfig } from './palmpay.config';

/**
 * PalmPay Authentication & Signature Service
 * Handles request signature generation using MD5 + SHA1WithRSA
 * 
 * Signature Process:
 * 1. Sort parameters by ASCII order, concatenate as key1=value1&key2=value2
 * 2. MD5 the string and convert to uppercase
 * 3. Sign md5Str with SHA1WithRSA using merchant's private key (Base64)
 */
class PalmPayAuthService {
  /**
   * Generate nonce string (32 characters)
   */
  generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get current timestamp in milliseconds
   */
  getRequestTime(): number {
    return Date.now();
  }

  /**
   * Generate MD5 hash of string (uppercase)
   */
  private md5Hash(str: string): string {
    return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
  }

  /**
   * Generate signature for PalmPay API requests
   * 
   * Process:
   * 1. Sort parameters by ASCII order (key=value format)
   * 2. MD5 the concatenated string and convert to uppercase
   * 3. Sign md5Str with SHA1WithRSA using merchant's private key
   */
  generateSignature(params: Record<string, any>): string {
    // Step 1: Filter non-empty params, sort by ASCII order, build key=value string
    
    const sortedKeys = Object.keys(params)
      .filter(key => {
        const value = params[key];
        return value !== null && value !== undefined && value !== '';
      })
      .sort(); // ASCII alphabetical order

    const signString = sortedKeys
      .map(key => {
        // Remove leading/trailing spaces from values
        const value = String(params[key]).trim();
        return `${key}=${value}`;
      })
      .join('&');

    // Step 2: MD5 hash and convert to uppercase
    const md5Str = this.md5Hash(signString);

    // Step 3: Sign with SHA1WithRSA using merchant's private key
    const privateKey = palmpayConfig.getPrivateKey();
    
    if (!privateKey || privateKey.trim().length === 0) {
      throw new Error('PalmPay private key is empty or not configured');
    }

    // Convert to PEM format if needed (Node.js crypto expects PEM format)
    let pemKey = privateKey.trim();
    
    // Check if key is already in PEM format
    const isPemFormat = pemKey.includes('-----BEGIN') && pemKey.includes('-----END');
    
    if (!isPemFormat) {
      // If it's raw Base64, try to construct PEM format
      // PalmPay provides Base64 encoded key, convert to PEM
      const cleanKey = pemKey.replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '');
      
      if (cleanKey.length === 0) {
        throw new Error('PalmPay private key is invalid (empty after cleaning)');
      }

      // Validate Base64 format
      let isValidBase64 = true;
      try {
        Buffer.from(cleanKey, 'base64');
      } catch (e) {
        isValidBase64 = false;
      }

      if (!isValidBase64) {
        throw new Error(
          'PalmPay private key is not valid Base64. ' +
          'Please check your PALMPAY_PRIVATE_KEY in .env file. ' +
          'The key should be Base64 encoded or in PEM format.'
        );
      }

      // Detect key format based on Base64 content
      // PKCS#8 keys typically start with MIIE (after Base64 decode, ASN.1 SEQUENCE)
      // PKCS#1 keys typically start with MIIB or MIIC
      const keyLines = cleanKey.match(/.{1,64}/g) || [];
      if (keyLines.length === 0) {
        throw new Error('PalmPay private key format is invalid');
      }

      // Try PKCS#8 format first (most common for modern keys)
      // PKCS#8 uses "-----BEGIN PRIVATE KEY-----"
      pemKey = `-----BEGIN PRIVATE KEY-----\n${keyLines.join('\n')}\n-----END PRIVATE KEY-----`;
    }

    try {
      const signature = crypto
        .createSign('RSA-SHA1')
        .update(md5Str, 'utf8')
        .sign(pemKey, 'base64');

      return signature;
    } catch (error: any) {
      // If PKCS#8 format fails and key was not already in PEM format, try PKCS#1 format
      if (!isPemFormat) {
        try {
          const cleanKey = privateKey.trim().replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '');
          const keyLines = cleanKey.match(/.{1,64}/g) || [];
          const pkcs1Key = `-----BEGIN RSA PRIVATE KEY-----\n${keyLines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
          
          const signature = crypto
            .createSign('RSA-SHA1')
            .update(md5Str, 'utf8')
            .sign(pkcs1Key, 'base64');

          return signature;
        } catch (pkcs1Error: any) {
          console.error('PalmPay signature error - PKCS#8 failed:', error.message);
          console.error('PalmPay signature error - PKCS#1 failed:', pkcs1Error.message);
          console.error('Private key length:', privateKey.length);
          console.error('Private key starts with:', privateKey.substring(0, 50));
          throw new Error(
            `Failed to sign request with PalmPay private key. ` +
            `PKCS#8 error: ${error.message}. ` +
            `PKCS#1 error: ${pkcs1Error.message}. ` +
            `Please verify PALMPAY_PRIVATE_KEY format in .env file. ` +
            `The key should be Base64 encoded PKCS#8 or PKCS#1 format.`
          );
        }
      }
      
      console.error('PalmPay signature error:', error.message);
      console.error('Private key length:', privateKey.length);
      console.error('Private key starts with:', privateKey.substring(0, 50));
      throw new Error(
        `Failed to sign request with PalmPay private key: ${error.message}. ` +
        `Please verify PALMPAY_PRIVATE_KEY format in .env file.`
      );
    }
  }

  /**
   * Verify webhook signature from PalmPay
   * 
   * Process:
   * 1. Sort parameters (excluding 'sign') by ASCII order
   * 2. MD5 the concatenated string and convert to uppercase
   * 3. Verify signature using PalmPay's public key with SHA1WithRSA
   * 
   * @param payload - Webhook payload (JSON object, sign field will be excluded)
   * @param signature - URL decoded signature from webhook
   */
  verifyWebhookSignature(payload: Record<string, any>, signature: string): boolean {
    try {
      // Decode URL encoded signature
      const decodedSign = decodeURIComponent(signature);

      // Step 1: Build signature string (exclude 'sign' field, sort by ASCII order)
      const sortedKeys = Object.keys(payload)
        .filter(key => {
          // Exclude 'sign' field and empty values
          if (key === 'sign') return false;
          const value = payload[key];
          return value !== null && value !== undefined && value !== '';
        })
        .sort(); // ASCII alphabetical order

      const signString = sortedKeys
        .map(key => {
          // Remove leading/trailing spaces from values
          const value = String(payload[key]).trim();
          return `${key}=${value}`;
        })
        .join('&');

      // Step 2: MD5 hash and convert to uppercase
      const md5Str = this.md5Hash(signString);

      // Step 3: Verify signature using PalmPay's public key
      const config = palmpayConfig.getConfig();
      const publicKey = config.publicKey;

      if (!publicKey) {
        console.warn('PALMPAY_PUBLIC_KEY not set - skipping signature verification');
        return true; // Allow if public key not configured (for development)
      }

      // Convert public key to PEM format if needed
      let pemPublicKey = publicKey;
      if (!publicKey.includes('-----BEGIN')) {
        // If it's raw Base64, construct PEM format
        // Try PKCS#1 format first (RSA PUBLIC KEY)
        const cleanKey = publicKey.replace(/\s/g, '');
        const keyLines = cleanKey.match(/.{1,64}/g) || [];
        pemPublicKey = `-----BEGIN RSA PUBLIC KEY-----\n${keyLines.join('\n')}\n-----END RSA PUBLIC KEY-----`;
      }

      // Verify signature using SHA1WithRSA
      const verify = crypto.createVerify('RSA-SHA1');
      verify.update(md5Str, 'utf8');
      
      // Convert signature from base64 string
      let isValid = false;
      try {
        // Try PKCS#1 format first
        isValid = verify.verify(pemPublicKey, decodedSign, 'base64');
      } catch (error) {
        // If PKCS#1 fails, try PKCS#8 format
        if (!publicKey.includes('-----BEGIN')) {
          const cleanKey = publicKey.replace(/\s/g, '');
          const keyLines = cleanKey.match(/.{1,64}/g) || [];
          const pkcs8Key = `-----BEGIN PUBLIC KEY-----\n${keyLines.join('\n')}\n-----END PUBLIC KEY-----`;
          isValid = verify.verify(pkcs8Key, decodedSign, 'base64');
        } else {
          throw error;
        }
      }

      if (!isValid) {
        console.error('PalmPay webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      console.error('Error verifying PalmPay webhook signature:', error);
      return false;
    }
  }

  /**
   * Get request headers for PalmPay API
   */
  getRequestHeaders(signature: string): Record<string, string> {
    const config = palmpayConfig.getConfig();

    return {
      'Accept': 'application/json, text/plain, */*',
      'CountryCode': config.countryCode,
      'Authorization': `Bearer ${config.apiKey}`,
      'Signature': signature,
      'Content-Type': 'application/json',
      // 'Bare'
    };
  }
}

// Export singleton instance
export const palmpayAuth = new PalmPayAuthService();

```

---

## 5) palmpay.logger.ts

```ts
/**
 * PalmPay Logger Utility
 * 
 * Dedicated logging service for PalmPay-related operations
 * Writes logs to a dedicated palmpay.log file
 */

import fs from 'fs';
import path from 'path';

class PalmPayLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'palmpay.log');

    // Ensure logs directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Format log entry with timestamp
   */
  private formatLogEntry(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data }),
    };
    return JSON.stringify(logEntry) + '\n';
  }

  /**
   * Write log entry to file
   */
  private writeLog(level: string, message: string, data?: any): void {
    try {
      const logEntry = this.formatLogEntry(level, message, data);
      fs.appendFileSync(this.logFile, logEntry, 'utf8');
    } catch (error) {
      // Fallback to console if file write fails
      console.error('Failed to write to palmpay.log:', error);
      console.log(`[${level}] ${message}`, data || '');
    }
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.writeLog('INFO', message, data);
    console.log(`[PALMPAY INFO] ${message}`, data || '');
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.writeLog('WARN', message, data);
    console.warn(`[PALMPAY WARN] ${message}`, data || '');
  }

  /**
   * Log error message
   */
  error(message: string, error?: any, data?: any): void {
    const errorData = {
      message: error?.message || message,
      stack: error?.stack,
      name: error?.name,
      ...(data && { context: data }),
    };
    this.writeLog('ERROR', message, errorData);
    console.error(`[PALMPAY ERROR] ${message}`, errorData);
  }

  /**
   * Log webhook received
   */
  webhookReceived(webhookData: any, headers?: any, ipAddress?: string): void {
    this.writeLog('WEBHOOK_RECEIVED', 'PalmPay webhook received', {
      webhookData,
      headers,
      ipAddress,
    });
    console.log('[PALMPAY WEBHOOK] Received webhook:', {
      orderNo: webhookData?.orderNo,
      orderStatus: webhookData?.orderStatus,
      outOrderNo: webhookData?.outOrderNo,
    });
  }

  /**
   * Log webhook processing
   */
  webhookProcessing(webhookData: any): void {
    this.writeLog('WEBHOOK_PROCESSING', 'Processing webhook', webhookData);
    console.log('[PALMPAY WEBHOOK] Processing:', {
      orderNo: webhookData?.orderNo,
      outOrderNo: webhookData?.outOrderNo,
    });
  }

  /**
   * Log webhook processed
   */
  webhookProcessed(result: any): void {
    this.writeLog('WEBHOOK_PROCESSED', 'Webhook processed successfully', result);
    console.log('[PALMPAY WEBHOOK] Processed:', result);
  }

  /**
   * Log bill payment operation
   */
  billPayment(operation: string, details: any): void {
    this.writeLog('BILL_PAYMENT', operation, details);
    console.log(`[PALMPAY BILL] ${operation}:`, details);
  }

  /**
   * Log wallet refund
   */
  refund(details: any): void {
    this.writeLog('REFUND', 'Wallet refund processed', details);
    console.log('[PALMPAY REFUND] Processed:', details);
  }

  /**
   * Log status check
   */
  statusCheck(details: any): void {
    this.writeLog('STATUS_CHECK', 'Bill payment status check', details);
    console.log('[PALMPAY STATUS] Check:', details);
  }

  /**
   * Log exception/error with full context
   */
  exception(operation: string, error: any, context?: any): void {
    const exceptionData = {
      operation,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      },
      context,
    };
    
    this.writeLog('EXCEPTION', `Exception in ${operation}`, exceptionData);
    console.error(`[PALMPAY EXCEPTION] ${operation}:`, exceptionData);
  }

  /**
   * Log API call to PalmPay
   */
  apiCall(endpoint: string, request?: any, response?: any, error?: any): void {
    const logData: any = {
      endpoint,
    };
    
    if (request) logData.request = request;
    if (response) logData.response = response;
    if (error) {
      logData.error = {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      };
    }

    const level = error ? 'ERROR' : 'INFO';
    this.writeLog(level, `API call to PalmPay ${endpoint}`, logData);
    
    if (error) {
      console.error(`[PALMPAY API ERROR] ${endpoint}:`, error);
    } else {
      console.log(`[PALMPAY API] ${endpoint}`);
    }
  }

  /**
   * Log transaction update
   */
  transactionUpdate(details: any): void {
    this.writeLog('TRANSACTION_UPDATE', 'Transaction updated', details);
    console.log('[PALMPAY TX] Updated:', details);
  }
}

// Export singleton instance
export const palmpayLogger = new PalmPayLogger();
export default palmpayLogger;

```

---

## 6) palmpay.checkout.service.ts

```ts
import axios from 'axios';
import {
  PalmPayCreateOrderRequest,
  PalmPayQueryOrderRequest,
  PalmPayBaseResponse,
  PalmPayCreateOrderResponse,
  PalmPayQueryOrderResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';

/**
 * PalmPay Checkout Service
 * Handles deposit/pay-in operations (wallet top-up)
 */
class PalmPayCheckoutService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  /**
   * Create payment order for deposit
   */
  async createOrder(request: Omit<PalmPayCreateOrderRequest, 'requestTime' | 'version' | 'nonceStr'>): Promise<PalmPayCreateOrderResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const fullRequest: PalmPayCreateOrderRequest = {
      ...request,
      requestTime,
      version,
      nonceStr,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(fullRequest);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayCreateOrderResponse>>(
        `${this.baseUrl}/api/v2/payment/merchant/createorder`,
        fullRequest,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }

  /**
   * Query order status
   */
  async queryOrderStatus(orderId?: string, orderNo?: string): Promise<PalmPayQueryOrderResponse> {
    if (!orderId && !orderNo) {
      throw new Error('Either orderId or orderNo must be provided');
    }

    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryOrderRequest = {
      requestTime,
      version,
      nonceStr,
      ...(orderId && { orderId }),
      ...(orderNo && { orderNo }),
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryOrderResponse>>(
        `${this.baseUrl}/api/v2/payment/merchant/order/queryStatus`,
        request,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }
}

// Export singleton instance
export const palmpayCheckout = new PalmPayCheckoutService();

```

---

## 7) palmpay.payout.service.ts

```ts
import axios from 'axios';
import {
  PalmPayPayoutRequest,
  PalmPayQueryPayStatusRequest,
  PalmPayBaseResponse,
  PalmPayPayoutResponse,
  PalmPayQueryPayStatusResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';

/**
 * PalmPay Payout Service
 * Handles automatic payouts (withdrawals)
 */
class PalmPayPayoutService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  /**
   * Initiate merchant payment (payout)
   */
  async initiatePayout(request: Omit<PalmPayPayoutRequest, 'requestTime' | 'version' | 'nonceStr'>): Promise<PalmPayPayoutResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    // Clean account number (remove spaces and special characters)
    const cleanAccountNo = request.payeeBankAccNo.replace(/\D/g, '');

    const fullRequest: PalmPayPayoutRequest = {
      ...request,
      payeeBankAccNo: cleanAccountNo,
      requestTime,
      version,
      nonceStr,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(fullRequest);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayPayoutResponse>>(
        `${this.baseUrl}/api/v2/merchant/payment/payout`,
        fullRequest,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }

  /**
   * Query payout status
   */
  async queryPayStatus(orderId?: string, orderNo?: string): Promise<PalmPayQueryPayStatusResponse> {
    if (!orderId && !orderNo) {
      throw new Error('Either orderId or orderNo must be provided');
    }

    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryPayStatusRequest = {
      requestTime,
      version,
      nonceStr,
      ...(orderId && { orderId }),
      ...(orderNo && { orderNo }),
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryPayStatusResponse>>(
        `${this.baseUrl}/api/v2/merchant/payment/queryPayStatus`,
        request,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }
}

// Export singleton instance
export const palmpayPayout = new PalmPayPayoutService();

```

---

## 8) palmpay.banks.service.ts

```ts
import axios from 'axios';
import { execSync } from 'child_process';
import {
  PalmPayQueryBankListRequest,
  PalmPayQueryBankAccountRequest,
  PalmPayQueryAccountRequest,
  PalmPayBaseResponse,
  PalmPayBankInfo,
  PalmPayQueryBankAccountResponse,
  PalmPayQueryAccountResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';

/**
 * PalmPay Banks Service
 * Handles bank list queries and account verification
 */
class PalmPayBanksService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  /**
   * Query bank list
   * @param businessType - 0 = all
   */
  async queryBankList(businessType: number = 0): Promise<PalmPayBankInfo[]> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryBankListRequest = {
      requestTime,
      version,
      nonceStr,
      businessType,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayBankInfo[]>>(
        `${this.baseUrl}/api/v2/general/merchant/queryBankList`,
        request,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      // Handle both array and single object responses
      if (Array.isArray(response.data.data)) {
        return response.data.data;
      } else if (response.data.data) {
        // If single object, return as array
        return [response.data.data];
      }

      return [];
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }

  /**
   * Query bank account (verify account name)
   * Note: For PalmPay account (bankCode "100033"), use queryAccount instead
   */
  async queryBankAccount(bankCode: string, bankAccNo: string): Promise<PalmPayQueryBankAccountResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    // Try V1.1 version for this endpoint (some PalmPay endpoints require V1.1 instead of V2)
    const version = 'V1.1';
    const nonceStr = palmpayAuth.generateNonce();

    // Remove spaces and special characters from account number
    const cleanAccountNo = bankAccNo.replace(/\D/g, '');

    const request: PalmPayQueryBankAccountRequest = {
      requestTime,
      version,
      nonceStr,
      bankCode,
      bankAccNo: cleanAccountNo,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const config = palmpayConfig.getConfig();
    const endpoint = `${this.baseUrl}/api/v2/payment/merchant/payout/queryBankAccount`;

    // Prepare the exact JSON payload string (must match byte-for-byte)
    const payload = JSON.stringify({
      requestTime,
      version,
      nonceStr,
      bankCode,
      bankAccNo: cleanAccountNo,
    });

    try {
      console.log('queryBankAccount - Using curl for exact byte matching');
      console.log('Request payload:', payload);
      console.log('Endpoint:', endpoint);

      // Build curl command with exact payload
      // Escape single quotes in payload for shell safety
      const escapedPayload = payload.replace(/'/g, "'\"'\"'");
      
      const curlCommand = `curl --location '${endpoint}' ` +
        `--header 'Accept: application/json, text/plain, */*' ` +
        `--header 'CountryCode: ${config.countryCode}' ` +
        `--header 'Authorization: Bearer ${config.apiKey}' ` +
        `--header 'Signature: ${signature}' ` +
        `--header 'Content-Type: application/json' ` +
        `--data '${escapedPayload}'`;

      console.log('Executing curl command...');
      const curlOutput = execSync(curlCommand, { 
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }).trim();

      console.log('Curl response:', curlOutput);

      // Parse the JSON response
      const response = JSON.parse(curlOutput) as PalmPayBaseResponse<PalmPayQueryBankAccountResponse>;

      if (response.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.respMsg} (${response.respCode})`);
      }

      if (!response.data) {
        throw new Error('PalmPay API returned no data');
      }

      // Normalize the response - PalmPay returns Status (capital S) but our code expects status
      const responseData = response.data;
      if (responseData.Status && !responseData.status) {
        responseData.status = responseData.Status;
      }

      return responseData;
    } catch (error: any) {
      console.error('queryBankAccount curl error:', error);
      
      // If it's a parsing error, log the raw output
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        throw new Error(`Failed to parse PalmPay response: ${error.message}`);
      }

      // If execSync error, extract stderr
      if (error.stderr) {
        throw new Error(`Curl execution error: ${error.stderr.toString()}`);
      }

      throw new Error(error.message || 'Failed to query bank account');
    }
  }

  /**
   * Query PalmPay account
   * Use this for PalmPay account verification (bankCode "100033")
   */
  async queryAccount(palmpayAccNo: string): Promise<PalmPayQueryAccountResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryAccountRequest = {
      requestTime,
      version,
      nonceStr,
      palmpayAccNo,
    };

    // Generate signature
    const signature = palmpayAuth.generateSignature(request);
    const headers = palmpayAuth.getRequestHeaders(signature);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryAccountResponse>>(
        `${this.baseUrl}/api/v2/payment/merchant/payout/queryAccount`,
        request,
        { headers }
      );

      if (response.data.respCode !== '00000000') {
        throw new Error(`PalmPay API error: ${response.data.respMsg} (${response.data.respCode})`);
      }

      if (!response.data.data) {
        throw new Error('PalmPay API returned no data');
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `PalmPay API error: ${error.response.data?.respMsg || error.message} (${error.response.data?.respCode || 'UNKNOWN'})`
        );
      }
      throw error;
    }
  }
}

// Export singleton instance
export const palmpayBanks = new PalmPayBanksService();


```

---

## 9) fiat.wallet.service.ts

```ts
import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Fiat Wallet Service
 * Handles wallet credit/debit operations
 */
class FiatWalletService {
  /**
   * Get or create user's fiat wallet for a currency
   */
  async getOrCreateWallet(userId: number, currency: string) {
    let wallet = await prisma.fiatWallet.findUnique({
      where: {
        userId_currency: {
          userId,
          currency: currency.toUpperCase(),
        },
      },
    });

    if (!wallet) {
      // Check if this is the first wallet (make it primary)
      const existingWallets = await prisma.fiatWallet.count({
        where: { userId },
      });

      wallet = await prisma.fiatWallet.create({
        data: {
          userId,
          currency: currency.toUpperCase(),
          balance: 0,
          isPrimary: existingWallets === 0,
          status: 'active',
        },
      });
    }

    return wallet;
  }

  /**
   * Get wallet by ID
   */
  async getWalletById(walletId: string) {
    return prisma.fiatWallet.findUnique({
      where: { id: walletId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });
  }

  /**
   * Get user's wallets
   */
  async getUserWallets(userId: number) {
    return prisma.fiatWallet.findMany({
      where: { userId, status: 'active' },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  /**
   * Credit wallet (add funds)
   */
  async creditWallet(
    walletId: string,
    amount: number,
    transactionId: string,
    description?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get wallet with lock
      const wallet = await tx.fiatWallet.findUnique({
        where: { id: walletId },
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = new Decimal(balanceBefore).plus(amount);

      // Update wallet balance
      await tx.fiatWallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter },
      });

      // Update transaction
      await tx.fiatTransaction.update({
        where: { id: transactionId },
        data: {
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      return {
        walletId,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        amount: amount.toString(),
      };
    });
  }

  /**
   * Debit wallet (subtract funds)
   */
  async debitWallet(
    walletId: string,
    amount: number,
    transactionId: string,
    description?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get wallet with lock
      const wallet = await tx.fiatWallet.findUnique({
        where: { id: walletId },
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = new Decimal(balanceBefore).minus(amount);

      // Check if sufficient balance
      if (balanceAfter.lessThan(0)) {
        throw new Error('Insufficient balance');
      }

      // Update wallet balance
      await tx.fiatWallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter },
      });

      // Update transaction
      await tx.fiatTransaction.update({
        where: { id: transactionId },
        data: {
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      return {
        walletId,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        amount: amount.toString(),
      };
    });
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletId: string) {
    const wallet = await prisma.fiatWallet.findUnique({
      where: { id: walletId },
      select: { balance: true, currency: true },
    });

    return wallet ? {
      balance: wallet.balance.toString(),
      currency: wallet.currency,
    } : null;
  }

  /**
   * Get user's wallet overview
   */
  async getWalletOverview(userId: number) {
    const wallets = await this.getUserWallets(userId);

    const totalBalance = wallets.reduce((sum, wallet) => {
      return sum + parseFloat(wallet.balance.toString());
    }, 0);

    return {
      wallets,
      totalBalance,
      currency: wallets[0]?.currency || 'NGN',
    };
  }
}

// Export singleton instance
export const fiatWalletService = new FiatWalletService();

```

---

## 10) palmpay.types.core.ts (palmpay.types lines 1–356)

```ts
// PalmPay API Types

// Request Types
export interface PalmPayCreateOrderRequest {
  requestTime: number; // Timestamp in milliseconds
  version: string; // "V1.1"
  nonceStr: string; // Random string (32 chars)
  orderId: string; // Unique merchant order ID (32 chars max)
  title?: string; // Order title (100 chars max)
  description?: string; // Order description (200 chars max)
  amount: number; // Amount in CENTS (e.g., 2500000 = 25,000.00 NGN)
  currency: string; // "NGN", "GHS", "TZS", "KES", "ZAR"
  notifyUrl: string; // Webhook callback URL
  callBackUrl: string; // Return URL after payment
  orderExpireTime?: number; // Order expiry in seconds (1800-86400, default 3600)
  goodsDetails?: string; // JSONArray string (required for global merchants)
  customerInfo?: string; // JSON string with customer info
  remark?: string; // Remarks (200 chars max)
  splitDetail?: string; // JSON string for split payments
  productType?: string; // "bank_transfer", "pay_wallet", "mmo"
  userId?: string; // Unique user ID on merchant (50 chars max)
  userMobileNo?: string; // User mobile phone number (15 chars max, e.g., 07011698742)
}

export interface PalmPayQueryOrderRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  orderId?: string; // Merchant order ID
  orderNo?: string; // PalmPay order number
}

export interface PalmPayQueryBankListRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  businessType: number; // 0 = all
}

export interface PalmPayQueryBankAccountRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  bankCode: string; // Bank or MMO code
  bankAccNo: string; // Bank account number (numeric only)
}

export interface PalmPayQueryAccountRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  palmpayAccNo: string; // PalmPay account number
}

export interface PalmPayPayoutRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  orderId: string; // Unique merchant order ID (32 chars max)
  title?: string;
  description?: string;
  payeeName?: string; // Name of payee (50 chars max)
  payeeBankCode: string; // Bank or MMO code (required except TZ)
  payeeBankAccNo: string; // Bank account number (numeric only, 50 chars max)
  payeePhoneNo?: string; // Phone number with country code (e.g., "023301234567890")
  currency: string; // "NGN", "GHS", "TZS", "KES"
  amount: number; // Amount in CENTS
  notifyUrl: string; // Webhook callback URL
  remark: string; // Remarks (200 chars max)
}

export interface PalmPayQueryPayStatusRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  orderId?: string; // Merchant order ID
  orderNo?: string; // PalmPay order number
}

// Response Types
export interface PalmPayBaseResponse<T> {
  respCode: string; // "00000000" = success
  respMsg: string; // "success" or error message
  data?: T;
}

export interface PalmPayCreateOrderResponse {
  orderNo: string; // PalmPay's order number
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  message: string;
  checkoutUrl?: string; // H5 payment URL
  payToken?: string; // Token for SDK payment
  payerAccountType?: string; // Account type (pay with bank transfer -1)
  payerAccountId?: string; // Unique account id (returned when -1)
  payerBankName?: string; // Bank name of virtual account (returned when -1)
  payerAccountName?: string; // Account name of virtual account (returned when -1)
  payerVirtualAccNo?: string; // Virtual account number (returned when -1)
  sdkSessionId: string;
  sdkSignKey: string;
  currency: string;
  orderAmount: number; // Amount in cents
  payMethod?: string; // "bank_transfer", "pay_wallet", "mmo"
}

export interface PalmPayQueryOrderResponse {
  orderId: string; // Merchant order ID
  orderNo: string; // PalmPay order number
  merchantId: string;
  currency: string;
  amount: number; // Amount in cents
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  payMethod?: string; // "pay_wallet", "bank_transfer", "mmo"
  productType?: string; // "pay_wallet", "bank_transfer", "mmo"
  remark?: string;
  errorMsg?: string;
  createdTime: number; // Timestamp in milliseconds
  completedTime?: number; // Timestamp in milliseconds
  payerBankName?: string;
  payerAccountName?: string;
  payerVirtualAccNo?: string;
}

export interface PalmPayBankInfo {
  bankCode: string;
  bankName: string;
  bankUrl?: string; // Bank logo URL
  bg2Url?: string; // Small background picture
  bgUrl?: string; // Small background picture
}

export interface PalmPayQueryBankAccountResponse {
  Status?: string; // "Success" or "Failed" (PalmPay returns capital S)
  status?: string; // Fallback for lowercase (some responses may use lowercase)
  accountName: string; // Full name of account
  errorMessage?: string; // Error message if status is "Failed"
}

export interface PalmPayQueryAccountResponse {
  accountName: string; // Full name of PalmPay account
  accountStatus: number; // 0 = available, others = unavailable
}

export interface PalmPayPayoutResponse {
  currency: string;
  amount: number; // Amount in cents (only when orderStatus = 2)
  fee?: {
    fee: number;
    vat?: number;
  };
  orderNo: string; // PalmPay order number
  orderId: string; // Merchant order ID
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  sessionId?: string; // Channel response parameters
  message?: string;
  errorMsg?: string;
}

export interface PalmPayQueryPayStatusResponse {
  currency: string;
  amount: number; // Amount in cents (only when orderStatus = 2)
  fee?: {
    fee: number;
    vat?: number;
  };
  orderNo: string;
  orderId: string;
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  sessionId?: string;
  message?: string;
  errorMsg?: string;
  createdTime: number; // Timestamp in milliseconds
  completedTime?: number; // Timestamp in milliseconds
}

// Webhook Types
export interface PalmPayDepositWebhook {
  orderId: string; // Merchant order ID
  orderNo: string; // PalmPay order number
  appId: string; // Merchant App ID
  currency: string;
  amount: number; // Amount in CENTS
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  completeTime?: number; // Timestamp in milliseconds (only when orderStatus = 2)
  sign: string; // URL encoded signature
  payMethod?: string;
  payer?: any; // Only returned to whitelisted merchants
}

export interface PalmPayPayoutWebhook {
  orderId: string; // Merchant order ID
  orderNo: string; // PalmPay order number
  appId: string; // Merchant App ID
  currency: string;
  amount: number; // Amount in CENTS
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  sessionId?: string; // Channel response parameters
  completeTime?: number; // Timestamp in milliseconds
  errorMsg?: string;
  sign: string; // URL encoded signature
}

// Order Status Enum
export enum PalmPayOrderStatus {
  PENDING = 1,
  SUCCESS = 2,
  FAILED = 3,
  CANCELLED = 4,
}

// Customer Info (for JSON string in customerInfo)
export interface PalmPayCustomerInfo {
  userId?: string;
  userName?: string;
  phone?: string;
  email?: string;
}

// ============================================
// Bill Payment Types (Biller Reseller API)
// ============================================

// Scene Codes
export type PalmPaySceneCode = 'airtime' | 'data' | 'betting';

// Query Biller Request
export interface PalmPayQueryBillerRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
}

// Biller Response
export interface PalmPayBiller {
  billerId: string; // Operator ID (e.g., "MTN", "GLO")
  billerName: string; // Operator Name
  billerIcon: string; // Operator Icon URL
  minAmount?: number; // Minimum recharge amount (in cents)
  maxAmount?: number; // Maximum recharge amount (in cents)
  status: number; // 0 = Unavailable, 1 = Available
}

// Query Item Request
export interface PalmPayQueryItemRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  billerId: string; // Operator ID
}

// Item Response
export interface PalmPayItem {
  billerId: string; // Carrier ID
  itemId: string; // Package ID
  itemName: string; // Package Name
  amount?: number; // Package Amount (in cents)
  minAmount?: number; // Minimum Recharge Amount (in cents)
  maxAmount?: number; // Maximum Recharge Amount (in cents)
  isFixAmount: number; // 0 = Non-fixed Amount, 1 = Fixed Amount
  status: number; // 0 = Unavailable, 1 = Available
  extInfo?: {
    validityDate?: number; // Package Validity Days
    itemSize?: string; // Package Size
    itemDescription?: Record<string, any>; // Package Usage Instructions
  };
}

// Query Recharge Account Request
export interface PalmPayQueryRechargeAccountRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  rechargeAccount: string; // Phone number, meter number, etc. (max 15 chars)
  billerId?: string; // Operator ID (Required for Betting)
  itemId?: string; // Package ID (Required for Betting)
}

// Query Recharge Account Response
export interface PalmPayQueryRechargeAccountResponse {
  biller?: string; // Mobile phone number corresponding operator
}

// Create Bill Payment Order Request
export interface PalmPayCreateBillOrderRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  outOrderNo: string; // Merchant order number (max 64 chars, unique)
  amount: number; // Total order amount in CENTS
  notifyUrl: string; // Payment notification callback URL
  billerId: string; // Operator ID
  itemId: string; // Package ID
  rechargeAccount: string; // Recharge account (phone number, max 15 chars)
  title?: string; // Order title (max 50 chars)
  description?: string; // Order description (max 200 chars)
  relationId?: string; // User-defined associated ID (max 64 chars)
}

// Create Bill Payment Order Response
export interface PalmPayCreateBillOrderResponse {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  orderStatus: number; // Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
  msg?: string; // Status description
  amount: number; // Total order amount (in cents)
  sceneCode: PalmPaySceneCode;
}

// Query Bill Payment Order Request
export interface PalmPayQueryBillOrderRequest {
  requestTime: number;
  version: string; // "V1.1" or "V2"
  nonceStr: string;
  sceneCode: PalmPaySceneCode;
  outOrderNo?: string; // Merchant order number
  orderNo?: string; // PalmPay platform order number (at least one required)
}

// Query Bill Payment Order Response
export interface PalmPayQueryBillOrderResponse {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  billerId: string; // Operator ID
  itemId: string; // Package ID
  orderStatus: number; // Order status
  amount: number | null; // Total order amount (in cents, null if not completed)
  sceneCode: PalmPaySceneCode;
  currencySymbol: string; // e.g., "₦"
  currency: string; // e.g., "NGN"
  payerEmail: string; // Payer's email address
  payerMobileNo: string | null; // Associated system member's mobile number
  payerAccountId: string; // Payer's account ID
  payerAccountType: number; // Payer's account type
  payTime: number; // Payment time (timestamp in milliseconds)
  completedTime: number; // Order completion time (timestamp in milliseconds)
  merchantNo: string; // Merchant number
  errorMsg: string | null; // Return message
  notifyUrl?: string; // Notification URL
}

// Bill Payment Webhook
export interface PalmPayBillPaymentWebhook {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  appId: string; // Merchant APP ID
  amount: number; // Total order amount (in cents)
  rechargeAccount?: string; // Recharge account
  orderStatus: number; // Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
  completedTime: number; // Transaction completion time (timestamp)
  sign: string; // Signature (URL encoded)
  errorMsg?: string; // Error message
  country?: string; // Country code
}
```

---

## 11) palmpay.deposit.controller.ts

```ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayCheckout } from '../../services/palmpay/palmpay.checkout.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';
import { PalmPayCustomerInfo } from '../../types/palmpay.types';
import { getCustomerRestrictions, isFeatureFrozen, FEATURE_DEPOSIT } from '../../utils/customer.restrictions';

/**
 * Initiate deposit (wallet top-up)
 * POST /api/v2/payments/palmpay/deposit/initiate
 */
export const initiateDepositController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    const restrictions = await getCustomerRestrictions(user.id);
    if (restrictions.banned) {
      return next(ApiError.forbidden('Your account has been banned. Contact support.'));
    }
    if (isFeatureFrozen(restrictions, FEATURE_DEPOSIT)) {
      return next(ApiError.forbidden('Deposit is temporarily disabled for your account.'));
    }
    const { amount, currency = 'NGN' } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return next(ApiError.badRequest('Amount must be greater than 0'));
    }

    // Convert amount to cents (minimum 10,000 kobo = 100 NGN for bank transfer)
    const amountInCents = Math.round(parseFloat(amount) * 100);
    if (amountInCents < 10000) {
      return next(ApiError.badRequest('Minimum amount is 100.00 NGN (10,000 kobo)'));
    }

    // Generate unique merchant order ID
    const merchantOrderId = `deposit_${uuidv4().replace(/-/g, '')}`.substring(0, 32);

    // Get or create wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, currency);

    // Create transaction record
    const transaction = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        type: 'DEPOSIT',
        status: 'pending',
        currency: currency.toUpperCase(),
        amount: parseFloat(amount),
        fees: 0,
        totalAmount: parseFloat(amount),
        description: `Wallet top-up - ${amount} ${currency}`,
        palmpayOrderId: merchantOrderId,
      },
    });

    // Prepare goodsDetails for bank transfer (use -1 to get virtual account)
    const goodsDetails = JSON.stringify([{ goodsId: '-1' }]);

    // Call PalmPay merchant order API with bank_transfer
    const palmpayResponse = await palmpayCheckout.createOrder({
      orderId: merchantOrderId,
      title: 'Wallet Top-up',
      description: `Deposit to ${currency} wallet`,
      amount: amountInCents,
      currency: currency.toUpperCase(),
      notifyUrl: palmpayConfig.getWebhookUrl(),
      callBackUrl: `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/deposit/success`,
      productType: 'bank_transfer',
      goodsDetails: goodsDetails,
      userId: user.id.toString(),
      userMobileNo: user.phoneNumber,
      remark: `Wallet top-up transaction for user ${user.id}`,
    });

    // Save merchant order details including virtual account info
    const merchantOrder = await prisma.palmPayUserVirtualAccount.create({
      data: {
        userId: user.id,
        merchantOrderId: merchantOrderId,
        palmpayOrderNo: palmpayResponse.orderNo,
        amount: parseFloat(amount),
        currency: currency.toUpperCase(),
        orderStatus: palmpayResponse.orderStatus,
        title: 'Wallet Top-up',
        description: `Deposit to ${currency} wallet`,
        payerAccountType: palmpayResponse.payerAccountType?.toString() || null,
        payerAccountId: palmpayResponse.payerAccountId || null,
        payerBankName: palmpayResponse.payerBankName || null,
        payerAccountName: palmpayResponse.payerAccountName || null,
        payerVirtualAccNo: palmpayResponse.payerVirtualAccNo || null,
        checkoutUrl: palmpayResponse.checkoutUrl || null,
        sdkSessionId: palmpayResponse.sdkSessionId || null,
        sdkSignKey: palmpayResponse.sdkSignKey || null,
        payMethod: palmpayResponse.payMethod || null,
        productType: 'bank_transfer',
        notifyUrl: palmpayConfig.getWebhookUrl(),
        callBackUrl: `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/deposit/success`,
        remark: `Wallet top-up transaction for user ${user.id}`,
        fiatTransactionId: transaction.id,
        metadata: JSON.stringify(palmpayResponse),
      },
    });

    // Update transaction with PalmPay order number
    await prisma.fiatTransaction.update({
      where: { id: transaction.id },
      data: {
        palmpayOrderNo: palmpayResponse.orderNo,
        palmpayStatus: palmpayResponse.orderStatus.toString(),
        checkoutUrl: palmpayResponse.checkoutUrl,
        redirectUrl: `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/deposit/success`,
      },
    });

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        merchantOrderId: merchantOrderId,
        orderNo: palmpayResponse.orderNo,
        amount: amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        // Virtual account details for bank transfer
        virtualAccount: {
          accountType: palmpayResponse.payerAccountType,
          accountId: palmpayResponse.payerAccountId,
          bankName: palmpayResponse.payerBankName,
          accountName: palmpayResponse.payerAccountName,
          accountNumber: palmpayResponse.payerVirtualAccNo,
        },
        checkoutUrl: palmpayResponse.checkoutUrl,
      }, 'Deposit initiated successfully. Please transfer to the provided virtual account.')
    );
  } catch (error: any) {
    console.error('Deposit initiation error:', error);
    return next(ApiError.internal(error.message || 'Failed to initiate deposit'));
  }
};

/**
 * Check deposit status
 * GET /api/v2/payments/palmpay/deposit/:transactionId
 */
export const checkDepositStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { transactionId } = req.params;

    // Get transaction
    const transaction = await prisma.fiatTransaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true },
    });

    if (!transaction) {
      return next(ApiError.notFound('Transaction not found'));
    }

    if (transaction.userId !== user.id) {
      return next(ApiError.unauthorized('Unauthorized access'));
    }

    // If transaction is already completed, return current status
    if (transaction.status === 'completed') {
      return res.status(200).json(
        new ApiResponse(200, {
          transactionId: transaction.id,
          orderId: transaction.palmpayOrderId,
          orderNo: transaction.palmpayOrderNo,
          status: transaction.status,
          amount: transaction.amount.toString(),
          currency: transaction.currency,
          completedAt: transaction.completedAt,
        }, 'Transaction status retrieved')
      );
    }

    // Query PalmPay for latest status
    if (transaction.palmpayOrderNo || transaction.palmpayOrderId) {
      try {
        const palmpayStatus = await palmpayCheckout.queryOrderStatus(
          transaction.palmpayOrderId || undefined,
          transaction.palmpayOrderNo || undefined
        );

        // Update transaction status
        let newStatus = transaction.status;
        if (palmpayStatus.orderStatus === 2) {
          newStatus = 'completed';
        } else if (palmpayStatus.orderStatus === 3) {
          newStatus = 'failed';
        } else if (palmpayStatus.orderStatus === 4) {
          newStatus = 'cancelled';
        }

        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayStatus: palmpayStatus.orderStatus.toString(),
            status: newStatus,
            ...(palmpayStatus.orderStatus === 2 && palmpayStatus.completedTime && {
              completedAt: new Date(palmpayStatus.completedTime),
            }),
          },
        });

        return res.status(200).json(
          new ApiResponse(200, {
            transactionId: transaction.id,
            orderId: transaction.palmpayOrderId,
            orderNo: transaction.palmpayOrderNo,
            status: newStatus,
            palmpayStatus: palmpayStatus.orderStatus,
            amount: transaction.amount.toString(),
            currency: transaction.currency,
            completedAt: palmpayStatus.completedTime ? new Date(palmpayStatus.completedTime).toISOString() : null,
          }, 'Transaction status retrieved')
        );
      } catch (error: any) {
        console.error('Error querying PalmPay status:', error);
        // Return current transaction status if query fails
      }
    }

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        orderId: transaction.palmpayOrderId,
        orderNo: transaction.palmpayOrderNo,
        status: transaction.status,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
      }, 'Transaction status retrieved')
    );
  } catch (error: any) {
    console.error('Check deposit status error:', error);
    return next(ApiError.internal(error.message || 'Failed to check deposit status'));
  }
};

/**
 * Deposit success page controller
 * GET /api/v2/payments/palmpay/deposit/success
 * This is the callback URL that PalmPay redirects to after successful payment
 */
export const depositSuccessController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    return res.status(200).json({
      status: 'success',
      message: 'Deposit completed successfully',
      data: {
        success: true,
        message: 'Your deposit has been processed successfully. Your wallet will be credited shortly.',
      },
    });
  } catch (error: any) {
    console.error('Error in depositSuccessController:', error);
    return res.status(200).json({
      status: 'success',
      message: 'Deposit completed successfully',
      data: {
        success: true,
        message: 'Your deposit has been processed successfully.',
      },
    });
  }
};

```

---

## 12) palmpay.payout.controller.ts

```ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayBanks } from '../../services/palmpay/palmpay.banks.service';
import { palmpayPayout } from '../../services/palmpay/palmpay.payout.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';
import { getCustomerRestrictions, isFeatureFrozen, FEATURE_WITHDRAWAL } from '../../utils/customer.restrictions';

/**
 * Get bank list
 * GET /api/v2/payments/palmpay/banks
 */
export const getBankListController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { businessType = 0 } = req.query;

    const banks = await palmpayBanks.queryBankList(Number(businessType));

    return res.status(200).json(
      new ApiResponse(200, banks, 'Bank list retrieved successfully')
    );
  } catch (error: any) {
    console.error('Get bank list error:', error);
    return next(ApiError.internal(error.message || 'Failed to get bank list'));
  }
};

/**
 * Verify bank account
 * POST /api/v2/payments/palmpay/verify-account
 */
export const verifyBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { bankCode, accountNumber } = req.body;

    if (!bankCode || !accountNumber) {
      return next(ApiError.badRequest('Bank code and account number are required'));
    }

    // Check if it's PalmPay account (bankCode "100033")
    if (bankCode === '100033') {
      const result = await palmpayBanks.queryAccount(accountNumber);
      return res.status(200).json(
        new ApiResponse(200, {
          accountName: result.accountName,
          accountStatus: result.accountStatus,
          isValid: result.accountStatus === 0,
        }, 'Account verified successfully')
      );
    }

    // Regular bank account
    const result = await palmpayBanks.queryBankAccount(bankCode, accountNumber);

    return res.status(200).json(
      new ApiResponse(200, {
        accountName: result.accountName,
        status: result.status,
        isValid: result.status === 'Success',
        errorMessage: result.errorMessage,
      }, 'Account verified successfully')
    );
  } catch (error: any) {
    console.error('Verify account error:', error);
    return next(ApiError.internal(error.message || 'Failed to verify account'));
  }
};

/**
 * Initiate payout (withdrawal)
 * POST /api/v2/payments/palmpay/payout/initiate
 */
export const initiatePayoutController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    const restrictions = await getCustomerRestrictions(user.id);
    if (restrictions.banned) {
      return next(ApiError.forbidden('Your account has been banned. Contact support.'));
    }
    if (isFeatureFrozen(restrictions, FEATURE_WITHDRAWAL)) {
      return next(ApiError.forbidden('Withdrawal is temporarily disabled for your account.'));
    }
    const { amount, currency = 'NGN', bankCode, accountNumber, accountName, phoneNumber } = req.body;

    // Validate inputs
    if (!amount || amount <= 0) {
      return next(ApiError.badRequest('Amount must be greater than 0'));
    }

    if (!bankCode || !accountNumber) {
      return next(ApiError.badRequest('Bank code and account number are required'));
    }

    // Convert amount to cents
    const amountInCents = Math.round(parseFloat(amount) * 100);
    if (amountInCents < 100) {
      return next(ApiError.badRequest('Minimum amount is 1.00 NGN'));
    }

    // Get or create wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, currency);

    // Check balance for withdrawal amount (no fees)
    const amountDecimal = parseFloat(amount);
    const balance = await fiatWalletService.getBalance(wallet.id);
    if (!balance || parseFloat(balance.balance) < amountDecimal) {
      return next(ApiError.badRequest(
        `Insufficient balance. Required: ${amountDecimal.toFixed(2)} ${currency.toUpperCase()}, Available: ${balance?.balance || '0'} ${currency.toUpperCase()}`
      ));
    }

    // Check withdrawal limits (daily and monthly) based on KYC tier
    try {
      // Fetch user with KYC tier information
      const userWithKyc = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          kycTier2Verified: true,
        },
      });

      // Set limits based on KYC tier
      // Tier 2 verified: 3,000 daily / 30,000 monthly
      // Default (Tier 1 or unverified): 1,000 daily / 10,000 monthly
      const DAILY_WITHDRAWAL_LIMIT = userWithKyc?.kycTier2Verified ? 3000 : 1000;
      const MONTHLY_WITHDRAWAL_LIMIT = userWithKyc?.kycTier2Verified ? 30000 : 10000;
      
      const now = new Date();
      
      // Calculate today's total withdrawals
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const dailyWithdrawals = await prisma.fiatTransaction.aggregate({
        where: {
          userId: user.id,
          type: 'WITHDRAW',
          status: { in: ['completed', 'successful', 'pending'] }, // Include pending as they're already debited
          currency: currency.toUpperCase(),
          createdAt: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const dailyTotal = dailyWithdrawals._sum.amount?.toNumber() || 0;
      const newDailyTotal = dailyTotal + amountDecimal;

      // Calculate current month's total withdrawals
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const monthlyWithdrawals = await prisma.fiatTransaction.aggregate({
        where: {
          userId: user.id,
          type: 'WITHDRAW',
          status: { in: ['completed', 'successful', 'pending'] }, // Include pending as they're already debited
          currency: currency.toUpperCase(),
          createdAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const monthlyTotal = monthlyWithdrawals._sum.amount?.toNumber() || 0;
      const newMonthlyTotal = monthlyTotal + amountDecimal;

      // Check daily limit first
      if (newDailyTotal > DAILY_WITHDRAWAL_LIMIT) {
        const remainingDaily = Math.max(0, DAILY_WITHDRAWAL_LIMIT - dailyTotal);
        return next(ApiError.badRequest(
          `Daily withdrawal limit exceeded. You are trying to withdraw ${amountDecimal.toLocaleString()} ${currency.toUpperCase()}, but your remaining daily limit is ${remainingDaily.toLocaleString()} ${currency.toUpperCase()}. Your daily limit is ${DAILY_WITHDRAWAL_LIMIT.toLocaleString()} ${currency.toUpperCase()} and you have already withdrawn ${dailyTotal.toLocaleString()} ${currency.toUpperCase()} today. Please reduce the withdrawal amount or try again tomorrow.`
        ));
      }

      // Check monthly limit
      if (newMonthlyTotal > MONTHLY_WITHDRAWAL_LIMIT) {
        const remainingMonthly = Math.max(0, MONTHLY_WITHDRAWAL_LIMIT - monthlyTotal);
        return next(ApiError.badRequest(
          `Monthly withdrawal limit exceeded. You are trying to withdraw ${amountDecimal.toLocaleString()} ${currency.toUpperCase()}, but your remaining monthly limit is ${remainingMonthly.toLocaleString()} ${currency.toUpperCase()}. Your monthly limit is ${MONTHLY_WITHDRAWAL_LIMIT.toLocaleString()} ${currency.toUpperCase()} and you have already withdrawn ${monthlyTotal.toLocaleString()} ${currency.toUpperCase()} this month. Please reduce the withdrawal amount or try again next month.`
        ));
      }
    } catch (limitError: any) {
      console.error('Withdrawal limit check error:', limitError);
      return next(ApiError.internal('Unable to verify withdrawal limits. Please try again or contact support.'));
    }

    // Generate unique order ID
    const orderId = `payout_${uuidv4().replace(/-/g, '')}`.substring(0, 32);

    // Create transaction record
    const transaction = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        type: 'WITHDRAW',
        status: 'pending',
        currency: currency.toUpperCase(),
        amount: parseFloat(amount),
        fees: 0, // No fees
        totalAmount: parseFloat(amount), // Total equals amount (no fees)
        description: `Withdrawal to ${accountNumber}`,
        palmpayOrderId: orderId,
        payeeName: accountName,
        payeeBankCode: bankCode,
        payeeBankAccNo: accountNumber,
        payeePhoneNo: phoneNumber,
      },
    });

    // Call PalmPay API to initiate payout
    const palmpayResponse = await palmpayPayout.initiatePayout({
      orderId,
      title: 'Withdrawal',
      description: `Withdrawal to ${accountNumber}`,
      payeeName: accountName || 'Unknown',
      payeeBankCode: bankCode,
      payeeBankAccNo: accountNumber,
      payeePhoneNo: phoneNumber,
      currency: currency.toUpperCase(),
      amount: amountInCents,
      notifyUrl: palmpayConfig.getWebhookUrl(),
      remark: `Withdrawal transaction for user ${user.id}`,
    });

    // Update transaction with PalmPay response (no fees)
    const totalAmount = parseFloat(amount); // Total equals amount (no fees)
    
    await prisma.fiatTransaction.update({
      where: { id: transaction.id },
      data: {
        palmpayOrderNo: palmpayResponse.orderNo,
        palmpayStatus: palmpayResponse.orderStatus.toString(),
        palmpaySessionId: palmpayResponse.sessionId,
        fees: 0, // No fees
        totalAmount: totalAmount,
        status: palmpayResponse.orderStatus === 2 ? 'completed' : 'pending',
        ...(palmpayResponse.orderStatus === 2 && { completedAt: new Date() }),
      },
    });

    // Debit wallet immediately after withdrawal is initiated (regardless of status)
    await fiatWalletService.debitWallet(wallet.id, totalAmount, transaction.id);

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        orderId: orderId,
        orderNo: palmpayResponse.orderNo,
        status: palmpayResponse.orderStatus === 2 ? 'completed' : 'pending',
        amount: amount,
        fees: 0, // No fees
        totalAmount: totalAmount,
        currency: currency.toUpperCase(),
        sessionId: palmpayResponse.sessionId,
      }, 'Payout initiated successfully')
    );
  } catch (error: any) {
    console.error('Payout initiation error:', error);
    return next(ApiError.internal(error.message || 'Failed to initiate payout'));
  }
};

/**
 * Check payout status
 * GET /api/v2/payments/palmpay/payout/:transactionId
 */
export const checkPayoutStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { transactionId } = req.params;

    // Get transaction
    const transaction = await prisma.fiatTransaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true },
    });

    if (!transaction) {
      return next(ApiError.notFound('Transaction not found'));
    }

    if (transaction.userId !== user.id) {
      return next(ApiError.unauthorized('Unauthorized access'));
    }

    // If transaction is already completed, return current status
    if (transaction.status === 'completed') {
      return res.status(200).json(
        new ApiResponse(200, {
          transactionId: transaction.id,
          orderId: transaction.palmpayOrderId,
          orderNo: transaction.palmpayOrderNo,
          status: transaction.status,
          amount: transaction.amount.toString(),
          fees: transaction.fees.toString(),
          totalAmount: transaction.totalAmount.toString(),
          currency: transaction.currency,
          completedAt: transaction.completedAt,
        }, 'Transaction status retrieved')
      );
    }

    // Query PalmPay for latest status
    if (transaction.palmpayOrderNo || transaction.palmpayOrderId) {
      try {
        const palmpayStatus = await palmpayPayout.queryPayStatus(
          transaction.palmpayOrderId || undefined,
          transaction.palmpayOrderNo || undefined
        );

        // Update transaction status
        let newStatus = transaction.status;
        if (palmpayStatus.orderStatus === 2) {
          newStatus = 'completed';
        } else if (palmpayStatus.orderStatus === 3) {
          newStatus = 'failed';
        } else if (palmpayStatus.orderStatus === 4) {
          newStatus = 'cancelled';
        }

        // Update transaction status (no fees - totalAmount equals amount)
        const totalAmount = transaction.amount.toNumber(); // Total equals amount (no fees)

        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayStatus: palmpayStatus.orderStatus.toString(),
            palmpaySessionId: palmpayStatus.sessionId,
            status: newStatus,
            fees: 0, // No fees
            totalAmount: totalAmount,
            ...(palmpayStatus.orderStatus === 2 && palmpayStatus.completedTime && {
              completedAt: new Date(palmpayStatus.completedTime),
            }),
          },
        });

        // Wallet is already debited immediately when withdrawal is initiated, so no need to debit again

        return res.status(200).json(
          new ApiResponse(200, {
            transactionId: transaction.id,
            orderId: transaction.palmpayOrderId,
            orderNo: transaction.palmpayOrderNo,
            status: newStatus,
            palmpayStatus: palmpayStatus.orderStatus,
            amount: transaction.amount.toString(),
            fees: '0', // No fees
            totalAmount: totalAmount.toString(),
            currency: transaction.currency,
            completedAt: palmpayStatus.completedTime ? new Date(palmpayStatus.completedTime).toISOString() : null,
          }, 'Transaction status retrieved')
        );
      } catch (error: any) {
        console.error('Error querying PalmPay status:', error);
        // Return current transaction status if query fails
      }
    }

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        orderId: transaction.palmpayOrderId,
        orderNo: transaction.palmpayOrderNo,
        status: transaction.status,
        amount: transaction.amount.toString(),
        fees: transaction.fees.toString(),
        totalAmount: transaction.totalAmount.toString(),
        currency: transaction.currency,
      }, 'Transaction status retrieved')
    );
  } catch (error: any) {
    console.error('Check payout status error:', error);
    return next(ApiError.internal(error.message || 'Failed to check payout status'));
  }
};

```

---

## 13) palmpay.billpayment.service.ts

```ts
import axios from 'axios';
import {
  PalmPaySceneCode,
  PalmPayQueryBillerRequest,
  PalmPayBiller,
  PalmPayQueryItemRequest,
  PalmPayItem,
  PalmPayQueryRechargeAccountRequest,
  PalmPayQueryRechargeAccountResponse,
  PalmPayCreateBillOrderRequest,
  PalmPayCreateBillOrderResponse,
  PalmPayQueryBillOrderRequest,
  PalmPayQueryBillOrderResponse,
  PalmPayBaseResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';
import palmpayLogger from '../../utils/palmpay.logger';

/**
 * PalmPay Bill Payment Service
 * Handles bill payment operations (airtime, data, betting)
 */
class PalmPayBillPaymentService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  /**
   * Query Billers (Operators) for a scene code
   * POST /api/v2/bill-payment/biller/query
   */
  async queryBillers(sceneCode: PalmPaySceneCode): Promise<PalmPayBiller[]> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryBillerRequest = {
      requestTime,
      nonceStr,
      version,
      sceneCode,
    };

    const signature = palmpayAuth.generateSignature(request);
    try {
      const response = await axios.post<PalmPayBiller[]>(
        `${this.baseUrl}/api/v2/bill-payment/biller/query`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      palmpayLogger.apiCall('/api/v2/bill-payment/biller/query', request, response.data);
      return response.data;
    } catch (error: any) {
      palmpayLogger.apiCall('/api/v2/bill-payment/biller/query', request, undefined, error);
      throw new Error(
        error.response?.data?.respMsg || error.message || 'Failed to query billers'
      );
    }
  }

  /**
   * Query Items (Packages) for a biller
   * POST /api/v2/bill-payment/item/query
   */
  async queryItems(
    sceneCode: PalmPaySceneCode,
    billerId: string
  ): Promise<PalmPayItem[]> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryItemRequest = {
      requestTime,
      nonceStr,
      version,
      sceneCode,
      billerId,
    };

    const signature = palmpayAuth.generateSignature(request);

    try {
      const response = await axios.post<PalmPayItem[]>(
        `${this.baseUrl}/api/v2/bill-payment/item/query`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      palmpayLogger.apiCall('/api/v2/bill-payment/item/query', request, response.data);
      return response.data;
    } catch (error: any) {
      palmpayLogger.apiCall('/api/v2/bill-payment/item/query', request, undefined, error);
      throw new Error(
        error.response?.data?.respMsg || error.message || 'Failed to query items'
      );
    }
  }

  /**
   * Query Recharge Account (Verify account)
   * POST /api/v2/bill-payment/rechargeaccount/query
   */
  async queryRechargeAccount(
    sceneCode: PalmPaySceneCode,
    rechargeAccount: string,
    billerId?: string,
    itemId?: string
  ): Promise<PalmPayQueryRechargeAccountResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryRechargeAccountRequest = {
      requestTime,
      nonceStr,
      version,
      sceneCode,
      rechargeAccount,
      ...(billerId && { billerId }),
      ...(itemId && { itemId }),
    };

    const signature = palmpayAuth.generateSignature(request);

    try {
      const response = await axios.post<PalmPayQueryRechargeAccountResponse>(
        `${this.baseUrl}/api/v2/bill-payment/rechargeaccount/query`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      palmpayLogger.apiCall('/api/v2/bill-payment/rechargeaccount/query', request, response.data);
      return response.data;
    } catch (error: any) {
      palmpayLogger.apiCall('/api/v2/bill-payment/rechargeaccount/query', request, undefined, error);
      throw new Error(
        error.response?.data?.respMsg || error.message || 'Failed to query recharge account'
      );
    }
  }

  /**
   * Create Bill Payment Order
   * POST /api/v2/bill-payment/order/create
   */
  async createOrder(
    request: Omit<PalmPayCreateBillOrderRequest, 'requestTime' | 'version' | 'nonceStr'>
  ): Promise<PalmPayCreateBillOrderResponse> {
    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const fullRequest: PalmPayCreateBillOrderRequest = {
      ...request,
      requestTime,
      version,
      nonceStr,
    };

    const signature = palmpayAuth.generateSignature(fullRequest);
    const endpoint = `${this.baseUrl}/api/v2/bill-payment/order/create`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
      'Signature': signature,
      'CountryCode': palmpayConfig.getCountryCode(),
    };

    // Log complete request details to console
    console.log('\n========================================');
    console.log('[PALMPAY BILL PAYMENT] CREATE ORDER REQUEST');
    console.log('========================================');
    console.log('📡 Complete URL:', endpoint);
    console.log('🔑 Signature:', signature);
    console.log('📋 Request Headers:', JSON.stringify(headers, null, 2));
    console.log('📦 Request Body:', JSON.stringify(fullRequest, null, 2));
    console.log('========================================\n');

    // Log to file via logger
    palmpayLogger.apiCall('/api/v2/bill-payment/order/create', fullRequest);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayCreateBillOrderResponse>>(
        endpoint,
        fullRequest,
        { headers }
      );

      // Log complete response details to console
      console.log('\n========================================');
      console.log('[PALMPAY BILL PAYMENT] CREATE ORDER RESPONSE');
      console.log('========================================');
      console.log('✅ Status Code:', response.status, response.statusText);
      console.log('📋 Response Headers:', JSON.stringify(response.headers, null, 2));
      console.log('📦 Full Response Body:', JSON.stringify(response.data, null, 2));
      console.log('🔍 Response Code:', response.data.respCode);
      console.log('💬 Response Message:', response.data.respMsg);
      if (response.data.data) {
        console.log('📊 Unwrapped Data:', JSON.stringify(response.data.data, null, 2));
      }
      console.log('========================================\n');

      // Check for errors in response
      if (response.data.respCode !== '00000000') {
        palmpayLogger.error('PalmPay createBillOrder - Error response', undefined, { 
          respCode: response.data.respCode,
          respMsg: response.data.respMsg,
          data: response.data.data
        });
        throw new Error(
          response.data.respMsg || 'Failed to create bill payment order'
        );
      }
      
      // Check if data exists
      if (!response.data.data) {
        palmpayLogger.error('PalmPay createBillOrder - No data in response', undefined, { response: response.data });
        throw new Error('PalmPay API returned no data');
      }
      
      // Log response for debugging (with both request and response)
      palmpayLogger.apiCall('/api/v2/bill-payment/order/create', fullRequest, response.data);
      
      // Validate response data structure
      const orderData = response.data.data;
      if (!orderData.orderNo && orderData.orderStatus === undefined) {
        palmpayLogger.error('PalmPay createBillOrder - Invalid data structure', undefined, { orderData });
        throw new Error(
          orderData?.msg || response.data.respMsg || 'Invalid response from PalmPay'
        );
      }

      return orderData;
    } catch (error: any) {
      // Log complete error details to console
      console.log('\n========================================');
      console.log('[PALMPAY BILL PAYMENT] CREATE ORDER ERROR');
      console.log('========================================');
      console.log('❌ Error Message:', error.message);
      console.log('📋 Error Stack:', error.stack);
      if (error.response) {
        console.log('📊 Response Status:', error.response.status, error.response.statusText);
        console.log('📋 Response Headers:', JSON.stringify(error.response.headers, null, 2));
        console.log('📦 Error Response Body:', JSON.stringify(error.response.data, null, 2));
      }
      if (error.request) {
        console.log('📡 Request Details:', error.request);
      }
      console.log('========================================\n');

      palmpayLogger.apiCall('/api/v2/bill-payment/order/create', fullRequest, undefined, error);
      const errorData = error.response?.data as any;
      throw new Error(
        errorData?.respMsg || 
        errorData?.msg || 
        error.message || 
        'Failed to create bill payment order'
      );
    }
  }

  /**
   * Query Bill Payment Order Status
   * POST /api/v2/bill-payment/order/query
   */
  async queryOrderStatus(
    sceneCode: PalmPaySceneCode,
    outOrderNo?: string,
    orderNo?: string
  ): Promise<PalmPayQueryBillOrderResponse> {
    if (!outOrderNo && !orderNo) {
      throw new Error('Either outOrderNo or orderNo must be provided');
    }

    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const request: PalmPayQueryBillOrderRequest = {
      requestTime,
      version,
      nonceStr,
      sceneCode,
      ...(outOrderNo && { outOrderNo }),
      ...(orderNo && { orderNo }),
    };

    const signature = palmpayAuth.generateSignature(request);

    // Log complete request details to console
    console.log('\n========================================');
    console.log('[PALMPAY BILL PAYMENT] QUERY ORDER STATUS REQUEST');
    console.log('========================================');
    console.log('🌐 Endpoint:', `${this.baseUrl}/api/v2/bill-payment/order/query`);
    console.log('🔑 Signature:', signature);
    console.log('📦 Request Body:', JSON.stringify(request, null, 2));
    console.log('========================================\n');

    // Log to file via logger
    palmpayLogger.apiCall('/api/v2/bill-payment/order/queryOrderStatus', request);

    try {
      const response = await axios.post<PalmPayBaseResponse<PalmPayQueryBillOrderResponse>>(
        `${this.baseUrl}/api/v2/bill-payment/order/query`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${palmpayConfig.getApiKey()}`,
            'Signature': signature,
            'CountryCode': palmpayConfig.getCountryCode(),
          },
        }
      );

      // Log complete response details to console
      console.log('\n========================================');
      console.log('[PALMPAY BILL PAYMENT] QUERY ORDER STATUS RESPONSE');
      console.log('========================================');
      console.log('✅ Status Code:', response.status, response.statusText);
      console.log('📦 Full Response Body:', JSON.stringify(response.data, null, 2));
      console.log('🔍 Response Code:', response.data.respCode);
      console.log('💬 Response Message:', response.data.respMsg);
      if (response.data.data) {
        console.log('📊 Unwrapped Data:', JSON.stringify(response.data.data, null, 2));
      }
      console.log('========================================\n');

      // Check for errors in response
      if (response.data.respCode !== '00000000') {
        palmpayLogger.error('PalmPay queryOrderStatus - Error response', undefined, { 
          respCode: response.data.respCode,
          respMsg: response.data.respMsg,
          data: response.data.data
        });
        throw new Error(
          response.data.respMsg || 'Failed to query order status'
        );
      }
      
      // Check if data exists
      if (!response.data.data) {
        palmpayLogger.error('PalmPay queryOrderStatus - No data in response', undefined, { response: response.data });
        throw new Error('PalmPay API returned no data');
      }
      
      // Log response for debugging (with both request and response)
      palmpayLogger.apiCall('/api/v2/bill-payment/order/queryOrderStatus', request, response.data);
      
      return response.data.data;
    } catch (error: any) {
      // Log complete error details to console
      console.log('\n========================================');
      console.log('[PALMPAY BILL PAYMENT] QUERY ORDER STATUS ERROR');
      console.log('========================================');
      console.log('❌ Error Message:', error.message);
      console.log('📋 Error Stack:', error.stack);
      if (error.response) {
        console.log('📊 Response Status:', error.response.status, error.response.statusText);
        console.log('📦 Error Response Body:', JSON.stringify(error.response.data, null, 2));
      }
      if (error.request) {
        console.log('📡 Request Details:', error.request);
      }
      console.log('========================================\n');

      palmpayLogger.apiCall('/api/v2/bill-payment/order/queryOrderStatus', request, undefined, error);
      const errorData = error.response?.data as any;
      throw new Error(
        errorData?.respMsg || error.message || 'Failed to query order status'
      );
    }
  }
}

// Export singleton instance
export const palmpayBillPaymentService = new PalmPayBillPaymentService();

```

---

## 14) billpayment.controller.ts (full)

```ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayBillPaymentService } from '../../services/palmpay/palmpay.billpayment.service';
import { vtpassBillPaymentService } from '../../services/vtpass/vtpass.billpayment.service';
import { reloadlyAirtimeService } from '../../services/reloadly/reloadly.airtime.service';
import { reloadlyUtilitiesService } from '../../services/reloadly/reloadly.utilities.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';
import { Decimal } from '@prisma/client/runtime/library';
import { PalmPaySceneCode, PalmPayOrderStatus } from '../../types/palmpay.types';
import { creditReferralCommission, ReferralService } from '../../services/referral/referral.commission.service';

/**
 * Query Billers (Operators) for a scene code
 * GET /api/v2/bill-payments/billers?sceneCode=airtime&provider=palmpay|vtpass
 */
export const queryBillersController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, provider = 'palmpay' } = req.query;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    if (provider !== 'palmpay' && provider !== 'vtpass' && provider !== 'reloadly') {
      return next(ApiError.badRequest('provider must be either "palmpay", "vtpass", or "reloadly"'));
    }

    let billers;
    let actualProvider = provider;
    
    // For airtime, always use Reloadly
    if (sceneCode === 'airtime') {
      const reloadlyBillers = await reloadlyAirtimeService.getBillers();
      billers = reloadlyBillers.map(b => ({
        billerId: b.billerId,
        billerName: b.billerName,
        operatorId: b.operatorId,
      }));
      actualProvider = 'reloadly';
    } 
    // For electricity with Reloadly
    else if (sceneCode === 'electricity' && provider === 'reloadly') {
      const reloadlyBillers = await reloadlyUtilitiesService.getNigeriaElectricityBillers();
      billers = reloadlyBillers.map(b => ({
        billerId: b.id.toString(), // Use Reloadly biller ID as string
        billerName: b.name,
        serviceType: b.serviceType,
        type: b.type,
        minAmount: b.minLocalTransactionAmount,
        maxAmount: b.maxLocalTransactionAmount,
        currency: b.localTransactionCurrencyCode,
      }));
      actualProvider = 'reloadly';
    } 
    else if (provider === 'vtpass') {
      billers = await vtpassBillPaymentService.queryBillers(sceneCode as any);
    } else {
      billers = await palmpayBillPaymentService.queryBillers(sceneCode as any);
    }

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        provider: actualProvider,
        billers,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query billers'));
  }
};

/**
 * Query Items (Packages) for a biller
 * GET /api/v2/bill-payments/items?sceneCode=airtime&billerId=MTN&provider=palmpay|vtpass
 */
export const queryItemsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, billerId, provider = 'palmpay' } = req.query;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    if (!billerId || typeof billerId !== 'string') {
      return next(ApiError.badRequest('billerId is required'));
    }

    if (provider !== 'palmpay' && provider !== 'vtpass' && provider !== 'reloadly') {
      return next(ApiError.badRequest('provider must be either "palmpay", "vtpass", or "reloadly"'));
    }

    let items: any[] = [];
    let actualProvider = provider;
    
    // For airtime, always use Reloadly (returns empty items - user-specified amounts)
    if (sceneCode === 'airtime') {
      items = []; // Reloadly airtime uses user-specified amounts
      actualProvider = 'reloadly';
    } 
    // For electricity with Reloadly (returns empty items - user-specified amounts)
    else if (sceneCode === 'electricity' && provider === 'reloadly') {
      items = []; // Reloadly utilities uses user-specified amounts
      actualProvider = 'reloadly';
    } 
    else if (provider === 'vtpass') {
      items = await vtpassBillPaymentService.queryItems(sceneCode as any, billerId);
    } else {
      items = await palmpayBillPaymentService.queryItems(sceneCode as any, billerId);
    }

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        billerId,
        provider: actualProvider,
        items,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query items'));
  }
};

/**
 * Verify Recharge Account
 * POST /api/v2/bill-payments/verify-account
 */
export const verifyAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, rechargeAccount, billerId, itemId, provider = 'palmpay' } = req.body;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    if (!rechargeAccount || typeof rechargeAccount !== 'string') {
      return next(ApiError.badRequest('rechargeAccount is required'));
    }

    if (rechargeAccount.length > 50) { // Increased for meter numbers
      return next(ApiError.badRequest('rechargeAccount must be 50 characters or less'));
    }

    if (provider !== 'palmpay' && provider !== 'vtpass') {
      return next(ApiError.badRequest('provider must be either "palmpay" or "vtpass"'));
    }

    // For betting (PalmPay only), billerId and itemId are required
    if (provider === 'palmpay' && sceneCode === 'betting' && (!billerId || !itemId)) {
      return next(ApiError.badRequest('billerId and itemId are required for betting'));
    }

    // For electricity (VTpass), itemId (meterType) is required
    if (provider === 'vtpass' && sceneCode === 'electricity' && !itemId) {
      return next(ApiError.badRequest('itemId (meterType: prepaid or postpaid) is required for electricity verification'));
    }

    let result;
    let actualProvider = provider;
    
    // For airtime, use Reloadly auto-detect
    if (sceneCode === 'airtime') {
      const operator = await reloadlyAirtimeService.autoDetectOperator(rechargeAccount, 'NG');
      if (operator) {
        result = {
          biller: operator.name,
          billerId: billerId || operator.name.toUpperCase(),
          valid: true,
        };
      } else {
        // If auto-detect fails, still return valid (basic phone validation)
        result = {
          biller: billerId || 'Unknown',
          billerId: billerId || 'UNKNOWN',
          valid: /^0\d{10}$/.test(rechargeAccount), // Basic phone format validation
        };
      }
      actualProvider = 'reloadly';
    } else if (provider === 'vtpass') {
      result = await vtpassBillPaymentService.queryRechargeAccount(
        sceneCode as any,
        rechargeAccount,
        billerId,
        itemId
      );
    } else {
      result = await palmpayBillPaymentService.queryRechargeAccount(
        sceneCode as any,
        rechargeAccount,
        billerId,
        itemId
      );
    }

    // Handle different result types from different providers
    const billerName = (result as any).biller || (result as any).billerId || undefined;
    const isValid = (result as any).valid !== undefined ? (result as any).valid !== false : true;

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        provider: actualProvider,
        rechargeAccount,
        biller: billerName,
        valid: isValid,
        result,
      })
    );
  } catch (error: any) {
    // If account is invalid, return error but don't crash
    if (error.message?.includes('INVALID_RECHARGE_ACCOUNT')) {
      return res.status(200).json(
        new ApiResponse(200, {
          valid: false,
          error: error.message,
        })
      );
    }
    next(ApiError.internal(error.message || 'Failed to verify account'));
  }
};

/**
 * Create Bill Payment Order
 * POST /api/v2/bill-payments/create-order
 * 
 * IMPORTANT: This debits the user's wallet BEFORE creating the provider order
 * If provider order creation fails, we refund the wallet
 * 
 * Supports both PalmPay and VTpass providers
 */
export const createBillOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { sceneCode, billerId, itemId, rechargeAccount, amount, pin, provider = 'palmpay', phone } = req.body;

    // Validate inputs
    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    // Determine actual provider (for airtime, always use Reloadly)
    const actualProvider = sceneCode === 'airtime' ? 'reloadly' : provider;

    if (actualProvider !== 'palmpay' && actualProvider !== 'vtpass' && actualProvider !== 'reloadly') {
      return next(ApiError.badRequest('provider must be either "palmpay" or "vtpass"'));
    }

    // For airtime (Reloadly), itemId is not required
    if (sceneCode === 'airtime') {
      if (!billerId || !rechargeAccount || !amount) {
        return next(ApiError.badRequest('Missing required fields: billerId, rechargeAccount, amount'));
      }
    }
    // For PalmPay (non-airtime), all fields required
    else if (actualProvider === 'palmpay' && (!billerId || !itemId || !rechargeAccount || !amount)) {
      return next(ApiError.badRequest('Missing required fields: billerId, itemId, rechargeAccount, amount'));
    }
    // For VTpass
    else if (actualProvider === 'vtpass') {
      if (!billerId || !rechargeAccount || !amount) {
        return next(ApiError.badRequest('Missing required fields: billerId, rechargeAccount, amount'));
      }
      // For VTpass, itemId is optional for airtime, required for others
      if (sceneCode !== 'airtime' && !itemId) {
        return next(ApiError.badRequest('itemId is required for VTpass ' + sceneCode));
      }
      // Phone is required for VTpass
      if (!phone || typeof phone !== 'string') {
        return next(ApiError.badRequest('phone is required for VTpass'));
      }
    }

    // Validate PIN
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return next(ApiError.badRequest('Invalid PIN. Must be 4 digits'));
    }

    // Verify PIN
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { pin: true },
    });

    if (!userRecord?.pin || userRecord.pin !== pin) {
      return next(ApiError.unauthorized('Invalid PIN'));
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return next(ApiError.badRequest('Amount must be greater than 0'));
    }

    // Convert amount to cents (for PalmPay only)
    const amountInCents = Math.round(amountNum * 100);
    if (actualProvider === 'palmpay' && amountInCents < 100) {
      return next(ApiError.badRequest('Minimum amount is 1.00 NGN'));
    }

    // Get user's NGN wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, 'NGN');

    // Check balance
    const balance = parseFloat(wallet.balance.toString());
    if (balance < amountNum) {
      return next(ApiError.badRequest('Insufficient balance'));
    }

    // Generate unique order ID / request ID
    const outOrderNo = provider === 'vtpass' 
      ? undefined // VTpass generates its own request_id
      : `bill_${uuidv4().replace(/-/g, '')}`.substring(0, 64);
    const transactionId = uuidv4();

    // Create transaction record (status: pending)
    const transaction = await prisma.fiatTransaction.create({
      data: {
        id: transactionId,
        userId: user.id,
        walletId: wallet.id,
        type: 'BILL_PAYMENT',
        status: 'pending',
        currency: 'NGN',
        amount: amountNum,
        fees: 0,
        totalAmount: amountNum,
        description: `${sceneCode} payment - ${billerId} - ${rechargeAccount} (${actualProvider})`,
        palmpayOrderId: outOrderNo || undefined,
      },
    });

    // Get biller info for VTpass/Reloadly
    let serviceID: string | undefined;
    let billerName: string | undefined;
    let operatorId: number | undefined;
    let reloadlyBillerId: number | undefined;
    
    if (actualProvider === 'reloadly' && sceneCode === 'airtime') {
      // Get Reloadly operator info
      const operator = await reloadlyAirtimeService.findOperatorByBillerId(billerId);
      if (!operator) {
        return next(ApiError.badRequest(`Invalid billerId: ${billerId} for Reloadly airtime`));
      }
      operatorId = operator.operatorId;
      billerName = operator.name;
    } else if (actualProvider === 'reloadly' && sceneCode === 'electricity') {
      // Get Reloadly utility biller info
      reloadlyBillerId = parseInt(billerId, 10);
      if (isNaN(reloadlyBillerId)) {
        return next(ApiError.badRequest(`Invalid billerId: ${billerId}. Reloadly electricity billerId must be a number`));
      }
      const biller = await reloadlyUtilitiesService.getBillerById(reloadlyBillerId);
      if (!biller) {
        return next(ApiError.badRequest(`Invalid billerId: ${billerId} for Reloadly electricity`));
      }
      billerName = biller.name;
    } else if (actualProvider === 'vtpass') {
      const billers = await vtpassBillPaymentService.queryBillers(sceneCode as any);
      const biller = billers.find(b => b.billerId === billerId);
      if (!biller) {
        return next(ApiError.badRequest(`Invalid billerId: ${billerId} for sceneCode: ${sceneCode}`));
      }
      serviceID = biller.serviceID;
      billerName = biller.billerName;
    }

    // Create dedicated BillPayment record
    const billPayment = await prisma.billPayment.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        transactionId: transaction.id,
        provider: actualProvider,
        sceneCode: sceneCode,
        billType: sceneCode.toUpperCase(),
        billerId: billerId,
        billerName: billerName,
        itemId: itemId || '', // Empty for VTpass airtime
        rechargeAccount: rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        status: 'pending',
        palmpayOrderId: outOrderNo || undefined,
      },
    });

    let providerResponse: any;
    let orderNo: string | null = null;
    let orderStatus: number | null = null;
    let requestId: string | null = null;

    try {
      // DEBIT USER WALLET FIRST
      await fiatWalletService.debitWallet(
        wallet.id,
        amountNum,
        transaction.id,
        `Bill payment: ${sceneCode} - ${billerId} (${actualProvider})`
      );

      // For airtime, use Reloadly
      if (actualProvider === 'reloadly' && sceneCode === 'airtime') {
        if (!operatorId) {
          throw new Error('Operator ID not found');
        }

        // Create Reloadly top-up
        const reloadlyResponse = await reloadlyAirtimeService.makeTopup(
          operatorId,
          rechargeAccount,
          amountNum,
          transaction.id // Use transaction ID as custom identifier
        );

        // Map Reloadly status to our order status format
        const statusMap: Record<string, number> = {
          'SUCCESSFUL': 2,
          'PENDING': 1,
          'FAILED': 3,
          'REFUNDED': 3,
        };
        orderStatus = statusMap[reloadlyResponse.status] || 1;
        orderNo = reloadlyResponse.transactionId.toString();
        requestId = reloadlyResponse.customIdentifier || reloadlyResponse.transactionId.toString();
        providerResponse = reloadlyResponse;

        // Update transaction and bill payment
        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayOrderId: requestId,
            palmpayOrderNo: orderNo,
            palmpayStatus: reloadlyResponse.status,
          },
        });

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            palmpayOrderId: requestId,
            palmpayOrderNo: orderNo,
            palmpayStatus: reloadlyResponse.status,
            providerResponse: JSON.stringify(reloadlyResponse),
          },
        });

        // If order status is SUCCESSFUL, mark transaction as completed
        if (reloadlyResponse.status === 'SUCCESSFUL') {
          await prisma.fiatTransaction.update({
            where: { id: transaction.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          });

          await prisma.billPayment.update({
            where: { id: billPayment.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
              billReference: reloadlyResponse.operatorTransactionId || orderNo,
            },
          });

          creditReferralCommission(user.id, ReferralService.BILL_PAYMENT, amountNum)
            .catch((err) => console.error('[BillPayment] Referral commission error:', err));
        }
      } else if (actualProvider === 'reloadly' && sceneCode === 'electricity') {
        if (!reloadlyBillerId) {
          throw new Error('Reloadly biller ID not found');
        }

        // Create Reloadly utility payment
        const reloadlyResponse = await reloadlyUtilitiesService.payBill({
          billerId: reloadlyBillerId,
          subscriberAccountNumber: rechargeAccount,
          amount: amountNum,
          referenceId: transaction.id,
          useLocalAmount: true, // Use NGN
        });

        // Map Reloadly status to our order status format
        const statusMap: Record<string, number> = {
          'SUCCESSFUL': 2,
          'PROCESSING': 1,
          'FAILED': 3,
          'REFUNDED': 3,
        };
        orderStatus = statusMap[reloadlyResponse.status] || 1;
        orderNo = reloadlyResponse.id.toString();
        requestId = reloadlyResponse.referenceId;
        providerResponse = reloadlyResponse;

        // Update transaction and bill payment
        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayOrderId: requestId,
            palmpayOrderNo: orderNo,
            palmpayStatus: reloadlyResponse.status,
          },
        });

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            palmpayOrderId: requestId,
            palmpayOrderNo: orderNo,
            palmpayStatus: reloadlyResponse.status,
            providerResponse: JSON.stringify(reloadlyResponse),
          },
        });

        // If order status is SUCCESSFUL, mark transaction as completed
        if (reloadlyResponse.status === 'SUCCESSFUL') {
          await prisma.fiatTransaction.update({
            where: { id: transaction.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          });

          await prisma.billPayment.update({
            where: { id: billPayment.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
              billReference: reloadlyResponse.referenceId || orderNo,
            },
          });

          creditReferralCommission(user.id, ReferralService.BILL_PAYMENT, amountNum)
            .catch((err) => console.error('[BillPayment] Referral commission error:', err));
        }
      } else if (actualProvider === 'vtpass') {
        // Get meterType for electricity
        const meterType = sceneCode === 'electricity' && itemId 
          ? (itemId === 'prepaid' || itemId === 'postpaid' ? itemId : undefined)
          : undefined;

        if (sceneCode === 'electricity' && !meterType) {
          throw new Error('itemId must be "prepaid" or "postpaid" for electricity');
        }

        // Create VTpass order
        const vtpassResponse = await vtpassBillPaymentService.createOrder({
          sceneCode: sceneCode as any,
          serviceID: serviceID!,
          billerId,
          itemId: itemId || undefined, // Optional for airtime
          rechargeAccount,
          amount: amountNum,
          phone,
          meterType,
        });

        requestId = vtpassResponse.requestId;
        orderNo = vtpassResponse.transactionId;
        orderStatus = vtpassResponse.orderStatus;
        providerResponse = vtpassResponse;

        // Update transaction and bill payment
        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayOrderId: requestId, // Store request_id here
            palmpayOrderNo: orderNo, // Store transactionId here
            palmpayStatus: vtpassResponse.orderStatus === 2 ? 'delivered' : vtpassResponse.orderStatus === 1 ? 'pending' : 'failed',
          },
        });

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            palmpayOrderId: requestId,
            palmpayOrderNo: orderNo,
            palmpayStatus: vtpassResponse.orderStatus === 2 ? 'delivered' : vtpassResponse.orderStatus === 1 ? 'pending' : 'failed',
            providerResponse: JSON.stringify(vtpassResponse),
          },
        });

        // If order status is SUCCESS (2), mark transaction as completed
        if (vtpassResponse.orderStatus === 2) {
          await prisma.fiatTransaction.update({
            where: { id: transaction.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          });

          await prisma.billPayment.update({
            where: { id: billPayment.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
              billReference: orderNo,
            },
          });

          creditReferralCommission(user.id, ReferralService.BILL_PAYMENT, amountNum)
            .catch((err) => console.error('[BillPayment] Referral commission error:', err));
        }
      } else {
        // PalmPay flow
        const palmpayResponse = await palmpayBillPaymentService.createOrder({
          sceneCode: sceneCode as any,
          outOrderNo: outOrderNo!,
          amount: amountInCents,
          notifyUrl: `${palmpayConfig.getWebhookUrl()}/bill-payment`,
          billerId,
          itemId,
          rechargeAccount,
          title: `${sceneCode} Payment`,
          description: `${sceneCode} payment for ${rechargeAccount}`,
          relationId: user.id.toString(),
        });

        // Validate PalmPay response
        if (!palmpayResponse || !palmpayResponse.orderNo || palmpayResponse.orderStatus === undefined) {
          throw new Error(
            `Invalid PalmPay response: ${JSON.stringify(palmpayResponse)}`
          );
        }

        orderNo = palmpayResponse.orderNo;
        orderStatus = palmpayResponse.orderStatus;
        providerResponse = palmpayResponse;

        // Update transaction with PalmPay order number
        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayOrderNo: palmpayResponse.orderNo,
            palmpayStatus: palmpayResponse.orderStatus?.toString() || null,
          },
        });

        // Update BillPayment record
        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            palmpayOrderNo: palmpayResponse.orderNo,
            palmpayStatus: palmpayResponse.orderStatus?.toString() || null,
            providerResponse: JSON.stringify(palmpayResponse),
          },
        });

        // If order status is SUCCESS (2), mark transaction as completed
        if (palmpayResponse.orderStatus === 2) {
          await prisma.fiatTransaction.update({
            where: { id: transaction.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          });

          await prisma.billPayment.update({
            where: { id: billPayment.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
              billReference: palmpayResponse.orderNo,
            },
          });

          creditReferralCommission(user.id, ReferralService.BILL_PAYMENT, amountNum)
            .catch((err) => console.error('[BillPayment] Referral commission error:', err));
        }
      }
    } catch (error: any) {
      // If provider order creation fails, REFUND the wallet
      try {
        // Get current wallet balance
        const currentWallet = await prisma.fiatWallet.findUnique({
          where: { id: wallet.id },
        });

        if (currentWallet) {
          // Refund the amount
          const refundAmount = new Decimal(currentWallet.balance).plus(amountNum);
          await prisma.fiatWallet.update({
            where: { id: wallet.id },
            data: { balance: refundAmount },
          });

          // Create refund transaction record
          await prisma.fiatTransaction.create({
            data: {
              id: uuidv4(),
              userId: user.id,
              walletId: wallet.id,
              type: 'BILL_PAYMENT',
              status: 'completed',
              currency: 'NGN',
              amount: amountNum,
              fees: 0,
              totalAmount: amountNum,
              description: `Refund for failed bill payment: ${transaction.id}`,
              metadata: JSON.stringify({
                refundFor: transaction.id,
                reason: error.message,
                provider: actualProvider,
              }),
            },
          });
        }
      } catch (refundError) {
        console.error(`Failed to refund wallet after ${provider} error:`, refundError);
        // Log this for manual intervention
      }

      // Update transaction status to failed
      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          errorMessage: error.message || `Failed to create ${actualProvider} order`,
        },
      });

      // Update BillPayment record
      await prisma.billPayment.update({
        where: { id: billPayment.id },
        data: {
          status: 'failed',
          errorMessage: error.message || `Failed to create ${actualProvider} order`,
        },
      }).catch(() => {
        // BillPayment might not exist if creation failed early
      });

      throw error;
    }

    return res.status(200).json(
      new ApiResponse(200, {
        billPaymentId: billPayment.id,
        transactionId: transaction.id,
        orderNo: orderNo || null,
        outOrderNo: outOrderNo || requestId || null,
        requestId: requestId || null, // VTpass request ID
        sceneCode,
        provider: actualProvider,
        billerId,
        itemId: itemId || null,
        rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        orderStatus: orderStatus ?? null,
        status: orderStatus === 2 ? 'completed' : 'pending',
        message: providerResponse?.msg || providerResponse?.response_description || null,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to create bill payment order'));
  }
};

/**
 * Query Bill Payment Order Status
 * GET /api/v2/bill-payments/order-status?sceneCode=airtime&orderNo=xxx
 * OR
 * GET /api/v2/bill-payments/order-status?billPaymentId=xxx
 */
export const queryOrderStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, outOrderNo, orderNo, billPaymentId } = req.query;
    const user = req.body._user;

    let billPayment;

    // If billPaymentId is provided, query by that first
    if (billPaymentId) {
      billPayment = await prisma.billPayment.findFirst({
        where: {
          id: billPaymentId as string,
          userId: user.id, // Ensure user owns this bill payment
        },
        include: { transaction: true },
      });

      if (!billPayment) {
        return next(ApiError.notFound('Bill payment not found'));
      }
    } else {
      // Query by sceneCode and order numbers
      const where: any = {
        userId: user.id,
      };

      if (sceneCode && typeof sceneCode === 'string') {
        where.sceneCode = sceneCode;
      }

      if (outOrderNo || orderNo) {
        where.OR = [];
        if (outOrderNo) {
          where.OR.push({ palmpayOrderId: outOrderNo as string });
        }
        if (orderNo) {
          where.OR.push({ palmpayOrderNo: orderNo as string });
        }
      } else {
        return next(ApiError.badRequest('Either billPaymentId, outOrderNo, or orderNo must be provided'));
      }

      billPayment = await prisma.billPayment.findFirst({
        where,
        include: { transaction: true },
      });

      if (!billPayment) {
        return next(ApiError.notFound('Bill payment not found'));
      }
    }

    // Build response from database record
    const palmpayStatus = billPayment.palmpayStatus ? parseInt(billPayment.palmpayStatus) : null;
    
    return res.status(200).json(
      new ApiResponse(200, {
        orderStatus: {
          outOrderNo: billPayment.palmpayOrderId || null,
          orderNo: billPayment.palmpayOrderNo || null,
          billerId: billPayment.billerId || null,
          itemId: billPayment.itemId || null,
          orderStatus: palmpayStatus,
          amount: billPayment.amount ? billPayment.amount.toNumber() : null,
          sceneCode: billPayment.sceneCode,
          currency: billPayment.currency || 'NGN',
          errorMsg: billPayment.errorMessage || null,
          completedTime: billPayment.completedAt ? billPayment.completedAt.getTime() : null,
        },
        billPayment: {
          id: billPayment.id,
          transactionId: billPayment.transactionId,
          provider: billPayment.provider,
          status: billPayment.status,
          sceneCode: billPayment.sceneCode,
          billType: billPayment.billType,
          billerId: billPayment.billerId,
          billerName: billPayment.billerName,
          itemId: billPayment.itemId,
          itemName: billPayment.itemName,
          rechargeAccount: billPayment.rechargeAccount,
          amount: billPayment.amount.toString(),
          currency: billPayment.currency,
          palmpayOrderId: billPayment.palmpayOrderId,
          palmpayOrderNo: billPayment.palmpayOrderNo,
          palmpayStatus: billPayment.palmpayStatus,
          billReference: billPayment.billReference,
          errorMessage: billPayment.errorMessage,
          createdAt: billPayment.createdAt,
          completedAt: billPayment.completedAt,
        },
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query order status'));
  }
};

/**
 * Get Bill Payment History
 * GET /api/v2/bill-payments/history
 */
export const getBillPaymentHistoryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { page = 1, limit = 20, sceneCode, billerId, status, provider } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {
      userId: user.id,
    };

    if (sceneCode) {
      where.sceneCode = sceneCode;
    }

    if (provider) {
      where.provider = provider;
    }

    if (billerId) {
      where.billerId = billerId;
    }

    if (status) {
      where.status = status;
    }

    const [billPayments, total] = await Promise.all([
      prisma.billPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
        select: {
          id: true,
          transactionId: true,
          provider: true,
          sceneCode: true,
          billType: true,
          billerId: true,
          billerName: true,
          itemId: true,
          itemName: true,
          rechargeAccount: true,
          amount: true,
          currency: true,
          status: true,
          palmpayOrderId: true,
          palmpayOrderNo: true,
          palmpayStatus: true,
          billReference: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.billPayment.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(200, {
        billPayments,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to get bill payment history'));
  }
};

```

---

## 15) palmpay.webhook.controller.ts

```ts
import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import { prisma } from '../../utils/prisma';
import { palmpayAuth } from '../../services/palmpay/palmpay.auth.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { PalmPayDepositWebhook, PalmPayPayoutWebhook, PalmPayOrderStatus, PalmPayBillPaymentWebhook } from '../../types/palmpay.types';
import { Decimal } from '@prisma/client/runtime/library';
import palmpayLogger from '../../utils/palmpay.logger';
import { sendPushNotification } from '../../utils/pushService';
import { InAppNotificationType } from '@prisma/client';

/**
 * PalmPay Webhook Handler
 * Handles both deposit and payout webhooks
 * POST /api/v2/webhooks/palmpay
 * 
 * CRITICAL: Must return plain text "success" (not JSON)
 */
export const palmpayWebhookController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // ============================================
  // ✅ SAVE RAW WEBHOOK IMMEDIATELY
  // ============================================

  let rawWebhookId: number | null = null;

  try {
    const webhookData = req.body;
    
    const rawWebhook = await prisma.palmPayRawWebhook.create({
      data: {
        rawData: JSON.stringify(webhookData),
        headers: JSON.stringify(req.headers),
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: req.get("user-agent") || null,
        processed: false,
      },
    });

    rawWebhookId = rawWebhook.id;
    palmpayLogger.webhookReceived(webhookData, req.headers, req.ip);
    palmpayLogger.info(`Saved raw PalmPay webhook (ID: ${rawWebhookId})`, {
      rawWebhookId,
      orderNo: webhookData?.orderNo,
      outOrderNo: webhookData?.outOrderNo,
      orderStatus: webhookData?.orderStatus,
    });
  } catch (saveError: any) {
    palmpayLogger.exception('Save raw PalmPay webhook', saveError, {
      webhookData: req.body?.orderNo || req.body?.outOrderNo || 'unknown',
    });
    // Continue even if save fails - don't block webhook receipt
  }

  // ============================================
  // ✅ PROCESS WEBHOOK
  // ============================================

  try {
    const webhookData = req.body as any; // Use any to handle extra fields like transType, orderType, etc.

    // Skip signature validation for now (as requested)
    // const signature = webhookData.sign;
    // if (!signature) return res.status(200).send("success");
    // const isValid = palmpayAuth.verifyWebhookSignature(webhookData, signature);
    // if (!isValid) return res.status(200).send("success");

    const orderId = webhookData.orderId; // This is the merchantOrderId
    const orderNo = webhookData.orderNo;
    const orderStatus = webhookData.orderStatus;
    const amount = webhookData.amount; // Amount in cents
    const currency = webhookData.currency || 'NGN';
    const completeTime = webhookData.completeTime || webhookData.completedTime; // Handle both field names

    palmpayLogger.info('Processing PalmPay webhook', {
      orderId,
      orderNo,
      orderStatus,
      amount,
      currency,
      rawWebhookId,
    });

    // Check if this is a deposit webhook (has orderId that starts with "deposit_")
    if (orderId && orderId.startsWith('deposit_')) {
      // Find the PalmPayUserVirtualAccount by merchantOrderId
      const virtualAccountRecord = await prisma.palmPayUserVirtualAccount.findUnique({
        where: { merchantOrderId: orderId },
        include: {
          user: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
            },
          },
        },
      });

      if (!virtualAccountRecord) {
        palmpayLogger.warn(`PalmPay deposit webhook: Virtual account record not found for orderId ${orderId}`, {
          orderId,
          orderNo,
        });
        
        // Mark webhook as processed even if not found
        if (rawWebhookId) {
          await prisma.palmPayRawWebhook.update({
            where: { id: rawWebhookId },
            data: {
              processed: true,
              processedAt: new Date(),
              errorMessage: `Virtual account record not found for orderId: ${orderId}`,
            },
          });
        }
        return res.status(200).send("success");
      }

      const userId = virtualAccountRecord.userId;
      const fiatTransactionId = virtualAccountRecord.fiatTransactionId;

      if (!fiatTransactionId) {
        palmpayLogger.warn(`PalmPay deposit webhook: No fiatTransactionId found for orderId ${orderId}`, {
          orderId,
          orderNo,
          virtualAccountRecordId: virtualAccountRecord.id,
        });
        
        if (rawWebhookId) {
          await prisma.palmPayRawWebhook.update({
            where: { id: rawWebhookId },
            data: {
              processed: true,
              processedAt: new Date(),
              errorMessage: `No fiatTransactionId found for orderId: ${orderId}`,
            },
          });
        }
        return res.status(200).send("success");
      }

      // Find the fiat transaction
      const transaction = await prisma.fiatTransaction.findUnique({
        where: { id: fiatTransactionId },
        include: {
          wallet: true,
        },
      });

      if (!transaction) {
        palmpayLogger.warn(`PalmPay deposit webhook: Transaction not found for id ${fiatTransactionId}`, {
          orderId,
          orderNo,
          fiatTransactionId,
        });
        
        if (rawWebhookId) {
          await prisma.palmPayRawWebhook.update({
            where: { id: rawWebhookId },
            data: {
              processed: true,
              processedAt: new Date(),
              errorMessage: `Transaction not found for id: ${fiatTransactionId}`,
            },
          });
        }
        return res.status(200).send("success");
      }

      // ============================================
      // ✅ IDEMPOTENCY CHECK - Prevent duplicate processing
      // ============================================
      // Check if transaction is already completed - this is our source of truth
      // The webhook always sends orderStatus=2 for success, so we can't rely on that
      // Instead, we check our transaction record status
      if (transaction.status === 'completed') {
        palmpayLogger.info(`PalmPay deposit webhook: Already processed - skipping duplicate webhook`, {
          orderId,
          orderNo,
          transactionId: fiatTransactionId,
          transactionStatus: transaction.status,
          palmpayOrderNo: transaction.palmpayOrderNo,
        });
        
        // Update virtual account record with latest orderNo if different (idempotent update)
        if (virtualAccountRecord.palmpayOrderNo !== orderNo || virtualAccountRecord.orderStatus !== orderStatus) {
          await prisma.palmPayUserVirtualAccount.update({
            where: { id: virtualAccountRecord.id },
            data: {
              palmpayOrderNo: orderNo,
              orderStatus: orderStatus,
            },
          });
        }
        
        // Mark raw webhook as processed but skip actual processing
        if (rawWebhookId) {
          await prisma.palmPayRawWebhook.update({
            where: { id: rawWebhookId },
            data: {
              processed: true,
              processedAt: new Date(),
            },
          });
        }
        return res.status(200).send("success");
      }

      // Update virtual account record with latest status (only if changed)
      if (virtualAccountRecord.palmpayOrderNo !== orderNo || virtualAccountRecord.orderStatus !== orderStatus) {
        await prisma.palmPayUserVirtualAccount.update({
          where: { id: virtualAccountRecord.id },
          data: {
            palmpayOrderNo: orderNo,
            orderStatus: orderStatus,
          },
        });
      }

      // Process based on order status
      if (orderStatus === 2) {
        // SUCCESS - Credit the wallet
        // Note: We already checked if transaction is completed above, so we only reach here if it's NOT completed
        // Convert amount from cents to decimal
        const amountInNgn = new Decimal(amount).dividedBy(100);

        // Credit the wallet
        try {
          await fiatWalletService.creditWallet(
            transaction.walletId,
            amountInNgn.toNumber(),
            fiatTransactionId,
            `Deposit via PalmPay - ${orderNo}`
          );

          palmpayLogger.info(`PalmPay deposit webhook: Wallet credited successfully`, {
            orderId,
            orderNo,
            transactionId: fiatTransactionId,
            walletId: transaction.walletId,
            amount: amountInNgn.toString(),
            currency,
            userId,
          });

          // Update transaction with PalmPay order number and completion time
          await prisma.fiatTransaction.update({
            where: { id: fiatTransactionId },
            data: {
              palmpayOrderNo: orderNo,
              palmpayStatus: orderStatus.toString(),
              ...(completeTime && {
                completedAt: new Date(completeTime),
              }),
            },
          });

          // Send notification to user
          try {
            const userName = virtualAccountRecord.user?.firstname || 'User';
            await sendPushNotification({
              userId: userId,
              title: 'Deposit Successful',
              body: `Your deposit of ${amountInNgn.toString()} ${currency} has been credited to your wallet successfully.`,
              sound: 'default',
              priority: 'high',
            });

            // Create in-app notification
            await prisma.inAppNotification.create({
              data: {
                userId: userId,
                title: 'Deposit Successful',
                description: `Your deposit of ${amountInNgn.toString()} ${currency} has been credited to your wallet. Order: ${orderNo}`,
                type: InAppNotificationType.customeer,
              },
            });

            palmpayLogger.info(`PalmPay deposit webhook: Notification sent to user ${userId}`, {
              orderId,
              orderNo,
              userId,
            });
          } catch (notifError: any) {
            palmpayLogger.exception('Send deposit notification', notifError, {
              orderId,
              orderNo,
              userId,
            });
            // Don't fail the webhook if notification fails
          }
        } catch (creditError: any) {
          palmpayLogger.exception('Credit wallet', creditError, {
            orderId,
            orderNo,
            transactionId: fiatTransactionId,
            walletId: transaction.walletId,
            amount: amountInNgn.toString(),
          });
          throw creditError;
        }
      } else if (orderStatus === 3 || orderStatus === 4) {
        // FAILED or CANCELLED
        const statusText = orderStatus === 3 ? 'failed' : 'cancelled';
        
        await prisma.fiatTransaction.update({
          where: { id: fiatTransactionId },
          data: {
            status: statusText,
            palmpayOrderNo: orderNo,
            palmpayStatus: orderStatus.toString(),
            ...(completeTime && {
              completedAt: new Date(completeTime),
            }),
          },
        });

        palmpayLogger.info(`PalmPay deposit webhook: Transaction marked as ${statusText}`, {
          orderId,
          orderNo,
          transactionId: fiatTransactionId,
          orderStatus,
        });
      }

      // Mark raw webhook as processed
      if (rawWebhookId) {
        await prisma.palmPayRawWebhook.update({
          where: { id: rawWebhookId },
          data: {
            processed: true,
            processedAt: new Date(),
          },
        });
        palmpayLogger.info(`Marked raw webhook ${rawWebhookId} as processed`, { rawWebhookId });
      }

      return res.status(200).send("success");
    } else {
      // Not a deposit webhook, might be payout or bill payment
      palmpayLogger.info('PalmPay webhook: Not a deposit webhook, skipping deposit processing', {
        orderId,
        orderNo,
        hasOutOrderNo: !!webhookData.outOrderNo, // Bill payment has outOrderNo
      });

      // Mark as processed anyway
      if (rawWebhookId) {
        await prisma.palmPayRawWebhook.update({
          where: { id: rawWebhookId },
          data: {
            processed: true,
            processedAt: new Date(),
            errorMessage: 'Not a deposit webhook',
          },
        });
      }

      return res.status(200).send("success");
    }
  } catch (error: any) {
    palmpayLogger.exception('Process PalmPay webhook', error, {
      rawWebhookId,
      webhookData: req.body?.orderNo || req.body?.outOrderNo || 'unknown',
    });

    if (rawWebhookId) {
      await prisma.palmPayRawWebhook.update({
        where: { id: rawWebhookId },
        data: {
          processed: true,
          processedAt: new Date(),
          errorMessage: error?.message || "Unknown error",
        },
      });
    }

    // Always return success to prevent PalmPay retries
    return res.status(200).send("success");
  }
};


```

---

## 16) Route files

### palmpay.deposit.router.ts
```ts
import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  initiateDepositController,
  checkDepositStatusController,
  depositSuccessController,
} from '../../controllers/customer/palmpay.deposit.controller';

const depositRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - PalmPay Deposit
 *   description: PalmPay wallet deposit (top-up) endpoints
 */

/**
 * @swagger
 * /api/v2/payments/palmpay/deposit/initiate:
 *   post:
 *     summary: Initiate wallet deposit via bank transfer
 *     tags: [V2 - PalmPay Deposit]
 *     description: |
 *       Initiates a wallet deposit using PalmPay bank transfer.
 *       Returns virtual account details for the user to transfer funds to.
 *       **Minimum amount:** 100.00 NGN (10,000 kobo)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 25000.00
 *                 description: Amount to deposit in NGN (minimum 100.00 NGN)
 *               currency:
 *                 type: string
 *                 default: NGN
 *                 example: NGN
 *                 enum: [NGN]
 *                 description: Currency (currently only NGN is supported for bank transfer)
 *     responses:
 *       200:
 *         description: Deposit initiated successfully. Virtual account details provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Deposit initiated successfully. Please transfer to the provided virtual account."
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                       description: Internal transaction ID
 *                       example: "uuid-123-456"
 *                     merchantOrderId:
 *                       type: string
 *                       description: Merchant order ID
 *                       example: "deposit_abc123def456"
 *                     orderNo:
 *                       type: string
 *                       description: PalmPay platform order number
 *                       example: "2424220903032435363613"
 *                     amount:
 *                       type: number
 *                       description: Deposit amount
 *                       example: 25000.00
 *                     currency:
 *                       type: string
 *                       description: Currency code
 *                       example: "NGN"
 *                     status:
 *                       type: string
 *                       description: Transaction status
 *                       example: "pending"
 *                     virtualAccount:
 *                       type: object
 *                       description: Virtual account details for bank transfer
 *                       properties:
 *                         accountType:
 *                           type: string
 *                           description: Account type (-1 for bank transfer)
 *                           example: "-1"
 *                         accountId:
 *                           type: string
 *                           description: Unique account ID
 *                           example: "ACC123456"
 *                         bankName:
 *                           type: string
 *                           description: Bank name of virtual account
 *                           example: "Access Bank"
 *                         accountName:
 *                           type: string
 *                           description: Account name of virtual account
 *                           example: "TERESCROW MERCHANT"
 *                         accountNumber:
 *                           type: string
 *                           description: Virtual account number to transfer funds to
 *                           example: "1234567890"
 *                     checkoutUrl:
 *                       type: string
 *                       description: H5 payment URL (alternative payment method)
 *                       example: "https://openapi.transspay.net/open-api/api/v1/payment/h5/redirect?orderNo=..."
 *       400:
 *         description: Bad request (validation error)
 *       500:
 *         description: Internal server error
 */
depositRouter.post(
  '/initiate',
  authenticateUser,
  initiateDepositController
);

/**
 * @swagger
 * /api/v2/payments/palmpay/deposit/success:
 *   get:
 *     summary: Deposit success callback
 *     tags: [V2 - PalmPay Deposit]
 *     description: |
 *       **Callback URL:** This is the URL that PalmPay redirects users to after successful payment.
 *       Returns a success message in JSON format.
 *       This endpoint does not require authentication as it's a public callback.
 *     responses:
 *       200:
 *         description: Deposit success message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Deposit completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "Your deposit has been processed successfully. Your wallet will be credited shortly."
 */
depositRouter.get('/success', depositSuccessController);

/**
 * @swagger
 * /api/v2/payments/palmpay/deposit/{transactionId}:
 *   get:
 *     summary: Check deposit status
 *     tags: [V2 - PalmPay Deposit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deposit status retrieved
 */
depositRouter.get(
  '/:transactionId',
  authenticateUser,
  checkDepositStatusController
);

export default depositRouter;

```

### palmpay.payout.router.ts
```ts
import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getBankListController,
  verifyBankAccountController,
  initiatePayoutController,
  checkPayoutStatusController,
} from '../../controllers/customer/palmpay.payout.controller';

const payoutRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - PalmPay Payout
 *   description: PalmPay withdrawal (payout) endpoints
 */

/**
 * @swagger
 * /api/v2/payments/palmpay/banks:
 *   get:
 *     summary: Get bank list
 *     tags: [V2 - PalmPay Payout]
 *     x-order: 1
 *     description: |
 *       **Flow Step 1:** Get list of supported banks for payout.
 *       Use this to populate bank selection dropdown.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessType
 *         schema:
 *           type: integer
 *           default: 0
 *           description: 0 = all banks
 *     responses:
 *       200:
 *         description: Bank list retrieved successfully
 */
payoutRouter.get('/banks', authenticateUser, getBankListController);

/**
 * @swagger
 * /api/v2/payments/palmpay/verify-account:
 *   post:
 *     summary: Verify bank account
 *     tags: [V2 - PalmPay Payout]
 *     x-order: 2
 *     description: |
 *       **Flow Step 2:** Verify bank account details before initiating payout.
 *       Validates account number and bank code, returns account name.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankCode
 *               - accountNumber
 *             properties:
 *               bankCode:
 *                 type: string
 *                 example: "100033"
 *               accountNumber:
 *                 type: string
 *                 example: "023408844440004"
 *     responses:
 *       200:
 *         description: Account verified successfully
 */
payoutRouter.post('/verify-account', authenticateUser, verifyBankAccountController);

/**
 * @swagger
 * /api/v2/payments/palmpay/payout/initiate:
 *   post:
 *     summary: Initiate payout (withdrawal)
 *     tags: [V2 - PalmPay Payout]
 *     x-order: 3
 *     description: |
 *       **Flow Step 3:** Initiate bank transfer payout after verifying account.
 *       Transfers NGN from user's fiat wallet to their bank account.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - bankCode
 *               - accountNumber
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 10000.00
 *               currency:
 *                 type: string
 *                 default: NGN
 *               bankCode:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               accountName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payout initiated successfully
 */
payoutRouter.post('/payout/initiate', authenticateUser, initiatePayoutController);

/**
 * @swagger
 * /api/v2/payments/palmpay/payout/{transactionId}:
 *   get:
 *     summary: Check payout status
 *     tags: [V2 - PalmPay Payout]
 *     x-order: 4
 *     description: |
 *       **Flow Step 4:** Check the status of a payout transaction.
 *       Use this to poll for transaction updates or check completion status.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payout status retrieved
 */
payoutRouter.get('/payout/:transactionId', authenticateUser, checkPayoutStatusController);

export default payoutRouter;

```

### billpayment.router.ts
```ts
import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  queryBillersController,
  queryItemsController,
  verifyAccountController,
  createBillOrderController,
  queryOrderStatusController,
  getBillPaymentHistoryController,
} from '../../controllers/customer/billpayment.controller';

const billPaymentRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Bill Payments
 *   description: Bill payment endpoints (Airtime, Data, Cable, Electricity, Education, Betting) using PalmPay or VTpass
 */

/**
 * @swagger
 * /api/v2/bill-payments/billers:
 *   get:
 *     summary: Query billers (operators) for a scene code
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Get list of available operators (MTN, GLO, Airtel, etc.) for airtime, data, cable, electricity, education, or betting.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sceneCode
 *         required: true
 *         schema:
 *           type: string
 *           enum: [airtime, data, cable, electricity, education, betting]
 *         description: |
 *           Business scenario code. Examples: airtime, data, cable, electricity, education, betting.
 *       - in: query
 *         name: provider
 *         required: false
 *         schema:
 *           type: string
 *           enum: [palmpay, vtpass]
 *           default: palmpay
 *         description: |
 *           Payment provider. "palmpay" for PalmPay (supports airtime, data, betting).
 *           "vtpass" for VTpass (supports airtime, data, cable, electricity, education).
 *         examples:
 *           airtime:
 *             value: airtime
 *           data:
 *             value: data
 *           betting:
 *             value: betting
 *     responses:
 *       200:
 *         description: Billers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneCode:
 *                   type: string
 *                 billers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       billerId:
 *                         type: string
 *                         example: "MTN"
 *                       billerName:
 *                         type: string
 *                         example: "MTN"
 *                       billerIcon:
 *                         type: string
 *                         example: "https://xxx/MTN.png"
 *                       minAmount:
 *                         type: number
 *                         example: 100
 *                       maxAmount:
 *                         type: number
 *                         example: 100000
 *                       status:
 *                         type: integer
 *                         example: 1
 */
billPaymentRouter.get('/billers', authenticateUser, queryBillersController);

/**
 * @swagger
 * /api/v2/bill-payments/items:
 *   get:
 *     summary: Query items (packages) for a biller
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Get list of available packages/plans for a specific operator.
 *       Example: Get data plans for MTN.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sceneCode
 *         required: true
 *         schema:
 *           type: string
 *           enum: [airtime, data, cable, electricity, education, betting]
 *         description: |
 *           Business scenario code. Examples: airtime, data, cable, electricity, education, betting.
 *       - in: query
 *         name: billerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Operator ID (e.g., "MTN", "GLO", "DSTV", "IKEDC")
 *       - in: query
 *         name: provider
 *         required: false
 *         schema:
 *           type: string
 *           enum: [palmpay, vtpass]
 *           default: palmpay
 *         description: Payment provider (palmpay or vtpass)
 *     responses:
 *       200:
 *         description: Items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneCode:
 *                   type: string
 *                 billerId:
 *                   type: string
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       billerId:
 *                         type: string
 *                       itemId:
 *                         type: string
 *                       itemName:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       minAmount:
 *                         type: number
 *                       maxAmount:
 *                         type: number
 *                       isFixAmount:
 *                         type: integer
 *                         description: "0 = Non-fixed, 1 = Fixed"
 *                       status:
 *                         type: integer
 */
billPaymentRouter.get('/items', authenticateUser, queryItemsController);

/**
 * @swagger
 * /api/v2/bill-payments/verify-account:
 *   post:
 *     summary: Verify recharge account (phone number, meter number, etc.)
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Verify recipient account and get operator information.
 *       For betting (PalmPay), billerId and itemId are required.
 *       For electricity (VTpass), itemId (meterType: prepaid/postpaid) is required.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sceneCode
 *               - rechargeAccount
 *             properties:
 *               sceneCode:
 *                 type: string
 *                 enum: [airtime, data, cable, electricity, education, betting]
 *                 description: Business scenario code
 *                 example: "airtime"
 *               provider:
 *                 type: string
 *                 enum: [palmpay, vtpass]
 *                 default: palmpay
 *                 description: Payment provider
 *               rechargeAccount:
 *                 type: string
 *                 maxLength: 50
 *                 example: "08154462953"
 *                 description: Phone number, meter number, smartcard number, or account number
 *               billerId:
 *                 type: string
 *                 description: Required for betting (PalmPay) and verification
 *                 example: "MTN"
 *               itemId:
 *                 type: string
 *                 description: Required for betting (PalmPay). For electricity (VTpass), must be "prepaid" or "postpaid"
 *     responses:
 *       200:
 *         description: Account verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 biller:
 *                   type: string
 *                   example: "GLO"
 */
billPaymentRouter.post('/verify-account', authenticateUser, verifyAccountController);

/**
 * @swagger
 * /api/v2/bill-payments/create-order:
 *   post:
 *     summary: Create bill payment order
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Create a bill payment order (Airtime, Data, Cable, Electricity, Education, or Betting).
 *       
 *       **IMPORTANT**: This endpoint debits the user's wallet balance BEFORE creating the provider order.
 *       If the provider order creation fails, the wallet is automatically refunded.
 *       
 *       **PIN Required**: User must provide their 4-digit PIN for authorization.
 *       
 *       **VTpass Requirements**: 
 *       - `phone` field is required for VTpass
 *       - For VTpass airtime, `itemId` is optional
 *       - For VTpass electricity, `itemId` must be "prepaid" or "postpaid"
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sceneCode
 *               - billerId
 *               - rechargeAccount
 *               - amount
 *               - pin
 *             properties:
 *               sceneCode:
 *                 type: string
 *                 enum: [airtime, data, cable, electricity, education, betting]
 *                 description: Business scenario code
 *                 example: "airtime"
 *               provider:
 *                 type: string
 *                 enum: [palmpay, vtpass]
 *                 default: palmpay
 *                 description: Payment provider
 *               billerId:
 *                 type: string
 *                 example: "MTN"
 *               itemId:
 *                 type: string
 *                 example: "5267001812"
 *                 description: Required for PalmPay. For VTpass airtime, optional. For VTpass electricity, must be "prepaid" or "postpaid"
 *               rechargeAccount:
 *                 type: string
 *                 maxLength: 50
 *                 example: "08154462953"
 *                 description: Phone number, meter number, smartcard number, or account number
 *               phone:
 *                 type: string
 *                 example: "08011111111"
 *                 description: Required for VTpass. Customer phone number.
 *               amount:
 *                 type: number
 *                 example: 1000.00
 *                 description: Amount in currency (e.g., 1000.00 NGN)
 *               pin:
 *                 type: string
 *                 pattern: '^\d{4}$'
 *                 example: "1234"
 *                 description: User's 4-digit PIN
 *     responses:
 *       200:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactionId:
 *                   type: string
 *                 billPaymentId:
 *                   type: string
 *                 orderNo:
 *                   type: string
 *                   description: Provider platform order number (PalmPay orderNo or VTpass transactionId)
 *                 outOrderNo:
 *                   type: string
 *                   description: Merchant order number (PalmPay) or request ID (VTpass)
 *                 requestId:
 *                   type: string
 *                   description: VTpass request ID (only for VTpass)
 *                 provider:
 *                   type: string
 *                   description: Payment provider used (palmpay or vtpass)
 *                 sceneCode:
 *                   type: string
 *                 billerId:
 *                   type: string
 *                 itemId:
 *                   type: string
 *                 rechargeAccount:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 currency:
 *                   type: string
 *                 status:
 *                   type: string
 *       400:
 *         description: Validation error, insufficient balance, or invalid PIN
 *       401:
 *         description: Invalid PIN
 */
billPaymentRouter.post('/create-order', authenticateUser, createBillOrderController);

/**
 * @swagger
 * /api/v2/bill-payments/order-status:
 *   get:
 *     summary: Query bill payment order status
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Query the status of a bill payment order from the database.
 *       Returns the current status stored in our database.
 *       Can query by billPaymentId OR by sceneCode + orderNo/outOrderNo.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: billPaymentId
 *         schema:
 *           type: string
 *         description: Bill payment ID (preferred method)
 *       - in: query
 *         name: sceneCode
 *         schema:
 *           type: string
 *         description: |
 *           Business scenario code. Examples: airtime, data, betting.
 *           Any scene code value is accepted. Required if billPaymentId not provided.
 *         examples:
 *           airtime:
 *             value: airtime
 *           data:
 *             value: data
 *           betting:
 *             value: betting
 *       - in: query
 *         name: outOrderNo
 *         schema:
 *           type: string
 *         description: Merchant order number (required if billPaymentId not provided)
 *       - in: query
 *         name: orderNo
 *         schema:
 *           type: string
 *         description: PalmPay platform order number (required if billPaymentId not provided)
 *     responses:
 *       200:
 *         description: Order status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderStatus:
 *                   type: object
 *                   properties:
 *                     outOrderNo:
 *                       type: string
 *                     orderNo:
 *                       type: string
 *                     billerId:
 *                       type: string
 *                     itemId:
 *                       type: string
 *                     orderStatus:
 *                       type: integer
 *                     amount:
 *                       type: number
 *                     sceneCode:
 *                       type: string
 *                     currency:
 *                       type: string
 *                     completedTime:
 *                       type: number
 *                       description: Timestamp in milliseconds, or null if not completed
 *                     errorMsg:
 *                       type: string
 *                       nullable: true
 *                 billPayment:
 *                   type: object
 *                   nullable: true
 *                   description: Full bill payment details from database
 */
billPaymentRouter.get('/order-status', authenticateUser, queryOrderStatusController);

/**
 * @swagger
 * /api/v2/bill-payments/history:
 *   get:
 *     summary: Get bill payment history
 *     tags: [V2 - Bill Payments]
 *     description: |
 *       **V2 API** - Get user's bill payment transaction history with pagination and optional filters.
 *       
 *       If no filters are provided, returns all bill payments for the user.
 *       All query parameters are optional - use them to filter the results.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: sceneCode
 *         required: false
 *         schema:
 *           type: string
 *         description: |
 *           (Optional) Business scenario code. Examples: airtime, data, cable, electricity, education, betting.
 *           If not provided, returns all scene codes.
 *       - in: query
 *         name: provider
 *         required: false
 *         schema:
 *           type: string
 *           enum: [palmpay, vtpass]
 *         description: (Optional) Filter by payment provider. If not provided, returns all providers.
 *       - in: query
 *         name: billerId
 *         required: false
 *         schema:
 *           type: string
 *         description: (Optional) Filter by biller ID (e.g., MTN, AIRTEL, GLO, DSTV, IKEDC). If not provided, returns all billers.
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: (Optional) Filter by transaction status. If not provided, returns all statuses.
 *     responses:
 *       200:
 *         description: Bill payment history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
billPaymentRouter.get('/history', authenticateUser, getBillPaymentHistoryController);

export default billPaymentRouter;
```

### palmpay.webhook.router.ts
```ts
import { Router } from 'express';
import { palmpayWebhookController } from '../../controllers/webhooks/palmpay.webhook.controller';

const webhookRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Webhooks
 *   description: Webhook endpoints for payment notifications
 */

/**
 * @swagger
 * /api/v2/webhooks/palmpay:
 *   post:
 *     summary: PalmPay webhook handler
 *     tags: [V2 - Webhooks]
 *     description: |
 *       Receives payment notifications from PalmPay for:
 *       - Deposits (wallet top-up)
 *       - Payouts (bank transfers)
 *       - Bill Payments (airtime, data, betting)
 *       
 *       **CRITICAL**: Must return plain text "success" (not JSON) to prevent retries.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 description: Deposit webhook
 *                 properties:
 *                   orderId:
 *                     type: string
 *                   orderNo:
 *                     type: string
 *                   orderStatus:
 *                     type: integer
 *                   sign:
 *                     type: string
 *               - type: object
 *                 description: Payout webhook
 *                 properties:
 *                   orderId:
 *                     type: string
 *                   orderNo:
 *                     type: string
 *                   orderStatus:
 *                     type: integer
 *                   sign:
 *                     type: string
 *               - type: object
 *                 description: Bill Payment webhook
 *                 properties:
 *                   outOrderNo:
 *                     type: string
 *                   orderNo:
 *                     type: string
 *                   orderStatus:
 *                     type: integer
 *                   sign:
 *                     type: string
 *     responses:
 *       200:
 *         description: Webhook processed successfully (returns plain text "success")
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "success"
 */
webhookRouter.post('/palmpay', palmpayWebhookController);

/**
 * @swagger
 * /api/v2/webhooks/palmpay/bill-payment:
 *   post:
 *     summary: PalmPay bill payment webhook handler
 *     tags: [V2 - Webhooks]
 *     description: |
 *       Receives bill payment notifications from PalmPay (airtime, data, betting).
 *       This is an alias for the main webhook endpoint.
 *       
 *       **CRITICAL**: Must return plain text "success" (not JSON) to prevent retries.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               outOrderNo:
 *                 type: string
 *                 description: Merchant order number
 *               orderNo:
 *                 type: string
 *                 description: PalmPay platform order number
 *               appId:
 *                 type: string
 *                 description: Merchant APP ID
 *               amount:
 *                 type: number
 *                 description: Total order amount (in cents)
 *               rechargeAccount:
 *                 type: string
 *                 description: Recharge account (phone number, etc.)
 *               orderStatus:
 *                 type: integer
 *                 description: Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
 *               completedTime:
 *                 type: number
 *                 description: Transaction completion time (timestamp)
 *               sign:
 *                 type: string
 *                 description: Signature (URL encoded)
 *               errorMsg:
 *                 type: string
 *                 description: Error message (if failed)
 *     responses:
 *       200:
 *         description: Webhook processed successfully (returns plain text "success")
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "success"
 */
webhookRouter.post('/palmpay/bill-payment', palmpayWebhookController);

export default webhookRouter;

```

---

## 17) External dependencies (implement or stub in your app)

- utils/prisma — Prisma client
- utils/ApiError, utils/ApiResponse
- middlewares/authenticate.user
- utils/customer.restrictions — deposit/payout
- services/referral/referral.commission.service — bill payment
- services/vtpass/*, services/reloadly/* — only for multi-provider branches in billpayment.controller
- utils/pushService — webhook notifications

