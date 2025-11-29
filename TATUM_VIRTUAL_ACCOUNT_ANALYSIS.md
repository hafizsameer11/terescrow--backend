# Tatum Virtual Account System - Complete Analysis

## Overview
This document provides a comprehensive analysis of how the Tatum virtual account system works in the EarlyBaze wallet backend, including master wallets, virtual accounts, deposit addresses, and webhook processing.

---

## 1. Master Wallet System

### Purpose
Master wallets serve as the root wallets for each blockchain, used to generate deposit addresses for user virtual accounts.

### Implementation
**Location:** `app/Services/MasterWalletService.php`, `app/Models/MasterWallet.php`, `app/Http/Controllers/MasterWalletController.php`

### Database Schema: `master_wallets`

```php
Schema::create('master_wallets', function (Blueprint $table) {
    $table->id();
    $table->string('blockchain');        // e.g., bitcoin, ethereum, xrp
    $table->string('xpub')->nullable();  // For EVM/UTXO blockchains
    $table->string('address')->nullable(); // For XRP/XLM or EVM
    $table->string('private_key')->nullable(); // Store securely if required
    $table->string('mnemonic')->nullable(); // Store securely if required
    $table->text('response')->nullable(); // Full Tatum API response (JSON)
    $table->timestamps();
});
```

**Fields:**
- `id` - Primary key
- `blockchain` - Blockchain name (e.g., ethereum, bitcoin, tron, bsc, litecoin)
- `xpub` - Extended public key (for address derivation on UTXO/EVM chains)
- `address` - Master wallet address (derived at index 0)
- `private_key` - Encrypted private key (stored as string, should be encrypted)
- `mnemonic` - Seed phrase (stored as string, should be encrypted)
- `response` - Full JSON response from Tatum API (for reference)

### Master Wallet Generation - Exact Code

#### 1. API Endpoint
**Route:** `POST /api/master-wallet`
**Controller:** `app/Http/Controllers/MasterWalletController.php::create()`

```php
public function create(Request $request)
{
    $validated = $request->validate([
        'blockchain' => 'required|string',  // e.g., 'ethereum', 'bitcoin'
        'endpoint' => 'required|string'      // e.g., '/ethereum/wallet', '/bitcoin/wallet'
    ]);

    try {
        $wallet = $this->walletService->createMasterWallet(
            $validated['blockchain'], 
            $validated['endpoint']
        );
        return response()->json(['message' => 'Master wallet created', 'wallet' => $wallet], 201);
    } catch (\Exception $e) {
        return response()->json(['error' => $e->getMessage()], 500);
    }
}
```

#### 2. Service Layer
**Service:** `app/Services/MasterWalletService.php::createMasterWallet()`

```php
public function createMasterWallet(string $blockchain, string $endpoint): array
{
    // Generate wallet using Tatum API
    $walletData = $this->tatumService->createWallet($blockchain, $endpoint);
    Log::info("walletData: ".json_encode($walletData));
    
    $masterWallet = $this->walletRepository->create([
        'blockchain' => $blockchain,
        'xpub' => $walletData['xpub'] ?? null,
        'address' => $walletData['address'] ?? null,
        'private_key' => $walletData['privateKey'] ?? null,
        'mnemonic' => $walletData['mnemonic'] ?? null,
        'response' => json_encode($walletData)
    ]);

    return $masterWallet->toArray();
}
```

#### 3. Tatum Service
**Service:** `app/Services/TatumService.php::createWallet()`

```php
public function createWallet(string $blockchain, string $endpoint): array
{
    // Makes GET request to Tatum API
    $response = Http::withHeaders(['x-api-key' => $this->apiKey])
        ->get("{$this->baseUrl}{$endpoint}");

    if ($response->failed()) {
        throw new \Exception('Failed to create wallet: ' . $response->body());
    }

    return $response->json();
}
```

**Tatum API Endpoints Used:**
- `GET /v3/ethereum/wallet` - Ethereum master wallet
- `GET /v3/bitcoin/wallet` - Bitcoin master wallet
- `GET /v3/bsc/wallet` - BSC master wallet
- `GET /v3/tron/wallet` - Tron master wallet
- `GET /v3/litecoin/wallet` - Litecoin master wallet
- etc.

**Tatum Response Structure:**
```json
{
  "mnemonic": "word1 word2 ... word12",
  "xpub": "xpub...",
  "address": "0x...",
  "privateKey": "0x..."
}
```

#### 4. Repository Layer
**Repository:** `app/Repositories/MasterWalletRepository.php`

```php
public function create(array $data): MasterWallet
{
    return MasterWallet::create($data);
}
```

### Master Wallet Model
**Location:** `app/Models/MasterWallet.php`

```php
class MasterWallet extends Model
{
    use HasFactory;
    protected $fillable = [
        'blockchain',
        'xpub',
        'address',
        'private_key',
        'mnemonic',
        'response'
    ];
}
```

**Usage:**
- Master wallet xpub and mnemonic are used to derive deposit addresses
- Each deposit address is generated using an index (starting from 5, incrementing by 40)
- Addresses are derived using: `GET /{blockchain}/address/{xpub}/{index}`
- Private keys are generated using: `POST /{blockchain}/wallet/priv` with mnemonic and index

### Master Wallet Creation Flow

