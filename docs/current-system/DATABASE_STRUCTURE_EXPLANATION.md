# Database Structure Explanation

## Current Structure

```
User (1)
  └── VirtualAccount (Many) - One per currency
        └── DepositAddress (Many) - One per address
```

**Example:**
- User 1 has:
  - VirtualAccount (ETH on Ethereum) → DepositAddress
  - VirtualAccount (USDT on Ethereum) → DepositAddress (SHARES same address as ETH)
  - VirtualAccount (BTC on Bitcoin) → DepositAddress
  - VirtualAccount (TRON on Tron) → DepositAddress

## The Problem: Where to Store User's Mnemonic?

### Option 1: Add mnemonic to VirtualAccount ❌
```
VirtualAccount {
  id
  userId
  blockchain: "ethereum"
  currency: "ETH"
  mnemonic: "word1 word2..."  ← Store here?
  xpub: "xpub..."
}
```

**Problem:**
- User has 3 VirtualAccounts on Ethereum (ETH, USDT, USDC)
- All 3 would have the SAME mnemonic (redundant!)
- Not clean design - violates normalization

### Option 2: Create UserWallet table ✅
```
UserWallet {
  id
  userId: 1
  blockchain: "ethereum"
  mnemonic: "word1 word2..."  ← Store once per user+blockchain
  xpub: "xpub..."
}

VirtualAccount {
  id
  userId: 1
  blockchain: "ethereum"
  currency: "ETH"
  userWalletId: 1  ← Reference to UserWallet
}
```

**Benefits:**
- ✅ One mnemonic per user per blockchain (not per currency)
- ✅ All VirtualAccounts on same blockchain share same wallet
- ✅ Clean design - follows normalization
- ✅ Easy to export: "Get user's Ethereum wallet"

## Why Not Use VirtualAccount?

**VirtualAccount is for:**
- Tracking balances per currency
- Account management (active, frozen, etc.)
- One per currency

**UserWallet is for:**
- Storing the actual wallet (mnemonic, xpub)
- One per blockchain (not per currency)
- Wallet-level operations (export, backup)

## Proposed Structure

```
User (1)
  ├── UserWallet (Many) - One per blockchain
  │     ├── blockchain: "ethereum"
  │     ├── mnemonic: "word1 word2..."
  │     └── xpub: "xpub..."
  │
  └── VirtualAccount (Many) - One per currency
        ├── currency: "ETH"
        ├── userWalletId: 1  ← Links to UserWallet
        └── DepositAddress (Many)
              ├── address: "0x..."
              └── privateKey: "encrypted..."
```

## Alternative: Minimal Changes

If you want to avoid new table, we could:
1. Store mnemonic in first VirtualAccount per blockchain
2. Other VirtualAccounts reference it
3. But this is hacky and not clean

**Recommendation:** Use UserWallet table - it's the cleanest approach.

