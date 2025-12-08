# Address Sharing and Webhook Registration

## Address Sharing Logic ✅

### How It Works:
1. **VirtualAccount stores blockchain field:**
   - ETH: `blockchain = "ethereum"` (or "eth")
   - USDT: `blockchain = "ethereum"` (same as ETH)
   - USDC: `blockchain = "ethereum"` (same as ETH)

2. **Address Generation Flow:**
   ```
   User creates ETH virtual account
       ↓
   Generate deposit address
       ↓
   Check for existing address (blockchain = "ethereum")
       ↓
   Not found → Generate new address (index 0)
       ↓
   Store: address = "0x...", blockchain = "ethereum", currency = "ETH"
   
   User creates USDT virtual account
       ↓
   Generate deposit address
       ↓
   Check for existing address (blockchain = "ethereum")
       ↓
   Found! → Reuse same address "0x..."
       ↓
   Store: address = "0x..." (same), blockchain = "ethereum", currency = "USDT"
   ```

3. **Blockchain Normalization:**
   ```typescript
   const BLOCKCHAIN_NORMALIZATION = {
     'ethereum': 'ethereum',
     'eth': 'ethereum',  // Normalizes to 'ethereum'
     'tron': 'tron',
     'trx': 'tron',
     'bsc': 'bsc',
     'binance': 'bsc',
   };
   ```

### Result:
- ✅ **ETH and USDT share the same address** (both on Ethereum blockchain)
- ✅ **All currencies on same blockchain share one address**
- ✅ **Each user has their own address** (from their own wallet)

---

## Webhook Registration ✅

### Current Implementation:

1. **New Address Creation:**
   ```
   Generate new address (index 0)
       ↓
   Register webhook for this address
       ↓
   Tatum monitors: address "0x..." on ethereum-mainnet
   ```

2. **Address Reuse:**
   ```
   Reuse existing address
       ↓
   Skip webhook registration (already registered)
       ↓
   Webhook already monitoring this address
   ```

### Webhook Details:
- **Type:** `ADDRESS_EVENT` (monitors all transactions to the address)
- **Chain:** Uses normalized blockchain (e.g., `ethereum-mainnet`)
- **Address:** User's wallet address (from user wallet, not master wallet)
- **URL:** `TATUM_WEBHOOK_URL` or `${BASE_URL}/api/v2/webhooks/tatum`

### Important Notes:
- ✅ **Webhooks use user wallet addresses** (not master wallet)
- ✅ **One webhook per address** (not per currency)
- ✅ **Webhook monitors all currencies** on that address
- ✅ **No duplicate registrations** (skipped when reusing addresses)

---

## Verification Checklist

### Address Sharing:
- [x] ETH and USDT both have `blockchain = "ethereum"`
- [x] Normalization maps both to `"ethereum"`
- [x] Existing address lookup uses normalized blockchain
- [x] Address reuse works correctly

### Webhook Registration:
- [x] Webhooks registered for new addresses
- [x] Webhooks skipped when reusing addresses
- [x] Webhooks use user wallet addresses (not master wallet)
- [x] Webhooks use correct blockchain (normalized)

---

## Example Flow

### User Creates ETH Account:
```
1. VirtualAccount created: currency="ETH", blockchain="ethereum"
2. Generate deposit address
3. No existing address found
4. Create user wallet (if not exists)
5. Generate address from user wallet (index 0)
6. Store: address="0xABC...", blockchain="ethereum", currency="ETH"
7. Register webhook: address="0xABC..." on ethereum-mainnet
```

### User Creates USDT Account:
```
1. VirtualAccount created: currency="USDT", blockchain="ethereum"
2. Generate deposit address
3. Find existing address: blockchain="ethereum" → address="0xABC..."
4. Reuse address: address="0xABC..." (same as ETH)
5. Store: address="0xABC...", blockchain="ethereum", currency="USDT"
6. Skip webhook registration (already registered)
```

### Result:
- ✅ Both ETH and USDT use address `0xABC...`
- ✅ One webhook monitors `0xABC...` for all transactions
- ✅ Transactions to `0xABC...` are detected for both ETH and USDT

---

## Potential Issues & Solutions

### Issue 1: Different Blockchain Values
**Problem:** If ETH has `blockchain="eth"` and USDT has `blockchain="ethereum"`, they won't share address.

**Solution:** ✅ Normalization handles this - both map to `"ethereum"`

### Issue 2: Duplicate Webhook Registrations
**Problem:** Registering webhook multiple times for same address.

**Solution:** ✅ Fixed - webhook registration skipped when reusing addresses

### Issue 3: Webhook Using Wrong Address
**Problem:** Webhook registered for master wallet address instead of user address.

**Solution:** ✅ Fixed - webhooks use user wallet addresses (from `depositAddress.address`)

---

## Testing Recommendations

1. **Test Address Sharing:**
   - Create ETH virtual account → Get address A
   - Create USDT virtual account → Should get same address A
   - Verify both have same address in database

2. **Test Webhook Registration:**
   - Check Tatum dashboard for webhook subscriptions
   - Verify webhook is registered for user's address (not master wallet)
   - Verify only one webhook per address (not per currency)

3. **Test Transaction Detection:**
   - Send ETH to user's address
   - Verify webhook receives transaction
   - Send USDT to same address
   - Verify webhook receives transaction