```
1. API Request
   POST /api/master-wallet
   {
     "blockchain": "ethereum",
     "endpoint": "/ethereum/wallet"
   }
   ↓
2. MasterWalletController::create()
   - Validates request
   - Calls MasterWalletService::createMasterWallet()
   ↓
3. MasterWalletService::createMasterWallet()
   - Calls TatumService::createWallet()
   - Stores result in database via MasterWalletRepository
   ↓
4. TatumService::createWallet()
   - Makes GET request to Tatum API: GET /v3/ethereum/wallet
   - Returns wallet data (xpub, mnemonic, address, privateKey)
   ↓
5. MasterWalletRepository::create()
   - Creates MasterWallet model instance
   - Saves to master_wallets table
   ↓
6. Response
   Returns created master wallet data
```

---

## 2. Virtual Account Creation Flow

### Trigger: Email Verification
**Location:** `app/Services/UserService.php::verifyOtp()`

**Flow:**
1. User registers → receives OTP via email
2. User verifies OTP → `verifyOtp()` method called
3. `otp_verified` set to `true`
4. **Virtual accounts created:** `dispatch(new CreateVirtualAccount($user))`

### Virtual Account Creation Process
**Location:** `app/Jobs/CreateVirtualAccount.php`

**Steps:**
1. Fetches all supported `WalletCurrency` records
2. For each currency:
   - Finds corresponding `MasterWallet` for the blockchain
   - Creates virtual account via Tatum API:
     ```php
     POST /ledger/account
     {
       "currency": "BTC",
       "customer": {
         "externalId": "user_id"
       },
       "accountCode": "user_code",
       "accountingCurrency": "USD"
     }
     ```
   - **Note:** `xpub` is commented out (line 59), so virtual accounts are NOT linked to master wallet xpub
   - Stores virtual account in database with:
     - `account_id` - Tatum virtual account ID
     - `customer_id` - Tatum customer ID
     - `blockchain`, `currency`, `user_id`
     - Balance information
3. After creation:
   - Dispatches `AssignDepositAddress` job
   - Dispatches `RegisterTatumWebhook` job

### Database Schema: `virtual_accounts`

**Initial Migration:** `database/migrations/2025_01_29_102556_create_virtual_accounts_table.php`

```php
Schema::create('virtual_accounts', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->onDelete('cascade');
    $table->string('blockchain');              // Blockchain name (e.g., Bitcoin, Ethereum)
    $table->string('currency');                // Currency name (e.g., BTC, ETH)
    $table->string('customer_id')->nullable(); // Tatum Customer ID
    $table->string('account_id')->unique();    // Virtual Account ID from Tatum
    $table->string('account_code')->nullable(); // Custom user account code
    $table->boolean('active')->default(true);   // Whether the account is active
    $table->boolean('frozen')->default(false);  // Whether the account is frozen
    $table->string('account_balance')->default('0');     // Account balance from Tatum
    $table->string('available_balance')->default('0');  // Available balance from Tatum
    $table->string('xpub')->nullable();        // Extended public key (for UTXO blockchains)
    $table->string('accounting_currency')->nullable(); // Accounting currency (e.g., EUR, USD)
    $table->timestamps();
});
```

**Update Migration:** `database/migrations/2025_02_24_163655_update_virtual_account_table.php`
- Added `currency_id` foreign key to link to `wallet_currencies` table

```php
Schema::table('virtual_accounts', function (Blueprint $table) {
    $table->unsignedBigInteger('currency_id')->nullable();
    $table->foreign('currency_id')->references('id')->on('wallet_currencies');
});
```

**Complete Schema:**
- `id` - Primary key
- `user_id` - Foreign key to `users` table (cascade delete)
- `blockchain` - Blockchain name (e.g., Ethereum, Bitcoin, Tron)
- `currency` - Currency code (e.g., BTC, ETH, USDT)
- `customer_id` - Tatum customer ID (nullable)
- `account_id` - Tatum virtual account ID (unique)
- `account_code` - User's account code (nullable)
- `active` - Account active status (default: true)
- `frozen` - Account frozen status (default: false)
- `account_balance` - Total account balance from Tatum (string, default: '0')
- `available_balance` - Available balance from Tatum (string, default: '0')
- `xpub` - Extended public key (nullable, currently not used)
- `accounting_currency` - Accounting currency (e.g., USD, EUR)
- `currency_id` - Foreign key to `wallet_currencies` table
- `created_at`, `updated_at` - Timestamps

**Relationships:**
- `belongsTo(User::class)` - One user has many virtual accounts
- `belongsTo(WalletCurrency::class, 'currency_id')` - Links to wallet currency
- `hasMany(DepositAddress::class)` - One virtual account has many deposit addresses

---

## 3. Deposit Address Generation

### Process
**Location:** `app/Services/WalletAddressService.php`, `app/Jobs/AssignDepositAddress.php`

**Key Features:**

#### Address Reuse (Blockchain Groups)
Addresses are shared within blockchain groups:
- **Tron Group:** `['tron', 'usdt_tron']` - share same address
- **Ethereum Group:** `['eth', 'usdt', 'usdc']` - share same address
- **BSC Group:** `['bsc', 'usdt_bsc', 'usdc_bsc']` - share same address

