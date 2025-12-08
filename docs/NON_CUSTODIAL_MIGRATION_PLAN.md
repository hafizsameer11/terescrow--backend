# Non-Custodial System Migration Plan

## Current System Analysis

### Current Architecture (Custodial)
```
Master Wallet (Service Controlled)
    ├─ xpub: Extended Public Key
    ├─ mnemonic: Seed Phrase (ENCRYPTED)
    └─ Derives → User Addresses (Index 5, 6, 7...)
        ├─ Private Keys Generated
        ├─ Private Keys Encrypted (AES-256-CBC)
        └─ Stored in Database
```

**Problems:**
- ❌ Service has access to all private keys
- ❌ Users don't control their funds
- ❌ Single point of failure (master wallet compromise)
- ❌ Regulatory issues (classified as custodial)

---

## Recommended Non-Custodial Approach

### Option 1: User-Provided Wallets (Best for Deposits)

**How it works:**
1. Users connect their own wallets (MetaMask, Trust Wallet, WalletConnect, etc.)
2. Users provide their public addresses
3. Service stores only public addresses (no private keys)
4. Users sign all transactions with their own wallets

**Implementation:**
```typescript
// User connects wallet and provides address
interface UserWallet {
  userId: number;
  blockchain: string;
  address: string; // User's own address
  walletType: 'metamask' | 'trust' | 'walletconnect' | 'hardware';
  connectedAt: Date;
  // NO private key stored
}

// Virtual Account links to user's address
interface VirtualAccount {
  userId: number;
  blockchain: string;
  currency: string;
  userAddress: string; // Points to user's wallet address
  // No deposit address generation needed
}
```

**Pros:**
- ✅ True non-custodial
- ✅ Users have full control
- ✅ No private key storage
- ✅ Industry standard (like Uniswap, OpenSea)

**Cons:**
- ❌ Users must have wallets
- ❌ More complex UX (wallet connection)
- ❌ Need to handle multiple wallet providers

---

### Option 2: User-Generated HD Wallets (Best for Full Control)

**How it works:**
1. User generates seed phrase on their device (never sent to server)
2. User provides xpub (extended public key) to service
3. Service derives addresses from user's xpub
4. Private keys never leave user's device

**Implementation:**
```typescript
// User generates wallet on frontend
// Frontend: Generate mnemonic → Derive xpub → Send xpub to backend

interface UserHDWallet {
  userId: number;
  blockchain: string;
  xpub: string; // User's extended public key
  derivationPath: string; // e.g., "m/44'/60'/0'"
  createdAt: Date;
  // NO mnemonic, NO private keys
}

// Service derives addresses from user's xpub
async generateUserAddress(userId: number, blockchain: string, index: number) {
  const userWallet = await getUserHDWallet(userId, blockchain);
  return await tatumService.generateAddress(blockchain, userWallet.xpub, index);
  // Private key generation happens on user's device only
}
```

**Pros:**
- ✅ True non-custodial
- ✅ Users control seed phrase
- ✅ Service can generate addresses without private keys
- ✅ Better UX (no wallet connection needed)

**Cons:**
- ❌ Users must securely store seed phrase
- ❌ Seed phrase recovery is user's responsibility
- ❌ More complex frontend implementation

---

### Option 3: Hybrid Approach (Recommended for Transition)

**How it works:**
1. **Deposits**: Users provide their own addresses (non-custodial)
2. **Withdrawals**: Users sign transactions with their own wallets
3. **Service Role**: Only tracks balances, processes transactions

**Implementation:**
```typescript
// For deposits
interface DepositAddress {
  userId: number;
  blockchain: string;
  currency: string;
  userAddress: string; // User's own address
  // No private key stored
}

// For withdrawals
interface WithdrawalRequest {
  userId: number;
  toAddress: string;
  amount: string;
  currency: string;
  blockchain: string;
  // User signs transaction on frontend
  signedTransaction: string; // Signed by user's wallet
}
```

**Pros:**
- ✅ True non-custodial
- ✅ Flexible (supports both approaches)
- ✅ Easier migration path
- ✅ Service doesn't need private keys

