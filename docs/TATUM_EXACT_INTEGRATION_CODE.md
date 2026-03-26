# Tatum — **complete** exact code & database (verbatim from this repo)

Same level of detail as `PALMPAY_EXACT_INTEGRATION_CODE.md`: Prisma models, Tatum API service, virtual accounts, deposit addresses, master wallet, webhook ingestion, async processing job, queue jobs, crypto transaction persistence, routes.

**Mirror folder:** `docs/tatum-exact-source/` — plain `.ts` copies.

### Table of contents

1. Env vars & Tatum API overview
2. Prisma: MasterWallet, WalletCurrency, UserWallet, VirtualAccount, DepositAddress, WebhookResponse
3. Prisma: TatumRawWebhook
4. Prisma: CryptoTransaction, CryptoBuy…CryptoReceive + enums
5. tatum.service.ts (V3 + V4 API, wallets, webhooks)
6. virtual.account.service.ts
7. deposit.address.service.ts
8. master.wallet.service.ts
9. tatum.logger.ts
10. tatum.webhook.controller.ts
11. process.webhook.job.ts
12. crypto.transaction.service.ts (used by webhook processing)
13. create.virtual.account.job.ts
14. retry.sell.token.transfer.job.ts
15. tatum.webhook.router.ts
16. External dependencies & queue wiring

---

## 1) Environment variables (Tatum)

```env
TATUM_API_KEY=your_key
TATUM_BASE_URL=https://api.tatum.io/v3   # optional; V4 uses https://api.tatum.io/v4
ENCRYPTION_KEY=32_byte_compatible_key_for_aes256   # private key / mnemonic encryption
# Webhook URL you register in Tatum must hit:
# POST https://your-api.com/api/v2/webhooks/tatum
```

**API:** `tatum.service.ts` uses `x-api-key` header. V4 used for address-based webhook subscriptions (`INCOMING_NATIVE_TX`, `INCOMING_FUNGIBLE_TX`).


---

## 2–4) Prisma — wallets, deposit addresses, WebhookResponse