#### Generation Flow:
1. **Check for existing address** in same blockchain group for the user
   - If exists: Reuse address and assign to new virtual account
   - If not: Generate new address

2. **New Address Generation:**
   - Get master wallet for blockchain (with lock to prevent race conditions)
   - Calculate next index: `max(index) + 40` (starts from 5)
   - Generate address: `GET /{blockchain}/address/{xpub}/{index}`
   - Generate private key: `POST /{blockchain}/wallet/priv` with mnemonic and index
   - Assign to virtual account: `POST /offchain/account/{account_id}/address/{address}`
   - Store in `deposit_addresses` table:
     - Encrypted private key
     - Address, index, blockchain, currency

**Security:**
- Private keys are encrypted using `Crypt::encryptString()`
- Master wallet is locked during address generation to prevent concurrent access

---

## 4. Webhook System

### Registration
**Location:** `app/Jobs/RegisterTatumWebhook.php`

**Process:**
1. After virtual account creation, webhook is registered:
   ```php
   POST /subscription
   {
     "type": "ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION",
     "attr": {
       "id": "virtual_account_id",
       "url": "https://earlybaze.hmstech.xyz/api/webhook"
     }
   }
   ```
2. Webhook URL configured in `config/tatum.php`

### Webhook Processing
**Location:** `app/Http/Controllers/WebhookController.php`, `app/Jobs/ProcessBlockchainWebhook.php`

**Flow:**
1. **Receives webhook** at `/api/webhook`
2. **Queues processing:** Dispatches `ProcessBlockchainWebhook` job
3. **Job Processing:**
   - **Master wallet check:** Ignores webhooks from master wallet addresses (top-ups)
   - **Duplicate check:** Prevents processing same `reference` twice
   - **Virtual account lookup:** Finds account by `accountId`
   - **Balance update:** Updates `available_balance` on virtual account
   - **Webhook logging:** Creates `WebhookResponse` record
   - **Asset tracking:** Creates `ReceivedAsset` record
   - **Transaction creation:** Creates `Transaction` and `ReceiveTransaction` records
   - **Notification:** Sends notification to user
   - **Transfer to master wallet:** Currently **COMMENTED OUT** (lines 151-165)
     - Would transfer funds from virtual account to master wallet
     - Supports: Ethereum, BSC, Solana, Litecoin, Tron, Bitcoin

**Webhook Payload Structure:**
```json
{
  "accountId": "virtual_account_id",
  "subscriptionType": "ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION",
  "amount": "0.001",
  "currency": "BTC",
  "reference": "unique_reference",
  "txId": "transaction_hash",
  "from": "sender_address",
  "to": "receiver_address",
  "date": 1234567890000,
  "blockHeight": 12345,
  "blockHash": "block_hash",
  "index": 0
}
```

**Lock Mechanism:**
- Uses cache lock (`webhook_lock_{reference}`) to prevent duplicate processing
- Lock duration: 120 seconds

---

## 5. Current System Architecture

### Data Flow Diagram

```
User Registration
    ↓
Email Verification (verifyOtp)
    ↓
CreateVirtualAccount Job
    ↓
For each WalletCurrency:
    ├─ Create Tatum Virtual Account
    ├─ AssignDepositAddress Job
    │   └─ Generate address from Master Wallet
    │   └─ Assign to Virtual Account
    └─ RegisterTatumWebhook Job
        └─ Register webhook subscription

Deposit Flow:
    ↓
User sends crypto to deposit address
    ↓
Tatum detects transaction
    ↓
Webhook sent to /api/webhook
    ↓
ProcessBlockchainWebhook Job
    ├─ Update virtual account balance
    ├─ Create transaction records
    ├─ Send notification
    └─ [Transfer to master wallet - DISABLED]
```

---

## 6. Key Observations & Issues

### ✅ Working Components:
1. ✅ Master wallet creation and storage
2. ✅ Virtual account creation on email verification
3. ✅ Deposit address generation from master wallet
4. ✅ Address reuse for blockchain groups
5. ✅ Webhook registration
6. ✅ Webhook processing and transaction recording

### ⚠️ Potential Issues:

1. **Virtual Account Not Linked to Master Wallet:**
   - Line 59 in `CreateVirtualAccount.php`: `xpub` is commented out
   - Virtual accounts are created without linking to master wallet xpub
   - This means Tatum manages addresses separately from your master wallet

2. **Transfer to Master Wallet Disabled:**
   - Lines 151-165 in `ProcessBlockchainWebhook.php` are commented out
   - Funds remain in virtual accounts, not transferred to master wallet
   - This could be intentional for custody management

3. **Index Increment:**
   - Address index increments by 40 (line 69 in `WalletAddressService.php`)
   - This leaves gaps in address indices
   - May be intentional to avoid address collision

4. **No Error Recovery:**
   - If deposit address assignment fails, virtual account exists without address
   - No retry mechanism for failed jobs

5. **Webhook Duplicate Prevention:**
   - Uses `reference` field to prevent duplicates
   - If Tatum sends same transaction with different reference, it will be processed twice

---

## 7. Complete Database Schema Reference

### 7.1. master_wallets

**Migration:** `database/migrations/2025_01_28_131225_create_master_wallets_table.php`

