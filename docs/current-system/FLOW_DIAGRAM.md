# Current System Flow Diagram

## User Signup Flow

```
┌─────────────────┐
│  User Signs Up  │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  Email Verification │
└────────┬────────────┘
         │
         ▼
┌──────────────────────────────┐
│ verifyUserController         │
│ - User verified              │
│ - Dispatch queue job         │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Queue: create-virtual-account│
│ Job added to Redis queue     │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Worker Process                │
│ processCreateVirtualAccountJob│
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ createVirtualAccountsForUser │
│ For each WalletCurrency:     │
│  - Create VirtualAccount      │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ generateAndAssignToVirtual   │
│ Account (for each account)   │
└────────┬─────────────────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌──────────────┐   ┌──────────────┐
│ Reuse Address│   │ Generate New │
│ (if exists)  │   │ Address       │
└──────────────┘   └───────┬───────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Get Master      │
                  │ Wallet          │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Decrypt Master  │
                  │ Mnemonic        │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Calculate Index  │
                  │ (max + 1 or 5)  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Generate Address │
                  │ (xpub + index)   │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Generate Private│
                  │ Key (mnemonic + │
                  │ index)          │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Encrypt Private │
                  │ Key             │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Store in DB     │
                  │ DepositAddress │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Register Webhook│
                  │ (Tatum V4)      │
                  └─────────────────┘
```

## Address Generation Logic

```
┌─────────────────────┐
│ Virtual Account     │
│ Created             │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get Blockchain      │
│ Normalize           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check Existing      │
│ Addresses for User  │
│ (same blockchain)   │
└──────────┬──────────┘
           │
           ├─────────────┐
           │             │
      ┌────▼────┐   ┌────▼────┐
      │ Found   │   │ Not     │
      │ Existing│   │ Found   │
      └────┬────┘   └────┬────┘
           │             │
           │             ▼
           │     ┌───────────────┐
           │     │ Get Master    │
           │     │ Wallet        │
           │     └───────┬───────┘
           │             │
           │             ▼
           │     ┌───────────────┐
           │     │ Generate New  │
           │     │ Address       │
           │     └───────┬───────┘
           │             │
           └─────┬───────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Store Address   │
        │ + Private Key    │
        └─────────────────┘
```

## Master Wallet Structure

```
Master Wallet (Per Blockchain)
│
├─── Ethereum Master Wallet
│    ├── xpub: "xpub..."
│    ├── mnemonic: "word1 word2 ... word24" (encrypted)
│    └── Derives:
│        ├── Index 0: Master address
│        ├── Index 5: User 1 address
│        ├── Index 6: User 2 address
│        └── Index 7: User 3 address
│
├─── Tron Master Wallet
│    ├── xpub: "xpub..."
│    ├── mnemonic: "word1 word2 ... word24" (encrypted)
│    └── Derives:
│        ├── Index 0: Master address
│        ├── Index 5: User 1 address
│        └── Index 6: User 2 address
│
└─── BSC Master Wallet
     ├── xpub: "xpub..."
     ├── mnemonic: "word1 word2 ... word24" (encrypted)
     └── Derives:
         ├── Index 0: Master address
         └── Index 5: User 1 address
```

