# PalmPay Full Integration Implementation (Copy-Ready)

## Exact code & database (deposit, withdraw, PalmPay bill payments)

**Use this for byte-for-byte integration into another app:**

| Document | Contents |
|----------|----------|
| **[`PALMPAY_EXACT_INTEGRATION_CODE.md`](./PALMPAY_EXACT_INTEGRATION_CODE.md)** | **~5500 lines, complete:** Prisma + `palmpay.config` + `palmpay.auth` + `palmpay.logger` + checkout + payout + **banks** + **fiat.wallet** + types (1–356) + deposit + payout controllers + **full `billpayment.controller.ts`** + **webhook controller** + **all route files**. Regenerate with `./docs/build-palmpay-doc.sh`. |
| **[`palmpay-exact-source/`](./palmpay-exact-source/README.md)** | **All** of the above as plain `.ts` / schema snippets (mirror of repo) |

**PalmPay bill payment scene codes** (Biller Reseller API): `airtime` | `data` | `betting` — see `PalmPaySceneCode` in the exact types file.

---

## Tatum — exact code & database (crypto / webhooks / virtual accounts)

**Same style as PalmPay (verbatim pack + build script):**

| Document | Contents |
|----------|----------|
| **[`TATUM_EXACT_INTEGRATION_CODE.md`](./TATUM_EXACT_INTEGRATION_CODE.md)** | **~4300+ lines:** Prisma (wallets, addresses, `TatumRawWebhook`, crypto tx/receive chain, enums) + `tatum.service` + virtual account + deposit address + master wallet + webhook controller + `process.webhook.job` + `crypto.transaction.service` + queue jobs + router. Regenerate with `./docs/build-tatum-doc.sh`. |
| **[`tatum-exact-source/`](./tatum-exact-source/README.md)** | Plain `.ts` + schema snippet copies used to build the doc |

---

This document also gives you a **full implementation template** you can adapt. It includes:

- PalmPay config + signature/auth
- Deposit flow (initiate + webhook credit + status)
- Withdrawal flow (banks + verify + initiate + status)
- Bill payment flow (biller/items/verify/create/status)
- Webhook handler (deposit + payout + bill payment)
- DB models (Prisma)
- Route wiring (Express)

---

## 1) Environment Variables

```env
# PalmPay
PALMPAY_ENVIRONMENT=production
PALMPAY_BASE_URL=https://open-gw-prod.palmpay-inc.com
PALMPAY_APP_ID=your_app_id
PALMPAY_API_KEY=your_api_key_if_provided
PALMPAY_API_SECRET=your_api_secret_if_provided
PALMPAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
PALMPAY_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
PALMPAY_COUNTRY_CODE=NG
PALMPAY_VERSION=V2
PALMPAY_WEBHOOK_URL=https://your-domain.com/api/v1/webhooks/palmpay

# App
FRONTEND_URL=https://your-frontend.com
```

---

## 2) PalmPay Types (`src/types/palmpay.types.ts`)

```ts
export interface PalmPayBaseResponse<T> {
  respCode: string;
  respMsg: string;
  data?: T;
}

export enum PalmPayOrderStatus {
  PENDING = 1,
  SUCCESS = 2,
  FAILED = 3,
  CANCELLED = 4,
}

export interface PalmPayCreateOrderRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  orderId: string;
  title?: string;
  description?: string;
  amount: number; // cents/kobo
  currency: string;
  notifyUrl: string;
  callBackUrl: string;
  goodsDetails?: string;
  productType?: string;
  userId?: string;
  userMobileNo?: string;
  remark?: string;
}

export interface PalmPayCreateOrderResponse {
  orderNo: string;
  orderStatus: number;
  message: string;
  checkoutUrl?: string;
  payerAccountType?: string;
  payerAccountId?: string;
  payerBankName?: string;
  payerAccountName?: string;
  payerVirtualAccNo?: string;
  sdkSessionId?: string;
  sdkSignKey?: string;
  currency: string;
  orderAmount: number;
  payMethod?: string;
}

export interface PalmPayQueryOrderResponse {
  orderId: string;
  orderNo: string;
  amount: number;
  currency: string;
  orderStatus: number;
  completedTime?: number;
  errorMsg?: string;
}

export interface PalmPayPayoutRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  orderId: string;
  title?: string;
  description?: string;
  payeeName?: string;
  payeeBankCode: string;
  payeeBankAccNo: string;
  payeePhoneNo?: string;
  currency: string;
  amount: number; // cents/kobo
  notifyUrl: string;
  remark: string;
}

export interface PalmPayPayoutResponse {
  orderNo: string;
  orderId: string;
  orderStatus: number;
  sessionId?: string;
  errorMsg?: string;
}

export interface PalmPayQueryPayStatusResponse {
  orderNo: string;
  orderId: string;
  orderStatus: number;
  sessionId?: string;
  completedTime?: number;
  errorMsg?: string;
}

export type PalmPaySceneCode = 'airtime' | 'data' | 'betting';

export interface PalmPayCreateBillOrderRequest {
  requestTime: number;
  nonceStr: string;
  version: string;
  sceneCode: PalmPaySceneCode;
  outOrderNo: string;
  amount: number; // cents/kobo
  notifyUrl: string;
  billerId: string;
  itemId: string;
  rechargeAccount: string;
  title?: string;
  description?: string;
  relationId?: string;
}

export interface PalmPayCreateBillOrderResponse {
  outOrderNo: string;
  orderNo: string;
  orderStatus: number;
  msg?: string;
  amount: number;
  sceneCode: PalmPaySceneCode;
}

export interface PalmPayBillPaymentWebhook {
  outOrderNo: string;
  orderNo: string;
  appId: string;
  amount: number;
  orderStatus: number;
  completedTime?: number;
  errorMsg?: string;
  sign: string;
}
```

---

## 3) Config (`src/services/palmpay/palmpay.config.ts`)

```ts
import dotenv from 'dotenv';
dotenv.config();

class PalmPayConfigService {
  getBaseUrl(): string {
    if (process.env.PALMPAY_BASE_URL) return process.env.PALMPAY_BASE_URL;
    const env = process.env.PALMPAY_ENVIRONMENT || 'sandbox';
    return env === 'production'
      ? 'https://open-gw-prod.palmpay-inc.com'
      : 'https://open-gw-daily.palmpay-inc.com';
  }

  getApiKey(): string {
    return process.env.PALMPAY_API_KEY || process.env.PALMPAY_APP_ID || '';
  }

  getPrivateKey(): string {
    const key = (process.env.PALMPAY_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
    if (!key) throw new Error('PALMPAY_PRIVATE_KEY missing');
    return key;
  }

  getPublicKey(): string {
    return (process.env.PALMPAY_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim();
  }

  getCountryCode(): string {
    return process.env.PALMPAY_COUNTRY_CODE || 'NG';
  }

  getVersion(): string {
    return process.env.PALMPAY_VERSION || 'V2';
  }

  getWebhookUrl(): string {
    return process.env.PALMPAY_WEBHOOK_URL || '';
  }
}

export const palmpayConfig = new PalmPayConfigService();
```