```php
Schema::create('master_wallets', function (Blueprint $table) {
    $table->id();
    $table->string('blockchain');        // e.g., bitcoin, ethereum, xrp
    $table->string('xpub')->nullable();  // For EVM/UTXO blockchains
    $table->string('address')->nullable(); // For XRP/XLM or EVM
    $table->string('private_key')->nullable(); // Store securely if required
    $table->string('mnemonic')->nullable(); // Store securely if required
    $table->text('response')->nullable(); // Full Tatum API response
    $table->timestamps();
});
```

**Purpose:** Stores master wallet for each blockchain used to generate deposit addresses.

---

### 7.2. virtual_accounts

**Migration:** `database/migrations/2025_01_29_102556_create_virtual_accounts_table.php`
**Update:** `database/migrations/2025_02_24_163655_update_virtual_account_table.php`

```php
Schema::create('virtual_accounts', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->onDelete('cascade');
    $table->string('blockchain');
    $table->string('currency');
    $table->string('customer_id')->nullable();
    $table->string('account_id')->unique();
    $table->string('account_code')->nullable();
    $table->boolean('active')->default(true);
    $table->boolean('frozen')->default(false);
    $table->string('account_balance')->default('0');
    $table->string('available_balance')->default('0');
    $table->string('xpub')->nullable();
    $table->string('accounting_currency')->nullable();
    $table->unsignedBigInteger('currency_id')->nullable();
    $table->foreign('currency_id')->references('id')->on('wallet_currencies');
    $table->timestamps();
});
```

**Purpose:** Stores Tatum virtual accounts for each user and currency combination.

---

### 7.3. deposit_addresses

**Initial Migration:** `database/migrations/2025_01_29_103141_create_deposit_addresses_table.php`
**Updates:** 
- `database/migrations/2025_03_28_174839_update_depositaddress_tablke.php` - Added index and private_key
- `database/migrations/2025_03_28_191627_update_depositaddress_tablke.php` - Changed types

```php
// Initial schema
Schema::create('deposit_addresses', function (Blueprint $table) {
    $table->id();
    $table->foreignId('virtual_account_id')->constrained()->onDelete('cascade');
    $table->string('blockchain')->nullable();
    $table->string('currency')->nullable();
    $table->string('address')->unique();
    $table->timestamps();
});

// Updates added:
$table->integer('index')->nullable();        // Derivation index from master wallet
$table->text('private_key')->nullable();    // Encrypted private key for this address
```

**Final Schema:**
- `id` - Primary key
- `virtual_account_id` - Foreign key to `virtual_accounts` (cascade delete)
- `blockchain` - Blockchain name (nullable)
- `currency` - Currency code (nullable)
- `address` - Deposit address (unique)
- `index` - Derivation index from master wallet (integer, nullable)
- `private_key` - Encrypted private key (text, nullable)
- `created_at`, `updated_at` - Timestamps

**Purpose:** Stores deposit addresses generated from master wallet, linked to virtual accounts.

---

### 7.4. webhook_responses

**Migration:** `database/migrations/2025_02_27_205918_create_webhook_responses_table.php`

```php
Schema::create('webhook_responses', function (Blueprint $table) {
    $table->id();
    $table->string('account_id')->nullable();
    $table->string('subscription_type')->nullable();
    $table->decimal('amount', 20, 8)->nullable();
    $table->string('reference')->nullable();
    $table->string('currency')->nullable();
    $table->string('tx_id')->nullable();
    $table->bigInteger('block_height')->nullable();
    $table->string('block_hash')->nullable();
    $table->string('from_address')->nullable();
    $table->string('to_address')->nullable();
    $table->timestamp('transaction_date')->nullable();
    $table->integer('index')->nullable();
    $table->timestamps();
});
```

**Purpose:** Logs all webhook events received from Tatum for audit and debugging.

---

### 7.5. received_assets

**Migration:** `database/migrations/2025_04_28_161237_create_received_assets_table.php`

```php
Schema::create('received_assets', function (Blueprint $table) {
    $table->id();
    $table->string('account_id')->nullable();
    $table->string('subscription_type')->nullable();
    $table->decimal('amount', 20, 8)->nullable();
    $table->string('reference')->nullable();
    $table->string('currency')->nullable();
    $table->string('tx_id')->nullable();
    $table->string('from_address')->nullable();
    $table->string('to_address')->nullable();
    $table->timestamp('transaction_date')->nullable();
    $table->string('status')->default('inWallet');
    $table->integer('index')->nullable();
    $table->unsignedBigInteger('user_id')->nullable();
    $table->foreign('user_id')->references('id')->on('users');
    $table->timestamps();
});
```

**Purpose:** Tracks received assets from webhooks, with status field to track asset state.

---

### 7.6. receive_transactions

**Migration:** `database/migrations/2025_03_29_180239_create_receive_transactions_table.php`

```php
Schema::create('receive_transactions', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('user_id')->nullable();
    $table->unsignedBigInteger('virtual_account_id')->nullable();
    $table->unsignedBigInteger('transaction_id')->nullable();
    $table->foreign('user_id')->references('id')->on('users');
    $table->foreign('virtual_account_id')->references('id')->on('virtual_accounts');
    $table->foreign('transaction_id')->references('id')->on('transactions');
    $table->string('transaction_type'); // 'internal' or 'on_chain'
    $table->string('sender_address')->nullable();
    $table->string('reference')->nullable()->unique();
    $table->text('tx_id')->nullable()->unique();
    $table->double('amount')->nullable();
    $table->string('currency')->nullable();
    $table->string('blockchain')->nullable();
    $table->double('amount_usd')->nullable();
    $table->string('status')->default('pending');
    $table->timestamps();
});
```