```prisma
model MasterWallet {
  id         Int      @id @default(autoincrement())
  blockchain String   @db.VarChar(255)
  xpub       String?  @db.VarChar(500)
  address    String?  @db.VarChar(255)
  privateKey String?  @db.Text
  mnemonic   String?  @db.Text
  response   String?  @db.Text
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([blockchain])
  @@map("MasterWallet")
}

model MasterWalletTransaction {
  id             Int       @id @default(autoincrement())
  walletId       String    @map("wallet_id") @db.VarChar(50)
  type           String    @db.VarChar(50)
  assetSymbol    String    @map("asset_symbol") @db.VarChar(20)
  amount         Decimal   @db.Decimal(20, 8)
  toAddress      String?   @map("to_address") @db.VarChar(255)
  txHash         String?   @map("tx_hash") @db.VarChar(255)
  status         String    @default("pending") @db.VarChar(50)
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@index([walletId])
  @@index([assetSymbol])
  @@index([createdAt])
  @@map("master_wallet_transactions")
}

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

model UserWallet {
  id               Int              @id @default(autoincrement())
  userId           Int              @map("user_id")
  blockchain       String           @db.VarChar(255)
  mnemonic         String?          @db.Text // Encrypted mnemonic (24-word seed phrase)
  xpub             String?          @db.VarChar(500) // Extended public key
  derivationPath   String?          @map("derivation_path") @db.VarChar(100) // e.g., "m/44'/60'/0'"
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt @map("updated_at")
  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  depositAddresses DepositAddress[]

  @@unique([userId, blockchain])
  @@index([userId])
  @@index([blockchain])
  @@map("user_wallets")
}

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

model DepositAddress {
  id               Int            @id @default(autoincrement())
  virtualAccountId Int            @map("virtual_account_id")
  userWalletId     Int?           @map("user_wallet_id") // Optional: links to user's wallet (for per-user wallets)
  blockchain       String?        @db.VarChar(255)
  currency         String?        @db.VarChar(50)
  address          String         @db.VarChar(255)
  index            Int?           @db.Int
  privateKey       String?        @map("private_key") @db.Text
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

---

## ### TatumRawWebhook

```prisma
// Raw Tatum webhook data storage
model TatumRawWebhook {
  id           Int       @id @default(autoincrement())
  rawData      String    @map("raw_data") @db.LongText // JSON string of the entire webhook payload
  headers      String?   @db.Text // JSON string of request headers
  ipAddress    String?   @map("ip_address") @db.VarChar(255)
  userAgent    String?   @map("user_agent") @db.VarChar(500)
  processed    Boolean   @default(false) // Whether the webhook has been processed
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

## ### CryptoTransaction + CryptoBuy / Sell / Send / Receive

```prisma
model CryptoTransaction {
  id               Int            @id @default(autoincrement())
  userId           Int            @map("user_id")
  virtualAccountId Int?           @map("virtual_account_id")
  transactionType  CryptoTxType   @map("transaction_type")
  transactionId    String         @unique @map("transaction_id") @db.VarChar(255) // Unique transaction ID (e.g., "031pxtg2c101")
  status           CryptoTxStatus @default(pending)
  currency         String         @db.VarChar(50)
  blockchain       String         @db.VarChar(255)
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")

  // Relations to child tables
  cryptoBuy     CryptoBuy?
  cryptoSell    CryptoSell?
  cryptoSend    CryptoSend?
  cryptoReceive CryptoReceive?
  cryptoSwap    CryptoSwap?

  // Relations
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  virtualAccount VirtualAccount? @relation(fields: [virtualAccountId], references: [id])

  @@index([userId])
  @@index([virtualAccountId])
  @@index([transactionId])
  @@index([transactionType])
  @@index([status])
  @@index([createdAt])
  @@map("crypto_transactions")
}

// Crypto Buy Transaction
model CryptoBuy {
  id                  Int      @id @default(autoincrement())
  cryptoTransactionId Int      @unique @map("crypto_transaction_id")
  fromAddress         String?  @map("from_address") @db.VarChar(255)
  toAddress           String?  @map("to_address") @db.VarChar(255)
  amount              Decimal  @db.Decimal(20, 8) // Crypto amount received
  amountUsd           Decimal  @map("amount_usd") @db.Decimal(20, 8) // USD equivalent
  amountNaira         Decimal  @map("amount_naira") @db.Decimal(20, 8) // NGN spent
  rateNgnToUsd        Decimal? @map("rate_ngn_to_usd") @db.Decimal(20, 8) // NGN to USD conversion rate (Naira per $1)
  rateUsdToCrypto     Decimal? @map("rate_usd_to_crypto") @db.Decimal(20, 8) // USD to Crypto conversion rate (crypto price in USD)
  rate                Decimal? @db.Decimal(20, 8) // Legacy field - kept for backward compatibility
  txHash              String?  @unique @map("tx_hash") @db.VarChar(255)
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  cryptoTransaction CryptoTransaction @relation(fields: [cryptoTransactionId], references: [id], onDelete: Cascade)

  @@index([cryptoTransactionId])
  @@index([txHash])
  @@map("crypto_buy")
}

// Crypto Sell Transaction
model CryptoSell {
  id                  Int      @id @default(autoincrement())
  cryptoTransactionId Int      @unique @map("crypto_transaction_id")
  fromAddress         String?  @map("from_address") @db.VarChar(255)
  toAddress           String?  @map("to_address") @db.VarChar(255)
  amount              Decimal  @db.Decimal(20, 8) // Crypto amount sold
  amountUsd           Decimal  @map("amount_usd") @db.Decimal(20, 8) // USD equivalent
  amountNaira         Decimal  @map("amount_naira") @db.Decimal(20, 8) // Amount received in Naira
  rateCryptoToUsd     Decimal? @map("rate_crypto_to_usd") @db.Decimal(20, 8) // Crypto to USD conversion rate (crypto price in USD)
  rateUsdToNgn        Decimal? @map("rate_usd_to_ngn") @db.Decimal(20, 8) // USD to NGN conversion rate (Naira per $1)
  rate                Decimal? @db.Decimal(20, 8) // Legacy field - kept for backward compatibility
  txHash              String?  @unique @map("tx_hash") @db.VarChar(255)
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  cryptoTransaction CryptoTransaction @relation(fields: [cryptoTransactionId], references: [id], onDelete: Cascade)

  @@index([cryptoTransactionId])
  @@index([txHash])
  @@map("crypto_sell")
}

// Crypto Send Transaction
model CryptoSend {
  id                  Int      @id @default(autoincrement())
  cryptoTransactionId Int      @unique @map("crypto_transaction_id")
  fromAddress         String   @map("from_address") @db.VarChar(255)
  toAddress           String   @map("to_address") @db.VarChar(255)
  amount              Decimal  @db.Decimal(20, 8) // Crypto amount
  amountUsd           Decimal  @map("amount_usd") @db.Decimal(20, 8)
  amountNaira         Decimal? @map("amount_naira") @db.Decimal(20, 8)
  rate                Decimal? @db.Decimal(20, 8) // NGN per USD rate
  txHash              String   @unique @map("tx_hash") @db.VarChar(255)
  networkFee          Decimal? @map("network_fee") @db.Decimal(20, 8)
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  cryptoTransaction CryptoTransaction @relation(fields: [cryptoTransactionId], references: [id], onDelete: Cascade)

  @@index([cryptoTransactionId])
  @@index([txHash])
  @@index([fromAddress])
  @@index([toAddress])
  @@map("crypto_send")
}

// Crypto Receive Transaction
model CryptoReceive {
  id                  Int      @id @default(autoincrement())
  cryptoTransactionId Int      @unique @map("crypto_transaction_id")
  fromAddress         String   @map("from_address") @db.VarChar(255)
  toAddress           String   @map("to_address") @db.VarChar(255)
  amount              Decimal  @db.Decimal(20, 8) // Crypto amount received
  amountUsd           Decimal  @map("amount_usd") @db.Decimal(20, 8)
  amountNaira         Decimal? @map("amount_naira") @db.Decimal(20, 8)
  rate                Decimal? @db.Decimal(20, 8) // NGN per USD rate
  txHash              String   @unique @map("tx_hash") @db.VarChar(255)
  blockNumber         BigInt?  @map("block_number")
  confirmations       Int?     @default(0)
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  cryptoTransaction CryptoTransaction @relation(fields: [cryptoTransactionId], references: [id], onDelete: Cascade)

  @@index([cryptoTransactionId])
  @@index([txHash])
  @@index([toAddress])
  @@map("crypto_receive")
}
```

---

## ### Enums CryptoTxType, CryptoTxStatus

```prisma
enum CryptoTxType {
  BUY
  SELL
  SEND
  RECEIVE
  SWAP
}

enum CryptoTxStatus {
  pending
  processing
  successful
  failed
  cancelled
}
```

---

## 5) tatum.service.ts

```ts
/**
 * Tatum API Service
 * 
 * Handles all Tatum API interactions
 */

import axios, { AxiosInstance } from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';

export interface TatumWalletResponse {
  mnemonic?: string;
  xpub?: string;
  address: string;
  privateKey?: string;
  secret?: string; // XRP uses 'secret' instead of 'mnemonic' and 'privateKey'
}

export interface TatumVirtualAccountRequest {
  currency: string;
  customer: {
    externalId: string;
  };
  accountCode?: string;
  accountingCurrency?: string;
  xpub?: string;
}

export interface TatumVirtualAccountResponse {
  id: string;
  customerId: string;
  currency: string;
  active: boolean;
  frozen: boolean;
  balance: {
    accountBalance: string;
    availableBalance: string;
  };
  accountingCurrency?: string;
}

export interface TatumAddressResponse {
  address: string;
}

export interface TatumPrivateKeyResponse {
  key: string;
}

export interface TatumWebhookPayload {
  accountId: string;
  subscriptionType: string;
  amount: string;
  currency: string;
  reference: string;
  txId: string;
  from: string;
  to: string;
  date: number;
  blockHeight: number;
  blockHash: string;
  index: number;
}

export interface TatumWebhookSubscriptionRequest {
  type: string;
  attr: {
    id: string;
    url: string;
  };
}

export interface TatumWebhookSubscriptionResponse {
  id: string;
  type: string;
  attr: {
    id: string;
    url: string;
  };
}

export interface TatumV4AddressWebhookRequest {
  type: 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX' | 'ADDRESS_EVENT';
  attr: {
    address: string;
    chain: string;
    url: string;
  };
  templateId?: 'enriched' | 'enriched_with_raw_data' | 'legacy';
  finality?: 'confirmed' | 'final';
}

export interface TatumV4WebhookSubscriptionResponse {
  id: string;
  type: string;
  attr: {
    address: string;
    chain: string;
    url: string;
  };
  templateId?: string;
}

class TatumService {
  private apiKey: string;
  private baseUrl: string;
  private baseUrlV4: string;
  private axiosInstance: AxiosInstance;
  private axiosInstanceV4: AxiosInstance;

  /**
   * Map blockchain names to Tatum V4 chain identifiers
   */
  private getTatumV4Chain(blockchain: string): string {
    const chainMap: { [key: string]: string } = {
      bitcoin: 'bitcoin-mainnet',
      ethereum: 'ethereum-mainnet',
      eth: 'ethereum-mainnet',
      tron: 'tron-mainnet',
      bsc: 'bsc-mainnet',
      solana: 'solana-mainnet',
      sol: 'solana-mainnet',
      litecoin: 'litecoin-core-mainnet',
      ltc: 'litecoin-core-mainnet',
      polygon: 'polygon-mainnet',
      matic: 'polygon-mainnet',
      dogecoin: 'doge-mainnet',
      doge: 'doge-mainnet',
      xrp: 'ripple-mainnet',
      ripple: 'ripple-mainnet',
      arbitrum: 'arb-one-mainnet',
      optimism: 'optimism-mainnet',
      base: 'base-mainnet',
      avalanche: 'avax-mainnet',
      fantom: 'fantom-mainnet',
      celo: 'celo-mainnet',
      // Testnet mappings
      'bitcoin-testnet': 'bitcoin-testnet',
      'ethereum-sepolia': 'ethereum-sepolia',
      'ethereum-holesky': 'ethereum-holesky',
      'tron-testnet': 'tron-testnet',
      'bsc-testnet': 'bsc-testnet',
      'solana-devnet': 'solana-devnet',
      'litecoin-testnet': 'litecoin-core-testnet',
      'polygon-amoy': 'polygon-amoy',
      'doge-testnet': 'doge-testnet',
      'ripple-testnet': 'ripple-testnet',
    };

    const normalized = blockchain.toLowerCase();
    const chain = chainMap[normalized];
    
    if (!chain) {
      console.warn(`Unknown blockchain ${blockchain} for Tatum V4 chain mapping, defaulting to ethereum-mainnet`);
      return 'ethereum-mainnet';
    }
    
    return chain;
  }

  constructor() {
    this.apiKey = process.env.TATUM_API_KEY || '';
    this.baseUrl = process.env.TATUM_BASE_URL || 'https://api.tatum.io/v3';
    this.baseUrlV4 = 'https://api.tatum.io/v4';

    if (!this.apiKey) {
      throw new Error('TATUM_API_KEY is required in environment variables');
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.axiosInstanceV4 = axios.create({
      baseURL: this.baseUrlV4,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Create a master wallet for a blockchain
   */
  async createWallet(blockchain: string): Promise<TatumWalletResponse> {
    try {
      const normalizedBlockchain = blockchain.toLowerCase();
      
      // XRP uses a different endpoint: /v3/xrp/account (not /v3/xrp/wallet)
      if (normalizedBlockchain === 'xrp' || normalizedBlockchain === 'ripple') {
        const endpoint = `/xrp/account`;
        const response = await this.axiosInstance.get<{ address: string; secret: string }>(endpoint);
        return {
          address: response.data.address,
          secret: response.data.secret,
          privateKey: response.data.secret, // Use secret as privateKey for consistency
        };
      }
      
      // Other blockchains use /wallet endpoint
      const endpoint = `/${normalizedBlockchain}/wallet`;
      const response = await this.axiosInstance.get<TatumWalletResponse>(endpoint);
      return response.data;
    } catch (error: any) {
      console.error(`Error creating wallet for ${blockchain}:`, error.response?.data || error.message);
      throw new Error(`Failed to create wallet: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a virtual account
   */
  async createVirtualAccount(
    data: TatumVirtualAccountRequest
  ): Promise<TatumVirtualAccountResponse> {
    try {
      const response = await this.axiosInstance.post<TatumVirtualAccountResponse>(
        '/ledger/account',
        data
      );
      return response.data;
    } catch (error: any) {
      console.error('Error creating virtual account:', error.response?.data || error.message);
      throw new Error(
        `Failed to create virtual account: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get user's virtual accounts by external ID
   */
  async getUserAccounts(externalId: string, pageSize: number = 50): Promise<any> {
    try {
      const response = await this.axiosInstance.get(
        `/ledger/account/customer/${externalId}?pageSize=${pageSize}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error getting user accounts:', error.response?.data || error.message);
      throw new Error(
        `Failed to get user accounts: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Generate address from master wallet xpub
   */
  async generateAddress(blockchain: string, xpub: string, index: number): Promise<string> {
    try {
      const endpoint = `/${blockchain.toLowerCase()}/address/${xpub}/${index}`;
      const response = await this.axiosInstance.get<TatumAddressResponse>(endpoint);
      return response.data.address;
    } catch (error: any) {
      console.error('Error generating address:', error.response?.data || error.message);
      throw new Error(
        `Failed to generate address: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Generate private key from mnemonic
   */
  async generatePrivateKey(blockchain: string, mnemonic: string, index: number): Promise<string> {
    try {
      const endpoint = `/${blockchain.toLowerCase()}/wallet/priv`;
      const response = await this.axiosInstance.post<TatumPrivateKeyResponse>(endpoint, {
        mnemonic,
        index,
      });
      return response.data.key;
    } catch (error: any) {
      console.error('Error generating private key:', error.response?.data || error.message);
      throw new Error(
        `Failed to generate private key: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Assign address to virtual account
   */
  async assignAddressToVirtualAccount(accountId: string, address: string): Promise<any> {
    try {
      const response = await this.axiosInstance.post(
        `/offchain/account/${accountId}/address/${address}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error assigning address:', error.response?.data || error.message);
      throw new Error(
        `Failed to assign address: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Register webhook subscription (V3 - Legacy, uses accountId)
   * @deprecated Use registerAddressWebhookV4 instead
   */
  async registerWebhook(
    accountId: string,
    webhookUrl: string
  ): Promise<TatumWebhookSubscriptionResponse> {
    try {
      const data: TatumWebhookSubscriptionRequest = {
        type: 'ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION',
        attr: {
          id: accountId,
          url: webhookUrl,
        },
      };
      const response = await this.axiosInstance.post<TatumWebhookSubscriptionResponse>(
        '/subscription',
        data
      );
      return response.data;
    } catch (error: any) {
      console.error('Error registering webhook:', error.response?.data || error.message);
      throw new Error(
        `Failed to register webhook: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Register address-based webhook subscription (V4)
   * Uses address directly instead of Tatum account ID
   */
  async registerAddressWebhookV4(
    address: string,
    blockchain: string,
    webhookUrl: string,
    options?: {
      type?: 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX' | 'ADDRESS_EVENT';
      finality?: 'confirmed' | 'final';
    }
  ): Promise<TatumV4WebhookSubscriptionResponse> {
    try {
      const chain = this.getTatumV4Chain(blockchain);
      const subscriptionType = options?.type || 'INCOMING_NATIVE_TX';
      
      const data: any = {
        type: subscriptionType,
        attr: {
          address,
          chain,
          url: webhookUrl,
        },
      };

      // Only add finality if provided (only supported for certain chains like TRON)
      if (options?.finality) {
        data.finality = options.finality;
      }

      const response = await this.axiosInstanceV4.post<TatumV4WebhookSubscriptionResponse>(
        '/subscription',
        data
      );
      return response.data;
    } catch (error: any) {
      console.error('Error registering V4 address webhook:', error.response?.data || error.message);
      throw new Error(
        `Failed to register address webhook: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get virtual account details
   */
  async getVirtualAccount(accountId: string): Promise<TatumVirtualAccountResponse> {
    try {
      const response = await this.axiosInstance.get<TatumVirtualAccountResponse>(
        `/ledger/account/${accountId}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error getting virtual account:', error.response?.data || error.message);
      throw new Error(
        `Failed to get virtual account: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get fungible token balances for supported tokens only (from wallet_currencies table)
   * Fetches balances for tokens that have contract addresses in our wallet_currencies table
   * GET /v3/blockchain/token/address/{chain}/{address}
   * Supported chains: ETH, MATIC, CELO, SOL, ALGO, BSC
   */
  async getSupportedTokenBalances(blockchain: string, address: string): Promise<any[]> {
    try {
      const normalizedBlockchain = blockchain.toLowerCase();
      
      // Map blockchain names to Tatum chain codes
      const chainMap: { [key: string]: string } = {
        'ethereum': 'ETH',
        'eth': 'ETH',
        'polygon': 'MATIC',
        'matic': 'MATIC',
        'celo': 'CELO',
        'solana': 'SOL',
        'sol': 'SOL',
        'algorand': 'ALGO',
        'algo': 'ALGO',
        'bsc': 'BSC',
        'binance': 'BSC',
        'binancesmartchain': 'BSC',
      };

      const chainCode = chainMap[normalizedBlockchain];
      
      if (!chainCode) {
        // Chain not supported for token balances
        return [];
      }

      // Get all supported tokens for this blockchain from wallet_currencies
      const supportedTokens = await prisma.walletCurrency.findMany({
        where: {
          blockchain: normalizedBlockchain,
          isToken: true,
          contractAddress: {
            not: null,
          },
        },
        select: {
          id: true,
          currency: true,
          name: true,
          symbol: true,
          contractAddress: true,
          decimals: true,
          tokenType: true,
        },
      });

      if (supportedTokens.length === 0) {
        // No supported tokens for this blockchain
        return [];
      }

      const encodedAddress = encodeURIComponent(address);
      
      // BSC uses a different endpoint: GET /v3/bsc/token/balance/{contractAddress}/{address}
      // For other chains, use: GET /v3/blockchain/token/address/{chain}/{address}
      if (chainCode === 'BSC') {
        // For BSC, fetch balance for each supported token individually
        const tokenBalances = await Promise.all(
          supportedTokens.map(async (token) => {
            try {
              if (!token.contractAddress) return null;
              
              // BSC uses ERC-20 compatible endpoint: GET /v3/bsc/erc20/balance/{contractAddress}/{address}
              const endpoint = `/bsc/erc20/balance/${encodeURIComponent(token.contractAddress)}/${encodedAddress}`;
              console.log(`Fetching BSC token balance: ${this.baseUrl}${endpoint}`);
              
              const response = await this.axiosInstance.get(endpoint);
              
              // Response format: { balance: "1000.0" }
              const balance = response.data.balance || '0';
              
              // Only return if balance > 0
              if (parseFloat(balance) > 0) {
                return {
                  contractAddress: token.contractAddress,
                  amount: balance,
                  currency: token.currency,
                  name: token.name,
                  symbol: token.symbol,
                  decimals: token.decimals,
                  tokenType: token.tokenType,
                  walletCurrencyId: token.id,
                };
              }
              return null;
            } catch (error: any) {
              // Log but don't fail - some tokens might not exist or have errors
              console.error(`Error fetching balance for token ${token.contractAddress}:`, error.response?.data?.message || error.message);
              return null;
            }
          })
        );
        
        return tokenBalances.filter((balance: any) => balance !== null);
      } else {
        // For other chains (ETH, MATIC, CELO, SOL, ALGO), use the bulk endpoint
        const endpoint = `/blockchain/token/address/${chainCode}/${encodedAddress}`;

        console.log(`Fetching token balances from Tatum: ${this.baseUrl}${endpoint}`);
        const response = await this.axiosInstance.get(endpoint);
        
        // Response is an array of { contractAddress: string, amount: string }
        const allTokenBalances = Array.isArray(response.data) ? response.data : [];
        
        // Filter to only include tokens we support, and enrich with our token data
        const supportedBalances = allTokenBalances
          .map((tokenBalance: any) => {
            // Find matching token in our supported tokens (case-insensitive comparison)
            const tokenInfo = supportedTokens.find(
              (token) => token.contractAddress?.toLowerCase() === tokenBalance.contractAddress?.toLowerCase()
            );
            
            if (tokenInfo) {
              return {
                contractAddress: tokenBalance.contractAddress,
                amount: tokenBalance.amount,
                // Add our token metadata
                currency: tokenInfo.currency,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                decimals: tokenInfo.decimals,
                tokenType: tokenInfo.tokenType,
                walletCurrencyId: tokenInfo.id,
              };
            }
            return null;
          })
          .filter((balance: any) => balance !== null);

        return supportedBalances;
      }
    } catch (error: any) {
      // Log error but don't throw - token balances are optional
      console.error(`Error getting supported token balances for ${blockchain}:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get fungible token balances (ERC-20, etc.) for an address
   * GET /v3/blockchain/token/address/{chain}/{address}
   * Supported chains: ETH, MATIC, CELO, SOL, ALGO
   * @deprecated Use getSupportedTokenBalances instead to get only tokens from wallet_currencies
   */
  async getFungibleTokenBalances(blockchain: string, address: string): Promise<any[]> {
    try {
      const normalizedBlockchain = blockchain.toLowerCase();
      
      // Map blockchain names to Tatum chain codes
      const chainMap: { [key: string]: string } = {
        'ethereum': 'ETH',
        'eth': 'ETH',
        'polygon': 'MATIC',
        'matic': 'MATIC',
        'celo': 'CELO',
        'solana': 'SOL',
        'sol': 'SOL',
        'algorand': 'ALGO',
        'algo': 'ALGO',
        'bsc': 'BSC',
        'binance': 'BSC',
        'binancesmartchain': 'BSC',
      };

      const chainCode = chainMap[normalizedBlockchain];
      
      if (!chainCode) {
        // Chain not supported for token balances
        return [];
      }

      const encodedAddress = encodeURIComponent(address);
      const endpoint = `/blockchain/token/address/${chainCode}/${encodedAddress}`;

      console.log(`Fetching fungible token balances from Tatum: ${this.baseUrl}${endpoint}`);
      const response = await this.axiosInstance.get(endpoint);
      
      // Response is an array of { contractAddress: string, amount: string }
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      // Log error but don't throw - token balances are optional
      console.error(`Error getting fungible token balances for ${blockchain}:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get balance for an address on a blockchain
   * Uses blockchain-specific endpoints based on Tatum API documentation
   * Note: Tatum v3 balance endpoints vary by blockchain
   * For Ethereum and other supported chains, also fetches fungible token balances
   */
  async getAddressBalance(blockchain: string, address: string, includeTokens: boolean = true): Promise<any> {
    try {
      const normalizedBlockchain = blockchain.toLowerCase();
      let endpoint: string;

      // Different blockchains have different balance endpoint formats in Tatum v3
      // Based on Tatum API documentation:
      // - Bitcoin/Litecoin: GET /v3/{blockchain}/address/{address}/balance
      // - Ethereum: GET /v3/ethereum/account/balance/{address}
      // - EVM chains: GET /v3/{blockchain}/account/balance/{address}
      // - Tron: GET /v3/tron/account/{address}
      switch (normalizedBlockchain) {
        case 'bitcoin':
        case 'litecoin':
          // UTXO-based chains: GET /v3/{blockchain}/address/balance/{address}
          // Note: The /balance comes BEFORE the address in the path!
          endpoint = `/${normalizedBlockchain}/address/balance/${address}`;
          break;
        case 'ethereum':
        case 'eth':
          // Ethereum: GET /v3/ethereum/account/balance/{address}
          endpoint = `/ethereum/account/balance/${address}`;
          break;
        case 'bsc':
        case 'binance':
        case 'binancesmartchain':
          // BSC: GET /v3/bsc/account/balance/{address}
          endpoint = `/bsc/account/balance/${address}`;
          break;
        case 'polygon':
          endpoint = `/polygon/account/balance/${address}`;
          break;
        case 'arbitrum':
          endpoint = `/arbitrum/account/balance/${address}`;
          break;
        case 'optimism':
          endpoint = `/optimism/account/balance/${address}`;
          break;
        case 'base':
          endpoint = `/base/account/balance/${address}`;
          break;
        case 'avalanche':
        case 'avax':
          endpoint = `/avalanche/account/balance/${address}`;
          break;
        case 'fantom':
          endpoint = `/fantom/account/balance/${address}`;
          break;
        case 'celo':
          endpoint = `/celo/account/balance/${address}`;
          break;
        case 'tron':
        case 'trx':
          // Tron: GET /v3/tron/account/{address} (returns account object with balance field)
          endpoint = `/tron/account/${address}`;
          break;
        case 'solana':
        case 'sol':
          // Solana: GET /v3/solana/account/{address} (may not have direct balance endpoint)
          endpoint = `/solana/account/${address}`;
          break;
        default:
          // Try EVM format for unknown chains
          endpoint = `/${normalizedBlockchain}/account/balance/${address}`;
      }

      // Ensure address is properly URL-encoded
      const encodedAddress = encodeURIComponent(address);
      
      // Rebuild endpoint with encoded address for Bitcoin/Litecoin
      if (normalizedBlockchain === 'bitcoin' || normalizedBlockchain === 'litecoin') {
        endpoint = `/${normalizedBlockchain}/address/balance/${encodedAddress}`;
      } else if (normalizedBlockchain === 'ethereum' || normalizedBlockchain === 'eth') {
        endpoint = `/ethereum/account/balance/${encodedAddress}`;
      } else if (normalizedBlockchain === 'bsc' || normalizedBlockchain === 'binance' || normalizedBlockchain === 'binancesmartchain') {
        endpoint = `/bsc/account/balance/${encodedAddress}`;
      } else if (normalizedBlockchain === 'tron' || normalizedBlockchain === 'trx') {
        endpoint = `/tron/account/${encodedAddress}`;
      } else {
        // For other chains, encode the address in the endpoint
        endpoint = endpoint.replace(address, encodedAddress);
      }

      console.log(`Fetching balance from Tatum: ${this.baseUrl}${endpoint}`);
      const response = await this.axiosInstance.get(endpoint);
      
      // Normalize response format for different blockchains
      // Bitcoin/Litecoin returns: { incoming, outgoing, incomingPending, outgoingPending }
      // Ethereum/EVM returns: { balance: "0.5" }
      // Tron returns: { balance: "0.5", ... } or { account: { balance: "0.5", ... }, ... }
      if (normalizedBlockchain === 'bitcoin' || normalizedBlockchain === 'litecoin') {
        // Bitcoin/Litecoin returns incoming/outgoing, calculate net balance
        const incoming = new Decimal(response.data.incoming || '0');
        const outgoing = new Decimal(response.data.outgoing || '0');
        const balance = incoming.minus(outgoing);
        return {
          balance: balance.toString(),
          incoming: response.data.incoming,
          outgoing: response.data.outgoing,
          incomingPending: response.data.incomingPending,
          outgoingPending: response.data.outgoingPending,
          ...response.data,
        };
      } else if (normalizedBlockchain === 'tron' || normalizedBlockchain === 'trx') {
        // Tron account endpoint returns account object with balance
        // Check multiple possible response structures
        if (response.data.balance !== undefined) {
          return { balance: response.data.balance.toString(), ...response.data };
        } else if (response.data.account?.balance !== undefined) {
          return { 
            balance: response.data.account.balance.toString(),
            account: response.data.account,
            ...response.data 
          };
        } else if (response.data.data?.balance !== undefined) {
          return { balance: response.data.data.balance.toString(), ...response.data };
        } else if (response.data.trc20?.length > 0) {
          // Tron might return TRC20 tokens, calculate total balance
          const nativeBalance = response.data.balance || '0';
          return { balance: nativeBalance.toString(), ...response.data };
        }
        // Return full response if balance not found in expected format
        return response.data;
      } else if (response.data.balance !== undefined) {
        // Ethereum and other EVM chains
        const result: any = { balance: response.data.balance.toString(), ...response.data };
        
        // Fetch fungible token balances for supported chains if requested
        // Only returns tokens that are in our wallet_currencies table
        if (includeTokens) {
          const supportedChainsForTokens = ['ethereum', 'eth', 'polygon', 'matic', 'celo', 'solana', 'sol', 'algorand', 'algo', 'bsc', 'binance', 'binancesmartchain'];
          if (supportedChainsForTokens.includes(normalizedBlockchain)) {
            try {
              const tokenBalances = await this.getSupportedTokenBalances(blockchain, address);
              result.tokens = tokenBalances;
            } catch (tokenError: any) {
              // Log but don't fail - token balances are optional
              console.error(`Failed to fetch token balances:`, tokenError.message);
              result.tokens = [];
            }
          }
        }
        
        return result;
      } else if (response.data.account?.balance !== undefined) {
        return { balance: response.data.account.balance.toString(), ...response.data };
      } else if (response.data.data?.balance !== undefined) {
        return { balance: response.data.data.balance.toString(), ...response.data };
      }
      
      return response.data;
    } catch (error: any) {
      // Log the error with full details for debugging
      const errorDetails = error.response?.data || error.message;
      console.error(`Error getting address balance for ${blockchain}:`, errorDetails);
      throw new Error(
        `Failed to get address balance: ${error.response?.data?.message || error.message}`
      );
    }
  }
}

export default new TatumService();

```

---

## 6) virtual.account.service.ts

```ts
/**
 * Virtual Account Service
 * 
 * Handles virtual account creation and management
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';
import { randomUUID } from 'crypto';

class VirtualAccountService {
  /**
   * Keep only one USDC variant for frontend display: ERC-20 / Ethereum.
   */
  private isAllowedUsdcAccount(account: {
    currency: string;
    blockchain: string;
    walletCurrency?: { blockchainName?: string | null } | null;
  }) {
    const currency = (account.currency || '').toUpperCase();
    const isUsdc = currency === 'USDC' || currency.startsWith('USDC_');
    if (!isUsdc) return true;

    const blockchain = (account.blockchain || '').toLowerCase();
    const blockchainName = (account.walletCurrency?.blockchainName || '').toLowerCase();

    return (
      blockchain === 'ethereum' ||
      blockchain === 'eth' ||
      blockchain === 'erc20' ||
      blockchainName.includes('erc-20') ||
      blockchainName.includes('erc20') ||
      blockchainName.includes('ethereum')
    );
  }

  /**
   * Create virtual accounts for a user (all supported currencies)
   */
  async createVirtualAccountsForUser(userId: number) {
    try {
      // Get all supported wallet currencies (both native and tokens)
      // Token currencies like USDT, USDC will share addresses with their base blockchain
      const walletCurrencies = await prisma.walletCurrency.findMany({
        // Create virtual accounts for all currencies (native and tokens)
        // Address sharing logic is handled in deposit.address.service.ts
      });

      const createdAccounts = [];

      for (const currency of walletCurrencies) {
        try {
          // Check if virtual account already exists
          const existing = await prisma.virtualAccount.findFirst({
            where: {
              userId,
              currency: currency.currency,
              blockchain: currency.blockchain,
            },
          });

          if (existing) {
            console.log(`Virtual account for ${currency.currency} already exists for user ${userId}`);
            createdAccounts.push(existing);
            continue;
          }

          // Generate our own accountId (UUID)
          const accountId = randomUUID();
          const accountCode = `user_${userId}_${currency.currency}`;

          // Create virtual account in our own system (not in Tatum)
          const virtualAccount = await prisma.virtualAccount.create({
            data: {
              userId,
              blockchain: currency.blockchain,
              currency: currency.currency,
              customerId: String(userId), // Use userId as customerId
              accountId: accountId,
              accountCode: accountCode,
              active: true,
              frozen: false,
              accountBalance: '0',
              availableBalance: '0',
              accountingCurrency: 'USD',
              currencyId: currency.id,
            },
          });

          createdAccounts.push(virtualAccount);
          console.log(`Virtual account created for user ${userId}, currency: ${currency.currency}`);
        } catch (error: any) {
          console.error(
            `Error creating virtual account for ${currency.currency}:`,
            error.message
          );
          // Continue with other currencies even if one fails
        }
      }

      return createdAccounts;
    } catch (error: any) {
      console.error(`Error creating virtual accounts for user ${userId}:`, error);
      throw new Error(`Failed to create virtual accounts: ${error.message}`);
    }
  }

  /**
   * Get user's virtual accounts
   */
  async getUserVirtualAccounts(userId: number) {
    const accounts = await prisma.virtualAccount.findMany({
      where: { userId },
      include: {
        walletCurrency: true,
        depositAddresses: {
          select: {
            id: true,
            address: true,
            blockchain: true,
            currency: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return accounts.filter((account) => this.isAllowedUsdcAccount(account));
  }

  /**
   * Get virtual account by ID
   */
  async getVirtualAccountById(accountId: string) {
    return await prisma.virtualAccount.findUnique({
      where: { accountId },
      include: {
        walletCurrency: true,
        depositAddresses: true,
      },
    });
  }

  /**
   * Update virtual account balance from Tatum
   * Note: Since we're not using Tatum virtual accounts, this method is kept for compatibility
   * but balance updates should be handled through webhook processing or manual updates
   */
  async updateBalanceFromTatum(accountId: string) {
    try {
      const account = await this.getVirtualAccountById(accountId);
      if (!account) {
        throw new Error('Virtual account not found');
      }

      // Since we're not using Tatum virtual accounts, we can't fetch balance from Tatum
      // Balance updates should be handled through webhook processing or manual updates
      console.log(`Balance update requested for account ${accountId}, but Tatum account doesn't exist`);
      
      // Return the current account without updating
      return account;
    } catch (error: any) {
      console.error(`Error updating balance for account ${accountId}:`, error);
      throw new Error(`Failed to update balance: ${error.message}`);
    }
  }
}

export default new VirtualAccountService();

```

---

## 7) deposit.address.service.ts

```ts
/**
 * Deposit Address Service
 * 
 * Handles deposit address generation and assignment
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';
import masterWalletService from './master.wallet.service';
import userWalletService from '../user/user.wallet.service';
import crypto from 'crypto';

// Blockchain groups that share the same address
// All currencies on the same base blockchain share the same address
// This maps blockchain name variations to the base blockchain name used for master wallet lookup
// Note: In the database, blockchain field stores the actual blockchain name (e.g., 'ethereum', 'tron', 'bsc')
// Currencies with the same blockchain value share the same address
const BLOCKCHAIN_NORMALIZATION: { [key: string]: string } = {
  // Ethereum variations
  'ethereum': 'ethereum',
  'eth': 'ethereum',
  // Tron variations  
  'tron': 'tron',
  'trx': 'tron',
  // BSC variations
  'bsc': 'bsc',
  'binance': 'bsc',
  'binancesmartchain': 'bsc',
};

/**
 * Encrypt private key
 */
function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const iv = crypto.randomBytes(16);
  // @ts-ignore - Buffer is valid for CipherKey, TypeScript type definition issue
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt private key
 */
function decryptPrivateKey(encryptedKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  // @ts-ignore - Buffer is valid for CipherKey, TypeScript type definition issue
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

class DepositAddressService {
  /**
   * Normalize blockchain name to base blockchain for master wallet lookup
   * e.g., 'ethereum' -> 'ethereum', 'eth' -> 'ethereum', 'tron' -> 'tron'
   */
  private normalizeBlockchain(blockchain: string): string {
    const normalized = blockchain.toLowerCase();
    return BLOCKCHAIN_NORMALIZATION[normalized] || normalized;
  }
  
  /**
   * Get all blockchain name variations that map to the same base blockchain
   * Used for finding existing addresses within the same blockchain group
   */
  private getBlockchainGroup(blockchain: string): string[] {
    const baseBlockchain = this.normalizeBlockchain(blockchain);
    
    // Find all blockchain variations that map to the same base blockchain
    const variations: string[] = [baseBlockchain];
    for (const [variant, base] of Object.entries(BLOCKCHAIN_NORMALIZATION)) {
      if (base === baseBlockchain && variant !== baseBlockchain) {
        variations.push(variant);
      }
    }
    
    return variations;
  }

  /**
   * Generate and assign deposit address to virtual account
   */
  async generateAndAssignToVirtualAccount(virtualAccountId: number) {
    try {
      // Get virtual account
      const virtualAccount = await prisma.virtualAccount.findUnique({
        where: { id: virtualAccountId },
        include: { walletCurrency: true },
      });

      if (!virtualAccount) {
        throw new Error('Virtual account not found');
      }

      const blockchain = virtualAccount.blockchain.toLowerCase();
      const currency = virtualAccount.currency.toLowerCase();

      console.log(`Checking for existing address - Blockchain: ${blockchain}, Currency: ${currency}`);

      // Normalize blockchain name for consistent comparison
      // All currencies on the same blockchain share the same address
      const normalizedBlockchain = this.normalizeBlockchain(blockchain);
      console.log(`Normalized blockchain: ${normalizedBlockchain}`);

      // Check for existing deposit address on the same blockchain for this user
      // Get all deposit addresses for this user first, then filter by normalized blockchain
      const allUserAddresses = await prisma.depositAddress.findMany({
        where: {
          virtualAccount: {
            userId: virtualAccount.userId,
          },
        },
        include: {
          virtualAccount: true,
        },
        orderBy: {
          createdAt: 'asc', // Get the first created address
        },
      });

      // Find existing address on the same normalized blockchain (case-insensitive comparison)
      // All currencies on the same blockchain share the same address
      const existingAddress = allUserAddresses.find((addr) => {
        if (!addr.blockchain) return false;
        const addrNormalizedBlockchain = this.normalizeBlockchain(addr.blockchain);
        // If normalized blockchains match, they share the same address
        return addrNormalizedBlockchain === normalizedBlockchain;
      });

      // If address exists in the same group, reuse it
      if (existingAddress) {
        console.log(`Found existing address in group: ${existingAddress.address} for blockchain ${existingAddress.blockchain}`);
        
        // Check if this virtual account already has this address
        const existingForThisAccount = await prisma.depositAddress.findFirst({
          where: {
            virtualAccountId,
            address: existingAddress.address,
          },
        });

        if (!existingForThisAccount) {
          // Ensure index exists (should always be present, but add safeguard)
          if (existingAddress.index === null || existingAddress.index === undefined) {
            console.warn(`Warning: Existing address ${existingAddress.address} has no index stored. This should not happen.`);
            throw new Error(`Cannot reuse address ${existingAddress.address}: index is missing`);
          }

          // Assign existing address to this virtual account
          // Store with current virtual account's currency and blockchain, but reuse the address and private key
          const depositAddress = await prisma.depositAddress.create({
            data: {
              virtualAccountId,
              userWalletId: existingAddress.userWalletId, // Preserve user wallet link if exists
              blockchain: blockchain, // Use current virtual account's blockchain
              currency: currency, // Use current virtual account's currency
              address: existingAddress.address, // Reuse the address
              index: existingAddress.index, // Store the index used for this address
              privateKey: existingAddress.privateKey, // Reuse encrypted key
            },
          });

          console.log(`Reused address ${existingAddress.address} with index ${existingAddress.index} for virtual account ${virtualAccountId} (${blockchain}/${currency})`);

          // Note: Webhook should already be registered for this address when it was first created
          // Skip webhook registration when reusing addresses to avoid duplicates
          // The webhook will monitor all transactions to this address regardless of which currency uses it

          return depositAddress;
        } else {
          console.log(`Address ${existingAddress.address} already assigned to this virtual account`);
          return existingForThisAccount;
        }
      }

      // Generate new address
      // Use the normalized base blockchain for wallet lookup
      // All currencies on the same blockchain share the same address
      const baseBlockchain = this.normalizeBlockchain(blockchain);
      console.log(`Generating new address using base blockchain: ${baseBlockchain} (requested: ${blockchain})`);
      
      // Get or create user wallet (per-user wallet approach - mandatory)
      // Each user gets their own unique wallet per blockchain
      const userWallet = await userWalletService.getOrCreateUserWallet(virtualAccount.userId, baseBlockchain);
      
      if (!userWallet || !userWallet.mnemonic) {
        throw new Error(`Failed to get or create user wallet for user ${virtualAccount.userId}, blockchain ${baseBlockchain}`);
      }

      // Check if this blockchain doesn't use xpub (returns address directly)
      // Solana and XRP don't use xpub - they return address directly
      const isNoXpub = baseBlockchain === 'solana' || baseBlockchain === 'sol' || 
                       baseBlockchain === 'xrp' || baseBlockchain === 'ripple';

      // Decrypt user wallet mnemonic/secret
      let mnemonic: string;
      try {
        mnemonic = decryptPrivateKey(userWallet.mnemonic);
      } catch (error) {
        throw new Error('Failed to decrypt user wallet mnemonic/secret');
      }

      let address: string;
      let privateKey: string;
      const addressIndex = 0; // Always 0 for user wallet addresses (one per blockchain)

      if (isNoXpub) {
        // For Solana/XRP, check if we already have an address stored in xpub field
        // These blockchains don't use HD derivation - one mnemonic/secret = one address/private key pair
        if (userWallet.xpub) {
          // Address already stored from previous generation
          address = userWallet.xpub;
          console.log(`Using existing ${baseBlockchain} address ${address} from user wallet`);
          
          // For Solana/XRP, the mnemonic field stores the private key/secret directly
          // Solana: We store privateKey in mnemonic field (since Tatum returns it and we can't derive it from mnemonic via API)
          // XRP: We store secret in mnemonic field (secret IS the private key)
          if (baseBlockchain === 'xrp' || baseBlockchain === 'ripple') {
            // XRP: secret is the private key (stored in mnemonic field)
            privateKey = mnemonic;
          } else if (baseBlockchain === 'solana' || baseBlockchain === 'sol') {
            // Solana: privateKey is stored in mnemonic field (we store it during wallet creation)
            // This is because Tatum returns privateKey directly and we can't derive it from mnemonic via API
            privateKey = mnemonic;
            console.log(`Solana: Using stored private key from mnemonic field`);
          } else {
            // Other non-xpub blockchains: try to generate private key from mnemonic
            try {
              privateKey = await tatumService.generatePrivateKey(baseBlockchain, mnemonic, 0);
            } catch (error: any) {
              console.error(`Failed to generate ${baseBlockchain} private key from mnemonic:`, error.message);
              throw new Error(`Failed to get ${baseBlockchain} private key: ${error.message}`);
            }
          }
        } else {
          // First time generating wallet for this user
          // Solana/XRP wallet generation returns address and privateKey/secret directly (not xpub-based)
          console.log(`Generating ${baseBlockchain} wallet to get address and private key for user ${virtualAccount.userId}`);
          const walletData = await tatumService.createWallet(baseBlockchain);
          
          if (!walletData.address) {
            throw new Error(`Failed to generate ${baseBlockchain} wallet: missing address`);
          }

          address = walletData.address;
          // XRP uses 'secret', Solana uses 'privateKey'
          privateKey = walletData.privateKey || walletData.secret || '';
          
          if (!privateKey) {
            throw new Error(`Failed to generate ${baseBlockchain} wallet: missing privateKey/secret`);
          }

          // Store address in xpub field (since these blockchains don't have xpub)
          // This allows us to reuse the address later
          await prisma.userWallet.update({
            where: { id: userWallet.id },
            data: { xpub: address }, // Store address in xpub field
          });
          console.log(`Stored ${baseBlockchain} address ${address} in user wallet xpub field`);
        }

        console.log(`Using ${baseBlockchain} address ${address} (${userWallet.xpub ? 'existing' : 'newly generated'})`);
      } else {
        // For other blockchains, use xpub-based address generation
        if (!userWallet.xpub) {
          throw new Error(`Failed to get or create user wallet: missing xpub for ${baseBlockchain}`);
        }

        const xpub = userWallet.xpub;
        console.log(`Using user wallet for user ${virtualAccount.userId}, blockchain ${baseBlockchain}`);

        console.log(`Generating new address for ${blockchain} using user wallet (user ${virtualAccount.userId}) with index ${addressIndex}`);

        // Generate address using the user's wallet xpub and index 0
        address = await tatumService.generateAddress(
          baseBlockchain,
          xpub,
          addressIndex
        );

        // Generate private key using the user's wallet mnemonic and index 0
        privateKey = await tatumService.generatePrivateKey(
          baseBlockchain,
          mnemonic,
          addressIndex
        );
      }

      // Encrypt private key
      const encryptedPrivateKey = encryptPrivateKey(privateKey);

      // Store in database with the index used for address and private key generation
      // Always link to user wallet (per-user wallet approach)
      // Index is always 0 (one address per blockchain per user, like master wallet)
      const depositAddress = await prisma.depositAddress.create({
        data: {
          virtualAccountId,
          userWalletId: userWallet.id, // Always link to user wallet
          blockchain,
          currency,
          address,
          index: addressIndex, // Always 0 for user wallet addresses (one per blockchain)
          privateKey: encryptedPrivateKey,
        },
      });

      console.log(`Generated new address ${address} with index ${addressIndex} for virtual account ${virtualAccountId}`);

      // Register webhooks for this address (V4 API)
      // Use base blockchain for webhook registration
      // For blockchains that support fungible tokens, register both native and fungible subscriptions
      try {
        const webhookUrl = process.env.TATUM_WEBHOOK_URL || `${process.env.BASE_URL}/api/v2/webhooks/tatum`;
        
        // Check if this blockchain supports fungible tokens
        const hasFungibleTokens = await prisma.walletCurrency.findFirst({
          where: {
            blockchain: baseBlockchain.toLowerCase(),
            isToken: true,
            contractAddress: { not: null },
          },
        });

        // Always register native token subscription
        try {
          await tatumService.registerAddressWebhookV4(
            address,
            baseBlockchain,
            webhookUrl,
            {
              type: 'INCOMING_NATIVE_TX',
            }
          );
          console.log(`INCOMING_NATIVE_TX webhook registered for address ${address} on ${baseBlockchain}`);
        } catch (error: any) {
          console.error(`Failed to register INCOMING_NATIVE_TX webhook for address ${address}:`, error.message);
          // Continue - don't fail if one subscription fails
        }

        // Register fungible token subscription if blockchain supports tokens
        if (hasFungibleTokens) {
          try {
            await tatumService.registerAddressWebhookV4(
              address,
              baseBlockchain,
              webhookUrl,
              {
                type: 'INCOMING_FUNGIBLE_TX',
              }
            );
            console.log(`INCOMING_FUNGIBLE_TX webhook registered for address ${address} on ${baseBlockchain}`);
          } catch (error: any) {
            console.error(`Failed to register INCOMING_FUNGIBLE_TX webhook for address ${address}:`, error.message);
            // Continue - don't fail if one subscription fails
          }
        }
      } catch (error: any) {
        console.error(`Failed to register webhooks for address ${address}:`, error.message);
        // Don't fail the whole process if webhook registration fails
      }

      return depositAddress;
    } catch (error: any) {
      console.error(`Error generating deposit address:`, error);
      throw new Error(`Failed to generate deposit address: ${error.message}`);
    }
  }

  /**
   * Get deposit address for a user's virtual account
   */
  async getDepositAddress(userId: number, currency: string, blockchain: string) {
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency,
        blockchain,
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!virtualAccount || !virtualAccount.depositAddresses.length) {
      throw new Error('Deposit address not found');
    }

    return {
      address: virtualAccount.depositAddresses[0].address,
      blockchain: virtualAccount.depositAddresses[0].blockchain,
      currency: virtualAccount.depositAddresses[0].currency,
      virtualAccountId: virtualAccount.id,
    };
  }
}

export default new DepositAddressService();

```

---

## 8) master.wallet.service.ts

```ts
/**
 * Master Wallet Service
 * 
 * Handles master wallet creation and management
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';
import crypto from 'crypto';

export interface CreateMasterWalletParams {
  blockchain: string;
  endpoint: string;
}

/**
 * Encrypt private key
 */
function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const iv = crypto.randomBytes(16);
  // @ts-ignore - Buffer is valid for CipherKey, TypeScript type definition issue
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt private key
 */
function decryptPrivateKey(encryptedKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  // @ts-ignore - Buffer is valid for CipherKey, TypeScript type definition issue
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

class MasterWalletService {
  /**
   * Create a master wallet for a blockchain
   */
  async createMasterWallet(blockchain: string, endpoint: string) {
    try {
      // Check if master wallet already exists
      const existing = await prisma.masterWallet.findUnique({
        where: { blockchain },
      });

      if (existing) {
        console.log(`Master wallet for ${blockchain} already exists`);
        return existing;
      }

      // Generate wallet using Tatum API
      const walletData = await tatumService.createWallet(blockchain);

      // Check if blockchain doesn't use xpub (Solana, XRP)
      const isNoXpub = blockchain.toLowerCase() === 'solana' || blockchain.toLowerCase() === 'sol' ||
                       blockchain.toLowerCase() === 'xrp' || blockchain.toLowerCase() === 'ripple';

      // Generate address from xpub (index 0 for master wallet) or use direct address
      let address: string | null = null;
      let privateKey: string | null = null;

      if (isNoXpub) {
        // Solana/XRP: address is returned directly
        address = walletData.address || null;
        // XRP uses 'secret', Solana uses 'privateKey'
        privateKey = walletData.privateKey || walletData.secret || null;
      } else {
        // Other blockchains: generate from xpub
        try {
          if (walletData.xpub) {
            address = await tatumService.generateAddress(blockchain, walletData.xpub, 0);
          }
        } catch (error: any) {
          console.warn(`Could not generate address for ${blockchain}:`, error.message);
          address = walletData.address || null;
        }

        // Generate private key from mnemonic (index 0 for master wallet)
        try {
          if (walletData.mnemonic) {
            privateKey = await tatumService.generatePrivateKey(blockchain, walletData.mnemonic, 0);
          }
        } catch (error: any) {
          console.warn(`Could not generate private key for ${blockchain}:`, error.message);
          // Some blockchains might return private key directly
          privateKey = walletData.privateKey || null;
        }
      }

      // Encrypt sensitive data before storing
      const encryptedPrivateKey = privateKey
        ? encryptPrivateKey(privateKey)
        : null;
      const encryptedMnemonic = walletData.mnemonic
        ? encryptPrivateKey(walletData.mnemonic) // Reuse encryption function for mnemonic
        : null;

      // Store in database
      const masterWallet = await prisma.masterWallet.create({
        data: {
          blockchain,
          xpub: walletData.xpub || null,
          address: address,
          privateKey: encryptedPrivateKey,
          mnemonic: encryptedMnemonic,
          response: JSON.stringify(walletData),
        },
      });

      console.log(`Master wallet created for ${blockchain}`);
      return masterWallet;
    } catch (error: any) {
      console.error(`Error creating master wallet for ${blockchain}:`, error);
      throw new Error(`Failed to create master wallet: ${error.message}`);
    }
  }

  /**
   * Get master wallet by blockchain
   */
  async getMasterWallet(blockchain: string, includeDecrypted: boolean = false) {
    const masterWallet = await prisma.masterWallet.findUnique({
      where: { blockchain },
    });

    if (!masterWallet) {
      throw new Error(`Master wallet not found for blockchain: ${blockchain}`);
    }

    // Decrypt sensitive data if requested (use with caution!)
    if (includeDecrypted) {
      return {
        ...masterWallet,
        privateKey: masterWallet.privateKey ? decryptPrivateKey(masterWallet.privateKey) : null,
        mnemonic: masterWallet.mnemonic ? decryptPrivateKey(masterWallet.mnemonic) : null,
      };
    }

    return masterWallet;
  }

  /**
   * Get all master wallets
   */
  async getAllMasterWallets() {
    return await prisma.masterWallet.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create master wallets for all supported blockchains
   * Gets blockchains from wallet_currencies table to ensure we only create wallets for currencies that exist
   */
  async createAllMasterWallets() {
    // Get unique blockchains from wallet_currencies table
    const walletCurrencies = await prisma.walletCurrency.findMany({
      select: {
        blockchain: true,
      },
      distinct: ['blockchain'],
    });

    // Map blockchain names to their endpoints
    // Some blockchains use different endpoints (e.g., XRP uses /account instead of /wallet)
    const getEndpoint = (blockchain: string): string => {
      const normalized = blockchain.toLowerCase();
      if (normalized === 'xrp' || normalized === 'ripple') {
        return '/xrp/account'; // XRP uses /account endpoint, not /wallet
      }
      return `/${normalized}/wallet`;
    };

    // Create list of blockchains with their endpoints
    const supportedBlockchains = walletCurrencies.map((wc) => ({
      blockchain: wc.blockchain.toLowerCase(),
      endpoint: getEndpoint(wc.blockchain),
    }));

    console.log(`Found ${supportedBlockchains.length} unique blockchains in wallet_currencies:`, 
      supportedBlockchains.map(b => b.blockchain).join(', '));

    const results = [];
    const errors = [];

    for (const { blockchain, endpoint } of supportedBlockchains) {
      try {
        // Check if wallet already exists
        const existing = await prisma.masterWallet.findUnique({
          where: { blockchain },
        });

        if (existing) {
          results.push({ blockchain, status: 'exists', wallet: existing });
        } else {
          const wallet = await this.createMasterWallet(blockchain, endpoint);
          results.push({ blockchain, status: 'created', wallet });
        }
      } catch (error: any) {
        errors.push({ blockchain, error: error.message || 'Unknown error' });
      }
    }

    return {
      success: results.filter((r) => r.status === 'created').length,
      existing: results.filter((r) => r.status === 'exists').length,
      errorCount: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Update existing master wallet with missing address and private key
   * Use this to populate missing data for existing wallets
   */
  async updateMasterWalletData(blockchain: string) {
    try {
      const masterWallet = await prisma.masterWallet.findUnique({
        where: { blockchain },
      });

      if (!masterWallet) {
        throw new Error(`Master wallet not found for blockchain: ${blockchain}`);
      }

      // If address and private key already exist, skip
      if (masterWallet.address && masterWallet.privateKey) {
        console.log(`Master wallet for ${blockchain} already has address and private key`);
        return masterWallet;
      }

      // Decrypt mnemonic if needed
      let mnemonic: string | null = null;
      if (masterWallet.mnemonic) {
        try {
          mnemonic = decryptPrivateKey(masterWallet.mnemonic);
        } catch (error) {
          // If decryption fails, mnemonic might be stored in plaintext (old format)
          mnemonic = masterWallet.mnemonic;
        }
      }

      if (!mnemonic) {
        throw new Error(`Mnemonic not found for ${blockchain}`);
      }

      // Generate address from xpub (index 0)
      let address: string | null = masterWallet.address;
      if (!address && masterWallet.xpub) {
        try {
          address = await tatumService.generateAddress(blockchain, masterWallet.xpub, 0);
        } catch (error: any) {
          console.warn(`Could not generate address for ${blockchain}:`, error.message);
        }
      }

      // Generate private key from mnemonic (index 0)
      let privateKey: string | null = null;
      if (!masterWallet.privateKey) {
        try {
          privateKey = await tatumService.generatePrivateKey(blockchain, mnemonic, 0);
          // Encrypt before storing
          privateKey = encryptPrivateKey(privateKey);
        } catch (error: any) {
          console.warn(`Could not generate private key for ${blockchain}:`, error.message);
        }
      } else {
        privateKey = masterWallet.privateKey; // Keep existing encrypted key
      }

      // Update wallet with generated data
      const updated = await prisma.masterWallet.update({
        where: { blockchain },
        data: {
          address: address || undefined,
          privateKey: privateKey || undefined,
        },
      });

      console.log(`Master wallet updated for ${blockchain}`);
      return updated;
    } catch (error: any) {
      console.error(`Error updating master wallet for ${blockchain}:`, error);
      throw new Error(`Failed to update master wallet: ${error.message}`);
    }
  }

  /**
   * Update all existing master wallets with missing data
   */
  async updateAllMasterWallets() {
    const wallets = await prisma.masterWallet.findMany();
    const results = [];

    for (const wallet of wallets) {
      try {
        const updated = await this.updateMasterWalletData(wallet.blockchain);
        results.push({ blockchain: wallet.blockchain, status: 'updated', wallet: updated });
      } catch (error: any) {
        results.push({ blockchain: wallet.blockchain, status: 'error', error: error.message });
      }
    }

    return {
      total: wallets.length,
      updated: results.filter((r) => r.status === 'updated').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };
  }

  /**
   * Lock master wallet for address generation (prevents race conditions)
   */
  async lockMasterWallet(blockchain: string): Promise<any> {
    // In a production environment, you might want to use Redis locks
    // For now, we'll use a simple database transaction
    return await prisma.masterWallet.findUnique({
      where: { blockchain },
    });
  }
}

export default new MasterWalletService();

```

---

## 9) tatum.logger.ts

```ts
/**
 * Tatum Logger Utility
 * 
 * Dedicated logging service for Tatum-related operations
 * Writes logs to a dedicated tatum.log file
 */

import fs from 'fs';
import path from 'path';

class TatumLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'tatum.log');

    // Ensure logs directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Format log entry with timestamp
   */
  private formatLogEntry(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data }),
    };
    return JSON.stringify(logEntry) + '\n';
  }

  /**
   * Write log entry to file
   */
  private writeLog(level: string, message: string, data?: any): void {
    try {
      const logEntry = this.formatLogEntry(level, message, data);
      fs.appendFileSync(this.logFile, logEntry, 'utf8');
    } catch (error) {
      // Fallback to console if file write fails
      console.error('Failed to write to tatum.log:', error);
      console.log(`[${level}] ${message}`, data || '');
    }
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.writeLog('INFO', message, data);
    console.log(`[TATUM INFO] ${message}`, data || '');
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.writeLog('WARN', message, data);
    console.warn(`[TATUM WARN] ${message}`, data || '');
  }

  /**
   * Log error message
   */
  error(message: string, error?: any, data?: any): void {
    const errorData = {
      message: error?.message || message,
      stack: error?.stack,
      name: error?.name,
      ...(data && { context: data }),
    };
    this.writeLog('ERROR', message, errorData);
    console.error(`[TATUM ERROR] ${message}`, errorData);
  }

  /**
   * Log webhook received
   */
  webhookReceived(webhookData: any, headers?: any, ipAddress?: string): void {
    this.writeLog('WEBHOOK_RECEIVED', 'Tatum webhook received', {
      webhookData,
      headers,
      ipAddress,
    });
    console.log('[TATUM WEBHOOK] Received webhook:', {
      accountId: webhookData?.accountId,
      reference: webhookData?.reference,
      txId: webhookData?.txId,
    });
  }

  /**
   * Log webhook processing
   */
  webhookProcessing(webhookData: any): void {
    this.writeLog('WEBHOOK_PROCESSING', 'Processing webhook', webhookData);
    console.log('[TATUM WEBHOOK] Processing:', {
      accountId: webhookData?.accountId,
      reference: webhookData?.reference,
    });
  }

  /**
   * Log webhook processed
   */
  webhookProcessed(result: any): void {
    this.writeLog('WEBHOOK_PROCESSED', 'Webhook processed successfully', result);
    console.log('[TATUM WEBHOOK] Processed:', result);
  }

  /**
   * Log virtual account operation
   */
  virtualAccount(operation: string, details: any): void {
    this.writeLog('VIRTUAL_ACCOUNT', operation, details);
    console.log(`[TATUM VA] ${operation}:`, details);
  }

  /**
   * Log balance update
   */
  balanceUpdate(accountId: string, balance: any, details?: any): void {
    this.writeLog('BALANCE_UPDATE', 'Balance updated', {
      accountId,
      balance,
      ...details,
    });
    console.log('[TATUM BALANCE] Updated:', { accountId, balance });
  }

  /**
   * Log exception/error with full context
   */
  exception(operation: string, error: any, context?: any): void {
    const exceptionData = {
      operation,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      },
      context,
    };
    
    this.writeLog('EXCEPTION', `Exception in ${operation}`, exceptionData);
    console.error(`[TATUM EXCEPTION] ${operation}:`, exceptionData);
  }

  /**
   * Log API call to Tatum
   */
  apiCall(endpoint: string, request?: any, response?: any, error?: any): void {
    const logData: any = {
      endpoint,
    };
    
    if (request) logData.request = request;
    if (response) logData.response = response;
    if (error) {
      logData.error = {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      };
    }

    const level = error ? 'ERROR' : 'INFO';
    this.writeLog(level, `API call to Tatum ${endpoint}`, logData);
    
    if (error) {
      console.error(`[TATUM API ERROR] ${endpoint}:`, error);
    } else {
      console.log(`[TATUM API] ${endpoint}`);
    }
  }
}

// Export singleton instance
export const tatumLogger = new TatumLogger();
export default tatumLogger;

```

---

## 10) tatum.webhook.controller.ts

```ts
/**
 * Tatum Webhook Controller
 * 
 * Handles incoming webhooks from Tatum
 */

import { Request, Response, NextFunction } from 'express';
import { processBlockchainWebhook } from '../../jobs/tatum/process.webhook.job';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import tatumLogger from '../../utils/tatum.logger';

/**
 * Receive Tatum webhook
 * POST /api/v2/webhooks/tatum
 */
export const tatumWebhookController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let rawWebhookId: number | null = null;

  try {
    const webhookData = req.body;

    // ============================================
    // ✅ SAVE RAW WEBHOOK IMMEDIATELY
    // ============================================
    try {
      const rawWebhook = await prisma.tatumRawWebhook.create({
        data: {
          rawData: JSON.stringify(webhookData),
          headers: JSON.stringify(req.headers),
          ipAddress: req.ip || req.socket.remoteAddress || null,
          userAgent: req.get('user-agent') || null,
          processed: false,
        },
      });

      rawWebhookId = rawWebhook.id;
      tatumLogger.webhookReceived(webhookData, req.headers, req.ip);
      tatumLogger.info(`Saved raw Tatum webhook (ID: ${rawWebhookId})`, {
        rawWebhookId,
        accountId: webhookData?.accountId,
        reference: webhookData?.reference,
        txId: webhookData?.txId,
      });
    } catch (saveError: any) {
      tatumLogger.exception('Save raw Tatum webhook', saveError, {
        webhookData: webhookData?.accountId || 'unknown',
      });
      // Continue even if save fails - don't block webhook receipt
    }

    // Process webhook asynchronously (don't block response)
    // Update raw webhook after processing
    processBlockchainWebhook(webhookData)
      .then(async (result) => {
        if (rawWebhookId) {
          try {
            const errorMessage = result && result.processed === false && 'reason' in result 
              ? (result as { processed: false; reason: string }).reason || 'Not processed'
              : null;

            await prisma.tatumRawWebhook.update({
              where: { id: rawWebhookId },
              data: {
                processed: true,
                processedAt: new Date(),
                ...(errorMessage ? { errorMessage } : {}),
              },
            });
            tatumLogger.info(`Marked raw webhook ${rawWebhookId} as processed`, { rawWebhookId, result });
          } catch (updateError: any) {
            tatumLogger.exception('Update raw webhook status', updateError, { rawWebhookId });
          }
        }
      })
      .catch(async (error) => {
        tatumLogger.exception('Process Tatum webhook', error, {
          rawWebhookId,
          webhookData: webhookData?.accountId || 'unknown',
        });
        
        if (rawWebhookId) {
          try {
            await prisma.tatumRawWebhook.update({
              where: { id: rawWebhookId },
              data: {
                processed: true,
                processedAt: new Date(),
                errorMessage: error?.message || 'Unknown error during processing',
              },
            });
          } catch (updateError: any) {
            tatumLogger.exception('Update raw webhook error status', updateError, { rawWebhookId });
          }
        }
      });

    // Return success immediately (Tatum expects 200 response)
    return new ApiResponse(200, { message: 'Webhook received' }, 'Webhook received successfully').send(res);
  } catch (error: any) {
    tatumLogger.exception('Tatum webhook controller', error, {
      rawWebhookId,
    });
    
    // Still return 200 to prevent Tatum from retrying
    return new ApiResponse(200, { message: 'Webhook received' }, 'Webhook received').send(res);
  }
};

```

---

## 11) process.webhook.job.ts

```ts
/**
 * Process Blockchain Webhook Job
 * 
 * Processes incoming webhooks from Tatum
 */

import { prisma } from '../../utils/prisma';
import virtualAccountService from '../../services/tatum/virtual.account.service';
import { TatumWebhookPayload } from '../../services/tatum/tatum.service';
import tatumLogger from '../../utils/tatum.logger';
import cryptoTransactionService from '../../services/crypto/crypto.transaction.service';
import { Decimal } from '@prisma/client/runtime/library';
import { sendPushNotification } from '../../utils/pushService';
import { InAppNotificationType } from '@prisma/client';

/**
 * Process blockchain webhook from Tatum
 */
export async function processBlockchainWebhook(webhookData: TatumWebhookPayload | any) {
  try {
    // Handle address-based webhooks (INCOMING_NATIVE_TX, INCOMING_FUNGIBLE_TX, or legacy ADDRESS_EVENT)
    const isAddressWebhook = webhookData.subscriptionType === 'ADDRESS_EVENT' 
      || webhookData.subscriptionType === 'INCOMING_NATIVE_TX'
      || webhookData.subscriptionType === 'INCOMING_FUNGIBLE_TX';
    const webhookAddress = webhookData.address || webhookData.to || webhookData.counterAddress;
    
    // Check if webhook address matches any master wallet - IGNORE these
    // This handles address-based webhooks (ADDRESS_EVENT) where transactions involve master wallet
    if (webhookAddress) {
      // Normalize address to lowercase for comparison (Ethereum addresses are case-insensitive)
      const normalizedAddress = webhookAddress.toLowerCase();
      
      // Check all master wallets (typically only a few, so in-memory filter is fine)
      const allMasterWallets = await prisma.masterWallet.findMany({
        where: { address: { not: null } },
      });
      
      const masterWallet = allMasterWallets.find(
        mw => mw.address?.toLowerCase() === normalizedAddress
      );

      if (masterWallet) {
        tatumLogger.info(`Ignoring webhook from master wallet address: ${webhookAddress}`, {
          address: webhookAddress,
          normalizedAddress,
          subscriptionType: webhookData.subscriptionType,
          txId: webhookData.txId,
          masterWalletId: masterWallet.id,
          blockchain: masterWallet.blockchain,
        });
        return { processed: false, reason: 'master_wallet' };
      }
    }

    // Handle address-based webhooks (INCOMING_NATIVE_TX, INCOMING_FUNGIBLE_TX, or legacy ADDRESS_EVENT)
    // These webhooks don't have accountId, but we can find the deposit address by matching the address
    if (isAddressWebhook && !webhookData.accountId) {
      const addressTxId = webhookData.txId || webhookData.txHash;
      const webhookAddr = webhookData.address?.toLowerCase();
      const counterAddress = webhookData.counterAddress?.toLowerCase();
      
      // If no counterAddress, it's a send transaction - ignore (we handle sends synchronously)
      if (!counterAddress) {
        tatumLogger.info('Address-based webhook without counterAddress - ignoring (send transaction)', {
          address: webhookAddr,
          txId: addressTxId,
          subscriptionType: webhookData.subscriptionType,
        });
        return { processed: false, reason: 'send_transaction_ignore' };
      }
      
      // Has counterAddress - this is a RECEIVE transaction
      // Find deposit address by matching the webhook address
      if (!webhookAddr) {
        tatumLogger.warn('Address-based webhook missing address field', {
          txId: addressTxId,
          subscriptionType: webhookData.subscriptionType,
        });
        return { processed: false, reason: 'missing_address' };
      }
      
      // Find deposit address with case-insensitive matching
      const allDepositAddresses = await prisma.depositAddress.findMany({
        include: {
          virtualAccount: {
            include: {
              walletCurrency: true,
            },
          },
        },
      });
      
      // Case-insensitive address matching
      const depositAddressRecord = allDepositAddresses.find(
        da => da.address.toLowerCase() === webhookAddr.toLowerCase()
      );
      
      if (!depositAddressRecord || !depositAddressRecord.virtualAccount) {
        tatumLogger.info('Address-based webhook - deposit address not found', {
          address: webhookAddr,
          txId: addressTxId,
          counterAddress,
        });
        return { processed: false, reason: 'deposit_address_not_found' };
      }
      
      // Process as receive transaction
      const addressVirtualAccount = depositAddressRecord.virtualAccount;
      const amountStr = webhookData.amount || '0';
      
      // Determine if this is a token transfer
      // For INCOMING_FUNGIBLE_TX, check contractAddress field
      // For ADDRESS_EVENT, check asset field and type
      const contractAddress = webhookData.contractAddress || webhookData.asset;
      const isFungibleToken = webhookData.subscriptionType === 'INCOMING_FUNGIBLE_TX' && contractAddress;
      const isToken = isFungibleToken || (contractAddress && contractAddress !== 'ETH' && webhookData.type === 'token');
      
      tatumLogger.info('Processing address-based webhook as receive transaction', {
        address: webhookAddr,
        counterAddress,
        amount: amountStr,
        contractAddress,
        subscriptionType: webhookData.subscriptionType,
        isToken,
        isFungibleToken,
        txId: addressTxId,
        virtualAccountId: addressVirtualAccount.id,
        userId: addressVirtualAccount.userId,
        currency: addressVirtualAccount.currency,
      });
      
      // Determine the correct currency based on contract address
      let detectedCurrency = addressVirtualAccount.currency;
      let targetVirtualAccount = addressVirtualAccount;
      
      // For token transfers, find the correct currency and virtual account
      if (isToken && contractAddress) {
        const walletCurrencies = await prisma.walletCurrency.findMany({
          where: {
            blockchain: addressVirtualAccount.blockchain.toLowerCase(),
            contractAddress: { not: null },
          },
        });
        
        // Case-insensitive contract address matching
        const walletCurrency = walletCurrencies.find(
          wc => wc.contractAddress?.toLowerCase() === contractAddress.toLowerCase()
        );
        
        if (walletCurrency) {
          detectedCurrency = walletCurrency.currency;
          
          // Find the correct virtual account for this currency
          const correctVirtualAccount = await prisma.virtualAccount.findFirst({
            where: {
              userId: addressVirtualAccount.userId,
              currency: walletCurrency.currency,
              blockchain: addressVirtualAccount.blockchain.toLowerCase(),
            },
            include: {
              walletCurrency: true,
            },
          });
          
          if (correctVirtualAccount) {
            targetVirtualAccount = correctVirtualAccount;
            tatumLogger.info('Found correct virtual account for token', {
              originalCurrency: addressVirtualAccount.currency,
              detectedCurrency: walletCurrency.currency,
              originalVirtualAccountId: addressVirtualAccount.id,
              targetVirtualAccountId: correctVirtualAccount.id,
              contractAddress,
            });
          } else {
            tatumLogger.warn('Virtual account not found for detected currency', {
              userId: addressVirtualAccount.userId,
              currency: walletCurrency.currency,
              blockchain: addressVirtualAccount.blockchain,
              contractAddress,
            });
          }
        }
      }
      
      // Process as receive - continue with normal flow using the correct virtualAccount
      // We'll set accountId to targetVirtualAccount.accountId for compatibility
      webhookData.accountId = targetVirtualAccount.accountId;
      webhookData.currency = detectedCurrency;
      // Set from and to addresses for address-based webhooks
      webhookData.from = counterAddress; // Sender
      webhookData.to = webhookAddr; // Receiver (our deposit address)
      
      // IMPORTANT: Check for duplicates and save WebhookResponse EARLY to "claim" this webhook
      // This must happen AFTER we've set up all the webhook data but BEFORE processing
      // This prevents race conditions where multiple webhooks arrive simultaneously
      if (addressTxId) {
        // Check for existing RECEIVE transaction (the real indicator that it's been processed)
        // Note: We only check for CryptoReceive, not CryptoSend, because a receive webhook
        // should only be blocked if we've already processed this receive transaction,
        // not if there's a send transaction with the same txHash
        // We don't check WebhookResponse because it might exist from a failed previous attempt
        const existingReceiveTx = await prisma.cryptoTransaction.findFirst({
          where: {
            transactionType: 'RECEIVE',
            cryptoReceive: { 
              txHash: addressTxId 
            }
          },
          include: {
            cryptoReceive: true,
          },
        });
        
        if (existingReceiveTx) {
          tatumLogger.info('Address-based webhook already processed (receive transaction exists)', {
            txId: addressTxId,
            address: webhookAddr,
            counterAddress,
            existingReceiveTxId: existingReceiveTx.id,
            transactionType: existingReceiveTx.transactionType,
          });
          return { processed: false, reason: 'duplicate_tx' };
        }
        
        // Save WebhookResponse EARLY to "claim" this webhook and prevent other processes from handling it
        // This must happen before we continue with processing to prevent race conditions
        const timestamp = webhookData.timestamp || Date.now();
        const transactionDateForClaim = new Date(timestamp);
        if (isNaN(transactionDateForClaim.getTime())) {
          transactionDateForClaim.setTime(Date.now());
        }
        
        // Try to save WebhookResponse (ignore if it already exists - we'll continue processing)
        // We only care if the actual receive transaction exists (checked above)
        try {
          await prisma.webhookResponse.create({
            data: {
              accountId: addressVirtualAccount.accountId,
              subscriptionType: webhookData.subscriptionType || 'ADDRESS_EVENT',
              amount: parseFloat(webhookData.amount || '0'),
              reference: webhookData.reference || null,
              currency: webhookData.currency || addressVirtualAccount.currency,
              txId: addressTxId || '',
              blockHeight: BigInt(webhookData.blockNumber || 0),
              blockHash: webhookData.blockHash || null,
              fromAddress: counterAddress || null,
              toAddress: webhookAddr || null,
              transactionDate: transactionDateForClaim,
              index: webhookData.logIndex || null,
            },
          });
        } catch (error: any) {
          // If it already exists, that's fine - we'll continue processing
          // The important check is whether the receive transaction exists (done above)
          tatumLogger.info('WebhookResponse might already exist, continuing anyway', {
            txId: addressTxId,
            error: error.message,
          });
          // Continue processing - don't block
        }
      }
    }

    const { accountId, reference, txId, amount, currency, from, to, date, timestamp, blockHeight, blockHash, index } = webhookData;
    
    // Handle date/timestamp - address-based webhooks use timestamp, others use date
    let transactionDate: Date;
    if (date) {
      transactionDate = new Date(date);
    } else if (timestamp) {
      // timestamp is in milliseconds
      transactionDate = new Date(timestamp);
    } else {
      // Default to now if neither is available
      transactionDate = new Date();
    }
    
    // Validate date
    if (isNaN(transactionDate.getTime())) {
      transactionDate = new Date();
    }

    if (!accountId) {
      tatumLogger.warn('Webhook missing accountId', {
        subscriptionType: webhookData.subscriptionType,
        txId: webhookData.txId,
        address: webhookAddress,
      });
      return { processed: false, reason: 'missing_account_id' };
    }

    tatumLogger.webhookProcessing(webhookData);

    // Check for duplicate RECEIVE transaction - only block if the actual transaction exists
    // For address-based webhooks, we already checked above, so skip this check
    if (!isAddressWebhook || webhookData.accountId) {
      const existingReceiveTx = await prisma.cryptoTransaction.findFirst({
        where: {
          transactionType: 'RECEIVE',
          OR: [
            { cryptoReceive: { txHash: txId } },
            ...(reference ? [{ cryptoReceive: { txHash: reference } }] : []),
          ],
        },
      });

      if (existingReceiveTx) {
        tatumLogger.warn(`Receive transaction already exists (txId: ${txId}, reference: ${reference})`, {
          accountId,
          reference,
          txId,
          existingTxId: existingReceiveTx.id,
        });
        return { processed: false, reason: 'duplicate' };
      }
    }

    // Check if from address is master wallet (ignore outbound transfers from master wallet)
    if (from) {
      const normalizedFrom = from.toLowerCase();
      const allMasterWallets = await prisma.masterWallet.findMany({
        where: { address: { not: null } },
      });
      const fromMasterWallet = allMasterWallets.find(
        mw => mw.address?.toLowerCase() === normalizedFrom
      );

      if (fromMasterWallet) {
        tatumLogger.info(`Ignoring webhook from master wallet: ${from}`, {
          accountId,
          reference,
          from,
          normalizedFrom,
          masterWalletId: fromMasterWallet.id,
          blockchain: fromMasterWallet.blockchain,
        });
        return { processed: false, reason: 'master_wallet' };
      }
    }

    // Get virtual account
    const virtualAccount = await virtualAccountService.getVirtualAccountById(accountId);
    if (!virtualAccount) {
      const error = new Error(`Virtual account not found: ${accountId}`);
      tatumLogger.exception('Get virtual account', error, {
        accountId,
        reference,
        txId,
      });
      return { processed: false, reason: 'account_not_found' };
    }

    tatumLogger.virtualAccount('Found virtual account', {
      accountId,
      virtualAccountId: virtualAccount.id,
      userId: virtualAccount.userId,
      currency: virtualAccount.currency,
      blockchain: virtualAccount.blockchain,
    });

    // Log webhook to WebhookResponse table (only if not already saved for address-based webhooks)
    let webhookResponse;
    if (isAddressWebhook && !webhookData.accountId) {
      // For address-based webhooks, we already saved it above, just fetch it
      webhookResponse = await prisma.webhookResponse.findFirst({
        where: { txId },
      });
      if (!webhookResponse) {
        // Fallback: create it if for some reason it doesn't exist
        webhookResponse = await prisma.webhookResponse.create({
          data: {
            accountId,
            subscriptionType: webhookData.subscriptionType,
            amount: parseFloat(amount),
            reference,
            currency,
            txId,
            blockHeight: BigInt(blockHeight || 0),
            blockHash,
            fromAddress: from,
            toAddress: to,
            transactionDate: transactionDate,
            index,
          },
        });
      }
    } else {
      // For non-address webhooks, create it now
      webhookResponse = await prisma.webhookResponse.create({
        data: {
          accountId,
          subscriptionType: webhookData.subscriptionType,
          amount: parseFloat(amount),
          reference,
          currency,
          txId,
          blockHeight: BigInt(blockHeight || 0),
          blockHash,
          fromAddress: from,
          toAddress: to,
          transactionDate: transactionDate,
          index,
        },
      });
    }

    tatumLogger.info('Webhook response logged', {
      webhookResponseId: webhookResponse.id,
      accountId,
      reference,
      txId,
      amount,
      currency,
    });

    // Update virtual account balance - credit the received amount
    tatumLogger.info('Updating virtual account balance', {
      accountId,
      virtualAccountId: virtualAccount.id,
      currency: virtualAccount.currency,
      amount,
    });

    const currentBalance = new Decimal(virtualAccount.accountBalance || '0');
    const receivedAmount = new Decimal(amount);
    const newBalance = currentBalance.plus(receivedAmount);

    const updatedVirtualAccount = await prisma.virtualAccount.update({
      where: { id: virtualAccount.id },
      data: {
        accountBalance: newBalance.toString(),
        availableBalance: newBalance.toString(),
      },
    });
    
    tatumLogger.balanceUpdate(accountId, updatedVirtualAccount, {
      virtualAccountId: virtualAccount.id,
      currency: virtualAccount.currency,
      balanceBefore: currentBalance.toString(),
      amountReceived: receivedAmount.toString(),
      balanceAfter: newBalance.toString(),
      reference,
      txId,
    });

    // Create received asset record
    const receivedAsset = await prisma.receivedAsset.create({
      data: {
        accountId,
        subscriptionType: webhookData.subscriptionType,
        amount: parseFloat(amount),
        reference,
        currency,
        txId,
        fromAddress: from,
        toAddress: to,
        transactionDate: transactionDate,
        status: 'inWallet',
        index,
        userId: virtualAccount.userId,
      },
    });

    tatumLogger.info('Received asset created', {
      receivedAssetId: receivedAsset.id,
      accountId,
      userId: virtualAccount.userId,
      amount,
      currency,
    });

    // Create receive transaction record
    const receiveTransaction = await prisma.receiveTransaction.create({
      data: {
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
        transactionType: 'on_chain',
        senderAddress: from,
        reference,
        txId,
        amount: parseFloat(amount),
        currency,
        blockchain: virtualAccount.blockchain,
        status: 'successful',
      },
    });

    tatumLogger.info('Receive transaction created', {
      receiveTransactionId: receiveTransaction.id,
      userId: virtualAccount.userId,
      virtualAccountId: virtualAccount.id,
      reference,
      txId,
    });

    // Send push notification for balance update and transaction creation
    try {
      await sendPushNotification({
        userId: virtualAccount.userId,
        title: 'Crypto Deposit Received',
        body: `You received ${receivedAmount.toString()} ${currency.toUpperCase()}. Your balance has been updated.`,
        sound: 'default',
        priority: 'high',
        data: {
          type: 'crypto_receive',
          transactionId: receiveTransaction.id.toString(),
          amount: receivedAmount.toString(),
          currency: currency.toUpperCase(),
          txHash: txId || '',
        },
      });

      await prisma.inAppNotification.create({
        data: {
          userId: virtualAccount.userId,
          title: 'Crypto Deposit Received',
          description: `You received ${receivedAmount.toString()} ${currency.toUpperCase()}. Transaction: ${txId || 'N/A'}`,
          type: InAppNotificationType.customeer,
        },
      });

      tatumLogger.info('Balance update and transaction notification sent', {
        userId: virtualAccount.userId,
        receiveTransactionId: receiveTransaction.id,
        amount: receivedAmount.toString(),
        currency,
      });
    } catch (notifError: any) {
      tatumLogger.exception('Send balance update notification', notifError, {
        userId: virtualAccount.userId,
        receiveTransactionId: receiveTransaction.id,
      });
      // Don't fail webhook processing if notification fails
    }

    // Create CryptoReceive transaction record
    try {
      // Get wallet currency for price calculation
      const walletCurrency = await prisma.walletCurrency.findFirst({
        where: {
          currency: currency.toUpperCase(),
          blockchain: virtualAccount.blockchain.toLowerCase(),
        },
      });

      // Calculate USD amount
      const amountDecimal = new Decimal(amount);
      const cryptoPrice = walletCurrency?.price ? new Decimal(walletCurrency.price.toString()) : new Decimal('1');
      const amountUsd = amountDecimal.mul(cryptoPrice);

      // Get USD to NGN rate for amountNaira (optional)
      const cryptoRate = await prisma.cryptoRate.findFirst({
        where: {
          transactionType: 'RECEIVE',
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      const usdToNgnRate = cryptoRate?.rate ? new Decimal(cryptoRate.rate.toString()) : new Decimal('1400');
      const amountNaira = amountUsd.mul(usdToNgnRate);

      // Generate transaction ID
      const transactionId = `RECEIVE-${Date.now()}-${virtualAccount.userId}-${Math.random().toString(36).substr(2, 9)}`;

      // Create CryptoReceive transaction
      const cryptoReceiveTx = await cryptoTransactionService.createReceiveTransaction({
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
        transactionId,
        fromAddress: from || '',
        toAddress: to || '',
        amount: amountDecimal.toString(),
        amountUsd: amountUsd.toString(),
        amountNaira: amountNaira.toString(),
        rate: cryptoPrice.toString(),
        txHash: txId || '',
        blockNumber: blockHeight ? BigInt(blockHeight) : undefined,
        confirmations: 0,
        status: 'successful',
      });

      tatumLogger.info('CryptoReceive transaction created', {
        cryptoTransactionId: cryptoReceiveTx.id,
        transactionId: cryptoReceiveTx.transactionId,
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
        currency,
        amount: amountDecimal.toString(),
        amountUsd: amountUsd.toString(),
        txHash: txId,
      });

      // Send enhanced notification with USD value (optional - first notification already sent above)
      // This provides additional details like USD value if available
      try {
        await sendPushNotification({
          userId: virtualAccount.userId,
          title: 'Crypto Deposit Confirmed',
          body: `Your deposit of ${amountDecimal.toString()} ${currency.toUpperCase()} is worth $${amountUsd.toFixed(2)}`,
          sound: 'default',
          priority: 'high',
          data: {
            type: 'crypto_receive_enhanced',
            transactionId: cryptoReceiveTx.transactionId,
            amount: amountDecimal.toString(),
            amountUsd: amountUsd.toString(),
            currency: currency.toUpperCase(),
            txHash: txId || '',
          },
        });

        tatumLogger.info('Enhanced receive transaction notification sent', {
          userId: virtualAccount.userId,
          transactionId: cryptoReceiveTx.transactionId,
          amountUsd: amountUsd.toString(),
        });
      } catch (notifError: any) {
        tatumLogger.exception('Send enhanced receive notification', notifError, {
          userId: virtualAccount.userId,
          transactionId: cryptoReceiveTx.transactionId,
        });
        // Don't fail webhook processing if notification fails
      }
    } catch (error: any) {
      // Log error but don't fail the webhook processing
      tatumLogger.exception('Failed to create CryptoReceive transaction', error, {
        accountId,
        txId,
        userId: virtualAccount.userId,
        virtualAccountId: virtualAccount.id,
      });
      // Continue processing - the ReceiveTransaction was already created
    }

    const result = {
      processed: true,
      accountId,
      reference,
      txId,
      amount,
      currency,
      userId: virtualAccount.userId,
      virtualAccountId: virtualAccount.id,
    };

    tatumLogger.webhookProcessed(result);

    return result;
  } catch (error: any) {
    tatumLogger.exception('Process blockchain webhook', error, {
      webhookData: {
        accountId: webhookData?.accountId,
        reference: webhookData?.reference,
        txId: webhookData?.txId,
      },
    });
    throw error;
  }
}

```

---

## 12) crypto.transaction.service.ts

```ts
/**
 * Crypto Transaction Service
 * 
 * Handles crypto transaction operations (Buy, Sell, Send, Receive)
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export type CryptoTxType = 'BUY' | 'SELL' | 'SEND' | 'RECEIVE' | 'SWAP';
export type CryptoTxStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'cancelled';

interface CreateCryptoBuyData {
  userId: number;
  virtualAccountId?: number;
  transactionId: string;
  fromAddress?: string;
  toAddress?: string;
  amount: string | number;
  amountUsd: string | number;
  amountNaira: string | number;
  rate?: string | number; // Legacy field
  rateNgnToUsd?: string | number; // NGN to USD rate (Naira per $1)
  rateUsdToCrypto?: string | number; // USD to Crypto rate (crypto price in USD)
  txHash?: string;
  status?: CryptoTxStatus;
}

interface CreateCryptoSellData {
  userId: number;
  virtualAccountId?: number;
  transactionId: string;
  fromAddress?: string;
  toAddress?: string;
  amount: string | number;
  amountUsd: string | number;
  amountNaira: string | number;
  rate?: string | number; // Legacy field
  rateCryptoToUsd?: string | number; // Crypto to USD rate (crypto price in USD)
  rateUsdToNgn?: string | number; // USD to NGN rate (Naira per $1)
  txHash?: string;
  status?: CryptoTxStatus;
}

interface CreateCryptoSendData {
  userId: number;
  virtualAccountId?: number;
  transactionId: string;
  fromAddress: string;
  toAddress: string;
  amount: string | number;
  amountUsd: string | number;
  amountNaira?: string | number;
  rate?: string | number;
  txHash: string;
  networkFee?: string | number;
  status?: CryptoTxStatus;
}

interface CreateCryptoReceiveData {
  userId: number;
  virtualAccountId?: number;
  transactionId: string;
  fromAddress: string;
  toAddress: string;
  amount: string | number;
  amountUsd: string | number;
  amountNaira?: string | number;
  rate?: string | number;
  txHash: string;
  blockNumber?: bigint | number;
  confirmations?: number;
  status?: CryptoTxStatus;
}

interface CreateCryptoSwapData {
  userId: number;
  fromVirtualAccountId?: number;
  toVirtualAccountId?: number;
  transactionId: string;
  fromAddress?: string;
  toAddress?: string;
  fromCurrency: string;
  fromBlockchain: string;
  fromAmount: string | number;
  fromAmountUsd: string | number;
  toCurrency: string;
  toBlockchain: string;
  toAmount: string | number;
  toAmountUsd: string | number;
  rateFromToUsd?: string | number;
  rateToToUsd?: string | number;
  gasFee: string | number;
  gasFeeUsd: string | number;
  totalAmount: string | number;
  totalAmountUsd: string | number;
  txHash?: string;
  status?: CryptoTxStatus;
}

class CryptoTransactionService {
  /**
   * Create a crypto buy transaction
   */
  async createBuyTransaction(data: CreateCryptoBuyData) {
    const { userId, virtualAccountId, transactionId, status = 'successful', ...buyData } = data;
    
    // Get virtual account to determine currency and blockchain
    const virtualAccount = virtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: virtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        userId,
        virtualAccountId,
        transactionType: 'BUY',
        transactionId,
        status,
        currency: virtualAccount?.currency || 'BTC',
        blockchain: virtualAccount?.blockchain || 'bitcoin',
        cryptoBuy: {
          create: {
            fromAddress: buyData.fromAddress || null,
            toAddress: buyData.toAddress || null,
            amount: new Decimal(buyData.amount),
            amountUsd: new Decimal(buyData.amountUsd),
            amountNaira: new Decimal(buyData.amountNaira),
            rate: buyData.rate ? new Decimal(buyData.rate) : null, // Legacy field
            rateNgnToUsd: buyData.rateNgnToUsd ? new Decimal(buyData.rateNgnToUsd) : null,
            rateUsdToCrypto: buyData.rateUsdToCrypto ? new Decimal(buyData.rateUsdToCrypto) : null,
            txHash: buyData.txHash || null,
          },
        },
      },
      include: {
        cryptoBuy: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Create a crypto sell transaction
   */
  async createSellTransaction(data: CreateCryptoSellData) {
    const { userId, virtualAccountId, transactionId, status = 'successful', ...sellData } = data;
    
    const virtualAccount = virtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: virtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        userId,
        virtualAccountId,
        transactionType: 'SELL',
        transactionId,
        status,
        currency: virtualAccount?.currency || 'BTC',
        blockchain: virtualAccount?.blockchain || 'bitcoin',
        cryptoSell: {
          create: {
            fromAddress: sellData.fromAddress || null,
            toAddress: sellData.toAddress || null,
            amount: new Decimal(sellData.amount),
            amountUsd: new Decimal(sellData.amountUsd),
            amountNaira: new Decimal(sellData.amountNaira),
            rate: sellData.rate ? new Decimal(sellData.rate) : null, // Legacy field
            rateCryptoToUsd: sellData.rateCryptoToUsd ? new Decimal(sellData.rateCryptoToUsd) : null,
            rateUsdToNgn: sellData.rateUsdToNgn ? new Decimal(sellData.rateUsdToNgn) : null,
            txHash: sellData.txHash || null,
          },
        },
      },
      include: {
        cryptoSell: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Create a crypto send transaction
   */
  async createSendTransaction(data: CreateCryptoSendData) {
    const { userId, virtualAccountId, transactionId, status = 'successful', ...sendData } = data;
    
    const virtualAccount = virtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: virtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        userId,
        virtualAccountId,
        transactionType: 'SEND',
        transactionId,
        status,
        currency: virtualAccount?.currency || 'BTC',
        blockchain: virtualAccount?.blockchain || 'bitcoin',
        cryptoSend: {
          create: {
            fromAddress: sendData.fromAddress,
            toAddress: sendData.toAddress,
            amount: new Decimal(sendData.amount),
            amountUsd: new Decimal(sendData.amountUsd),
            amountNaira: sendData.amountNaira ? new Decimal(sendData.amountNaira) : null,
            rate: sendData.rate ? new Decimal(sendData.rate) : null,
            txHash: sendData.txHash,
            networkFee: sendData.networkFee ? new Decimal(sendData.networkFee) : null,
          },
        },
      },
      include: {
        cryptoSend: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Create a crypto receive transaction
   */
  async createReceiveTransaction(data: CreateCryptoReceiveData) {
    const { userId, virtualAccountId, transactionId, status = 'successful', ...receiveData } = data;
    
    const virtualAccount = virtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: virtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        userId,
        virtualAccountId,
        transactionType: 'RECEIVE',
        transactionId,
        status,
        currency: virtualAccount?.currency || 'BTC',
        blockchain: virtualAccount?.blockchain || 'bitcoin',
        cryptoReceive: {
          create: {
            fromAddress: receiveData.fromAddress,
            toAddress: receiveData.toAddress,
            amount: new Decimal(receiveData.amount),
            amountUsd: new Decimal(receiveData.amountUsd),
            amountNaira: receiveData.amountNaira ? new Decimal(receiveData.amountNaira) : null,
            rate: receiveData.rate ? new Decimal(receiveData.rate) : null,
            txHash: receiveData.txHash,
            blockNumber: receiveData.blockNumber ? BigInt(receiveData.blockNumber) : null,
            confirmations: receiveData.confirmations || 0,
          },
        },
      },
      include: {
        cryptoReceive: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Create a crypto swap transaction
   */
  async createSwapTransaction(data: CreateCryptoSwapData) {
    const { userId, fromVirtualAccountId, toVirtualAccountId, transactionId, status = 'successful', ...swapData } = data;
    
    // Get virtual accounts to determine currencies and blockchains
    const fromVirtualAccount = fromVirtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: fromVirtualAccountId } })
      : null;
    const toVirtualAccount = toVirtualAccountId
      ? await prisma.virtualAccount.findUnique({ where: { id: toVirtualAccountId } })
      : null;

    const cryptoTransaction = await prisma.cryptoTransaction.create({
      data: {
        userId,
        virtualAccountId: fromVirtualAccountId, // Primary virtual account (the one being debited)
        transactionType: 'SWAP',
        transactionId,
        status,
        currency: swapData.fromCurrency,
        blockchain: swapData.fromBlockchain,
        cryptoSwap: {
          create: {
            fromAddress: swapData.fromAddress || null,
            toAddress: swapData.toAddress || null,
            fromCurrency: swapData.fromCurrency,
            fromBlockchain: swapData.fromBlockchain,
            fromAmount: new Decimal(swapData.fromAmount),
            fromAmountUsd: new Decimal(swapData.fromAmountUsd),
            toCurrency: swapData.toCurrency,
            toBlockchain: swapData.toBlockchain,
            toAmount: new Decimal(swapData.toAmount),
            toAmountUsd: new Decimal(swapData.toAmountUsd),
            rateFromToUsd: swapData.rateFromToUsd ? new Decimal(swapData.rateFromToUsd) : null,
            rateToToUsd: swapData.rateToToUsd ? new Decimal(swapData.rateToToUsd) : null,
            gasFee: new Decimal(swapData.gasFee),
            gasFeeUsd: new Decimal(swapData.gasFeeUsd),
            totalAmount: new Decimal(swapData.totalAmount),
            totalAmountUsd: new Decimal(swapData.totalAmountUsd),
            txHash: swapData.txHash || null,
          },
        },
      },
      include: {
        cryptoSwap: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    return cryptoTransaction;
  }

  /**
   * Get user's crypto transactions
   */
  async getUserTransactions(
    userId: number,
    transactionType?: CryptoTxType,
    limit: number = 50,
    offset: number = 0
  ) {
    const where: any = { userId };
    if (transactionType) {
      where.transactionType = transactionType;
    }

    const [transactions, total] = await Promise.all([
      prisma.cryptoTransaction.findMany({
        where,
        include: {
          cryptoBuy: true,
          cryptoSell: true,
          cryptoSend: true,
          cryptoReceive: true,
          cryptoSwap: true,
          virtualAccount: {
            include: {
              walletCurrency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.cryptoTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((tx) => this.formatTransaction(tx)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transactionId: string, userId?: number) {
    const where: any = { transactionId };
    if (userId) {
      where.userId = userId;
    }

    const transaction = await prisma.cryptoTransaction.findUnique({
      where,
      include: {
        cryptoBuy: true,
        cryptoSell: true,
        cryptoSend: true,
        cryptoReceive: true,
        cryptoSwap: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });

    if (!transaction) {
      return null;
    }

    return this.formatTransaction(transaction);
  }

  /**
   * Get transactions for a specific virtual account
   */
  async getVirtualAccountTransactions(
    userId: number,
    virtualAccountId: number,
    limit: number = 50,
    offset: number = 0
  ) {
    const [transactions, total] = await Promise.all([
      prisma.cryptoTransaction.findMany({
        where: {
          userId,
          virtualAccountId,
        },
        include: {
          cryptoBuy: true,
          cryptoSell: true,
          cryptoSend: true,
          cryptoReceive: true,
          cryptoSwap: true,
          virtualAccount: {
            include: {
              walletCurrency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.cryptoTransaction.count({
        where: {
          userId,
          virtualAccountId,
        },
      }),
    ]);

    return {
      transactions: transactions.map((tx) => this.formatTransaction(tx)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get all USDT transactions for a user
   * Returns transactions where currency contains "USDT" (e.g., USDT, USDT_TRON, USDT_ETH, USDT_BSC)
   */
  async getUsdtTransactions(
    userId: number,
    transactionType?: CryptoTxType,
    limit: number = 50,
    offset: number = 0
  ) {
    // Get all USDT virtual accounts for this user
    const usdtVirtualAccounts = await prisma.virtualAccount.findMany({
      where: {
        userId,
        OR: [
          { currency: 'USDT' },
          { currency: { startsWith: 'USDT_' } },
        ],
      },
      select: { id: true },
    });

    const usdtVirtualAccountIds = usdtVirtualAccounts.map(va => va.id);

    // Build where clause - match by currency field OR virtual account
    const baseWhere: any = {
      userId,
    };

    if (transactionType) {
      baseWhere.transactionType = transactionType;
    }

    // Build OR condition for USDT matching
    const orConditions: any[] = [];
    
    // Match by currency field (for non-swap transactions)
    orConditions.push({
      OR: [
        { currency: 'USDT' },
        { currency: { startsWith: 'USDT_' } },
      ],
    });

    // Match by virtual account IDs
    if (usdtVirtualAccountIds.length > 0) {
      orConditions.push({
        virtualAccountId: { in: usdtVirtualAccountIds },
      });
    }

    baseWhere.OR = orConditions;

    // First, get all transactions (including swaps for filtering)
    const allTransactions = await prisma.cryptoTransaction.findMany({
      where: baseWhere,
      include: {
        cryptoBuy: true,
        cryptoSell: true,
        cryptoSend: true,
        cryptoReceive: true,
        cryptoSwap: true,
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter to include swaps where fromCurrency or toCurrency is USDT
    const usdtTransactions = allTransactions.filter((tx) => {
      // For swap transactions, check both fromCurrency and toCurrency
      if (tx.transactionType === 'SWAP' && tx.cryptoSwap) {
        const fromCurrency = tx.cryptoSwap.fromCurrency?.toUpperCase() || '';
        const toCurrency = tx.cryptoSwap.toCurrency?.toUpperCase() || '';
        return fromCurrency === 'USDT' || fromCurrency.startsWith('USDT_') ||
               toCurrency === 'USDT' || toCurrency.startsWith('USDT_');
      }
      // For other transactions, they should already match via the where clause
      return true;
    });

    // Apply pagination after filtering
    const total = usdtTransactions.length;
    const paginatedTransactions = usdtTransactions.slice(offset, offset + limit);

    return {
      transactions: paginatedTransactions.map((tx) => this.formatTransaction(tx)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Format transaction for API response
   */
  private formatTransaction(transaction: any) {
    const base = {
      id: transaction.id, // Integer ID
      transactionId: transaction.transactionId, // String transaction ID
      transactionType: transaction.transactionType,
      status: transaction.status,
      currency: transaction.currency,
      blockchain: transaction.blockchain,
      symbol: transaction.virtualAccount?.walletCurrency?.symbol || null, // Currency symbol (icon path)
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      tradeType: this.getTradeTypeLabel(transaction.transactionType),
      cryptocurrencyType: transaction.virtualAccount?.walletCurrency?.name || transaction.currency,
    };

    // Add transaction-specific data based on type
    if (transaction.cryptoBuy) {
      return {
        ...base,
        from: transaction.cryptoBuy.fromAddress || 'External',
        to: transaction.cryptoBuy.toAddress || 'Your Crypto wallet',
        amount: `${transaction.cryptoBuy.amount.toString()}${transaction.currency}`,
        amountUsd: `$${transaction.cryptoBuy.amountUsd.toString()}`,
        amountNaira: `NGN${transaction.cryptoBuy.amountNaira.toString()}`,
        rate: transaction.cryptoBuy.rate ? `NGN${transaction.cryptoBuy.rate.toString()}/$` : null,
        rateNgnToUsd: transaction.cryptoBuy.rateNgnToUsd ? transaction.cryptoBuy.rateNgnToUsd.toString() : null, // NGN to USD rate
        rateUsdToCrypto: transaction.cryptoBuy.rateUsdToCrypto ? transaction.cryptoBuy.rateUsdToCrypto.toString() : null, // USD to Crypto rate
        txHash: transaction.cryptoBuy.txHash,
      };
    }

    if (transaction.cryptoSell) {
      return {
        ...base,
        from: transaction.cryptoSell.fromAddress || 'Your Crypto wallet',
        to: transaction.cryptoSell.toAddress || 'Tercescrow',
        amount: `${transaction.cryptoSell.amount.toString()}${transaction.currency}`,
        amountUsd: `$${transaction.cryptoSell.amountUsd.toString()}`,
        youReceived: `NGN${transaction.cryptoSell.amountNaira.toString()}`,
        rate: transaction.cryptoSell.rate ? `NGN${transaction.cryptoSell.rate.toString()}/$` : null,
        rateCryptoToUsd: transaction.cryptoSell.rateCryptoToUsd ? transaction.cryptoSell.rateCryptoToUsd.toString() : null, // Crypto to USD rate
        rateUsdToNgn: transaction.cryptoSell.rateUsdToNgn ? transaction.cryptoSell.rateUsdToNgn.toString() : null, // USD to NGN rate
        txHash: transaction.cryptoSell.txHash,
      };
    }

    if (transaction.cryptoSend) {
      return {
        ...base,
        from: transaction.cryptoSend.fromAddress,
        to: transaction.cryptoSend.toAddress,
        amount: `${transaction.cryptoSend.amount.toString()}${transaction.currency}`,
        amountUsd: `$${transaction.cryptoSend.amountUsd.toString()}`,
        amountNaira: transaction.cryptoSend.amountNaira 
          ? `NGN${transaction.cryptoSend.amountNaira.toString()}` 
          : null,
        rate: transaction.cryptoSend.rate ? `NGN${transaction.cryptoSend.rate.toString()}/$` : null,
        txHash: transaction.cryptoSend.txHash,
        networkFee: transaction.cryptoSend.networkFee?.toString(),
      };
    }

    if (transaction.cryptoReceive) {
      return {
        ...base,
        from: transaction.cryptoReceive.fromAddress,
        to: transaction.cryptoReceive.toAddress || 'Your Crypto wallet',
        amount: `${transaction.cryptoReceive.amount.toString()}${transaction.currency}`,
        amountUsd: `$${transaction.cryptoReceive.amountUsd.toString()}`,
        amountNaira: transaction.cryptoReceive.amountNaira 
          ? `NGN${transaction.cryptoReceive.amountNaira.toString()}` 
          : null,
        rate: transaction.cryptoReceive.rate ? `$${transaction.cryptoReceive.rate.toString()}` : null,
        txHash: transaction.cryptoReceive.txHash,
        confirmations: transaction.cryptoReceive.confirmations,
      };
    }

    if (transaction.cryptoSwap) {
      // Get symbol for both currencies
      const fromSymbol = transaction.virtualAccount?.walletCurrency?.symbol || null;
      // For swap, we might need to get the toCurrency symbol from a different virtual account
      // For now, we'll just use the base symbol
      
      // Primary amount shows what was received (toAmount) as the main transaction amount
      const toAmountStr = `${transaction.cryptoSwap.toAmount.toString()}${transaction.cryptoSwap.toCurrency}`;
      const fromAmountStr = `${transaction.cryptoSwap.fromAmount.toString()}${transaction.cryptoSwap.fromCurrency}`;
      
      return {
        ...base,
        // Primary amount field (what was received)
        amount: toAmountStr,
        amountUsd: `$${transaction.cryptoSwap.toAmountUsd.toString()}`,
        // Swap-specific fields
        from: transaction.cryptoSwap.fromAddress || 'Your Crypto wallet',
        to: transaction.cryptoSwap.toAddress || 'Your Crypto wallet',
        fromCurrency: transaction.cryptoSwap.fromCurrency,
        fromBlockchain: transaction.cryptoSwap.fromBlockchain,
        fromAmount: fromAmountStr,
        fromAmountUsd: `$${transaction.cryptoSwap.fromAmountUsd.toString()}`,
        toCurrency: transaction.cryptoSwap.toCurrency,
        toBlockchain: transaction.cryptoSwap.toBlockchain,
        toAmount: toAmountStr,
        toAmountUsd: `$${transaction.cryptoSwap.toAmountUsd.toString()}`,
        gasFee: `${transaction.cryptoSwap.gasFee.toString()}${transaction.cryptoSwap.fromCurrency}`,
        gasFeeUsd: `$${transaction.cryptoSwap.gasFeeUsd.toString()}`,
        totalAmount: `${transaction.cryptoSwap.totalAmount.toString()}${transaction.cryptoSwap.fromCurrency}`,
        totalAmountUsd: `$${transaction.cryptoSwap.totalAmountUsd.toString()}`,
        rateFromToUsd: transaction.cryptoSwap.rateFromToUsd ? transaction.cryptoSwap.rateFromToUsd.toString() : null,
        rateToToUsd: transaction.cryptoSwap.rateToToUsd ? transaction.cryptoSwap.rateToToUsd.toString() : null,
        txHash: transaction.cryptoSwap.txHash,
      };
    }

    return base;
  }

  /**
   * Get trade type label for display
   */
  private getTradeTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      BUY: 'Crypto Buy',
      SELL: 'Crypto Sell',
      SEND: 'Crypto Transfer',
      RECEIVE: 'Crypto Deposit',
      SWAP: 'Crypto Swap',
    };
    return labels[type] || type;
  }
}

export default new CryptoTransactionService();

```

---

## 13) create.virtual.account.job.ts

```ts
/**
 * Create Virtual Account Job
 * 
 * Background job to create virtual accounts for a user
 * Triggered after email verification
 * Uses Bull queue system for async processing
 */

import { Job } from 'bull';
import virtualAccountService from '../../services/tatum/virtual.account.service';
import depositAddressService from '../../services/tatum/deposit.address.service';
import tatumService from '../../services/tatum/tatum.service';

export interface CreateVirtualAccountJobData {
  userId: number;
}

/**
 * Process create virtual account job (for Bull queue)
 * This is the processor function that will be called by the queue worker
 */
export async function processCreateVirtualAccountJob(
  job: Job<CreateVirtualAccountJobData>
): Promise<void> {
  const { userId } = job.data;

  try {
    console.log(`[Queue:Tatum] Starting virtual account creation for user ${userId}`);

    // Create virtual accounts for all supported currencies
    const virtualAccounts = await virtualAccountService.createVirtualAccountsForUser(userId);

    console.log(`[Queue:Tatum] Created ${virtualAccounts.length} virtual accounts for user ${userId}`);

    // For each virtual account, assign deposit address
    // Note: Webhook registration is now handled automatically in deposit.address.service.ts
    // after address generation using Tatum V4 API (address-based subscriptions)
    for (const account of virtualAccounts) {
      try {
        // Assign deposit address (this will also register webhook automatically)
        await depositAddressService.generateAndAssignToVirtualAccount(account.id);
        console.log(`[Queue:Tatum] Deposit address assigned for account ${account.accountId}`);
      } catch (error: any) {
        console.error(`[Queue:Tatum] Error processing account ${account.accountId}:`, error.message);
        // Continue with other accounts even if one fails
      }
    }

    console.log(`[Queue:Tatum] Completed virtual account creation for user ${userId}`);
  } catch (error: any) {
    console.error(`[Queue:Tatum] Error in createVirtualAccountJob for user ${userId}:`, error);
    throw error; // Re-throw to let Bull handle retries
  }
}

```

---

## 14) retry.sell.token.transfer.job.ts

```ts
/**
 * Retry Sell Token Transfer Job
 * 
 * Retries USDT token transfer after ETH transfer has succeeded
 * Used when native funds haven't settled immediately
 */

import { Job } from 'bull';
import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { ethereumTransactionService } from '../../services/ethereum/ethereum.transaction.service';
import { ethereumGasService } from '../../services/ethereum/ethereum.gas.service';
import { ethereumBalanceService } from '../../services/ethereum/ethereum.balance.service';
import cryptoLogger from '../../utils/crypto.logger';
import { sendPushNotification } from '../../utils/pushService';
import { InAppNotificationType } from '@prisma/client';

export interface RetrySellTokenTransferJobData {
  userId: number;
  depositAddress: string;
  masterWalletAddress: string;
  amount: string; // USDT amount to transfer
  currency: string; // 'USDT'
  blockchain: string; // 'ethereum'
  virtualAccountId: number;
  fiatWalletId: string;
  amountNgn: string; // Final NGN amount user should receive
  ethTransferTxHash: string; // ETH transfer transaction hash
  ethAmountSent: string; // Amount of ETH sent to user
  attemptNumber: number; // Current attempt number (1, 2, or 3)
  sellTransactionId?: string; // Optional: if a transaction record was created
}

/**
 * Decrypt private key helper
 */
function decryptPrivateKey(encryptedKey: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  // @ts-ignore
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Process retry sell token transfer job
 * Retries the USDT token transfer from user wallet to master wallet
 */
export async function processRetrySellTokenTransferJob(
  job: Job<RetrySellTokenTransferJobData>
): Promise<void> {
  const {
    userId,
    depositAddress,
    masterWalletAddress,
    amount,
    currency,
    blockchain,
    virtualAccountId,
    fiatWalletId,
    amountNgn,
    ethTransferTxHash,
    ethAmountSent,
    attemptNumber,
    sellTransactionId,
  } = job.data;

  // Update attempt number based on job attemptsMade (Bull tracks attempts)
  const currentAttempt = attemptNumber + (job.attemptsMade || 0);

  console.log(`[Queue:Tatum] Retry sell token transfer job (Attempt ${currentAttempt})`, {
    userId,
    depositAddress,
    amount,
    currency,
    ethTransferTxHash,
    jobId: job.id,
  });

  try {
    // Step 1: Check if user's ETH balance is sufficient now
    console.log(`[Queue:Tatum] Checking user ETH balance before retry attempt ${currentAttempt}`);
    const userEthBalanceStr = await ethereumBalanceService.getETHBalance(depositAddress, false);
    const userEthBalance = new Decimal(userEthBalanceStr);
    
    // Get token gas fee estimation
    const tokenTransferGasEstimate = await ethereumGasService.estimateGasFee(
      depositAddress,
      masterWalletAddress,
      amount,
      false
    );

    let tokenGasLimit = parseInt(tokenTransferGasEstimate.gasLimit);
    const erc20GasLimit = 65000;
    tokenGasLimit = Math.max(tokenGasLimit, erc20GasLimit);
    tokenGasLimit = Math.ceil(tokenGasLimit * 1.2); // Add 20% buffer

    const tokenGasPriceWei = tokenTransferGasEstimate.gasPrice;
    const tokenGasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(
      tokenGasLimit.toString(),
      tokenGasPriceWei
    ));

    // Add buffer for gas fee
    const bufferAmount = Decimal.max(
      tokenGasFeeEth.mul(new Decimal('0.5')),
      new Decimal('0.0001')
    );
    const minimumEthNeeded = tokenGasFeeEth.plus(bufferAmount);

    console.log(`[Queue:Tatum] ETH balance check for retry ${currentAttempt}:`, {
      userBalance: userEthBalance.toString(),
      minimumNeeded: minimumEthNeeded.toString(),
      sufficient: userEthBalance.gte(minimumEthNeeded),
    });

    if (userEthBalance.lessThan(minimumEthNeeded)) {
      const error = new Error(`Insufficient ETH balance for token transfer. Balance: ${userEthBalance.toString()}, Required: ${minimumEthNeeded.toString()}`);
      console.error(`[Queue:Tatum] Retry ${currentAttempt} failed:`, error.message);
      
      // If this is the last attempt, notify user
      if (currentAttempt >= 3) {
        await notifyUserToContactAdmin(userId, depositAddress, ethTransferTxHash, amount, currency);
      }
      
      throw error; // This will trigger Bull's retry mechanism
    }

    // Step 2: Get user's private key
    const depositAddressRecord = await prisma.depositAddress.findFirst({
      where: {
        address: depositAddress,
        virtualAccountId: virtualAccountId,
      },
    });

    if (!depositAddressRecord || !depositAddressRecord.privateKey) {
      throw new Error('Deposit address private key not found');
    }

    let userPrivateKey = decryptPrivateKey(depositAddressRecord.privateKey);
    userPrivateKey = userPrivateKey.trim();
    if (userPrivateKey.startsWith('0x')) {
      userPrivateKey = userPrivateKey.substring(2).trim();
    }

    if (userPrivateKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(userPrivateKey)) {
      throw new Error('Invalid user private key format');
    }

    // Step 3: Attempt token transfer
    console.log(`[Queue:Tatum] Attempting token transfer (retry ${currentAttempt})`);
    const tokenTransferTxHash = await ethereumTransactionService.sendTransaction(
      masterWalletAddress,
      amount,
      currency,
      userPrivateKey,
      ethereumGasService.weiToGwei(tokenGasPriceWei),
      tokenGasLimit.toString(),
      false // mainnet
    );

    if (!tokenTransferTxHash) {
      throw new Error('Token transfer failed: No transaction hash returned');
    }

    console.log(`[Queue:Tatum] Token transfer succeeded on retry ${currentAttempt}:`, tokenTransferTxHash);
    cryptoLogger.transfer('TOKEN_TRANSFER_SUCCESS_RETRY', {
      userId,
      from: depositAddress,
      to: masterWalletAddress,
      amount,
      currency,
      txHash: tokenTransferTxHash,
      attemptNumber: currentAttempt,
      ethTransferTxHash,
    });

    // Step 4: Complete the sell transaction in database
    await completeSellTransaction({
      userId,
      virtualAccountId,
      fiatWalletId,
      amountCrypto: amount,
      amountNgn,
      currency,
      blockchain,
      tokenTransferTxHash,
      ethTransferTxHash,
      sellTransactionId,
      depositAddress,
      masterWalletAddress,
    });

    console.log(`[Queue:Tatum] Sell transaction completed successfully on retry ${currentAttempt}`);

  } catch (error: any) {
    console.error(`[Queue:Tatum] Retry ${currentAttempt} failed:`, error);
    cryptoLogger.exception('Retry sell token transfer', error, {
      userId,
      depositAddress,
      amount,
      currency,
      attemptNumber: currentAttempt,
      ethTransferTxHash,
      jobId: job.id,
    });

    // If this is the last attempt, notify user
    if (currentAttempt >= 3) {
      await notifyUserToContactAdmin(userId, depositAddress, ethTransferTxHash, amount, currency);
    }

    throw error; // Re-throw to let Bull handle retries
  }
}

/**
 * Complete the sell transaction in database
 */
async function completeSellTransaction(data: {
  userId: number;
  virtualAccountId: number;
  fiatWalletId: string;
  amountCrypto: string;
  amountNgn: string;
  currency: string;
  blockchain: string;
  tokenTransferTxHash: string;
  ethTransferTxHash: string;
  sellTransactionId?: string;
  depositAddress?: string;
  masterWalletAddress?: string;
}) {
  const {
    userId,
    virtualAccountId,
    fiatWalletId,
    amountCrypto,
    amountNgn,
    currency,
    blockchain,
    tokenTransferTxHash,
    ethTransferTxHash,
    sellTransactionId,
    depositAddress: depositAddressFromData,
    masterWalletAddress: masterWalletAddressFromData,
  } = data;

  return await prisma.$transaction(async (tx) => {
    // Get virtual account and fiat wallet with locking
    const virtualAccount = await tx.virtualAccount.findUnique({
      where: { id: virtualAccountId },
    });

    const fiatWallet = await tx.fiatWallet.findUnique({
      where: { id: fiatWalletId },
    });

    if (!virtualAccount || !fiatWallet) {
      throw new Error('Virtual account or fiat wallet not found');
    }

    // Calculate balances
    const cryptoBalanceBefore = new Decimal(virtualAccount.availableBalance || '0');
    const amountCryptoDecimal = new Decimal(amountCrypto);
    const cryptoBalanceAfter = cryptoBalanceBefore.minus(amountCryptoDecimal);

    const fiatBalanceBefore = new Decimal(fiatWallet.balance);
    const amountNgnDecimal = new Decimal(amountNgn);
    const fiatBalanceAfter = fiatBalanceBefore.plus(amountNgnDecimal);

    // Debit virtual account (crypto)
    await tx.virtualAccount.update({
      where: { id: virtualAccountId },
      data: {
        availableBalance: cryptoBalanceAfter.toString(),
        accountBalance: cryptoBalanceAfter.toString(),
      },
    });

    // Create fiat transaction
    const fiatTransaction = await tx.fiatTransaction.create({
      data: {
        userId,
        walletId: fiatWalletId,
        type: 'CRYPTO_SELL',
        status: 'pending',
        currency: 'NGN',
        amount: amountNgnDecimal,
        fees: new Decimal('0'),
        totalAmount: amountNgnDecimal,
        balanceBefore: fiatBalanceBefore,
        description: `Sell ${amountCrypto} ${currency}`,
      },
    });

    // Credit fiat wallet
    await tx.fiatWallet.update({
      where: { id: fiatWalletId },
      data: { balance: fiatBalanceAfter },
    });

    // Update fiat transaction
    await tx.fiatTransaction.update({
      where: { id: fiatTransaction.id },
      data: {
        balanceAfter: fiatBalanceAfter,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    // Create or update crypto transaction record
    let transactionId = sellTransactionId;
    if (!transactionId) {
      transactionId = `SELL-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Check if transaction already exists
    const existingTx = await tx.cryptoTransaction.findUnique({
      where: { transactionId },
    });

    if (existingTx) {
      // Update existing transaction
      await tx.cryptoTransaction.update({
        where: { id: existingTx.id },
        data: {
          status: 'successful',
        },
      });

      // Update CryptoSell record
      await tx.cryptoSell.update({
        where: { cryptoTransactionId: existingTx.id },
        data: {
          txHash: tokenTransferTxHash,
        },
      });
    } else {
      // Create new transaction
      const walletCurrency = await tx.walletCurrency.findFirst({
        where: {
          currency: currency.toUpperCase(),
          blockchain: blockchain.toLowerCase(),
        },
      });

      const cryptoPrice = walletCurrency?.price ? new Decimal(walletCurrency.price.toString()) : new Decimal('1');
      const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

      // Get USD to NGN rate (CryptoRate doesn't have fromCurrency/toCurrency, just transactionType)
      const cryptoRate = await tx.cryptoRate.findFirst({
        where: {
          transactionType: 'SELL',
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const usdToNgnRate = cryptoRate?.rate ? new Decimal(cryptoRate.rate.toString()) : new Decimal('1400');

      await tx.cryptoTransaction.create({
        data: {
          userId,
          virtualAccountId,
          transactionType: 'SELL',
          transactionId,
          status: 'successful',
          currency: currency.toUpperCase(),
          blockchain: blockchain.toLowerCase(),
          cryptoSell: {
            create: {
              fromAddress: depositAddressFromData || null,
              toAddress: masterWalletAddressFromData || null,
              amount: amountCryptoDecimal,
              amountUsd,
              amountNaira: amountNgnDecimal,
              rateCryptoToUsd: cryptoPrice,
              rateUsdToNgn: usdToNgnRate,
              txHash: tokenTransferTxHash,
            },
          },
        },
      });
    }
  });
}

/**
 * Notify user to contact admin after max retries
 */
async function notifyUserToContactAdmin(
  userId: number,
  depositAddress: string,
  ethTransferTxHash: string,
  amount: string,
  currency: string
) {
  try {
    console.log(`[Queue:Tatum] Sending notification to user ${userId} to contact admin`);

    // Send push notification
    await sendPushNotification({
      userId,
      title: 'Transaction Assistance Required',
      body: `Your ${currency} sell transaction needs manual processing. Please contact support with transaction ID: ${ethTransferTxHash.substring(0, 10)}...`,
      data: {
        type: 'sell_retry_failed',
        depositAddress,
        ethTransferTxHash,
        amount,
        currency,
      },
    });

    // Create in-app notification
    await prisma.inAppNotification.create({
      data: {
        userId,
        type: InAppNotificationType.customeer,
        title: 'Transaction Assistance Required',
        description: `Your ${currency} sell transaction needs manual processing. Please contact support with transaction ID: ${ethTransferTxHash}`,
        isRead: false,
      },
    });

    console.log(`[Queue:Tatum] Notification sent to user ${userId}`);
  } catch (error: any) {
    console.error(`[Queue:Tatum] Failed to send notification to user ${userId}:`, error);
    // Don't throw - notification failure shouldn't block the job
  }
}

```

---

## 15) tatum.webhook.router.ts

```ts
/**
 * Tatum Webhook Routes
 */

import express from 'express';
import { tatumWebhookController } from '../../controllers/webhooks/tatum.webhook.controller';

const tatumWebhookRouter = express.Router();

/**
 * @swagger
 * /api/v2/webhooks/tatum:
 *   post:
 *     summary: Receive Tatum webhook
 *     tags: [Webhooks]
 *     description: Endpoint for Tatum to send blockchain transaction webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: string
 *               subscriptionType:
 *                 type: string
 *               amount:
 *                 type: string
 *               currency:
 *                 type: string
 *               reference:
 *                 type: string
 *               txId:
 *                 type: string
 *               from:
 *                 type: string
 *               to:
 *                 type: string
 *               date:
 *                 type: number
 *               blockHeight:
 *                 type: number
 *               blockHash:
 *                 type: string
 *               index:
 *                 type: number
 *     responses:
 *       200:
 *         description: Webhook received successfully
 */
tatumWebhookRouter.post('/', tatumWebhookController);

export default tatumWebhookRouter;

```

---

## 16) External dependencies & queue wiring

- utils/prisma, utils/ApiResponse
- utils/pushService, Prisma InAppNotification (jobs / webhook side effects)
- services/ethereum/* — used by retry.sell.token.transfer.job (gas, balance, tx)
- services/user/user.wallet.service — imported by deposit.address.service
- Bull queue: src/queue/worker.ts registers queue tatum with jobs create-virtual-account, retry-sell-token-transfer
- App mount: src/index.ts -> app.use('/api/v2/webhooks/tatum', tatumWebhookRouter)

### Related docs in repo

- docs/TATUM_ENV_CONFIGURATION.md
- docs/TATUM_CODE_REFERENCE.md
- docs/TATUM_QUEUE_SYSTEM.md

