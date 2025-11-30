# Tatum Virtual Account System - Complete Implementation Guide

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Services](#services)
5. [API Endpoints](#api-endpoints)
6. [Queue System](#queue-system)
7. [Security Features](#security-features)
8. [Setup & Configuration](#setup--configuration)
9. [Usage Examples](#usage-examples)
10. [Flow Diagrams](#flow-diagrams)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The Tatum Virtual Account System enables users to receive cryptocurrency deposits through Tatum's infrastructure. Each user gets virtual accounts for supported cryptocurrencies, with unique deposit addresses generated from master wallets.

### Key Features

- ✅ **Multi-Blockchain Support**: Bitcoin, Ethereum, Tron, BSC, Solana, Litecoin
- ✅ **Virtual Accounts**: One per user per currency
- ✅ **Deposit Addresses**: Generated from master wallets with address reuse
- ✅ **Private Key Encryption**: AES-256-CBC encryption for all private keys
- ✅ **Webhook Processing**: Automatic balance updates on deposits
- ✅ **Queue-Based Processing**: Async job processing using Bull/Redis
- ✅ **Address Reuse**: Shared addresses within blockchain groups

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
│ Deposit Address │◄─────┤ Master Wallet    │
│   Generation    │      │  (xpub/mnemonic) │
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
4. **Deposit Address** → Generated from Master Wallet
5. **User Deposits** → Tatum Detects Transaction
6. **Webhook Received** → Balance Updated

---

## Database Schema

### Tables

#### 1. `MasterWallet`
Stores master wallets for each blockchain.

```prisma
model MasterWallet {
  id          Int      @id @default(autoincrement())
  blockchain  String   @unique
  xpub        String?  @db.Text
  address     String?  @db.VarChar(255)
  privateKey  String?  @db.Text  // Encrypted
  mnemonic    String?  @db.Text  // Encrypted
  response    String?  @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Fields:**
- `blockchain`: Unique blockchain identifier (e.g., "ethereum", "bitcoin")
- `xpub`: Extended public key for address generation
- `address`: Master wallet address (index 0)
- `privateKey`: Encrypted private key
- `mnemonic`: Encrypted seed phrase

#### 2. `WalletCurrency`
Supported cryptocurrencies and tokens.

```prisma
model WalletCurrency {
  id              Int      @id @default(autoincrement())
  blockchain      String
  currency        String
  symbol          String?
  name            String?
  price           Decimal? @db.Decimal(18, 2)
  nairaPrice      Decimal? @db.Decimal(18, 2)
  tokenType       String?
  contractAddress String?
  decimals        Int      @default(18)
  isToken         Boolean  @default(false)
  blockchainName  String?
}
```

#### 3. `VirtualAccount`
Tatum virtual accounts for users.

```prisma
model VirtualAccount {
  id            Int      @id @default(autoincrement())
  userId        Int
  accountId     String   @unique  // Tatum account ID
  currency      String
  blockchain    String
  balance       Decimal  @default(0) @db.Decimal(18, 8)
  walletCurrencyId Int
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  user            User             @relation(fields: [userId], references: [id])
  walletCurrency  WalletCurrency   @relation(fields: [walletCurrencyId], references: [id])
  depositAddresses DepositAddress[]
  receiveTransactions ReceiveTransaction[]
}
```

#### 4. `DepositAddress`
Deposit addresses generated from master wallets.

```prisma
model DepositAddress {
  id              Int      @id @default(autoincrement())
  virtualAccountId Int
  blockchain      String
  currency        String
  address         String   @db.VarChar(255)
  index           Int
  privateKey      String?  @db.Text  // Encrypted
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  virtualAccount  VirtualAccount @relation(fields: [virtualAccountId], references: [id])
}
```

**Address Reuse Logic:**
- Addresses are shared within blockchain groups:
  - **Tron Group**: `tron`, `usdt_tron`
  - **Ethereum Group**: `eth`, `usdt`, `usdc`
  - **BSC Group**: `bsc`, `usdt_bsc`, `usdc_bsc`

#### 5. `WebhookResponse`
Logs all webhook events from Tatum.

```prisma
model WebhookResponse {
  id          Int      @id @default(autoincrement())
  accountId   String
  payload     String   @db.Text
  processed   Boolean  @default(false)
  createdAt   DateTime @default(now())
}
```

#### 6. `ReceivedAsset`
Tracks received assets from webhooks.

```prisma
model ReceivedAsset {
  id          Int      @id @default(autoincrement())
  accountId   String
  assetId     String
  txId        String?  @db.VarChar(255)
  amount      Decimal  @db.Decimal(18, 8)
  currency    String
  createdAt   DateTime @default(now())
}
```

#### 7. `ReceiveTransaction`
Links transactions to users and virtual accounts.

```prisma
model ReceiveTransaction {
  id              Int      @id @default(autoincrement())
  userId          Int
  virtualAccountId Int
  txId            String?  @unique @db.VarChar(255)
  amount          Decimal  @db.Decimal(18, 8)
  currency        String
  fromAddress     String?  @db.VarChar(255)
  toAddress       String   @db.VarChar(255)
  blockHeight     Int?
  blockHash       String?  @db.VarChar(255)
  status          String   @default("pending")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  user            User            @relation(fields: [userId], references: [id])
  virtualAccount VirtualAccount  @relation(fields: [virtualAccountId], references: [id])
}
```

---

## Services

### 1. `tatum.service.ts`
Core Tatum API integration service.

**Key Methods:**
- `createWallet(blockchain)`: Creates a wallet via Tatum API
- `createVirtualAccount(data)`: Creates a virtual account
- `generateAddress(blockchain, xpub, index)`: Generates address from xpub
- `generatePrivateKey(blockchain, mnemonic, index)`: Generates private key
- `registerWebhook(accountId, url)`: Registers webhook subscription
- `getVirtualAccount(accountId)`: Gets virtual account details

**Example:**
```typescript
import tatumService from './services/tatum/tatum.service';

// Create wallet
const wallet = await tatumService.createWallet('ethereum');

// Generate address
const address = await tatumService.generateAddress('ethereum', xpub, 0);

// Register webhook
await tatumService.registerWebhook(accountId, webhookUrl);
```

### 2. `master.wallet.service.ts`
Master wallet management service.

**Key Methods:**
- `createMasterWallet(blockchain, endpoint)`: Creates master wallet
- `getMasterWallet(blockchain, includeDecrypted?)`: Gets master wallet
- `getAllMasterWallets()`: Gets all master wallets
- `createAllMasterWallets()`: Creates wallets for all blockchains
- `updateAllMasterWallets()`: Updates existing wallets with missing data

**Encryption:**
- Private keys and mnemonics are encrypted using AES-256-CBC
- Encryption key from `ENCRYPTION_KEY` environment variable

**Example:**
```typescript
import masterWalletService from './services/tatum/master.wallet.service';

// Create single wallet
const wallet = await masterWalletService.createMasterWallet('ethereum', '/ethereum/wallet');

// Create all wallets
const result = await masterWalletService.createAllMasterWallets();

// Update existing wallets
await masterWalletService.updateAllMasterWallets();
```

### 3. `virtual.account.service.ts`
Virtual account creation and management.

**Key Methods:**
- `createVirtualAccountsForUser(userId)`: Creates accounts for all currencies
- `createVirtualAccountForUser(userId, currency, blockchain)`: Creates single account
- `updateBalanceFromTatum(accountId)`: Syncs balance from Tatum

**Example:**
```typescript
import virtualAccountService from './services/tatum/virtual.account.service';

// Create all accounts for user
const accounts = await virtualAccountService.createVirtualAccountsForUser(userId);

// Update balance
await virtualAccountService.updateBalanceFromTatum(accountId);
```

### 4. `deposit.address.service.ts`
Deposit address generation with address reuse.

**Key Methods:**
- `getOrCreateDepositAddress(virtualAccountId, blockchain, currency)`: Gets or creates address
- `generateAndAssignToVirtualAccount(virtualAccountId)`: Generates and assigns address

**Address Reuse Logic:**
- Checks for existing addresses in the same blockchain group
- Reuses address if found, otherwise generates new one
- Index starts at 5 and increments by 40

**Example:**
```typescript
import depositAddressService from './services/tatum/deposit.address.service';

// Get or create address
const address = await depositAddressService.getOrCreateDepositAddress(
  virtualAccountId,
  'ethereum',
  'ETH'
);
```

---

## API Endpoints

### Customer Endpoints

#### 1. Get User Virtual Accounts
```
GET /api/v2/wallets/virtual-accounts
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": "success",
  "message": "Virtual accounts retrieved successfully",
  "data": {
    "accounts": [
      {
        "id": 1,
        "accountId": "tatum_account_id",
        "currency": "ETH",
        "blockchain": "ethereum",
        "balance": "0.00000000",
        "walletCurrency": {
          "name": "ETH",
          "symbol": "wallet_symbols/ETH.png"
        }
      }
    ]
  }
}
```

#### 2. Get Deposit Address
```
GET /api/v2/wallets/deposit-address/:currency/:blockchain
```

**Parameters:**
- `currency`: Currency code (e.g., "ETH", "BTC", "USDT")
- `blockchain`: Blockchain name (e.g., "ethereum", "bitcoin", "tron")

**Response:**
```json
{
  "status": "success",
  "message": "Deposit address retrieved successfully",
  "data": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "currency": "ETH",
    "blockchain": "ethereum",
    "qrCode": "data:image/png;base64,..."
  }
}
```

### Admin Endpoints

#### 1. Create Master Wallet
```
POST /api/admin/master-wallet
```

**Body:**
```json
{
  "blockchain": "ethereum",
  "endpoint": "/ethereum/wallet"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Master wallet created successfully",
  "data": {
    "wallet": {
      "id": 1,
      "blockchain": "ethereum",
      "address": "0x...",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

#### 2. Get All Master Wallets
```
GET /api/admin/master-wallet
```

**Response:**
```json
{
  "status": "success",
  "message": "Master wallets retrieved successfully",
  "data": {
    "wallets": [
      {
        "id": 1,
        "blockchain": "ethereum",
        "address": "0x...",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

#### 3. Create All Master Wallets
```
POST /api/admin/master-wallet/create-all
```

**Response:**
```json
{
  "status": "success",
  "message": "Master wallets creation completed",
  "data": {
    "summary": {
      "created": 6,
      "existing": 0,
      "errorCount": 0
    },
    "results": [
      {
        "blockchain": "ethereum",
        "status": "created",
        "wallet": { ... }
      }
    ]
  }
}
```

#### 4. Update All Master Wallets
```
POST /api/admin/master-wallet/update-all
```

Updates existing master wallets with missing addresses and private keys.

**Response:**
```json
{
  "status": "success",
  "message": "Master wallets update completed",
  "data": {
    "summary": {
      "total": 6,
      "updated": 5,
      "errors": 0
    },
    "results": [...]
  }
}
```

### Webhook Endpoint

#### Tatum Webhook
```
POST /api/v2/webhooks/tatum
```

**Body:** (Tatum webhook payload)
```json
{
  "accountId": "tatum_account_id",
  "subscriptionType": "ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION",
  "amount": "0.1",
  "currency": "ETH",
  "reference": "unique_reference",
  "txId": "0x...",
  "from": "0x...",
  "to": "0x...",
  "date": 1234567890,
  "blockHeight": 12345,
  "blockHash": "0x...",
  "index": 0
}
```

**Response:**
```
200 OK
```

---

## Queue System

### Queue Configuration

The system uses **Bull** (Redis-based queue) for async job processing.

**Environment Variables:**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
QUEUE_CONCURRENCY=1
QUEUE_MAX_JOBS=10
QUEUE_INTERVAL=1000
```

### Jobs

#### 1. Create Virtual Account Job
**Queue:** `tatum`  
**Job Name:** `create-virtual-account`  
**Data:** `{ userId: number }`

**Triggered:** After user email verification

**Process:**
1. Creates virtual accounts for all supported currencies
2. Generates deposit addresses
3. Registers webhooks

**Run Worker:**
```bash
npm run queue:work:tatum
```

#### 2. Process Webhook Job
**Queue:** `tatum`  
**Job Name:** `process-webhook`  
**Data:** `{ webhookPayload: object }`

**Triggered:** When Tatum webhook is received

**Process:**
1. Validates webhook payload
2. Updates virtual account balance
3. Creates transaction records
4. Logs webhook event

### Queue Management

#### Clear Jobs
```bash
# Clear all jobs from tatum queue
npm run queue:clear:tatum

# Clear only waiting jobs
npm run queue:clear:tatum:waiting

# Clear specific status
ts-node src/queue/clear.queue.ts tatum <status>
```

**Status Options:** `waiting`, `active`, `completed`, `failed`, `delayed`, `all`

#### Check Queue Stats
```typescript
import { queueManager } from './queue/queue.manager';

const stats = await queueManager.getQueueStats('tatum');
console.log(stats);
// {
//   queueName: 'tatum',
//   waiting: 5,
//   active: 2,
//   completed: 100,
//   failed: 3,
//   delayed: 0
// }
```

---

## Security Features

### 1. Private Key Encryption

All private keys and mnemonics are encrypted using **AES-256-CBC** encryption.

**Encryption Key:**
- Stored in `ENCRYPTION_KEY` environment variable
- Must be 32 characters long
- Format: `iv:encrypted_data` (hex encoded)

**Implementation:**
```typescript
// Encrypt
const encrypted = encryptPrivateKey(privateKey);

// Decrypt (use with caution!)
const decrypted = decryptPrivateKey(encrypted);
```

### 2. Master Wallet Security

- Private keys never exposed in API responses
- Decryption only available via service method with `includeDecrypted` flag
- Master wallet data stored encrypted in database

### 3. Webhook Security

- Webhook endpoint should be secured (consider adding signature verification)
- Duplicate prevention via `reference` field check
- Master wallet addresses filtered out

---

## Setup & Configuration

### 1. Environment Variables

Add to `.env`:
```env
# Tatum Configuration
TATUM_API_KEY=your_tatum_api_key
TATUM_BASE_URL=https://api.tatum.io/v3
TATUM_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/tatum

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Queue Configuration
QUEUE_CONCURRENCY=1
QUEUE_MAX_JOBS=10
QUEUE_INTERVAL=1000

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here!!

# Base URL
BASE_URL=https://yourdomain.com
```

### 2. Database Migration

```bash
npx prisma migrate dev --name add_tatum_virtual_account_system
```

### 3. Seed Wallet Currencies

```bash
ts-node prisma/seed/wallet-currencies.seed.ts
```

Or add to main seed file:
```typescript
import { seedWalletCurrencies } from './seed/wallet-currencies.seed';
await seedWalletCurrencies();
```

### 4. Create Master Wallets

**Option 1: Create All at Once**
```bash
POST /api/admin/master-wallet/create-all
```

**Option 2: Create Individually**
```bash
POST /api/admin/master-wallet
{
  "blockchain": "ethereum",
  "endpoint": "/ethereum/wallet"
}
```

**Supported Blockchains:**
- `bitcoin`
- `ethereum`
- `tron`
- `bsc`
- `solana`
- `litecoin`

### 5. Start Queue Worker

```bash
# Development
npm run queue:work:tatum

# Production (PM2)
pm2 start ecosystem.config.js --name queue-worker-tatum
```

---

## Usage Examples

### Example 1: User Registration Flow

```typescript
// 1. User registers
POST /api/v2/auth/register
// ... registration logic

// 2. User verifies email
POST /api/v2/auth/verify
// Email verified → Queue job dispatched automatically

// 3. Queue worker creates virtual accounts
// (Happens automatically in background)

// 4. User gets virtual accounts
GET /api/v2/wallets/virtual-accounts
// Returns all virtual accounts for user
```

### Example 2: Get Deposit Address

```typescript
// User wants to deposit ETH
GET /api/v2/wallets/deposit-address/ETH/ethereum

// Response:
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "currency": "ETH",
  "blockchain": "ethereum",
  "qrCode": "data:image/png;base64,..."
}

// User sends ETH to this address
// Tatum detects transaction → Webhook sent → Balance updated
```

### Example 3: Admin Creates Master Wallet

```typescript
// Create Ethereum master wallet
POST /api/admin/master-wallet
{
  "blockchain": "ethereum",
  "endpoint": "/ethereum/wallet"
}

// System:
// 1. Calls Tatum API to create wallet
// 2. Gets mnemonic and xpub
// 3. Generates address (index 0)
// 4. Generates private key (index 0)
// 5. Encrypts private key and mnemonic
// 6. Saves to database
```

---

## Flow Diagrams

### Virtual Account Creation Flow

```
User Verifies Email
    ↓
verifyUserController
    ↓
queueManager.addJob('tatum', 'create-virtual-account', { userId })
    ↓
Job Added to Redis Queue
    ↓
Queue Worker Picks Up Job
    ↓
processCreateVirtualAccountJob
    ↓
For Each WalletCurrency:
    ├─ Create Virtual Account (Tatum API)
    ├─ Generate Deposit Address (from master wallet)
    ├─ Encrypt & Save Private Key
    └─ Register Webhook
    ↓
Virtual Accounts Ready
```

### Deposit Flow

```
User Sends Crypto to Deposit Address
    ↓
Tatum Detects Transaction
    ↓
Tatum Sends Webhook
    ↓
POST /api/v2/webhooks/tatum
    ↓
tatumWebhookController
    ↓
processWebhookJob (Queue)
    ↓
Validate Webhook
    ↓
Update Virtual Account Balance
    ↓
Create Transaction Records
    ↓
Log Webhook Event
    ↓
Balance Updated in Database
```

### Address Generation Flow

```
getOrCreateDepositAddress Called
    ↓
Check Blockchain Group
    ↓
Search for Existing Address in Group
    ↓
Found? → Reuse Address
    ↓
Not Found? → Generate New Address
    ├─ Get Master Wallet
    ├─ Get Next Index (starts at 5, increments by 40)
    ├─ Generate Address from xpub
    ├─ Generate Private Key from mnemonic
    ├─ Encrypt Private Key
    └─ Save to Database
    ↓
Return Address
```

---

## Troubleshooting

### Issue: Virtual Accounts Not Created

**Check:**
1. Queue worker is running: `npm run queue:work:tatum`
2. Redis is running: `redis-cli ping`
3. Master wallets exist: `GET /api/admin/master-wallet`
4. Wallet currencies seeded: Check `WalletCurrency` table

**Solution:**
```bash
# Check queue for jobs
redis-cli KEYS bull:tatum:*

# Check queue stats
# Use queueManager.getQueueStats('tatum')

# Clear stuck jobs
npm run queue:clear:tatum:waiting
```

### Issue: Deposit Address Not Generated

**Check:**
1. Master wallet exists for blockchain
2. Master wallet has xpub and mnemonic
3. Encryption key is set correctly

**Solution:**
```bash
# Update master wallets
POST /api/admin/master-wallet/update-all

# Check master wallet
GET /api/admin/master-wallet
```

### Issue: Webhooks Not Received

**Check:**
1. Webhook URL is correct in Tatum dashboard
2. Webhook is registered: Check `WebhookResponse` table
3. Server is accessible from internet
4. Webhook endpoint is not blocked by firewall

**Solution:**
```bash
# Re-register webhooks manually
# Check Tatum dashboard for webhook subscriptions
```

### Issue: Balance Not Updating

**Check:**
1. Webhook is being received: Check `WebhookResponse` table
2. Webhook is processed: Check `processed` field
3. Transaction exists: Check `ReceiveTransaction` table
4. Virtual account balance: Check `VirtualAccount` table

**Solution:**
```typescript
// Manually update balance
await virtualAccountService.updateBalanceFromTatum(accountId);
```

### Issue: Private Key Decryption Fails

**Check:**
1. `ENCRYPTION_KEY` is set correctly
2. Encryption key hasn't changed (would break existing keys)
3. Key is exactly 32 characters

**Solution:**
- If encryption key changed, you'll need to re-encrypt all keys
- Or recreate master wallets with new key

---

## File Structure

```
src/
├── services/
│   └── tatum/
│       ├── tatum.service.ts              # Core Tatum API client
│       ├── master.wallet.service.ts       # Master wallet management
│       ├── virtual.account.service.ts     # Virtual account operations
│       └── deposit.address.service.ts    # Address generation
├── controllers/
│   ├── admin/
│   │   └── master.wallet.controller.ts   # Admin master wallet endpoints
│   ├── customer/
│   │   └── virtual.account.controller.ts # Customer virtual account endpoints
│   └── webhooks/
│       └── tatum.webhook.controller.ts   # Webhook handler
├── jobs/
│   └── tatum/
│       ├── create.virtual.account.job.ts # Virtual account creation job
│       └── process.webhook.job.ts        # Webhook processing job
└── routes/
    ├── admin/
    │   └── master.wallet.router.ts        # Admin routes
    ├── cutomer/
    │   └── virtual.account.router.ts      # Customer routes
    └── webhooks/
        └── tatum.webhook.router.ts        # Webhook route

prisma/
├── schema.prisma                         # Database schema
└── seed/
    └── wallet-currencies.seed.ts         # Wallet currencies seeder

docs/
├── TATUM_COMPLETE_IMPLEMENTATION.md      # This document
├── TATUM_ENV_CONFIGURATION.md            # Environment variables
├── TATUM_QUEUE_SYSTEM.md                 # Queue system details
└── TATUM_IMPLEMENTATION_SUMMARY.md       # Quick summary
```

---

## Best Practices

1. **Always encrypt private keys** before storing in database
2. **Use queue system** for async operations (don't block API responses)
3. **Handle errors gracefully** - continue processing other accounts if one fails
4. **Monitor queue** - check queue stats regularly
5. **Log webhook events** - keep track of all webhook payloads
6. **Test webhook endpoint** - use Tatum's webhook testing tools
7. **Backup encryption key** - store securely, never commit to git
8. **Monitor balances** - sync with Tatum API periodically if needed

---

## API Reference Links

- **Tatum API Docs**: https://docs.tatum.io/
- **Bull Queue Docs**: https://github.com/OptimalBits/bull
- **Prisma Docs**: https://www.prisma.io/docs

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review Tatum API documentation
3. Check queue logs and webhook logs
4. Verify environment variables are set correctly

---

**Last Updated:** 2024-01-01  
**Version:** 1.0.0