---

## 4) Signature/Auth (`src/services/palmpay/palmpay.auth.service.ts`)

```ts
import crypto from 'crypto';
import { palmpayConfig } from './palmpay.config';

class PalmPayAuthService {
  generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  getRequestTime(): number {
    return Date.now();
  }

  private md5Hash(str: string): string {
    return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
  }

  generateSignature(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params)
      .filter((k) => params[k] !== null && params[k] !== undefined && params[k] !== '')
      .sort();

    const signString = sortedKeys.map((k) => `${k}=${String(params[k]).trim()}`).join('&');
    const md5Str = this.md5Hash(signString);

    const signature = crypto
      .createSign('RSA-SHA1')
      .update(md5Str, 'utf8')
      .sign(palmpayConfig.getPrivateKey(), 'base64');

    return signature;
  }

  verifyWebhookSignature(payload: Record<string, any>, encodedSign: string): boolean {
    const sign = decodeURIComponent(encodedSign || '');
    const sortedKeys = Object.keys(payload)
      .filter((k) => k !== 'sign' && payload[k] !== null && payload[k] !== undefined && payload[k] !== '')
      .sort();

    const signString = sortedKeys.map((k) => `${k}=${String(payload[k]).trim()}`).join('&');
    const md5Str = this.md5Hash(signString);

    const publicKey = palmpayConfig.getPublicKey();
    if (!publicKey) return false;

    const verify = crypto.createVerify('RSA-SHA1');
    verify.update(md5Str, 'utf8');
    return verify.verify(publicKey, sign, 'base64');
  }

  getRequestHeaders(signature: string) {
    return {
      Accept: 'application/json, text/plain, */*',
      CountryCode: palmpayConfig.getCountryCode(),
      Authorization: `Bearer ${palmpayConfig.getApiKey()}`,
      Signature: signature,
      'Content-Type': 'application/json',
    };
  }
}

export const palmpayAuth = new PalmPayAuthService();
```

---

## 5) Deposit Service (`src/services/palmpay/palmpay.checkout.service.ts`)

```ts
import axios from 'axios';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';
import { PalmPayBaseResponse, PalmPayCreateOrderRequest, PalmPayCreateOrderResponse, PalmPayQueryOrderResponse } from '../../types/palmpay.types';

class PalmPayCheckoutService {
  private baseUrl = palmpayConfig.getBaseUrl();

  async createOrder(
    request: Omit<PalmPayCreateOrderRequest, 'requestTime' | 'version' | 'nonceStr'>
  ): Promise<PalmPayCreateOrderResponse> {
    const fullRequest: PalmPayCreateOrderRequest = {
      ...request,
      requestTime: palmpayAuth.getRequestTime(),
      version: palmpayConfig.getVersion(),
      nonceStr: palmpayAuth.generateNonce(),
    };
    const sign = palmpayAuth.generateSignature(fullRequest);
    const headers = palmpayAuth.getRequestHeaders(sign);

    const response = await axios.post<PalmPayBaseResponse<PalmPayCreateOrderResponse>>(
      `${this.baseUrl}/api/v2/payment/merchant/createorder`,
      fullRequest,
      { headers }
    );

    if (response.data.respCode !== '00000000' || !response.data.data) {
      throw new Error(response.data.respMsg || 'PalmPay create order failed');
    }
    return response.data.data;
  }

  async queryOrderStatus(orderId?: string, orderNo?: string): Promise<PalmPayQueryOrderResponse> {
    const req = {
      requestTime: palmpayAuth.getRequestTime(),
      version: palmpayConfig.getVersion(),
      nonceStr: palmpayAuth.generateNonce(),
      ...(orderId ? { orderId } : {}),
      ...(orderNo ? { orderNo } : {}),
    };
    const sign = palmpayAuth.generateSignature(req);
    const headers = palmpayAuth.getRequestHeaders(sign);

    const response = await axios.post<PalmPayBaseResponse<PalmPayQueryOrderResponse>>(
      `${this.baseUrl}/api/v2/payment/merchant/order/queryStatus`,
      req,
      { headers }
    );
    if (response.data.respCode !== '00000000' || !response.data.data) {
      throw new Error(response.data.respMsg || 'PalmPay query order failed');
    }
    return response.data.data;
  }
}

export const palmpayCheckout = new PalmPayCheckoutService();
```

---

## 6) Payout Service (`src/services/palmpay/palmpay.payout.service.ts`)

```ts
import axios from 'axios';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';
import { PalmPayBaseResponse, PalmPayPayoutRequest, PalmPayPayoutResponse, PalmPayQueryPayStatusResponse } from '../../types/palmpay.types';

class PalmPayPayoutService {
  private baseUrl = palmpayConfig.getBaseUrl();

  async initiatePayout(
    request: Omit<PalmPayPayoutRequest, 'requestTime' | 'version' | 'nonceStr'>
  ): Promise<PalmPayPayoutResponse> {
    const cleanAcc = request.payeeBankAccNo.replace(/\D/g, '');
    const fullReq: PalmPayPayoutRequest = {
      ...request,
      payeeBankAccNo: cleanAcc,
      requestTime: palmpayAuth.getRequestTime(),
      version: palmpayConfig.getVersion(),
      nonceStr: palmpayAuth.generateNonce(),
    };
    const sign = palmpayAuth.generateSignature(fullReq);
    const headers = palmpayAuth.getRequestHeaders(sign);

    const response = await axios.post<PalmPayBaseResponse<PalmPayPayoutResponse>>(
      `${this.baseUrl}/api/v2/merchant/payment/payout`,
      fullReq,
      { headers }
    );
    if (response.data.respCode !== '00000000' || !response.data.data) {
      throw new Error(response.data.respMsg || 'PalmPay payout failed');
    }
    return response.data.data;
  }

  async queryPayStatus(orderId?: string, orderNo?: string): Promise<PalmPayQueryPayStatusResponse> {
    const req = {
      requestTime: palmpayAuth.getRequestTime(),
      version: palmpayConfig.getVersion(),
      nonceStr: palmpayAuth.generateNonce(),
      ...(orderId ? { orderId } : {}),
      ...(orderNo ? { orderNo } : {}),
    };
    const sign = palmpayAuth.generateSignature(req);
    const headers = palmpayAuth.getRequestHeaders(sign);

    const response = await axios.post<PalmPayBaseResponse<PalmPayQueryPayStatusResponse>>(
      `${this.baseUrl}/api/v2/merchant/payment/queryPayStatus`,
      req,
      { headers }
    );
    if (response.data.respCode !== '00000000' || !response.data.data) {
      throw new Error(response.data.respMsg || 'PalmPay payout status failed');
    }
    return response.data.data;
  }
}

export const palmpayPayout = new PalmPayPayoutService();
```

