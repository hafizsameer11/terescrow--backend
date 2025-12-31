# Tatum Virtual Account System - Complete Implementation Guide

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Environment Configuration](#environment-configuration)
5. [Core Services](#core-services)
6. [API Endpoints](#api-endpoints)
7. [Webhook Processing](#webhook-processing)
8. [Setup Instructions](#setup-instructions)
9. [Code Examples](#code-examples)
10. [Flow Diagrams](#flow-diagrams)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The Tatum Virtual Account System enables users to receive cryptocurrency deposits through Tatum's infrastructure. Each user gets virtual accounts for supported cryptocurrencies, with unique deposit addresses generated from per-user wallets.

### Key Features

- ✅ **Multi-Blockchain Support**: Bitcoin, Ethereum, Tron, BSC, Solana, Litecoin, Polygon, Dogecoin, XRP
- ✅ **Per-User Wallets**: Each user gets their own unique wallet (mnemonic) per blockchain
- ✅ **Virtual Accounts**: One per user per currency
- ✅ **Deposit Addresses**: Generated from user wallets with address reuse within blockchain groups
- ✅ **Private Key Encryption**: AES-256-CBC encryption for all private keys and mnemonics
- ✅ **Webhook Processing**: Automatic balance updates on deposits
- ✅ **Address Reuse**: Shared addresses within blockchain groups (e.g., ETH, USDT, USDC share same address)

---

## Architecture

### System Components

```
┌─────────────────┐
│   User Action   │
│ (Email Verify)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Queue System   │
│   (Bull/Redis)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Tatum Service  │◄─────┤  Tatum API       │
│  (API Client)   │      │  (External)      │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐
│ Virtual Account │
│   Creation      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│ Deposit Address │◄─────┤  User Wallet     │
│   Generation    │      │  (per-user)      │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐
│  Webhook Event  │
│   Processing    │
└─────────────────┘
```

### Data Flow

1. **User Registration** → Email Verification
2. **Email Verified** → Queue Job Dispatched
3. **Queue Worker** → Creates Virtual Accounts
4. **Deposit Address** → Generated from User Wallet
5. **User Deposits** → Tatum Detects Transaction
6. **Webhook Received** → Balance Updated

---

## Database Schema

### 1. MasterWallet

Stores master wallets for each blockchain (used for reference, not for user deposits).

```prisma
model MasterWallet {
  id         Int      @id @default(autoincrement())
  blockchain String   @db.VarChar(255)
  xpub       String?  @db.VarChar(500)
  address    String?  @db.VarChar(255)
  privateKey String?  @db.Text  // Encrypted
  mnemonic   String?  @db.Text  // Encrypted
  response   String?  @db.Text
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([blockchain])
  @@map("MasterWallet")
}
```

**Fields:**
- `blockchain`: Unique blockchain identifier (e.g., "ethereum", "bitcoin")
- `xpub`: Extended public key for address generation
- `address`: Master wallet address (index 0)
- `privateKey`: Encrypted private key
- `mnemonic`: Encrypted seed phrase

### 2. UserWallet

Stores per-user wallets (one per blockchain per user).

```prisma
model UserWallet {
  id               Int              @id @default(autoincrement())
  userId           Int              @map("user_id")
  blockchain       String           @db.VarChar(255)
  mnemonic         String?          @db.Text // Encrypted mnemonic/secret/privateKey
  xpub             String?          @db.VarChar(500) // Extended public key (or address for Solana/XRP)
  derivationPath   String?          @map("derivation_path") @db.VarChar(100)
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt @map("updated_at")
  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  depositAddresses DepositAddress[]

  @@unique([userId, blockchain])
  @@index([userId])
  @@index([blockchain])
  @@map("user_wallets")
}
```

**Fields:**
- `userId`: User ID
- `blockchain`: Blockchain identifier
- `mnemonic`: Encrypted mnemonic (or privateKey for Solana, secret for XRP)
- `xpub`: Extended public key (or address for Solana/XRP stored here)
- `derivationPath`: BIP44 derivation path (e.g., "m/44'/60'/0'")

**Special Cases:**
- **Solana**: Stores `privateKey` in `mnemonic` field, stores `address` in `xpub` field
- **XRP**: Stores `secret` in `mnemonic` field, stores `address` in `xpub` field

### 3. WalletCurrency

Supported cryptocurrencies and tokens.

```prisma
model WalletCurrency {
  id              Int              @id @default(autoincrement())
  blockchain      String           @db.VarChar(255)
  currency        String           @db.VarChar(50)
  symbol          String?          @db.VarChar(255)
  name            String           @db.VarChar(255)
  price           Decimal?         @db.Decimal(20, 8)
  nairaPrice      Decimal?         @map("naira_price") @db.Decimal(20, 8)
  tokenType       String?          @map("token_type") @db.VarChar(50)
  contractAddress String?          @map("contract_address") @db.VarChar(255)
  decimals        Int              @default(18)
  isToken         Boolean          @default(false) @map("is_token")
  blockchainName  String?          @map("blockhain_name") @db.VarChar(255)
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")
  virtualAccounts VirtualAccount[]

  @@map("wallet_currencies")
}
```

**Fields:**
- `blockchain`: Blockchain identifier (e.g., "ethereum", "tron")
- `currency`: Currency code (e.g., "ETH", "USDT", "USDT_TRON")
- `contractAddress`: Token contract address (for tokens)
- `isToken`: Whether this is a token (true) or native coin (false)

### 4. VirtualAccount

Virtual accounts for users (one per currency per user).

```prisma
model VirtualAccount {
  id                  Int                  @id @default(autoincrement())
  userId              Int                  @map("user_id")
  blockchain          String               @db.VarChar(255)
  currency            String               @db.VarChar(50)
  customerId          String?              @map("customer_id") @db.VarChar(255)
  accountId           String               @unique @map("account_id") @db.VarChar(255)
  accountCode         String?              @map("account_code") @db.VarChar(255)
  active              Boolean              @default(true)
  frozen              Boolean              @default(false)
  accountBalance      String               @default("0") @map("account_balance") @db.VarChar(255)
  availableBalance    String               @default("0") @map("available_balance") @db.VarChar(255)
  xpub                String?              @db.VarChar(500)
  accountingCurrency  String?              @map("accounting_currency") @db.VarChar(50)
  currencyId          Int?                 @map("currency_id")
  createdAt           DateTime             @default(now()) @map("created_at")
  updatedAt           DateTime             @updatedAt @map("updated_at")
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  walletCurrency      WalletCurrency?      @relation(fields: [currencyId], references: [id])
  depositAddresses    DepositAddress[]
  receiveTransactions ReceiveTransaction[]
  cryptoTransactions  CryptoTransaction[]

  @@index([userId])
  @@index([blockchain])
  @@index([currency])
  @@index([currencyId])
  @@map("virtual_accounts")
}
```

**Fields:**
- `userId`: User ID
- `blockchain`: Blockchain identifier
- `currency`: Currency code
- `accountId`: Unique account identifier (UUID)
- `accountBalance`: Total balance (string to preserve precision)
- `availableBalance`: Available balance (string to preserve precision)

### 5. DepositAddress

Deposit addresses generated from user wallets.

```prisma
model DepositAddress {
  id               Int            @id @default(autoincrement())
  virtualAccountId Int            @map("virtual_account_id")
  userWalletId     Int?           @map("user_wallet_id")
  blockchain       String?        @db.VarChar(255)
  currency         String?        @db.VarChar(50)
  address          String         @db.VarChar(255)
  index            Int?           @db.Int
  privateKey       String?        @map("private_key") @db.Text  // Encrypted
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")
  virtualAccount   VirtualAccount @relation(fields: [virtualAccountId], references: [id], onDelete: Cascade)
  userWallet       UserWallet?    @relation(fields: [userWalletId], references: [id], onDelete: SetNull)

  @@index([virtualAccountId])
  @@index([userWalletId])
  @@index([blockchain])
  @@index([address])
  @@map("deposit_addresses")
}
```

**Fields:**
- `virtualAccountId`: Virtual account ID
- `userWalletId`: User wallet ID (links to per-user wallet)
- `address`: Deposit address
- `index`: Derivation index (always 0 for user wallets)
- `privateKey`: Encrypted private key

**Address Reuse Logic:**
- Addresses are shared within blockchain groups:
  - **Ethereum Group**: `ETH`, `USDT`, `USDC` (all share same address)
  - **Tron Group**: `TRX`, `USDT_TRON` (all share same address)
  - **BSC Group**: `BNB`, `USDT_BSC` (all share same address)

### 6. WebhookResponse

Logs all webhook events from Tatum.

```prisma
model WebhookResponse {
  id               Int       @id @default(autoincrement())
  accountId        String?   @map("account_id") @db.VarChar(255)
  subscriptionType String?   @map("subscription_type") @db.VarChar(255)
  amount           Decimal?  @db.Decimal(20, 8)
  reference        String?   @db.VarChar(255)
  currency         String?   @db.VarChar(50)
  txId             String?   @map("tx_id") @db.VarChar(255)
  blockHeight      BigInt?   @map("block_height")
  blockHash        String?   @map("block_hash") @db.VarChar(255)
  fromAddress      String?   @map("from_address") @db.VarChar(255)
  toAddress        String?   @map("to_address") @db.VarChar(255)
  transactionDate  DateTime? @map("transaction_date")
  index            Int?
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  @@index([accountId])
  @@index([reference])
  @@index([txId])
  @@map("webhook_responses")
}
```

### 7. TatumRawWebhook

Raw webhook data storage for debugging.

```prisma
model TatumRawWebhook {
  id           Int       @id @default(autoincrement())
  rawData      String    @map("raw_data") @db.LongText
  headers      String?   @db.Text
  ipAddress    String?   @map("ip_address") @db.VarChar(255)
  userAgent    String?   @map("user_agent") @db.VarChar(500)
  processed    Boolean   @default(false)
  processedAt  DateTime? @map("processed_at")
  errorMessage String?   @map("error_message") @db.Text
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@index([processed])
  @@index([createdAt])
  @@map("tatum_raw_webhooks")
}
```

---

## Environment Configuration

### Required Environment Variables

```env
# Tatum API Configuration
TATUM_API_KEY=your_tatum_api_key_here
TATUM_BASE_URL=https://api.tatum.io/v3
TATUM_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/tatum

# Encryption Key (MUST be exactly 32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key-here!!

# Base URL
BASE_URL=https://yourdomain.com
```

### Encryption Key Requirements

- **MUST be exactly 32 characters**
- Used for AES-256-CBC encryption of private keys and mnemonics
- **DO NOT CHANGE** after deployment (would break decryption of existing keys)
- Generate a secure random key: `openssl rand -hex 16`

---

## Core Services

### 1. TatumService (`src/services/tatum/tatum.service.ts`)

Core Tatum API client.

#### Key Methods

**createWallet(blockchain: string)**
```typescript
async createWallet(blockchain: string): Promise<TatumWalletResponse> {
  // XRP uses /v3/xrp/account endpoint
  if (blockchain === 'xrp' || blockchain === 'ripple') {
    const response = await this.axiosInstance.get('/xrp/account');
    return {
      address: response.data.address,
      secret: response.data.secret,
      privateKey: response.data.secret,
    };
  }
  
  // Other blockchains use /v3/{blockchain}/wallet
  const response = await this.axiosInstance.get(`/${blockchain}/wallet`);
  return response.data;
}
```

**generateAddress(blockchain: string, xpub: string, index: number)**
```typescript
async generateAddress(blockchain: string, xpub: string, index: number): Promise<string> {
  const endpoint = `/${blockchain.toLowerCase()}/address/${xpub}/${index}`;
  const response = await this.axiosInstance.get(endpoint);
  return response.data.address;
}
```

**generatePrivateKey(blockchain: string, mnemonic: string, index: number)**
```typescript
async generatePrivateKey(blockchain: string, mnemonic: string, index: number): Promise<string> {
  const endpoint = `/${blockchain.toLowerCase()}/wallet/priv`;
  const response = await this.axiosInstance.post(endpoint, { mnemonic, index });
  return response.data.key;
}
```

**registerAddressWebhookV4(address: string, blockchain: string, webhookUrl: string)**
```typescript
async registerAddressWebhookV4(
  address: string,
  blockchain: string,
  webhookUrl: string,
  options?: {
    type?: 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX' | 'ADDRESS_EVENT';
    finality?: 'confirmed' | 'final';
  }
): Promise<TatumV4WebhookSubscriptionResponse> {
  const chain = this.getTatumV4Chain(blockchain);
  const data = {
    type: options?.type || 'INCOMING_NATIVE_TX',
    attr: { address, chain, url: webhookUrl },
  };
  if (options?.finality) data.finality = options.finality;
  
  const response = await this.axiosInstanceV4.post('/subscription', data);
  return response.data;
}
```

**getTatumV4Chain(blockchain: string)**
Maps blockchain names to Tatum V4 chain identifiers:
- `bitcoin` → `bitcoin-mainnet`
- `ethereum` → `ethereum-mainnet`
- `tron` → `tron-mainnet`
- `bsc` → `bsc-mainnet`
- `solana` → `solana-mainnet`
- `polygon` → `polygon-mainnet`
- `dogecoin` → `doge-mainnet`
- `xrp` → `ripple-mainnet`

### 2. UserWalletService (`src/services/user/user.wallet.service.ts`)

Manages per-user wallets.

#### Key Methods

**getOrCreateUserWallet(userId: number, blockchain: string)**
```typescript
async getOrCreateUserWallet(userId: number, blockchain: string) {
  // Check if wallet exists
  let userWallet = await prisma.userWallet.findUnique({
    where: { userId_blockchain: { userId, blockchain } },
  });
  
  if (userWallet) return userWallet;
  
  // Generate new wallet via Tatum
  const walletData = await tatumService.createWallet(blockchain);
  
  // Handle special cases (Solana, XRP)
  const isNoXpub = blockchain === 'solana' || blockchain === 'xrp';
  
  // Encrypt mnemonic/secret/privateKey
  let mnemonicOrSecret: string;
  if (blockchain === 'solana') {
    mnemonicOrSecret = walletData.privateKey || walletData.mnemonic;
  } else if (blockchain === 'xrp') {
    mnemonicOrSecret = walletData.secret || walletData.privateKey;
  } else {
    mnemonicOrSecret = walletData.mnemonic;
  }
  
  const encryptedMnemonic = encryptPrivateKey(mnemonicOrSecret);
  
  // Create wallet
  userWallet = await prisma.userWallet.create({
    data: {
      userId,
      blockchain,
      mnemonic: encryptedMnemonic,
      xpub: isNoXpub ? walletData.address : walletData.xpub,
      derivationPath: this.getDerivationPath(blockchain),
    },
  });
  
  return userWallet;
}
```

**getDerivationPath(blockchain: string)**
Returns BIP44 derivation path:
- Bitcoin: `m/44'/0'/0'`
- Ethereum: `m/44'/60'/0'`
- Tron: `m/44'/195'/0'`
- BSC: `m/44'/60'/0'`
- Solana/XRP: `null` (not HD wallets)

### 3. VirtualAccountService (`src/services/tatum/virtual.account.service.ts`)

Manages virtual accounts.

#### Key Methods

**createVirtualAccountsForUser(userId: number)**
```typescript
async createVirtualAccountsForUser(userId: number) {
  // Get all supported currencies
  const walletCurrencies = await prisma.walletCurrency.findMany();
  
  const createdAccounts = [];
  
  for (const currency of walletCurrencies) {
    // Check if exists
    const existing = await prisma.virtualAccount.findFirst({
      where: { userId, currency: currency.currency, blockchain: currency.blockchain },
    });
    
    if (existing) {
      createdAccounts.push(existing);
      continue;
    }
    
    // Create virtual account
    const accountId = randomUUID();
    const virtualAccount = await prisma.virtualAccount.create({
      data: {
        userId,
        blockchain: currency.blockchain,
        currency: currency.currency,
        customerId: String(userId),
        accountId,
        accountCode: `user_${userId}_${currency.currency}`,
        active: true,
        frozen: false,
        accountBalance: '0',
        availableBalance: '0',
        accountingCurrency: 'USD',
        currencyId: currency.id,
      },
    });
    
    createdAccounts.push(virtualAccount);
  }
  
  return createdAccounts;
}
```

### 4. DepositAddressService (`src/services/tatum/deposit.address.service.ts`)

Generates deposit addresses from user wallets.

#### Key Methods

**generateAndAssignToVirtualAccount(virtualAccountId: number)**
```typescript
async generateAndAssignToVirtualAccount(virtualAccountId: number) {
  // Get virtual account
  const virtualAccount = await prisma.virtualAccount.findUnique({
    where: { id: virtualAccountId },
    include: { walletCurrency: true },
  });
  
  const blockchain = virtualAccount.blockchain.toLowerCase();
  const normalizedBlockchain = this.normalizeBlockchain(blockchain);
  
  // Check for existing address on same blockchain (address reuse)
  const allUserAddresses = await prisma.depositAddress.findMany({
    where: { virtualAccount: { userId: virtualAccount.userId } },
    include: { virtualAccount: true },
  });
  
  const existingAddress = allUserAddresses.find(addr => {
    const addrNormalized = this.normalizeBlockchain(addr.blockchain);
    return addrNormalized === normalizedBlockchain;
  });
  
  // Reuse existing address if found
  if (existingAddress) {
    const depositAddress = await prisma.depositAddress.create({
      data: {
        virtualAccountId,
        userWalletId: existingAddress.userWalletId,
        blockchain,
        currency: virtualAccount.currency,
        address: existingAddress.address,
        index: existingAddress.index,
        privateKey: existingAddress.privateKey,
      },
    });
    return depositAddress;
  }
  
  // Generate new address
  const userWallet = await userWalletService.getOrCreateUserWallet(
    virtualAccount.userId,
    normalizedBlockchain
  );
  
  const isNoXpub = normalizedBlockchain === 'solana' || normalizedBlockchain === 'xrp';
  
  let address: string;
  let privateKey: string;
  
  if (isNoXpub) {
    // Solana/XRP: reuse address from xpub field
    if (userWallet.xpub) {
      address = userWallet.xpub;
      const mnemonic = decryptPrivateKey(userWallet.mnemonic);
      privateKey = mnemonic; // For Solana/XRP, mnemonic stores privateKey/secret
    } else {
      // First time: generate wallet
      const walletData = await tatumService.createWallet(normalizedBlockchain);
      address = walletData.address;
      privateKey = walletData.privateKey || walletData.secret;
      
      // Store address in xpub field
      await prisma.userWallet.update({
        where: { id: userWallet.id },
        data: { xpub: address },
      });
    }
  } else {
    // Other blockchains: generate from xpub
    const mnemonic = decryptPrivateKey(userWallet.mnemonic);
    address = await tatumService.generateAddress(normalizedBlockchain, userWallet.xpub, 0);
    privateKey = await tatumService.generatePrivateKey(normalizedBlockchain, mnemonic, 0);
  }
  
  // Encrypt private key
  const encryptedPrivateKey = encryptPrivateKey(privateKey);
  
  // Store deposit address
  const depositAddress = await prisma.depositAddress.create({
    data: {
      virtualAccountId,
      userWalletId: userWallet.id,
      blockchain,
      currency: virtualAccount.currency,
      address,
      index: 0,
      privateKey: encryptedPrivateKey,
    },
  });
  
  // Register webhooks
  const webhookUrl = process.env.TATUM_WEBHOOK_URL;
  
  // Register native token webhook
  await tatumService.registerAddressWebhookV4(address, normalizedBlockchain, webhookUrl, {
    type: 'INCOMING_NATIVE_TX',
  });
  
  // Register fungible token webhook if blockchain supports tokens
  const hasFungibleTokens = await prisma.walletCurrency.findFirst({
    where: { blockchain: normalizedBlockchain, isToken: true, contractAddress: { not: null } },
  });
  
  if (hasFungibleTokens) {
    await tatumService.registerAddressWebhookV4(address, normalizedBlockchain, webhookUrl, {
      type: 'INCOMING_FUNGIBLE_TX',
    });
  }
  
  return depositAddress;
}
```

**normalizeBlockchain(blockchain: string)**
Normalizes blockchain names for consistent comparison:
- `ethereum`, `eth` → `ethereum`
- `tron`, `trx` → `tron`
- `bsc`, `binance` → `bsc`

### 5. MasterWalletService (`src/services/tatum/master.wallet.service.ts`)

Manages master wallets (for reference, not used for user deposits).

#### Key Methods

**createMasterWallet(blockchain: string, endpoint: string)**
**createAllMasterWallets()** - Creates wallets for all blockchains in `wallet_currencies`

---

## API Endpoints

### Admin Endpoints

#### Create Master Wallet
```
POST /api/admin/master-wallet
Body: { blockchain: "ethereum", endpoint: "/ethereum/wallet" }
```

#### Get All Master Wallets
```
GET /api/admin/master-wallet
```

#### Create All Master Wallets
```
POST /api/admin/master-wallet/create-all
```

### Customer Endpoints

#### Get User's Virtual Accounts
```
GET /api/v2/wallets/virtual-accounts
Headers: Authorization: Bearer {token}
```

#### Get Deposit Address
```
GET /api/v2/wallets/deposit-address/:currency/:blockchain
Headers: Authorization: Bearer {token}
```

### Webhook Endpoint

#### Receive Tatum Webhook
```
POST /api/v2/webhooks/tatum
Body: { ...webhook payload }
```

---

## Webhook Processing

### Webhook Types

1. **INCOMING_NATIVE_TX**: Native token transfers (ETH, BTC, TRX, etc.)
2. **INCOMING_FUNGIBLE_TX**: Token transfers (USDT, USDC, etc.)
3. **ADDRESS_EVENT**: Legacy address-based events

### Webhook Processing Flow

```typescript
// src/jobs/tatum/process.webhook.job.ts

export async function processBlockchainWebhook(webhookData: any) {
  // 1. Check if from master wallet (ignore)
  if (isMasterWallet(webhookData.from)) {
    return { processed: false, reason: 'master_wallet' };
  }
  
  // 2. Find deposit address by matching address
  const depositAddress = await findDepositAddress(webhookData.address || webhookData.to);
  
  if (!depositAddress) {
    return { processed: false, reason: 'deposit_address_not_found' };
  }
  
  // 3. Check for duplicate transaction
  const existingTx = await prisma.cryptoTransaction.findFirst({
    where: { transactionType: 'RECEIVE', cryptoReceive: { txHash: webhookData.txId } },
  });
  
  if (existingTx) {
    return { processed: false, reason: 'duplicate_tx' };
  }
  
  // 4. Determine currency (native or token)
  let currency = depositAddress.virtualAccount.currency;
  if (isTokenTransfer(webhookData)) {
    currency = await findCurrencyByContractAddress(webhookData.contractAddress);
  }
  
  // 5. Update virtual account balance
  const virtualAccount = await prisma.virtualAccount.findUnique({
    where: { accountId: depositAddress.virtualAccount.accountId },
  });
  
  const currentBalance = new Decimal(virtualAccount.accountBalance);
  const receivedAmount = new Decimal(webhookData.amount);
  const newBalance = currentBalance.plus(receivedAmount);
  
  await prisma.virtualAccount.update({
    where: { id: virtualAccount.id },
    data: {
      accountBalance: newBalance.toString(),
      availableBalance: newBalance.toString(),
    },
  });
  
  // 6. Create transaction records
  await createReceiveTransaction({
    userId: virtualAccount.userId,
    virtualAccountId: virtualAccount.id,
    amount: receivedAmount.toString(),
    currency,
    txHash: webhookData.txId,
    fromAddress: webhookData.from,
    toAddress: webhookData.to,
  });
  
  // 7. Send notifications
  await sendPushNotification({ ... });
  
  return { processed: true, ... };
}
```

### Webhook Payload Structure

**INCOMING_NATIVE_TX:**
```json
{
  "subscriptionType": "INCOMING_NATIVE_TX",
  "address": "0x...",
  "counterAddress": "0x...",
  "amount": "1.5",
  "txId": "0x...",
  "blockNumber": 12345,
  "blockHash": "0x...",
  "timestamp": 1234567890
}
```

**INCOMING_FUNGIBLE_TX:**
```json
{
  "subscriptionType": "INCOMING_FUNGIBLE_TX",
  "address": "0x...",
  "counterAddress": "0x...",
  "contractAddress": "0x...",
  "amount": "100.0",
  "txId": "0x...",
  "blockNumber": 12345,
  "blockHash": "0x...",
  "timestamp": 1234567890
}
```

---

## Setup Instructions

### 1. Install Dependencies

```bash
npm install axios prisma @prisma/client
npm install -D @types/node
```

### 2. Environment Variables

Add to `.env`:
```env
TATUM_API_KEY=your_tatum_api_key
TATUM_BASE_URL=https://api.tatum.io/v3
TATUM_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/tatum
ENCRYPTION_KEY=your-32-character-encryption-key-here!!
BASE_URL=https://yourdomain.com
```

### 3. Database Migration

```bash
npx prisma migrate dev --name add_tatum_system
```

### 4. Seed Wallet Currencies

Create a seeder or manually insert currencies:

```typescript
// Example: Seed wallet currencies
const currencies = [
  { blockchain: 'ethereum', currency: 'ETH', name: 'Ethereum', isToken: false },
  { blockchain: 'ethereum', currency: 'USDT', name: 'Tether USD', isToken: true, contractAddress: '0x...' },
  { blockchain: 'tron', currency: 'TRX', name: 'Tron', isToken: false },
  { blockchain: 'tron', currency: 'USDT_TRON', name: 'Tether USD (TRON)', isToken: true },
  // ... more currencies
];

for (const currency of currencies) {
  await prisma.walletCurrency.create({ data: currency });
}
```

### 5. Create Master Wallets (Optional)

```bash
POST /api/admin/master-wallet/create-all
```

### 6. Queue Worker Setup

Create a queue worker to process virtual account creation:

```typescript
// src/jobs/tatum/create.virtual.account.job.ts
export async function processCreateVirtualAccountJob(job: any) {
  const { userId } = job.data;
  
  // Create virtual accounts
  await virtualAccountService.createVirtualAccountsForUser(userId);
  
  // Generate deposit addresses
  const virtualAccounts = await virtualAccountService.getUserVirtualAccounts(userId);
  for (const va of virtualAccounts) {
    await depositAddressService.generateAndAssignToVirtualAccount(va.id);
  }
}
```

---

## Code Examples

### Complete Service Implementation

See the following files for complete code:
- `src/services/tatum/tatum.service.ts` - Tatum API client
- `src/services/tatum/user.wallet.service.ts` - User wallet management
- `src/services/tatum/virtual.account.service.ts` - Virtual account management
- `src/services/tatum/deposit.address.service.ts` - Deposit address generation
- `src/jobs/tatum/process.webhook.job.ts` - Webhook processing

### Encryption Functions

```typescript
import crypto from 'crypto';

function encryptPrivateKey(data: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPrivateKey(encryptedKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8');
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

---

## Flow Diagrams

### User Registration Flow

```
User Registers
    ↓
Email Verification
    ↓
Queue Job Dispatched
    ↓
Create Virtual Accounts (all currencies)
    ↓
For each Virtual Account:
    ├─ Get/Create User Wallet
    ├─ Generate Deposit Address
    ├─ Register Webhooks
    └─ Save Deposit Address
```

### Deposit Flow

```
User Sends Crypto to Deposit Address
    ↓
Tatum Detects Transaction
    ↓
Webhook Sent to /api/v2/webhooks/tatum
    ↓
Save Raw Webhook
    ↓
Process Webhook (async)
    ├─ Find Deposit Address
    ├─ Check Duplicates
    ├─ Update Virtual Account Balance
    ├─ Create Transaction Records
    └─ Send Notifications
```

---

## Troubleshooting

### Common Issues

1. **Encryption Key Error**
   - Ensure `ENCRYPTION_KEY` is exactly 32 characters
   - Don't change encryption key after deployment

2. **Webhook Not Received**
   - Verify `TATUM_WEBHOOK_URL` is publicly accessible
   - Check Tatum dashboard for webhook subscriptions
   - Verify webhook endpoint returns 200 status

3. **Address Generation Fails**
   - Check Tatum API key is valid
   - Verify blockchain is supported
   - Check user wallet exists

4. **Balance Not Updating**
   - Check webhook processing logs
   - Verify deposit address matches webhook address
   - Check for duplicate transaction prevention

5. **Solana/XRP Issues**
   - Solana: Stores `privateKey` in `mnemonic` field
   - XRP: Stores `secret` in `mnemonic` field
   - Both store `address` in `xpub` field

---

## File Structure

```
src/
├── services/
│   ├── tatum/
│   │   ├── tatum.service.ts              # Core Tatum API client
│   │   ├── master.wallet.service.ts       # Master wallet management
│   │   ├── virtual.account.service.ts     # Virtual account operations
│   │   └── deposit.address.service.ts    # Address generation
│   └── user/
│       └── user.wallet.service.ts         # Per-user wallet management
├── controllers/
│   ├── admin/
│   │   └── master.wallet.controller.ts   # Admin endpoints
│   ├── customer/
│   │   └── virtual.account.controller.ts # Customer endpoints
│   └── webhooks/
│       └── tatum.webhook.controller.ts   # Webhook handler
├── jobs/
│   └── tatum/
│       ├── create.virtual.account.job.ts # Virtual account creation
│       └── process.webhook.job.ts        # Webhook processing
└── routes/
    ├── admin/
    │   └── master.wallet.router.ts        # Admin routes
    ├── customer/
    │   └── virtual.account.router.ts      # Customer routes
    └── webhooks/
        └── tatum.webhook.router.ts        # Webhook route

prisma/
└── schema.prisma                         # Database schema
```

---

## Summary

This implementation provides:

1. **Per-User Wallets**: Each user gets their own wallet per blockchain
2. **Address Reuse**: Currencies on the same blockchain share addresses
3. **Encryption**: All private keys and mnemonics are encrypted
4. **Webhook Processing**: Automatic balance updates on deposits
5. **Multi-Blockchain**: Supports Bitcoin, Ethereum, Tron, BSC, Solana, Polygon, Dogecoin, XRP

For complete code, refer to the source files listed above.