**Cons:**
- ❌ More complex implementation
- ❌ Need to handle transaction signing on frontend

---

## Migration Strategy

### Phase 1: Prepare Schema Changes
```sql
-- Add user wallet table
CREATE TABLE user_wallets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  blockchain VARCHAR(255) NOT NULL,
  address VARCHAR(255) NOT NULL,
  xpub VARCHAR(500), -- Optional, for HD wallets
  wallet_type ENUM('metamask', 'trust', 'walletconnect', 'hardware', 'hd') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY unique_user_blockchain (user_id, blockchain)
);

-- Modify deposit_addresses to link to user wallets
ALTER TABLE deposit_addresses 
  ADD COLUMN user_wallet_id INT,
  ADD FOREIGN KEY (user_wallet_id) REFERENCES user_wallets(id);

-- Keep private_key column for backward compatibility (mark as deprecated)
-- Eventually remove after migration
```

### Phase 2: Implement User Wallet Connection
1. Create API endpoints for wallet connection
2. Frontend: Integrate wallet providers (MetaMask, WalletConnect)
3. Store user addresses (not private keys)

### Phase 3: Update Address Generation
- Remove master wallet dependency
- Use user-provided addresses or derive from user's xpub
- Remove private key generation and storage

### Phase 4: Update Transaction Flow
- Deposits: Track incoming transactions to user addresses
- Withdrawals: Users sign transactions on frontend
- Service: Only validates and broadcasts signed transactions

### Phase 5: Cleanup
- Remove master wallet service (or keep for admin purposes only)
- Remove private key encryption/decryption functions
- Remove private_key column from deposit_addresses

---

## Code Changes Required

### 1. New Service: User Wallet Service
```typescript
// src/services/user/user.wallet.service.ts
class UserWalletService {
  async connectWallet(userId: number, blockchain: string, address: string, walletType: string) {
    // Store user's wallet address (no private keys)
  }
  
  async getUserAddress(userId: number, blockchain: string) {
    // Return user's address for deposits
  }
}
```

### 2. Update Deposit Address Service
```typescript
// Remove master wallet dependency
// Use user-provided addresses instead
async generateAndAssignToVirtualAccount(virtualAccountId: number) {
  const userWallet = await userWalletService.getUserWallet(userId, blockchain);
  // Use userWallet.address instead of generating from master wallet
  // NO private key generation
}
```

### 3. Update Transaction Services
```typescript
// Withdrawals: User signs on frontend
async processWithdrawal(signedTransaction: string) {
  // Validate signed transaction
  // Broadcast to blockchain
  // NO private key usage
}
```

---

## Security Considerations

### For Non-Custodial System:
1. **Never store private keys** - Even encrypted
2. **Validate all transactions** - Before broadcasting
3. **Rate limiting** - Prevent abuse
4. **Transaction monitoring** - Detect suspicious activity
5. **User education** - Help users secure their wallets

### Migration Security:
1. **Gradual migration** - Support both old and new systems
2. **Data migration** - Securely migrate existing addresses
3. **Backup strategy** - Before removing old system
4. **Testing** - Thoroughly test new flow before production

---

## Recommendation

**For a true non-custodial system, I recommend Option 1 (User-Provided Wallets) or Option 3 (Hybrid):**

1. **Start with Option 1** for new users (wallet connection)
2. **Keep Option 3** for flexibility (support both)
3. **Migrate existing users** gradually
4. **Remove master wallet** after full migration

This approach:
- ✅ Makes your system truly non-custodial
- ✅ Gives users full control
- ✅ Reduces regulatory risk
- ✅ Follows industry best practices

---

## Next Steps

1. **Decide on approach** (Option 1, 2, or 3)
2. **Design API endpoints** for wallet connection
3. **Update database schema**
4. **Implement frontend wallet integration**
5. **Update deposit/withdrawal flows**
6. **Test thoroughly**
7. **Plan migration strategy for existing users**

Would you like me to start implementing one of these approaches?