---

## 7) Bill Payment Service (`src/services/palmpay/palmpay.billpayment.service.ts`)

```ts
import axios from 'axios';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';
import {
  PalmPayBaseResponse,
  PalmPaySceneCode,
  PalmPayCreateBillOrderRequest,
  PalmPayCreateBillOrderResponse,
} from '../../types/palmpay.types';

class PalmPayBillPaymentService {
  private baseUrl = palmpayConfig.getBaseUrl();

  private headers(signature: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${palmpayConfig.getApiKey()}`,
      Signature: signature,
      CountryCode: palmpayConfig.getCountryCode(),
    };
  }

  async createOrder(
    request: Omit<PalmPayCreateBillOrderRequest, 'requestTime' | 'version' | 'nonceStr'>
  ): Promise<PalmPayCreateBillOrderResponse> {
    const fullReq: PalmPayCreateBillOrderRequest = {
      ...request,
      requestTime: palmpayAuth.getRequestTime(),
      version: palmpayConfig.getVersion(),
      nonceStr: palmpayAuth.generateNonce(),
    };
    const sign = palmpayAuth.generateSignature(fullReq);

    const response = await axios.post<PalmPayBaseResponse<PalmPayCreateBillOrderResponse>>(
      `${this.baseUrl}/api/v2/bill-payment/order/create`,
      fullReq,
      { headers: this.headers(sign) }
    );
    if (response.data.respCode !== '00000000' || !response.data.data) {
      throw new Error(response.data.respMsg || 'PalmPay bill create failed');
    }
    return response.data.data;
  }

  async queryOrderStatus(sceneCode: PalmPaySceneCode, outOrderNo?: string, orderNo?: string): Promise<any> {
    const req = {
      requestTime: palmpayAuth.getRequestTime(),
      version: palmpayConfig.getVersion(),
      nonceStr: palmpayAuth.generateNonce(),
      sceneCode,
      ...(outOrderNo ? { outOrderNo } : {}),
      ...(orderNo ? { orderNo } : {}),
    };
    const sign = palmpayAuth.generateSignature(req);
    const response = await axios.post(`${this.baseUrl}/api/v2/bill-payment/order/query`, req, {
      headers: this.headers(sign),
    });
    if (response.data.respCode !== '00000000' || !response.data.data) {
      throw new Error(response.data.respMsg || 'PalmPay bill status failed');
    }
    return response.data.data;
  }
}

export const palmpayBillPaymentService = new PalmPayBillPaymentService();
```

---

## 8) Prisma Models (DB) - Copy Template

Put these in `prisma/schema.prisma` (adapt to your existing schema):

```prisma
model FiatWallet {
  id        String   @id @default(uuid())
  userId    Int
  currency  String   @db.VarChar(10)
  balance   Decimal  @default(0.00) @db.Decimal(15, 2)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  transactions FiatTransaction[]
  billPayments BillPayment[]
}

model FiatTransaction {
  id               String   @id @default(uuid())
  userId           Int
  walletId         String
  type             String
  status           String   @default("pending")
  currency         String   @db.VarChar(10)
  amount           Decimal  @db.Decimal(15, 2)
  fees             Decimal  @default(0.00) @db.Decimal(15, 2)
  totalAmount      Decimal  @db.Decimal(15, 2)
  palmpayOrderId   String?
  palmpayOrderNo   String?  @unique
  palmpayStatus    String?
  palmpaySessionId String?
  checkoutUrl      String?  @db.Text
  redirectUrl      String?  @db.Text
  errorMessage     String?  @db.Text
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  completedAt      DateTime?
}

model BillPayment {
  id               String   @id @default(uuid())
  userId           Int
  walletId         String
  transactionId    String   @unique
  provider         String   @default("palmpay")
  sceneCode        String
  billType         String
  billerId         String
  itemId           String
  rechargeAccount  String
  amount           Decimal  @db.Decimal(15, 2)
  currency         String   @default("NGN")
  status           String   @default("pending")
  palmpayOrderId   String?  @unique
  palmpayOrderNo   String?  @unique
  palmpayStatus    String?
  billReference    String?
  providerResponse String?  @db.LongText
  errorMessage     String?  @db.Text
  refunded         Boolean  @default(false)
  refundedAt       DateTime?
  refundReason     String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  completedAt      DateTime?
}

model PalmPayUserVirtualAccount {
  id                Int      @id @default(autoincrement())
  userId            Int
  merchantOrderId   String   @unique
  palmpayOrderNo    String?  @unique
  amount            Decimal  @db.Decimal(15, 2)
  currency          String   @default("NGN")
  orderStatus       Int      @default(1)
  payerBankName     String?
  payerAccountName  String?
  payerVirtualAccNo String?  @unique
  checkoutUrl       String?  @db.Text
  fiatTransactionId String?
  metadata          String?  @db.LongText
  errorMessage      String?  @db.Text
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  completedAt       DateTime?
}

