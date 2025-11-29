# Tatum Queue System - How It Works

## 🔄 Job Execution Flow

### Current System Architecture

The Tatum virtual account system uses **Bull Queue** (Redis-based) for background job processing, similar to Laravel's queue system.

### How Jobs Are Fired

1. **User Verifies Email** → `verifyUserController` in `auth.controllers.ts`
2. **Job Dispatched to Queue** → Uses `queueManager.addJob()` to add job to Redis queue
3. **Worker Process Picks Up Job** → Separate worker process (running via `npm run queue:work:tatum`)
4. **Job Processed** → `processCreateVirtualAccountJob` function executes
5. **Virtual Accounts Created** → For each currency, creates account, assigns address, registers webhook

### Flow Diagram

```
User Verifies Email
    ↓
verifyUserController
    ↓
queueManager.addJob('tatum', 'create-virtual-account', { userId })
    ↓
Job Added to Redis Queue (tatum queue)
    ↓
Worker Process (separate terminal/process)
    ↓
processCreateVirtualAccountJob(job)
    ↓
For each WalletCurrency:
    ├─ Create Virtual Account (Tatum API)
    ├─ Generate Deposit Address
    ├─ Encrypt & Save Private Key ✅
    └─ Register Webhook
```

## 🚀 Running the Queue Worker

### Development

Start the Tatum queue worker in a separate terminal:

```bash
npm run queue:work:tatum
```

Or manually:
```bash
ts-node src/queue/worker.ts tatum
```

### Production

Using PM2 (recommended):

```javascript
// ecosystem.config.js
{
  name: 'queue-worker-tatum',
  script: 'dist/queue/worker.js',
  args: 'tatum',
  instances: 2, // Run 2 workers for parallel processing
  exec_mode: 'fork',
  autorestart: true,
}
```

```bash
pm2 start ecosystem.config.js
```

## 🔐 Private Key Storage

### ✅ YES - Private Keys ARE Being Saved

**Location:** `src/services/tatum/deposit.address.service.ts`

**Process:**
1. Private key is generated from master wallet mnemonic using Tatum API
2. Private key is **encrypted** using AES-256-CBC encryption
3. Encrypted private key is **saved** to `deposit_addresses.private_key` field

**Code Reference:**
```typescript
// Line 153-160 in deposit.address.service.ts
const privateKey = await tatumService.generatePrivateKey(
  blockchain,
  masterWallet.mnemonic,
  nextIndex
);

// Encrypt private key
const encryptedPrivateKey = encryptPrivateKey(privateKey);

// Store in database (Line 166-175)
const depositAddress = await prisma.depositAddress.create({
  data: {
    virtualAccountId,
    blockchain,
    currency,
    address,
    index: nextIndex,
    privateKey: encryptedPrivateKey, // ✅ SAVED HERE
  },
});
```

### Encryption Details

- **Algorithm:** AES-256-CBC
- **Key:** From `ENCRYPTION_KEY` environment variable (32 characters)
- **Format:** `iv:encrypted_data` (hex encoded)
- **Storage:** Stored in `deposit_addresses.private_key` (TEXT field)

### Decryption Function

The `decryptPrivateKey()` function is available in the service but currently not used. It can be used when you need to retrieve the private key (e.g., for withdrawals).

## 📋 Queue Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Queue Configuration
QUEUE_CONCURRENCY=1        # Jobs processed simultaneously
QUEUE_MAX_JOBS=10          # Max jobs per interval
QUEUE_INTERVAL=1000        # Interval in milliseconds

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here!!
```

### Queue Options

When jobs are dispatched:
- **Attempts:** 3 retries on failure
- **Backoff:** Exponential (starts at 5 seconds)
- **Queue Name:** `tatum`
- **Job Name:** `create-virtual-account`

## 🔍 Monitoring

### Check Queue Status

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

### Redis CLI

```bash
redis-cli
> KEYS bull:tatum:*
> LLEN bull:tatum:wait
> LLEN bull:tatum:active
```

## ⚠️ Important Notes

1. **Worker Must Be Running**: Jobs won't process unless the worker is running
2. **Redis Required**: Queue system requires Redis to be running
3. **Separate Process**: Worker runs in a separate process from the main server
4. **Private Keys Encrypted**: All private keys are encrypted before storage
5. **Job Persistence**: Jobs survive server restarts (stored in Redis)

## 🐛 Troubleshooting

### Jobs Not Processing

1. **Check if worker is running:**
   ```bash
   ps aux | grep worker
   ```

2. **Check Redis connection:**
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

3. **Check for jobs in queue:**
   ```bash
   redis-cli KEYS bull:tatum:*
   ```

### Private Key Not Saved

1. Check `ENCRYPTION_KEY` is set in `.env`
2. Check database `deposit_addresses.private_key` field
3. Check logs for encryption errors

### Worker Errors

Check worker logs for:
- Redis connection errors
- Job processing errors
- Tatum API errors