**Purpose:** Links received transactions to users, virtual accounts, and general transactions table.

---

### 7.7. Related Tables (Referenced)

**users** - User accounts
- `id` - Primary key (referenced by virtual_accounts.user_id)

**wallet_currencies** - Supported currencies
- `id` - Primary key (referenced by virtual_accounts.currency_id)
- `blockchain` - Blockchain name
- `currency` - Currency code

**transactions** - General transaction table
- `id` - Primary key (referenced by receive_transactions.transaction_id)

**failed_master_transfers** - Failed transfer attempts
- Links virtual_account_id and webhook_response_id
- Stores failure reason

---

### 7.8. Schema Relationships Diagram

```
users (1) ──< (many) virtual_accounts
                │
                ├── (1) ──< (many) deposit_addresses
                │
                └── (1) ──< (many) receive_transactions
                              │
                              └── (many) >── (1) transactions

master_wallets (1) ──< (many) deposit_addresses [via blockchain + index]

webhook_responses (1) ──< (many) received_assets
webhook_responses (1) ──< (1) failed_master_transfers

wallet_currencies (1) ──< (many) virtual_accounts
```

---

## 8. Configuration

**Location:** `config/tatum.php`
```php
'api_key' => env('TATUM_API_KEY'),
'base_url' => env('TATUM_BASE_URL', 'https://api.tatum.io/v3'),
'webhook_url' => 'https://earlybaze.hmstech.xyz/api/webhook',
```

---

## 9. Recommendations

1. **Enable Master Wallet Linking:**
   - Uncomment xpub in `CreateVirtualAccount.php` if you want addresses derived from master wallet
   - Currently using Tatum's address generation instead

2. **Enable Transfer to Master Wallet:**
   - Uncomment transfer logic if you want funds consolidated in master wallet
   - Consider implementing retry mechanism for failed transfers

3. **Add Monitoring:**
   - Monitor failed webhook processing
   - Track virtual accounts without deposit addresses
   - Alert on master wallet balance thresholds

4. **Improve Error Handling:**
   - Add retry mechanism for failed address assignments
   - Implement dead letter queue for failed webhooks

5. **Security Enhancements:**
   - Rotate master wallet mnemonic periodically
   - Implement rate limiting on webhook endpoint
   - Add webhook signature verification

---

## 10. Complete API Endpoints Reference

This section provides all API endpoints needed to implement the same system in Express TypeScript or any other framework.

### Quick Reference Table

| Endpoint Type | Method | Endpoint | Purpose |
|--------------|--------|----------|---------|
| **Backend - Master Wallet** | POST | `/api/master-wallet` | Create master wallet |
| **Backend - Master Wallet** | GET | `/api/master-wallet` | Get all master wallets |
| **Backend - Auth** | POST | `/api/auth/register` | Register user |
| **Backend - Auth** | POST | `/api/auth/otp-verification` | Verify OTP (triggers VA creation) |
| **Backend - Auth** | POST | `/api/auth/login` | User login |
| **Backend - User** | GET | `/api/user/deposit-address/{currency}/{network}` | Get deposit address |
| **Backend - User** | GET | `/api/user/assets` | Get user virtual accounts |
| **Backend - Webhook** | POST | `/api/webhook` | Receive Tatum webhooks |
| **Tatum - Wallet** | GET | `/v3/{blockchain}/wallet` | Create master wallet |
| **Tatum - Virtual Account** | POST | `/v3/ledger/account` | Create virtual account |
| **Tatum - Virtual Account** | GET | `/v3/ledger/account/customer/{externalId}` | Get user accounts |
| **Tatum - Address** | GET | `/v3/{blockchain}/address/{xpub}/{index}` | Generate address |
| **Tatum - Address** | POST | `/v3/{blockchain}/wallet/priv` | Generate private key |
| **Tatum - Address** | POST | `/v3/offchain/account/{id}/address/{address}` | Assign address to VA |
| **Tatum - Webhook** | POST | `/v3/subscription` | Register webhook |
| **Tatum - Webhook** | GET | `/v3/subscription` | Get webhooks |
| **Tatum - Webhook** | DELETE | `/v3/subscription/{id}` | Delete webhook |

---

### 10.1. Backend API Endpoints (Your Application)

#### Base URL
```
Production: https://yourdomain.com/api
Development: http://localhost:8000/api
```

#### Authentication
- Most endpoints require Bearer token authentication
- Token obtained from `/api/auth/login` or `/api/auth/otp-verification`
- Header: `Authorization: Bearer {token}`

---

#### 10.1.1. Master Wallet Endpoints