model PalmPayRawWebhook {
  id           Int      @id @default(autoincrement())
  rawData      String   @db.LongText
  headers      String?  @db.Text
  ipAddress    String?
  userAgent    String?
  processed    Boolean  @default(false)
  processedAt  DateTime?
  errorMessage String?  @db.Text
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Run migration:

```bash
npx prisma migrate dev -n "add_palmpay_models"
```

---

## 9) Deposit Controller (Copy-Ready)

```ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma';
import { palmpayCheckout } from '../services/palmpay/palmpay.checkout.service';
import { palmpayConfig } from '../services/palmpay/palmpay.config';

export const initiateDeposit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { amount, currency = 'NGN' } = req.body;
    if (!amount || Number(amount) <= 0) throw new Error('Invalid amount');

    const amountInCents = Math.round(Number(amount) * 100);
    if (amountInCents < 10000) throw new Error('Minimum amount is 100.00 NGN');

    const wallet = await prisma.fiatWallet.upsert({
      where: { userId_currency: { userId: user.id, currency: 'NGN' } },
      create: { userId: user.id, currency: 'NGN', balance: 0 },
      update: {},
    });

    const merchantOrderId = `deposit_${uuidv4().replace(/-/g, '')}`.slice(0, 32);

    const tx = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        type: 'DEPOSIT',
        status: 'pending',
        currency: 'NGN',
        amount: Number(amount),
        fees: 0,
        totalAmount: Number(amount),
        palmpayOrderId: merchantOrderId,
        description: `Wallet top-up ${amount} ${currency}`,
      },
    });

    const resp = await palmpayCheckout.createOrder({
      orderId: merchantOrderId,
      amount: amountInCents,
      currency: 'NGN',
      title: 'Wallet Top-up',
      description: 'Wallet funding',
      notifyUrl: palmpayConfig.getWebhookUrl(),
      callBackUrl: `${process.env.FRONTEND_URL}/deposit/success`,
      productType: 'bank_transfer',
      goodsDetails: JSON.stringify([{ goodsId: '-1' }]),
      userId: String(user.id),
      userMobileNo: user.phoneNumber,
    });

    await prisma.palmPayUserVirtualAccount.create({
      data: {
        userId: user.id,
        merchantOrderId,
        palmpayOrderNo: resp.orderNo,
        amount: Number(amount),
        currency: 'NGN',
        orderStatus: resp.orderStatus,
        payerBankName: resp.payerBankName || null,
        payerAccountName: resp.payerAccountName || null,
        payerVirtualAccNo: resp.payerVirtualAccNo || null,
        checkoutUrl: resp.checkoutUrl || null,
        fiatTransactionId: tx.id,
        metadata: JSON.stringify(resp),
      },
    });

    await prisma.fiatTransaction.update({
      where: { id: tx.id },
      data: {
        palmpayOrderNo: resp.orderNo,
        palmpayStatus: String(resp.orderStatus),
        checkoutUrl: resp.checkoutUrl || null,
      },
    });

    res.json({
      transactionId: tx.id,
      merchantOrderId,
      orderNo: resp.orderNo,
      virtualAccount: {
        bankName: resp.payerBankName,
        accountName: resp.payerAccountName,
        accountNumber: resp.payerVirtualAccNo,
      },
      checkoutUrl: resp.checkoutUrl,
    });
  } catch (e) {
    next(e);
  }
};
```

---

## 10) Payout Controller (Copy-Ready)

```ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma';
import { palmpayPayout } from '../services/palmpay/palmpay.payout.service';
import { palmpayConfig } from '../services/palmpay/palmpay.config';

export const initiatePayout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { amount, bankCode, accountNumber, accountName, phoneNumber, currency = 'NGN' } = req.body;
    if (!amount || Number(amount) <= 0) throw new Error('Invalid amount');
    if (!bankCode || !accountNumber) throw new Error('bankCode and accountNumber required');

    const amountNum = Number(amount);
    const amountInCents = Math.round(amountNum * 100);
    const orderId = `payout_${uuidv4().replace(/-/g, '')}`.slice(0, 32);

    const wallet = await prisma.fiatWallet.findUnique({
      where: { userId_currency: { userId: user.id, currency } },
    });
    if (!wallet || Number(wallet.balance) < amountNum) throw new Error('Insufficient balance');

    const tx = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        type: 'WITHDRAW',
        status: 'pending',
        currency,
        amount: amountNum,
        fees: 0,
        totalAmount: amountNum,
        palmpayOrderId: orderId,
        payeeName: accountName,
        payeeBankCode: bankCode,
        payeeBankAccNo: accountNumber,
        payeePhoneNo: phoneNumber,
      },
    });

    const resp = await palmpayPayout.initiatePayout({
      orderId,
      title: 'Withdrawal',
      description: `Withdrawal to ${accountNumber}`,
      payeeName: accountName,
      payeeBankCode: bankCode,
      payeeBankAccNo: accountNumber,
      payeePhoneNo: phoneNumber,
      currency,
      amount: amountInCents,
      notifyUrl: palmpayConfig.getWebhookUrl(),
      remark: `Withdrawal user ${user.id}`,
    });

    await prisma.$transaction(async (db) => {
      await db.fiatTransaction.update({
        where: { id: tx.id },
        data: {
          palmpayOrderNo: resp.orderNo,
          palmpayStatus: String(resp.orderStatus),
          palmpaySessionId: resp.sessionId || null,
          status: resp.orderStatus === 2 ? 'completed' : 'pending',
          ...(resp.orderStatus === 2 ? { completedAt: new Date() } : {}),
        },
      });

      // Immediate debit on initiation
      await db.$executeRaw`
        UPDATE "FiatWallet"
        SET balance = balance - ${amountNum}::decimal
        WHERE id = ${wallet.id}
      `;
    });

    res.json({
      transactionId: tx.id,
      orderId,
      orderNo: resp.orderNo,
      status: resp.orderStatus === 2 ? 'completed' : 'pending',
      amount: amountNum,
      currency,
    });
  } catch (e) {
    next(e);
  }
};
```

---

## 11) Bill Payment Create Controller (PalmPay-only path)

```ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma';
import { palmpayBillPaymentService } from '../services/palmpay/palmpay.billpayment.service';
import { palmpayConfig } from '../services/palmpay/palmpay.config';

export const createPalmPayBillOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { sceneCode, billerId, itemId, rechargeAccount, amount, pin } = req.body;

    if (!sceneCode || !billerId || !itemId || !rechargeAccount || !amount || !pin) {
      throw new Error('Missing required fields');
    }
    if (!['airtime', 'data', 'betting'].includes(sceneCode)) throw new Error('Invalid sceneCode');

    // PIN check
    const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { pin: true } });
    if (!userRecord?.pin || userRecord.pin !== pin) throw new Error('Invalid PIN');

    const amountNum = Number(amount);
    const amountInCents = Math.round(amountNum * 100);
    if (amountInCents < 100) throw new Error('Minimum amount is 1.00 NGN');

    const wallet = await prisma.fiatWallet.findUnique({
      where: { userId_currency: { userId: user.id, currency: 'NGN' } },
    });
    if (!wallet || Number(wallet.balance) < amountNum) throw new Error('Insufficient balance');

    const outOrderNo = `bill_${uuidv4().replace(/-/g, '')}`.slice(0, 64);
    const txId = uuidv4();

    const tx = await prisma.fiatTransaction.create({
      data: {
        id: txId,
        userId: user.id,
        walletId: wallet.id,
        type: 'BILL_PAYMENT',
        status: 'pending',
        currency: 'NGN',
        amount: amountNum,
        fees: 0,
        totalAmount: amountNum,
        description: `${sceneCode} payment ${rechargeAccount}`,
        palmpayOrderId: outOrderNo,
      },
    });

    const bill = await prisma.billPayment.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        transactionId: tx.id,
        provider: 'palmpay',
        sceneCode,
        billType: sceneCode.toUpperCase(),
        billerId,
        itemId,
        rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        status: 'pending',
        palmpayOrderId: outOrderNo,
      },
    });

    try {
      // debit first
      await prisma.$executeRaw`
        UPDATE "FiatWallet"
        SET balance = balance - ${amountNum}::decimal
        WHERE id = ${wallet.id}
      `;

      const resp = await palmpayBillPaymentService.createOrder({
        sceneCode,
        outOrderNo,
        amount: amountInCents,
        notifyUrl: `${palmpayConfig.getWebhookUrl()}/bill-payment`,
        billerId,
        itemId,
        rechargeAccount,
        title: `${sceneCode} Payment`,
        description: `${sceneCode} payment`,
        relationId: String(user.id),
      });

      await prisma.$transaction(async (db) => {
        await db.fiatTransaction.update({
          where: { id: tx.id },
          data: {
            palmpayOrderNo: resp.orderNo,
            palmpayStatus: String(resp.orderStatus),
            ...(resp.orderStatus === 2 ? { status: 'completed', completedAt: new Date() } : {}),
          },
        });

        await db.billPayment.update({
          where: { id: bill.id },
          data: {
            palmpayOrderNo: resp.orderNo,
            palmpayStatus: String(resp.orderStatus),
            providerResponse: JSON.stringify(resp),
            ...(resp.orderStatus === 2
              ? { status: 'completed', completedAt: new Date(), billReference: resp.orderNo }
              : {}),
          },
        });
      });

      return res.json({
        billPaymentId: bill.id,
        transactionId: tx.id,
        outOrderNo,
        orderNo: resp.orderNo,
        orderStatus: resp.orderStatus,
        status: resp.orderStatus === 2 ? 'completed' : 'pending',
      });
    } catch (providerError: any) {
      // refund if provider create fails
      await prisma.$transaction(async (db) => {
        await db.$executeRaw`
          UPDATE "FiatWallet"
          SET balance = balance + ${amountNum}::decimal
          WHERE id = ${wallet.id}
        `;
        await db.fiatTransaction.update({
          where: { id: tx.id },
          data: { status: 'failed', errorMessage: providerError.message },
        });
        await db.billPayment.update({
          where: { id: bill.id },
          data: { status: 'failed', errorMessage: providerError.message },
        });
      });
      throw providerError;
    }
  } catch (e) {
    next(e);
  }
};
```

---

## 12) Webhook Controller (Deposit + Payout + Bill Payment)

Use this as the **single source of truth** for async completion and refunds.

```ts
import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { palmpayAuth } from '../services/palmpay/palmpay.auth.service';

export const palmpayWebhook = async (req: Request, res: Response) => {
  let rawId: number | null = null;
  try {
    const raw = await prisma.palmPayRawWebhook.create({
      data: {
        rawData: JSON.stringify(req.body),
        headers: JSON.stringify(req.headers),
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        processed: false,
      },
    });
    rawId = raw.id;

    // signature check
    const sign = req.body?.sign;
    if (!sign || !palmpayAuth.verifyWebhookSignature(req.body, sign)) {
      await prisma.palmPayRawWebhook.update({
        where: { id: rawId },
        data: { processed: true, processedAt: new Date(), errorMessage: 'Invalid signature' },
      });
      return res.status(200).send('success');
    }

    const { orderId, outOrderNo, orderNo, orderStatus, amount, completedTime, completeTime, errorMsg } = req.body;
    const doneTime = completedTime || completeTime;

    // 1) DEPOSIT
    if (orderId && String(orderId).startsWith('deposit_')) {
      const va = await prisma.palmPayUserVirtualAccount.findUnique({ where: { merchantOrderId: orderId } });
      if (!va?.fiatTransactionId) return res.status(200).send('success');

      const tx = await prisma.fiatTransaction.findUnique({ where: { id: va.fiatTransactionId } });
      if (!tx) return res.status(200).send('success');
      if (tx.status === 'completed') return res.status(200).send('success');

      if (Number(orderStatus) === 2) {
        await prisma.$transaction(async (db) => {
          await db.$executeRaw`
            UPDATE "FiatWallet"
            SET balance = balance + ${(Number(amount) || 0) / 100}::decimal
            WHERE id = ${tx.walletId}
          `;
          await db.fiatTransaction.update({
            where: { id: tx.id },
            data: {
              status: 'completed',
              palmpayOrderNo: orderNo || tx.palmpayOrderNo,
              palmpayStatus: String(orderStatus),
              completedAt: doneTime ? new Date(doneTime) : new Date(),
            },
          });
        });
      } else if ([3, 4].includes(Number(orderStatus))) {
        await prisma.fiatTransaction.update({
          where: { id: tx.id },
          data: { status: Number(orderStatus) === 3 ? 'failed' : 'cancelled', palmpayStatus: String(orderStatus) },
        });
      }
    }

    // 2) BILL PAYMENT (uses outOrderNo)
    if (outOrderNo) {
      const bill = await prisma.billPayment.findUnique({ where: { palmpayOrderId: outOrderNo } });
      if (bill) {
        const newStatus =
          Number(orderStatus) === 2 ? 'completed' :
          Number(orderStatus) === 3 ? 'failed' :
          Number(orderStatus) === 4 ? 'cancelled' : 'pending';

        await prisma.$transaction(async (db) => {
          const latest = await db.billPayment.findUnique({ where: { id: bill.id } });
          if (!latest) return;

          await db.billPayment.update({
            where: { id: bill.id },
            data: {
              palmpayOrderNo: orderNo || latest.palmpayOrderNo,
              palmpayStatus: String(orderStatus),
              status: newStatus,
              errorMessage: errorMsg || null,
              ...(newStatus === 'completed' ? { completedAt: doneTime ? new Date(doneTime) : new Date(), billReference: orderNo || latest.billReference } : {}),
              providerResponse: JSON.stringify(req.body),
            },
          });

          await db.fiatTransaction.update({
            where: { id: latest.transactionId },
            data: {
              palmpayOrderNo: orderNo || undefined,
              palmpayStatus: String(orderStatus),
              status: newStatus,
              errorMessage: errorMsg || null,
              ...(newStatus === 'completed' ? { completedAt: doneTime ? new Date(doneTime) : new Date() } : {}),
            },
          });

          // refund on failed/cancelled if not already refunded
          if ((newStatus === 'failed' || newStatus === 'cancelled') && !latest.refunded) {
            await db.$executeRaw`
              UPDATE "FiatWallet"
              SET balance = balance + ${Number(latest.amount)}::decimal
              WHERE id = ${latest.walletId}
            `;
            await db.billPayment.update({
              where: { id: latest.id },
              data: {
                refunded: true,
                refundedAt: new Date(),
                refundReason: `PalmPay ${newStatus}`,
              },
            });
          }
        });
      }
    }

    // 3) PAYOUT (orderId starts with payout_)
    if (orderId && String(orderId).startsWith('payout_')) {
      const tx = await prisma.fiatTransaction.findFirst({
        where: { palmpayOrderId: orderId, type: 'WITHDRAW' },
      });
      if (tx) {
        const newStatus =
          Number(orderStatus) === 2 ? 'completed' :
          Number(orderStatus) === 3 ? 'failed' :
          Number(orderStatus) === 4 ? 'cancelled' : 'pending';

        await prisma.$transaction(async (db) => {
          await db.fiatTransaction.update({
            where: { id: tx.id },
            data: {
              palmpayOrderNo: orderNo || tx.palmpayOrderNo,
              palmpayStatus: String(orderStatus),
              status: newStatus,
              ...(newStatus === 'completed' ? { completedAt: doneTime ? new Date(doneTime) : new Date() } : {}),
            },
          });

          // compensate wallet if payout failed/cancelled (since wallet was debited at initiation)
          if (newStatus === 'failed' || newStatus === 'cancelled') {
            const meta = tx.metadata ? JSON.parse(tx.metadata) : {};
            if (!meta.payoutCompensated) {
              await db.$executeRaw`
                UPDATE "FiatWallet"
                SET balance = balance + ${Number(tx.totalAmount)}::decimal
                WHERE id = ${tx.walletId}
              `;
              await db.fiatTransaction.update({
                where: { id: tx.id },
                data: { metadata: JSON.stringify({ ...meta, payoutCompensated: true, payoutCompensatedAt: new Date().toISOString() }) },
              });
            }
          }
        });
      }
    }

    if (rawId) {
      await prisma.palmPayRawWebhook.update({
        where: { id: rawId },
        data: { processed: true, processedAt: new Date() },
      });
    }
    return res.status(200).send('success');
  } catch (e: any) {
    if (rawId) {
      await prisma.palmPayRawWebhook.update({
        where: { id: rawId },
        data: { processed: true, processedAt: new Date(), errorMessage: e.message || 'Unknown error' },
      }).catch(() => undefined);
    }
    return res.status(200).send('success');
  }
};
```

---

## 13) Express Routes (Copy-Ready)

```ts
import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser';
import { initiateDeposit } from '../controllers/deposit.controller';
import { initiatePayout } from '../controllers/payout.controller';
import { createPalmPayBillOrder } from '../controllers/billpayment.controller';
import { palmpayWebhook } from '../controllers/palmpay.webhook.controller';

const router = Router();

// Deposit
router.post('/payments/palmpay/deposit/initiate', authenticateUser, initiateDeposit);

// Payout
router.post('/payments/palmpay/payout/initiate', authenticateUser, initiatePayout);

// Bill payment
router.post('/bill-payments/palmpay/create-order', authenticateUser, createPalmPayBillOrder);

// Webhook
router.post('/webhooks/palmpay', palmpayWebhook);
router.post('/webhooks/palmpay/bill-payment', palmpayWebhook);

export default router;
```

---

## 14) cURL Test Examples

### Deposit initiate

```bash
curl -X POST "https://your-domain.com/api/v1/payments/palmpay/deposit/initiate" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"amount":2500,"currency":"NGN"}'
```

### Payout initiate

```bash
curl -X POST "https://your-domain.com/api/v1/payments/palmpay/payout/initiate" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount":1000,
    "currency":"NGN",
    "bankCode":"000013",
    "accountNumber":"0123456789",
    "accountName":"John Doe",
    "phoneNumber":"08011111111"
  }'
```

### Bill payment create

```bash
curl -X POST "https://your-domain.com/api/v1/bill-payments/palmpay/create-order" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "sceneCode":"data",
    "billerId":"MTN",
    "itemId":"5267001812",
    "rechargeAccount":"08154462953",
    "amount":1000,
    "pin":"1234"
  }'
```

---

## 15) Integration Notes for Another Application

- Keep all PalmPay amounts in **kobo/cents** on external API calls, convert to NGN for wallet ledger.
- Use webhook as final source of truth for settlement (especially payout + bill payment).
- Always add idempotency guards on:
  - wallet credit/debit compensation
  - webhook reprocessing
  - bill/payout refund logic
- Keep sensitive values out of logs (`apiKey`, private keys, raw auth headers).
- Separate sandbox and production with env-based base URL switching.

---

## 16) What to Copy First (Recommended Order)

1. `palmpay.types.ts`
2. `palmpay.config.ts`
3. `palmpay.auth.service.ts`
4. checkout/payout/bill-payment services
5. Prisma models + migration
6. controllers
7. webhook controller
8. routes + app registration

---

If you want, next I can generate this as a **ready folder structure** (`/docs/palmpay-integration-kit/`) with one file per component (services, controllers, routes, prisma migration SQL) so you can paste directly into your new app.

# PalmPay Integration Full Audit

## Scope

This document audits PalmPay integration in this backend across:

- Deposit (wallet top-up via virtual account / checkout)
- Withdrawal (merchant payout to bank account)
- Bill payments (PalmPay provider path only)
- Related DB models, queue handling, webhook processing, and configuration

It is based on current source code, not only existing docs.

---

## 1) High-Level Architecture

### Core PalmPay modules

- `src/services/palmpay/palmpay.config.ts`
- `src/services/palmpay/palmpay.auth.service.ts`
- `src/services/palmpay/palmpay.checkout.service.ts`
- `src/services/palmpay/palmpay.payout.service.ts`
- `src/services/palmpay/palmpay.banks.service.ts`
- `src/services/palmpay/palmpay.billpayment.service.ts`
- `src/types/palmpay.types.ts`

### Customer-facing controllers/routes

- Deposit:
  - `src/controllers/customer/palmpay.deposit.controller.ts`
  - `src/routes/cutomer/palmpay.deposit.router.ts`
- Payout:
  - `src/controllers/customer/palmpay.payout.controller.ts`
  - `src/routes/cutomer/palmpay.payout.router.ts`
- Bill payments (multi-provider controller with PalmPay branch):
  - `src/controllers/customer/billpayment.controller.ts`
  - `src/routes/cutomer/billpayment.router.ts`
- Merchant order utility endpoint:
  - `src/controllers/customer/palmpay.merchant.order.controller.ts`
  - `src/routes/cutomer/palmpay.merchant.order.router.ts`

### Webhook handling

- `src/controllers/webhooks/palmpay.webhook.controller.ts`
- `src/routes/webhooks/palmpay.webhook.router.ts`

### Queue worker/job (bill payment status polling)

- `src/queue/worker.ts`
- `src/queue/jobs/billpayment.status.job.ts`
- `src/queue/queue.manager.ts`

### App wiring

- `src/index.ts` registers:
  - `/api/v2/payments/palmpay/deposit`
  - `/api/v2/payments/palmpay`
  - `/api/v2/payment/merchant`
  - `/api/v2/bill-payments`
  - `/api/v2/webhooks`

---

## 2) Configuration and Authentication

## 2.1 Config source

`palmpay.config.ts` reads environment and exposes:

- API key: `PALMPAY_APP_ID` currently used as Bearer key (`getApiKey`)
- Private key: `PALMPAY_PRIVATE_KEY`
- Public key: `PALMPAY_PUBLIC_KEY` (for webhook verification logic)
- Country code: `PALMPAY_COUNTRY_CODE` (default `NG`)
- Version: `PALMPAY_VERSION` (default `V2`)
- Webhook URL: `PALMPAY_WEBHOOK_URL`

## 2.2 Signature flow

`palmpay.auth.service.ts`:

1. Filters non-empty params
2. Sorts keys ASCII ascending
3. Builds query string `k=v&k2=v2`
4. MD5 uppercase hash
5. Signs MD5 using RSA-SHA1 and merchant private key
6. Sends signature in `Signature` header

Headers for requests include:

- `Authorization: Bearer <apiKey>`
- `Signature`
- `CountryCode`
- `Content-Type: application/json`

## 2.3 Important config behavior

- Base URL is hard-coded to production gateway (`open-gw-prod`) in `getBaseUrl()`.
- `getApiKey()` prints API key to console (sensitive logging risk).

---

## 3) Database Models Used by PalmPay Flows

From `prisma/schema.prisma`:

## 3.1 `FiatWallet`

- Stores per-user fiat balance by currency.
- Key field: `balance Decimal(15,2)`.

## 3.2 `FiatTransaction`

Primary ledger-like transaction record for deposits/withdrawals/bill payments.

PalmPay-specific fields:

- `palmpayOrderId`
- `palmpayOrderNo` (unique)
- `palmpayStatus`
- `palmpaySessionId`
- `checkoutUrl`
- `redirectUrl`
- payout beneficiary fields (`payeeName`, `payeeBankCode`, `payeeBankAccNo`, `payeePhoneNo`)

## 3.3 `BillPayment`

Dedicated bill-payment table linked 1:1 to `FiatTransaction` by `transactionId`.

Provider-agnostic fields, but PalmPay values stored in:

- `palmpayOrderId` (merchant outOrderNo)
- `palmpayOrderNo` (PalmPay orderNo)
- `palmpayStatus`
- `providerResponse` (raw JSON string)
- refund flags: `refunded`, `refundedAt`, `refundReason`

## 3.4 `PalmPayUserVirtualAccount`

Stores deposit initiation result and virtual account metadata:

- `merchantOrderId`
- `palmpayOrderNo`
- `payerVirtualAccNo`
- `payerBankName`
- `payerAccountName`
- `orderStatus`
- linked `fiatTransactionId`

## 3.5 `PalmPayRawWebhook`

Raw inbound webhook persistence:

- payload JSON string
- headers JSON string
- processing flag and processing error

---

## 4) Deposit Flow (PalmPay Checkout)

## 4.1 Public API endpoints

- `POST /api/v2/payments/palmpay/deposit/initiate`
- `GET /api/v2/payments/palmpay/deposit/:transactionId`
- `GET /api/v2/payments/palmpay/deposit/success`

## 4.2 Initiate sequence

Controller: `initiateDepositController`

1. Validate user restrictions (ban/freeze checks)
2. Validate amount (> 0)
3. Convert to kobo (`amount * 100`)
4. Minimum enforced: `100.00 NGN` (`>= 10000 kobo`)
5. Create/ensure fiat wallet
6. Create pending `FiatTransaction` (`type=DEPOSIT`)
7. Call `palmpayCheckout.createOrder()` with:
   - `productType=bank_transfer`
   - `goodsDetails=[{"goodsId":"-1"}]` for virtual account provisioning
   - `notifyUrl` from PalmPay config
8. Save response to `PalmPayUserVirtualAccount`
9. Update `FiatTransaction` with `palmpayOrderNo`, `palmpayStatus`, checkout/redirect URLs
10. Return virtual account data to client

## 4.3 Status sequence

`checkDepositStatusController`:

- Reads local transaction state first.
- If still non-final, queries PalmPay via `queryOrderStatus`.
- Maps PalmPay status:
  - `2 -> completed`
  - `3 -> failed`
  - `4 -> cancelled`

## 4.4 Wallet crediting model

Wallet is **not** credited at initiation. Credit occurs in webhook processing on success.

---

## 5) Deposit Webhook Processing

Endpoint: `POST /api/v2/webhooks/palmpay` (and alias `/palmpay/bill-payment` same controller)

Controller: `palmpayWebhookController`

## 5.1 What it does correctly

- Saves raw webhook immediately to `PalmPayRawWebhook`
- Returns plain text `"success"` (even on internal errors) to prevent retries
- Deposit-only processing path:
  - Detects deposit by `orderId` prefix `deposit_`
  - Finds `PalmPayUserVirtualAccount` by `merchantOrderId`
  - Loads linked fiat transaction + wallet
  - Idempotency check: skip if transaction already `completed`
  - If `orderStatus=2`, credits wallet via `fiatWalletService.creditWallet`
  - Updates transaction state and sends notifications

## 5.2 Current behavior limits

- Signature verification logic exists but is explicitly bypassed (commented out).
- Non-deposit webhook payloads are marked processed as "Not a deposit webhook".

---

## 6) Withdrawal Flow (PalmPay Payout)

## 6.1 Public API endpoints

- `GET /api/v2/payments/palmpay/banks`
- `POST /api/v2/payments/palmpay/verify-account`
- `POST /api/v2/payments/palmpay/payout/initiate`
- `GET /api/v2/payments/palmpay/payout/:transactionId`

## 6.2 Bank/account support

- Bank list from PalmPay `queryBankList`.
- Account verify:
  - PalmPay account route when bankCode = `100033` using `queryAccount`.
  - Other banks via `queryBankAccount`.
  - `queryBankAccount` uses `execSync(curl ...)` for payload-byte exactness.

## 6.3 Initiate payout sequence

Controller: `initiatePayoutController`

1. Restriction checks (ban/freeze)
2. Validate amount + beneficiary account fields
3. Ensure wallet and sufficient balance
4. Enforce daily/monthly limits by KYC tier:
   - Tier2: daily 3000, monthly 30000
   - Others: daily 1000, monthly 10000
5. Create pending `FiatTransaction` (`type=WITHDRAW`)
6. Call PalmPay payout API (`palmpayPayout.initiatePayout`)
7. Update transaction with order/session/status
8. **Immediately debit wallet** after initiation

## 6.4 Check payout status

`checkPayoutStatusController` queries PalmPay and updates local status mapping:

- `2 -> completed`
- `3 -> failed`
- `4 -> cancelled`

No debit occurs here because debit already happened in initiate.

---

## 7) Bill Payments (PalmPay Provider Only)

This section focuses on PalmPay path in `billpayment.controller.ts`.

## 7.1 Endpoints (shared bill payment API)

- `GET /api/v2/bill-payments/billers`
- `GET /api/v2/bill-payments/items`
- `POST /api/v2/bill-payments/verify-account`
- `POST /api/v2/bill-payments/create-order`
- `GET /api/v2/bill-payments/order-status`
- `GET /api/v2/bill-payments/history`

## 7.2 PalmPay scene support

From type definitions: `PalmPaySceneCode = 'airtime' | 'data' | 'betting'`.

Note: route layer is multi-provider; airtime can be redirected to Reloadly in current logic.

## 7.3 PalmPay provider create-order sequence

In `createBillOrderController` PalmPay branch:

1. Validates request + PIN.
2. Validates wallet balance.
3. Creates pending `FiatTransaction` (`type=BILL_PAYMENT`).
4. Creates pending `BillPayment` (`provider='palmpay'`).
5. **Debits wallet first** via `fiatWalletService.debitWallet`.
6. Calls PalmPay `createOrder` with:
   - `sceneCode`
   - `outOrderNo`
   - `amount` in kobo
   - `notifyUrl = <PALMPAY_WEBHOOK_URL>/bill-payment`
   - `billerId`, `itemId`, `rechargeAccount`
7. Persists `orderNo` / status into both `FiatTransaction` and `BillPayment`.
8. If immediate success (`orderStatus=2`), marks completed and credits referral commission.

If provider call fails:

- Attempts wallet refund by adding amount back
- Creates refund transaction record
- Marks original payment failed

## 7.4 PalmPay bill query/status service

`palmpay.billpayment.service.ts` supports:

- query billers
- query items
- query recharge account
- create order
- query order status

All signed with same auth service and Bearer header.

---

## 8) Queue / Async Status Reconciliation

`processBillPaymentStatusJob` can query PalmPay status, update transaction tables, and handle idempotent refunds.

However, current scan found no producer code enqueuing `'bill-payment-status'` jobs for PalmPay bill payments in active controller paths.

Meaning:

- Job processor exists
- Worker route exists
- But enqueue path for PalmPay bill-payment status appears missing

By contrast, Reloadly utility flow explicitly enqueues status jobs.

---

## 9) Critical Findings and Risks

## 9.1 Webhook only processes deposits

`palmpayWebhookController` ignores payout and bill-payment payloads (logs/marks not deposit).

Impact:

- PalmPay bill payment webhook notifications are not applied.
- Payout webhook notifications are not applied.

## 9.2 Withdrawal debit happens before final success, with no clear automatic compensation path

Initiate payout debits wallet immediately. If payout later becomes failed/cancelled:

- `checkPayoutStatusController` updates status only
- No wallet refund path in controller/webhook for failed payout was found

Impact:

- Potential stranded debits unless manually reconciled.

## 9.3 PalmPay bill-payment async completion may remain stale

Without webhook handling for bill payments and no observed enqueue of `'bill-payment-status'` jobs from create-order path:

- Pending PalmPay bill orders may not be auto-finalized/refunded.

## 9.4 Signature verification disabled for webhooks

Webhook signature verification code exists but is intentionally bypassed.

Impact:

- Trust boundary is weaker; spoofed callbacks are harder to reject.

## 9.5 Environment and logging concerns

- Base URL forced to production endpoint in config.
- API key printed to console in `getApiKey()`.

Impact:

- Harder sandbox/prod switching.
- Secret leakage risk via logs.

## 9.6 Type definition file duplication

`src/types/palmpay.types.ts` contains repeated bill-payment interface blocks.

Impact:

- Maintenance and correctness risk from duplicate declarations.

---

## 10) PalmPay Status Mapping in Code

Common status interpretation:

- `1` -> pending
- `2` -> success/completed
- `3` -> failed
- `4` -> cancelled

Used in:

- Deposit status checks
- Payout status checks
- Bill status job mapping

---

## 11) Endpoints Summary (PalmPay-Relevant)

### Deposit

- `POST /api/v2/payments/palmpay/deposit/initiate`
- `GET /api/v2/payments/palmpay/deposit/:transactionId`
- `GET /api/v2/payments/palmpay/deposit/success`

### Payout

- `GET /api/v2/payments/palmpay/banks`
- `POST /api/v2/payments/palmpay/verify-account`
- `POST /api/v2/payments/palmpay/payout/initiate`
- `GET /api/v2/payments/palmpay/payout/:transactionId`

### Merchant order helper

- `POST /api/v2/payment/merchant/createorder`

### Bill payments (PalmPay path inside shared API)

- `GET /api/v2/bill-payments/billers?provider=palmpay`
- `GET /api/v2/bill-payments/items?provider=palmpay`
- `POST /api/v2/bill-payments/verify-account` (provider `palmpay`)
- `POST /api/v2/bill-payments/create-order` (provider `palmpay`)
- `GET /api/v2/bill-payments/order-status`
- `GET /api/v2/bill-payments/history`

### Webhooks

- `POST /api/v2/webhooks/palmpay`
- `POST /api/v2/webhooks/palmpay/bill-payment` (alias to same controller)

---

## 12) Recommended Remediation Plan

1. Split webhook handling into explicit deposit, payout, and bill-payment branches.
2. Re-enable signature verification with strict failure handling in production.
3. Add payout failure/cancel refund compensation path with idempotency guard.
4. Enqueue PalmPay bill-payment status jobs at create-order when pending.
5. Add periodic scheduler for stale pending PalmPay bill payments.
6. Restore environment-based gateway switching (sandbox/production).
7. Remove sensitive console logging of API keys.
8. Deduplicate `palmpay.types.ts` declarations.

---

## 13) Operational Checklist

- Ensure worker running: queue `bill-payments`.
- Monitor `PalmPayRawWebhook` for unprocessed/error rows.
- Reconcile `FiatTransaction` and `BillPayment` for mismatched final states.
- Reconcile failed/cancelled withdrawals against wallet balances.
- Alert on prolonged `pending` bill payments and payouts.

---

## 14) Conclusion

Deposit integration is comparatively complete and idempotent with raw webhook storage and wallet crediting on success.

Withdrawal and PalmPay bill payment flows contain structural gaps in asynchronous finalization/reconciliation (especially webhook and refund handling for non-deposit events). These should be treated as high-priority reliability and financial-integrity fixes.

