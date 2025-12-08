# Current Master Wallet Flow Documentation

**Date:** 2024-11-29  
**Status:** To be replaced with Per-User Wallet System

---

## Overview

The current system uses a **Master Wallet** approach where:
- One master wallet (xpub + mnemonic) per blockchain
- All user addresses are derived from this master wallet using HD wallet derivation
- Private keys are generated from the master mnemonic and stored (encrypted)
- Users cannot export their mnemonic (security risk - would give access to all users)

---

## Architecture

```
Master Wallet (Per Blockchain)
    ├─ xpub: Extended Public Key
    ├─ mnemonic: Seed Phrase (ENCRYPTED in database)
    ├─ address: Master wallet address (index 0)
    └─ privateKey: Master wallet private key (index 0, ENCRYPTED)
        ↓
    Derives User Addresses (HD Wallet Derivation)
        ├─ User 1: Index 5 → Address + Private Key
        ├─ User 2: Index 6 → Address + Private Key
        ├─ User 3: Index 7 → Address + Private Key
        └─ User N: Index N+4 → Address + Private Key
```

---

## Database Schema

### MasterWallet Table
```sql
model MasterWallet {
  id          Int      @id @default(autoincrement())
  blockchain  String   @unique
  xpub        String?  -- Extended public key
  address     String?  -- Master wallet address (index 0)
  privateKey  String?  @db.Text -- Encrypted master private key
  mnemonic    String?  @db.Text -- Encrypted master mnemonic
  response    String?  @db.Text -- Full Tatum API response
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### DepositAddress Table
```sql
model DepositAddress {
  id               Int            @id @default(autoincrement())
  virtualAccountId Int
  blockchain       String?
  currency         String?
  address          String         -- User's deposit address
  index            Int?           -- HD derivation index (5, 6, 7...)
  privateKey       String?        @db.Text -- Encrypted private key
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  virtualAccount   VirtualAccount @relation(...)
}
```

---

## Flow: User Signup → Address Generation

### Step 1: User Verifies Email
```
User verifies email
    ↓
verifyUserController
    ↓
Queue job: create-virtual-account
```

### Step 2: Virtual Accounts Created
**File:** `src/services/tatum/virtual.account.service.ts`
```typescript
createVirtualAccountsForUser(userId)
    ↓
For each WalletCurrency:
    ├─ Check if virtual account exists
    ├─ Generate accountId (UUID)
    └─ Create VirtualAccount record
```

### Step 3: Deposit Address Generation
**File:** `src/services/tatum/deposit.address.service.ts`
```typescript
generateAndAssignToVirtualAccount(virtualAccountId)
    ↓
1. Get virtual account
2. Normalize blockchain name
3. Check for existing address (same blockchain for user)
    ├─ If exists: Reuse address + private key
    └─ If not: Generate new address
        ↓
4. Generate New Address:
    ├─ Get master wallet (lockMasterWallet)
    ├─ Decrypt master mnemonic
    ├─ Calculate next index (max existing + 1, or 5)
    ├─ Generate address from master xpub + index
    ├─ Generate private key from master mnemonic + index
    ├─ Encrypt private key (AES-256-CBC)
    └─ Store DepositAddress record
        ↓
5. Register webhook (Tatum V4 API)
```

---

## Key Generation Details

### Index Calculation
- **Master wallet:** Uses index 0
- **User addresses:** Start at index 5 (to avoid conflicts)
- **Increment:** Sequential (+1 for each new address)
- **Per blockchain:** Each blockchain has its own index sequence

### Private Key Encryption
**Algorithm:** AES-256-CBC  
**Key:** `ENCRYPTION_KEY` environment variable (32 characters)  
**Format:** `iv:encrypted_data` (hex encoded)

```typescript
function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}
```

---

## Address Sharing Logic

### Blockchain Groups
Currencies on the same blockchain share the same address:
- **Ethereum:** ETH, USDT, USDC → Same address
- **Tron:** TRON, USDT_TRON → Same address
- **BSC:** BSC, USDT_BSC, USDC_BSC → Same address

**Implementation:**
```typescript
const BLOCKCHAIN_NORMALIZATION = {
  'ethereum': 'ethereum',
  'eth': 'ethereum',
  'tron': 'tron',
  'trx': 'tron',
  'bsc': 'bsc',
  'binance': 'bsc',
  'binancesmartchain': 'bsc',
};
```

**Logic:**
1. When generating address for USDT (Ethereum):
   - Check if user already has ETH address
   - If yes: Reuse that address
   - If no: Generate new address (will be shared with future ETH/USDT/USDC)

---

## Webhook Registration

**Tatum V4 API:** Address-based subscriptions
- **Type:** `ADDRESS_EVENT`
- **No templateId:** Removed (not supported by all chains)
- **URL:** `TATUM_WEBHOOK_URL` or `${BASE_URL}/api/v2/webhooks/tatum`

**Supported Chains:**
- ✅ TRON (supports all features)
- ⚠️ Bitcoin, Ethereum, Litecoin, BSC (no templateId/finality)

---

## Security Considerations

### Current Limitations:
1. ❌ **Cannot export mnemonic** - Would give access to all users
2. ❌ **Shared master wallet** - Single point of failure
3. ❌ **No user ownership** - Users don't control their wallets
4. ⚠️ **Master wallet compromise** - Would affect all users

### What Works:
1. ✅ Private keys are encrypted
2. ✅ Addresses are properly derived
3. ✅ Index tracking prevents conflicts
4. ✅ Webhook registration for monitoring

---

## Files Reference

### Core Services:
- `src/services/tatum/master.wallet.service.ts` - Master wallet management
- `src/services/tatum/deposit.address.service.ts` - Address generation
- `src/services/tatum/virtual.account.service.ts` - Virtual account creation
- `src/services/tatum/tatum.service.ts` - Tatum API integration

### Jobs:
- `src/jobs/tatum/create.virtual.account.job.ts` - Background job for account creation
- `src/jobs/tatum/process.webhook.job.ts` - Webhook processing

### Database:
- `prisma/schema.prisma` - MasterWallet, DepositAddress models

---

## Migration Notes

When migrating to per-user wallets:
1. **Existing users:** Need to generate new wallets
2. **Existing addresses:** Can be migrated or kept for backward compatibility
3. **Master wallet:** Can be kept for admin/system purposes
4. **Private keys:** Users can export their keys from old system before migration

---

## End of Current System Documentation

This system will be replaced with **Per-User Wallet System** where each user has their own unique mnemonic.