**Create Master Wallet**
```
POST /api/master-wallet
Content-Type: application/json
Authorization: Bearer {token} (if required)

Request Body:
{
  "blockchain": "ethereum",  // or "bitcoin", "tron", "bsc", "litecoin"
  "endpoint": "/ethereum/wallet"  // Tatum API endpoint
}

Response (201):
{
  "message": "Master wallet created",
  "wallet": {
    "id": 1,
    "blockchain": "ethereum",
    "xpub": "xpub...",
    "address": "0x...",
    "private_key": "0x...",
    "mnemonic": "word1 word2 ... word12",
    "created_at": "2025-01-01T00:00:00.000000Z",
    "updated_at": "2025-01-01T00:00:00.000000Z"
  }
}
```

**Get All Master Wallets**
```
GET /api/master-wallet
Authorization: Bearer {token} (if required)

Response (200):
[
  {
    "id": 1,
    "blockchain": "ethereum",
    "xpub": "xpub...",
    "address": "0x...",
    ...
  }
]
```

---

#### 10.1.2. User Authentication & Registration

**Register User**
```
POST /api/auth/register
Content-Type: application/json

Request Body:
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890"  // optional
}

Response (201):
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "otp_verified": false,
    ...
  },
  "message": "OTP sent to email"
}
```

**Verify OTP (Triggers Virtual Account Creation)**
```
POST /api/auth/otp-verification
Content-Type: application/json

Request Body:
{
  "email": "john@example.com",
  "otp": "123456"
}

Response (200):
{
  "user": {
    "id": 1,
    "email": "john@example.com",
    "otp_verified": true,
    ...
  },
  "message": "OTP verified successfully"
}

Note: This triggers CreateVirtualAccount job in background
```

**Login**
```
POST /api/auth/login
Content-Type: application/json

Request Body:
{
  "email": "john@example.com",
  "password": "password123"
}

Response (200):
{
  "user": {
    "id": 1,
    "email": "john@example.com"
  },
  "virtual_accounts": [
    {
      "id": 1,
      "currency": "BTC",
      "blockchain": "bitcoin",
      "available_balance": "0.00000000",
      "account_balance": "0.00000000",
      "walletCurrency": {
        "id": 1,
        "price": "50000",
        "symbol": "BTC",
        "naira_price": "50000000"
      }
    }
  ],
  "token": "1|abc123..."
}
```

---

#### 10.1.3. Virtual Account & Deposit Address Endpoints

**Get User Deposit Address**
```
GET /api/user/deposit-address/{currency}/{network}
Authorization: Bearer {token}

Example:
GET /api/user/deposit-address/BTC/bitcoin
GET /api/user/deposit-address/USDT/ethereum

Response (200):
{
  "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "blockchain": "bitcoin",
  "currency": "BTC",
  "virtual_account_id": 1
}
```

**Get User Virtual Accounts**
```
GET /api/user/assets
Authorization: Bearer {token}

Response (200):
[
  {
    "id": 1,
    "currency": "BTC",
    "blockchain": "bitcoin",
    "available_balance": "0.00000000",
    "account_balance": "0.00000000",
    "account_id": "tatum_account_id",
    ...
  }
]
```

**Get User Accounts from Tatum**
```
GET /api/user-accounts
Authorization: Bearer {token}

Response (200):
{
  "data": [
    {
      "id": "tatum_account_id",
      "currency": "BTC",
      "balance": {
        "accountBalance": "0.00000000",
        "availableBalance": "0.00000000"
      },
      ...
    }
  ]
}
```

**Assign Deposit Addresses (Admin/Manual)**
```
POST /api/users/{user_id}/virtual-accounts/assign-deposit-addresses
Authorization: Bearer {token}

Response (200):
{
  "message": "Deposit addresses assigned"
}
```

---

#### 10.1.4. Webhook Endpoint

**Receive Tatum Webhook**
```
POST /api/webhook
Content-Type: application/json

Request Body (from Tatum):
{
  "accountId": "tatum_virtual_account_id",
  "subscriptionType": "ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION",
  "amount": "0.001",
  "currency": "BTC",
  "reference": "unique_reference_123",
  "txId": "transaction_hash_abc123",
  "from": "sender_address",
  "to": "receiver_address",
  "date": 1234567890000,
  "blockHeight": 12345,
  "blockHash": "block_hash_xyz",
  "index": 0
}

Response (200):
{
  "message": "Webhook queued for processing"
}

Note: This endpoint should be publicly accessible (no auth required)
```

---

### 10.2. Tatum API Endpoints

#### Base URL
```
Production: https://api.tatum.io/v3
Testnet: https://api.tatum.io/v3 (use testnet API keys)
```

#### Authentication
All Tatum API requests require:
```
Header: x-api-key: {YOUR_TATUM_API_KEY}
```

---

#### 10.2.1. Master Wallet Creation

**Create Wallet (Ethereum)**
```
GET https://api.tatum.io/v3/ethereum/wallet
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Response (200):
{
  "mnemonic": "word1 word2 word3 ... word12",
  "xpub": "xpub6C...",
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "privateKey": "0x..."
}
```

**Create Wallet (Bitcoin)**
```
GET https://api.tatum.io/v3/bitcoin/wallet
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Response (200):
{
  "mnemonic": "word1 word2 ... word12",
  "xpub": "xpub...",
  "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "privateKey": "..."
}
```

**Other Blockchains:**
- BSC: `GET /v3/bsc/wallet`
- Tron: `GET /v3/tron/wallet`
- Litecoin: `GET /v3/litecoin/wallet`
- Polygon: `GET /v3/polygon/wallet`
- Solana: `GET /v3/solana/wallet`

