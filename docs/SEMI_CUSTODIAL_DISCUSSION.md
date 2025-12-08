# Semi-Custodial System Discussion

## Your Requirements

✅ **Service stores private keys** (encrypted) - for executing transactions (selling, swapping)  
✅ **Users can export/retrieve their keys** - anytime they want (non-custodial aspect)  
✅ **Service uses keys for transactions** - when users want to sell through your platform

This is a **Semi-Custodial** or **Key Escrow** model.

---

## Current System Analysis

### What You Have Now:
```
Master Wallet (Service Controlled)
    ├─ xpub: Extended Public Key
    ├─ mnemonic: Seed Phrase (ENCRYPTED)
    └─ Derives → User Addresses (Index 5, 6, 7...)
        ├─ Private Keys Generated from Master Mnemonic
        ├─ Private Keys Encrypted (AES-256-CBC)
        └─ Stored in deposit_addresses.private_key
```

**Current Flow:**
1. User signs up → Virtual accounts created
2. Addresses generated from master wallet (HD derivation)
3. Private keys generated and stored (encrypted)
4. Service can use keys for transactions

**What's Missing:**
- ❌ No way for users to export their private keys
- ❌ No way for users to export their mnemonic (since it's from master wallet)
- ❌ Users don't have individual wallets

---

## Key Questions to Discuss

### 1. **Wallet Generation Approach**

**Option A: Keep Master Wallet (Current)**
- ✅ Simple, centralized
- ✅ Easy to manage
- ❌ Users can't export mnemonic (it's shared)
- ❌ Users can only export individual private keys
- ❌ If master wallet compromised, all users affected

**Option B: Per-User Wallets**
- ✅ Each user has their own mnemonic
- ✅ Users can export their full wallet (mnemonic + keys)
- ✅ Better security isolation
- ❌ More complex to manage
- ❌ Need to generate wallet per user

**Question:** Which approach do you prefer?
- If users only need to export private keys → Option A is fine
- If users need full wallet export (mnemonic) → Option B needed

---

### 2. **Key Export Functionality**

**What should users be able to export?**

**Option 1: Private Keys Only**
```
User can export:
- Private key for each address (blockchain-specific)
- Format: Plain text or encrypted file
```

**Option 2: Full Wallet Export**
```
User can export:
- Mnemonic (seed phrase) - if per-user wallets
- All private keys
- Wallet file (JSON format)
```

**Option 3: Both**
```
User can export:
- Individual private keys (per address)
- Full wallet backup (if per-user)
```

**Question:** What format do you want?
- Plain text private keys?
- Encrypted export file?
- QR code?
- JSON wallet file?

---

### 3. **Security for Key Export**

**Security Measures Needed:**

1. **Authentication:**
   - ✅ User must be logged in
   - ✅ PIN verification? (since you have PIN system)
   - ✅ 2FA required?
   - ✅ Email confirmation?

2. **Rate Limiting:**
   - Limit exports per day/hour
   - Prevent abuse

3. **Audit Logging:**
   - Log every key export
   - Track who exported what and when

4. **Warning Messages:**
   - Warn users about security risks
   - "Never share your private keys"
   - "Export only to secure location"

**Question:** What security measures do you want?

---

### 4. **Key Usage for Transactions**

**When does the system use private keys?**

**Current Understanding:**
- ✅ Selling crypto → Service uses keys to send crypto
- ✅ Swapping crypto → Service uses keys
- ❓ Sending crypto to external address?
- ❓ Other operations?

**Transaction Flow:**
```
User wants to sell USDT
    ↓
User initiates sell order
    ↓
Service decrypts private key
    ↓
Service signs transaction
    ↓
Service broadcasts to blockchain
    ↓
Transaction complete
```

**Question:** 
- Which operations need private keys?
- Do you have transaction signing logic already?
- Or do we need to implement it?

---

### 5. **User Experience**

**Key Export UI Flow:**

**Option 1: Simple Export**
```
User clicks "Export Private Key"
    ↓
PIN verification
    ↓
Show private key (with warning)
    ↓
Copy/download option
```

**Option 2: Secure Export**
```
User clicks "Export Wallet"
    ↓
PIN + Email verification
    ↓
Generate encrypted export file
    ↓
Send download link via email
    ↓
File expires after 24 hours
```

**Question:** What UX do you prefer?

---

### 6. **Database Schema Changes**

**Current Schema:**
```sql
deposit_addresses
  - private_key (encrypted, stored)
  - address
  - index
  - blockchain
  - currency
```

**Potential Additions:**
```sql
-- Track key exports
key_exports
  - user_id
  - deposit_address_id
  - exported_at
  - export_type (private_key, mnemonic, full_wallet)
  - ip_address
  - user_agent

-- User wallet info (if per-user wallets)
user_wallets
  - user_id
  - blockchain
  - mnemonic (encrypted)
  - xpub
  - created_at
```

**Question:** Do we need to track exports? Add user wallets table?

---

### 7. **Migration Strategy**

**If switching to per-user wallets:**

1. **Existing Users:**
   - Generate wallets for existing users?
   - Migrate existing addresses?
   - Or keep old system for existing, new system for new users?

2. **Data Migration:**
   - How to handle existing private keys?
   - Can users claim their keys from master wallet?

**Question:** How to handle existing users?

---

## My Recommendations

### **Recommended Approach: Per-User Wallets**

**Why:**
1. ✅ True ownership - users have their own mnemonic
2. ✅ Full export capability - users can export everything
3. ✅ Better security - isolation between users
4. ✅ Regulatory compliance - clearer ownership

**Implementation:**
```
User Signs Up
    ↓
Generate unique wallet for user (on backend)
    ├─ Generate mnemonic (24 words)
    ├─ Derive xpub
    └─ Store encrypted mnemonic + xpub
    ↓
Generate addresses from user's xpub (not master)
    ├─ Derive private keys
    └─ Store encrypted private keys
    ↓
User can export:
    ├─ Their mnemonic (decrypted with PIN)
    ├─ Individual private keys
    └─ Full wallet backup
```

**Key Export API:**
```typescript
// Export private key for specific address
GET /api/v2/crypto/wallet/export-key/:addressId
- Requires: PIN verification
- Returns: { privateKey: "0x...", address: "...", blockchain: "..." }

// Export full wallet (mnemonic + all keys)
GET /api/v2/crypto/wallet/export-full
- Requires: PIN + Email verification
- Returns: { mnemonic: "...", addresses: [...], privateKeys: [...] }
```

---

## Questions Summary

Please answer these to proceed:

1. **Wallet Generation:** Master wallet (current) or per-user wallets?
2. **Export Format:** Private keys only, or full wallet (mnemonic)?
3. **Security:** PIN verification? Email confirmation? Rate limiting?
4. **Key Usage:** Which operations need private keys? (selling, swapping, sending?)
5. **Transaction Signing:** Do you have signing logic, or need implementation?
6. **Existing Users:** How to handle users with addresses from master wallet?
7. **UX:** Simple export or secure file download?

---

## Next Steps

Once you answer these questions, I can:
1. Design the exact implementation
2. Create database schema changes
3. Implement key export functionality
4. Add security measures
5. Create API endpoints
6. Update transaction flows

**Let's discuss each point before implementation!**