---

#### 10.2.2. Virtual Account Management

**Create Virtual Account**
```
POST https://api.tatum.io/v3/ledger/account
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}
  Content-Type: application/json

Request Body:
{
  "currency": "BTC",  // BTC, ETH, USDT, etc.
  "customer": {
    "externalId": "user_id_123"  // Your user ID
  },
  "accountCode": "user_code_abc",  // Optional: user's account code
  "accountingCurrency": "USD"  // USD, EUR, etc.
}

Response (200):
{
  "id": "tatum_account_id_123",
  "customerId": "tatum_customer_id",
  "currency": "BTC",
  "active": true,
  "frozen": false,
  "balance": {
    "accountBalance": "0.00000000",
    "availableBalance": "0.00000000"
  },
  "accountingCurrency": "USD"
}
```

**Get User Accounts by External ID**
```
GET https://api.tatum.io/v3/ledger/account/customer/{externalId}?pageSize=50
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Example:
GET https://api.tatum.io/v3/ledger/account/customer/user_id_123?pageSize=50

Response (200):
{
  "data": [
    {
      "id": "tatum_account_id_123",
      "currency": "BTC",
      "balance": {
        "accountBalance": "0.00000000",
        "availableBalance": "0.00000000"
      },
      ...
    }
  ]
}
```

**Get Virtual Account Details**
```
GET https://api.tatum.io/v3/ledger/account/{accountId}
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Response (200):
{
  "id": "tatum_account_id_123",
  "currency": "BTC",
  "active": true,
  "frozen": false,
  "balance": {
    "accountBalance": "0.00000000",
    "availableBalance": "0.00000000"
  },
  ...
}
```

---

#### 10.2.3. Deposit Address Generation

**Generate Address from Master Wallet**
```
GET https://api.tatum.io/v3/{blockchain}/address/{xpub}/{index}
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Examples:
GET https://api.tatum.io/v3/ethereum/address/xpub6C.../5
GET https://api.tatum.io/v3/bitcoin/address/xpub.../5
GET https://api.tatum.io/v3/tron/address/xpub.../5

Response (200):
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Generate Private Key from Mnemonic**
```
POST https://api.tatum.io/v3/{blockchain}/wallet/priv
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}
  Content-Type: application/json

Request Body:
{
  "mnemonic": "word1 word2 ... word12",
  "index": 5
}

Examples:
POST https://api.tatum.io/v3/ethereum/wallet/priv
POST https://api.tatum.io/v3/bitcoin/wallet/priv
POST https://api.tatum.io/v3/tron/wallet/priv

Response (200):
{
  "key": "0x..."  // Private key
}
```

**Assign Address to Virtual Account**
```
POST https://api.tatum.io/v3/offchain/account/{accountId}/address/{address}
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Example:
POST https://api.tatum.io/v3/offchain/account/tatum_account_id_123/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

Response (200):
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "currency": "ETH",
  "derivationKey": [0, 5],
  "xpub": "xpub..."
}
```

---

#### 10.2.4. Webhook Registration

**Register Webhook Subscription**
```
POST https://api.tatum.io/v3/subscription
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}
  Content-Type: application/json

Request Body:
{
  "type": "ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION",
  "attr": {
    "id": "tatum_virtual_account_id",
    "url": "https://yourdomain.com/api/webhook"
  }
}

Response (200):
{
  "id": "webhook_subscription_id",
  "type": "ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION",
  "attr": {
    "id": "tatum_virtual_account_id",
    "url": "https://yourdomain.com/api/webhook"
  }
}
```

**Get Webhook Subscriptions**
```
GET https://api.tatum.io/v3/subscription?pageSize=50
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Response (200):
{
  "data": [
    {
      "id": "webhook_subscription_id",
      "type": "ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION",
      ...
    }
  ]
}
```

**Delete Webhook Subscription**
```
DELETE https://api.tatum.io/v3/subscription/{subscriptionId}
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Response (204): No Content
```

---

#### 10.2.5. Transaction Management

**Get Account Transactions**
```
GET https://api.tatum.io/v3/ledger/transaction/account/{accountId}?pageSize=50
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}

Response (200):
{
  "data": [
    {
      "id": "transaction_id",
      "accountId": "tatum_account_id",
      "amount": "0.001",
      "currency": "BTC",
      "type": "DEPOSIT",
      "status": "SUCCESS",
      ...
    }
  ]
}
```

**Transfer Between Virtual Accounts**
```
POST https://api.tatum.io/v3/ledger/transaction
Headers:
  x-api-key: {YOUR_TATUM_API_KEY}
  Content-Type: application/json

Request Body:
{
  "senderAccountId": "source_account_id",
  "recipientAccountId": "destination_account_id",
  "amount": "0.001",
  "currency": "BTC",
  "anonymous": false,
  "compliant": false,
  "attr": "optional_metadata"
}

Response (200):
{
  "reference": "transaction_reference",
  "id": "transaction_id",
  ...
}
```

---

### 10.3. Express TypeScript Implementation Example

```typescript
// Example: Create Master Wallet
import axios from 'axios';

const TATUM_API_KEY = process.env.TATUM_API_KEY;
const TATUM_BASE_URL = 'https://api.tatum.io/v3';

async function createMasterWallet(blockchain: string) {
  const endpoint = `/${blockchain}/wallet`;
  
  const response = await axios.get(`${TATUM_BASE_URL}${endpoint}`, {
    headers: {
      'x-api-key': TATUM_API_KEY
    }
  });
  
  return response.data; // { mnemonic, xpub, address, privateKey }
}

// Example: Create Virtual Account
async function createVirtualAccount(currency: string, userId: string, userCode: string) {
  const response = await axios.post(
    `${TATUM_BASE_URL}/ledger/account`,
    {
      currency: currency,
      customer: {
        externalId: userId
      },
      accountCode: userCode,
      accountingCurrency: 'USD'
    },
    {
      headers: {
        'x-api-key': TATUM_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data;
}

// Example: Generate Deposit Address
async function generateDepositAddress(blockchain: string, xpub: string, index: number) {
  const response = await axios.get(
    `${TATUM_BASE_URL}/${blockchain}/address/${xpub}/${index}`,
    {
      headers: {
        'x-api-key': TATUM_API_KEY
      }
    }
  );
  
  return response.data.address;
}

// Example: Register Webhook
async function registerWebhook(accountId: string, webhookUrl: string) {
  const response = await axios.post(
    `${TATUM_BASE_URL}/subscription`,
    {
      type: 'ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION',
      attr: {
        id: accountId,
        url: webhookUrl
      }
    },
    {
      headers: {
        'x-api-key': TATUM_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data;
}
```

---

### 10.4. Webhook Payload Structure

When Tatum sends a webhook to your endpoint, it will have this structure:

```typescript
interface TatumWebhookPayload {
  accountId: string;                    // Tatum virtual account ID
  subscriptionType: string;             // "ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION"
  amount: string;                        // "0.001"
  currency: string;                     // "BTC", "ETH", "USDT", etc.
  reference: string;                    // Unique transaction reference
  txId: string;                         // Blockchain transaction hash
  from: string;                         // Sender address
  to: string;                           // Receiver address (your deposit address)
  date: number;                         // Timestamp in milliseconds
  blockHeight: number;                  // Block number
  blockHash: string;                    // Block hash
  index: number;                        // Transaction index in block
}
```

---

### 10.5. Error Responses

**Tatum API Errors:**
```json
{
  "statusCode": 400,
  "message": "Error message",
  "error": "Bad Request"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (invalid API key)
- `404` - Not Found
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

---

## 11. Complete Code Flow Summary

### Master Wallet Creation
```
POST /api/master-wallet
  → MasterWalletController::create()
    → MasterWalletService::createMasterWallet()
      → TatumService::createWallet() [GET /v3/{blockchain}/wallet]
        → MasterWalletRepository::create()
          → MasterWallet::create() [Saves to DB]
```

### Virtual Account Creation (On Email Verification)
```
User verifies OTP
  → UserService::verifyOtp()
    → dispatch(CreateVirtualAccount($user))
      → CreateVirtualAccount::handle()
        → For each WalletCurrency:
          → POST /ledger/account [Tatum API]
            → VirtualAccount::create() [Saves to DB]
              → dispatch(AssignDepositAddress)
              → dispatch(RegisterTatumWebhook)
```

### Deposit Address Generation
```
AssignDepositAddress::handle()
  → WalletAddressService::generateAndAssignToVirtualAccount()
    → Check for existing address in blockchain group
    → If new:
      → Get MasterWallet (locked)
      → Calculate index (max + 40)
      → GET /{blockchain}/address/{xpub}/{index} [Tatum]
      → POST /{blockchain}/wallet/priv [Tatum]
      → POST /offchain/account/{id}/address/{address} [Tatum]
      → DepositAddress::create() [Saves encrypted private key]
```

### Webhook Processing
```
Tatum sends webhook
  → POST /api/webhook
    → WebhookController::webhook()
      → dispatch(ProcessBlockchainWebhook)
        → ProcessBlockchainWebhook::handle()
          → Check master wallet (ignore if from master)
          → Check duplicate (by reference)
          → Find VirtualAccount
          → Update balance
          → Create WebhookResponse
          → Create ReceivedAsset
          → Create Transaction & ReceiveTransaction
          → Send notification
          → [Transfer to master wallet - DISABLED]
```

---

## Conclusion

The system implements a complete Tatum virtual account integration with:
- ✅ Master wallet management (per blockchain)
- ✅ Virtual account creation on email verification (one per currency)
- ✅ Deposit address generation from master wallet (with address reuse)
- ✅ Webhook processing and transaction recording
- ✅ Complete database schema with relationships

### Key Architecture Points:
1. **Master Wallets:** One per blockchain, used to derive all deposit addresses
2. **Virtual Accounts:** One per user per currency, created when email is verified
3. **Deposit Addresses:** Generated from master wallet using index-based derivation
4. **Address Reuse:** Same address shared within blockchain groups (ETH/USDT/USDC, etc.)
5. **Webhooks:** Registered per virtual account, processed asynchronously

### Currently Disabled Features:
- Virtual account xpub linking (line 59 in CreateVirtualAccount.php)
- Transfer to master wallet (lines 151-165 in ProcessBlockchainWebhook.php)

These may be intentional based on your custody model - funds remain in virtual accounts managed by Tatum rather than being consolidated in master wallets.

