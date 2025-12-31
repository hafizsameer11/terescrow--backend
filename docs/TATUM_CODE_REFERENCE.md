# Tatum Implementation - Code Reference

Quick reference guide with copyable code snippets.

## Encryption Functions

```typescript
import crypto from 'crypto';

/**
 * Encrypt private key or mnemonic using AES-256-CBC
 */
function encryptPrivateKey(data: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt private key or mnemonic
 */
function decryptPrivateKey(encryptedKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

## Tatum Service - Core Methods

```typescript
// Create wallet
async createWallet(blockchain: string): Promise<TatumWalletResponse> {
  const normalizedBlockchain = blockchain.toLowerCase();
  
  // XRP uses different endpoint
  if (normalizedBlockchain === 'xrp' || normalizedBlockchain === 'ripple') {
    const endpoint = `/xrp/account`;
    const response = await this.axiosInstance.get<{ address: string; secret: string }>(endpoint);
    return {
      address: response.data.address,
      secret: response.data.secret,
      privateKey: response.data.secret,
    };
  }
  
  // Other blockchains
  const endpoint = `/${normalizedBlockchain}/wallet`;
  const response = await this.axiosInstance.get<TatumWalletResponse>(endpoint);
  return response.data;
}

// Generate address from xpub
async generateAddress(blockchain: string, xpub: string, index: number): Promise<string> {
  const endpoint = `/${blockchain.toLowerCase()}/address/${xpub}/${index}`;
  const response = await this.axiosInstance.get<{ address: string }>(endpoint);
  return response.data.address;
}

// Generate private key from mnemonic
async generatePrivateKey(blockchain: string, mnemonic: string, index: number): Promise<string> {
  const endpoint = `/${blockchain.toLowerCase()}/wallet/priv`;
  const response = await this.axiosInstance.post<{ key: string }>(endpoint, {
    mnemonic,
    index,
  });
  return response.data.key;
}

// Register address webhook (V4)
async registerAddressWebhookV4(
  address: string,
  blockchain: string,
  webhookUrl: string,
  options?: {
    type?: 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX' | 'ADDRESS_EVENT';
    finality?: 'confirmed' | 'final';
  }
): Promise<TatumV4WebhookSubscriptionResponse> {
  const chain = this.getTatumV4Chain(blockchain);
  const data: any = {
    type: options?.type || 'INCOMING_NATIVE_TX',
    attr: {
      address,
      chain,
      url: webhookUrl,
    },
  };
  
  if (options?.finality) {
    data.finality = options.finality;
  }
  
  const response = await this.axiosInstanceV4.post<TatumV4WebhookSubscriptionResponse>(
    '/subscription',
    data
  );
  return response.data;
}

// Get Tatum V4 chain identifier
private getTatumV4Chain(blockchain: string): string {
  const chainMap: { [key: string]: string } = {
    bitcoin: 'bitcoin-mainnet',
    ethereum: 'ethereum-mainnet',
    eth: 'ethereum-mainnet',
    tron: 'tron-mainnet',
    bsc: 'bsc-mainnet',
    solana: 'solana-mainnet',
    sol: 'solana-mainnet',
    polygon: 'polygon-mainnet',
    matic: 'polygon-mainnet',
    dogecoin: 'doge-mainnet',
    doge: 'doge-mainnet',
    xrp: 'ripple-mainnet',
    ripple: 'ripple-mainnet',
  };
  
  const normalized = blockchain.toLowerCase();
  return chainMap[normalized] || 'ethereum-mainnet';
}
```

## User Wallet Service - Get or Create

```typescript
async getOrCreateUserWallet(userId: number, blockchain: string) {
  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  
  if (!user) {
    throw new Error(`User with ID ${userId} does not exist`);
  }
  
  // Check if wallet exists
  let userWallet = await prisma.userWallet.findUnique({
    where: {
      userId_blockchain: {
        userId,
        blockchain: blockchain.toLowerCase(),
      },
    },
  });
  
  if (userWallet) {
    return userWallet;
  }
  
  // Generate new wallet
  const walletData = await tatumService.createWallet(blockchain);
  
  // Handle special cases
  const isNoXpub = blockchain === 'solana' || blockchain === 'sol' || 
                   blockchain === 'xrp' || blockchain === 'ripple';
  
  // Determine what to store in mnemonic field
  let mnemonicOrSecret: string;
  if (blockchain === 'solana' || blockchain === 'sol') {
    mnemonicOrSecret = walletData.privateKey || walletData.mnemonic || '';
  } else if (blockchain === 'xrp' || blockchain === 'ripple') {
    mnemonicOrSecret = walletData.secret || walletData.privateKey || '';
  } else {
    mnemonicOrSecret = walletData.mnemonic || '';
  }
  
  const encryptedMnemonic = encryptPrivateKey(mnemonicOrSecret);
  
  // Create wallet
  userWallet = await prisma.userWallet.create({
    data: {
      userId,
      blockchain: blockchain.toLowerCase(),
      mnemonic: encryptedMnemonic,
      xpub: isNoXpub ? walletData.address : walletData.xpub,
      derivationPath: this.getDerivationPath(blockchain),
    },
  });
  
  return userWallet;
}

// Get derivation path
private getDerivationPath(blockchain: string): string | null {
  const paths: { [key: string]: string | null } = {
    bitcoin: "m/44'/0'/0'",
    ethereum: "m/44'/60'/0'",
    eth: "m/44'/60'/0'",
    tron: "m/44'/195'/0'",
    bsc: "m/44'/60'/0'",
    polygon: "m/44'/60'/0'",
    dogecoin: "m/44'/3'/0'",
    solana: null,
    sol: null,
    xrp: null,
    ripple: null,
  };
  
  return paths[blockchain.toLowerCase()] || null;
}
```

## Virtual Account Service - Create for User

```typescript
async createVirtualAccountsForUser(userId: number) {
  // Get all supported currencies
  const walletCurrencies = await prisma.walletCurrency.findMany();
  
  const createdAccounts = [];
  
  for (const currency of walletCurrencies) {
    // Check if exists
    const existing = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: currency.currency,
        blockchain: currency.blockchain,
      },
    });
    
    if (existing) {
      createdAccounts.push(existing);
      continue;
    }
    
    // Generate account ID
    const accountId = randomUUID();
    const accountCode = `user_${userId}_${currency.currency}`;
    
    // Create virtual account
    const virtualAccount = await prisma.virtualAccount.create({
      data: {
        userId,
        blockchain: currency.blockchain,
        currency: currency.currency,
        customerId: String(userId),
        accountId,
        accountCode,
        active: true,
        frozen: false,
        accountBalance: '0',
        availableBalance: '0',
        accountingCurrency: 'USD',
        currencyId: currency.id,
      },
    });
    
    createdAccounts.push(virtualAccount);
  }
  
  return createdAccounts;
}
```

## Deposit Address Service - Generate and Assign

```typescript
async generateAndAssignToVirtualAccount(virtualAccountId: number) {
  // Get virtual account
  const virtualAccount = await prisma.virtualAccount.findUnique({
    where: { id: virtualAccountId },
    include: { walletCurrency: true },
  });
  
  const blockchain = virtualAccount.blockchain.toLowerCase();
  const normalizedBlockchain = this.normalizeBlockchain(blockchain);
  
  // Check for existing address (address reuse)
  const allUserAddresses = await prisma.depositAddress.findMany({
    where: {
      virtualAccount: {
        userId: virtualAccount.userId,
      },
    },
    include: {
      virtualAccount: true,
    },
  });
  
  const existingAddress = allUserAddresses.find((addr) => {
    const addrNormalized = this.normalizeBlockchain(addr.blockchain);
    return addrNormalized === normalizedBlockchain;
  });
  
  // Reuse existing address if found
  if (existingAddress) {
    const depositAddress = await prisma.depositAddress.create({
      data: {
        virtualAccountId,
        userWalletId: existingAddress.userWalletId,
        blockchain,
        currency: virtualAccount.currency,
        address: existingAddress.address,
        index: existingAddress.index,
        privateKey: existingAddress.privateKey,
      },
    });
    return depositAddress;
  }
  
  // Generate new address
  const userWallet = await userWalletService.getOrCreateUserWallet(
    virtualAccount.userId,
    normalizedBlockchain
  );
  
  const isNoXpub = normalizedBlockchain === 'solana' || normalizedBlockchain === 'sol' || 
                   normalizedBlockchain === 'xrp' || normalizedBlockchain === 'ripple';
  
  let address: string;
  let privateKey: string;
  
  if (isNoXpub) {
    // Solana/XRP: reuse address from xpub field
    if (userWallet.xpub) {
      address = userWallet.xpub;
      const mnemonic = decryptPrivateKey(userWallet.mnemonic);
      privateKey = mnemonic; // For Solana/XRP, mnemonic stores privateKey/secret
    } else {
      // First time: generate wallet
      const walletData = await tatumService.createWallet(normalizedBlockchain);
      address = walletData.address;
      privateKey = walletData.privateKey || walletData.secret || '';
      
      // Store address in xpub field
      await prisma.userWallet.update({
        where: { id: userWallet.id },
        data: { xpub: address },
      });
    }
  } else {
    // Other blockchains: generate from xpub
    const mnemonic = decryptPrivateKey(userWallet.mnemonic);
    address = await tatumService.generateAddress(normalizedBlockchain, userWallet.xpub, 0);
    privateKey = await tatumService.generatePrivateKey(normalizedBlockchain, mnemonic, 0);
  }
  
  // Encrypt private key
  const encryptedPrivateKey = encryptPrivateKey(privateKey);
  
  // Store deposit address
  const depositAddress = await prisma.depositAddress.create({
    data: {
      virtualAccountId,
      userWalletId: userWallet.id,
      blockchain,
      currency: virtualAccount.currency,
      address,
      index: 0,
      privateKey: encryptedPrivateKey,
    },
  });
  
  // Register webhooks
  const webhookUrl = process.env.TATUM_WEBHOOK_URL || `${process.env.BASE_URL}/api/v2/webhooks/tatum`;
  
  // Register native token webhook
  await tatumService.registerAddressWebhookV4(address, normalizedBlockchain, webhookUrl, {
    type: 'INCOMING_NATIVE_TX',
  });
  
  // Register fungible token webhook if blockchain supports tokens
  const hasFungibleTokens = await prisma.walletCurrency.findFirst({
    where: {
      blockchain: normalizedBlockchain.toLowerCase(),
      isToken: true,
      contractAddress: { not: null },
    },
  });
  
  if (hasFungibleTokens) {
    await tatumService.registerAddressWebhookV4(address, normalizedBlockchain, webhookUrl, {
      type: 'INCOMING_FUNGIBLE_TX',
    });
  }
  
  return depositAddress;
}

// Normalize blockchain name
private normalizeBlockchain(blockchain: string): string {
  const normalized = blockchain.toLowerCase();
  const blockchainMap: { [key: string]: string } = {
    ethereum: 'ethereum',
    eth: 'ethereum',
    tron: 'tron',
    trx: 'tron',
    bsc: 'bsc',
    binance: 'bsc',
    binancesmartchain: 'bsc',
  };
  return blockchainMap[normalized] || normalized;
}
```

## Webhook Processing

```typescript
export async function processBlockchainWebhook(webhookData: any) {
  // 1. Check if from master wallet (ignore)
  const webhookAddress = webhookData.address || webhookData.to;
  if (webhookAddress) {
    const normalizedAddress = webhookAddress.toLowerCase();
    const allMasterWallets = await prisma.masterWallet.findMany({
      where: { address: { not: null } },
    });
    const masterWallet = allMasterWallets.find(
      mw => mw.address?.toLowerCase() === normalizedAddress
    );
    if (masterWallet) {
      return { processed: false, reason: 'master_wallet' };
    }
  }
  
  // 2. Handle address-based webhooks
  const isAddressWebhook = webhookData.subscriptionType === 'ADDRESS_EVENT' 
    || webhookData.subscriptionType === 'INCOMING_NATIVE_TX'
    || webhookData.subscriptionType === 'INCOMING_FUNGIBLE_TX';
  
  if (isAddressWebhook && !webhookData.accountId) {
    const webhookAddr = webhookData.address?.toLowerCase();
    const counterAddress = webhookData.counterAddress?.toLowerCase();
    
    // Find deposit address
    const allDepositAddresses = await prisma.depositAddress.findMany({
      include: {
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
      },
    });
    
    const depositAddressRecord = allDepositAddresses.find(
      da => da.address.toLowerCase() === webhookAddr.toLowerCase()
    );
    
    if (!depositAddressRecord) {
      return { processed: false, reason: 'deposit_address_not_found' };
    }
    
    // Determine currency
    let currency = depositAddressRecord.virtualAccount.currency;
    const contractAddress = webhookData.contractAddress || webhookData.asset;
    const isToken = webhookData.subscriptionType === 'INCOMING_FUNGIBLE_TX' && contractAddress;
    
    if (isToken && contractAddress) {
      const walletCurrency = await prisma.walletCurrency.findFirst({
        where: {
          blockchain: depositAddressRecord.virtualAccount.blockchain.toLowerCase(),
          contractAddress: { not: null },
        },
      });
      
      if (walletCurrency) {
        currency = walletCurrency.currency;
      }
    }
    
    // Set accountId for processing
    webhookData.accountId = depositAddressRecord.virtualAccount.accountId;
    webhookData.currency = currency;
    webhookData.from = counterAddress;
    webhookData.to = webhookAddr;
  }
  
  // 3. Check for duplicates
  const existingReceiveTx = await prisma.cryptoTransaction.findFirst({
    where: {
      transactionType: 'RECEIVE',
      cryptoReceive: { txHash: webhookData.txId },
    },
  });
  
  if (existingReceiveTx) {
    return { processed: false, reason: 'duplicate_tx' };
  }
  
  // 4. Get virtual account
  const virtualAccount = await prisma.virtualAccount.findUnique({
    where: { accountId: webhookData.accountId },
  });
  
  if (!virtualAccount) {
    return { processed: false, reason: 'account_not_found' };
  }
  
  // 5. Update balance
  const currentBalance = new Decimal(virtualAccount.accountBalance || '0');
  const receivedAmount = new Decimal(webhookData.amount);
  const newBalance = currentBalance.plus(receivedAmount);
  
  await prisma.virtualAccount.update({
    where: { id: virtualAccount.id },
    data: {
      accountBalance: newBalance.toString(),
      availableBalance: newBalance.toString(),
    },
  });
  
  // 6. Create transaction records
  await prisma.receiveTransaction.create({
    data: {
      userId: virtualAccount.userId,
      virtualAccountId: virtualAccount.id,
      transactionType: 'on_chain',
      senderAddress: webhookData.from,
      txId: webhookData.txId,
      amount: parseFloat(webhookData.amount),
      currency: webhookData.currency,
      blockchain: virtualAccount.blockchain,
      status: 'successful',
    },
  });
  
  // 7. Create CryptoReceive transaction
  // ... (see full implementation in process.webhook.job.ts)
  
  return { processed: true, ... };
}
```

## Environment Variables

```env
# Tatum API Configuration
TATUM_API_KEY=your_tatum_api_key_here
TATUM_BASE_URL=https://api.tatum.io/v3
TATUM_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/tatum

# Encryption Key (MUST be exactly 32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key-here!!

# Base URL
BASE_URL=https://yourdomain.com
```

## Database Schema (Prisma)

```prisma
model UserWallet {
  id               Int              @id @default(autoincrement())
  userId           Int              @map("user_id")
  blockchain       String           @db.VarChar(255)
  mnemonic         String?          @db.Text // Encrypted
  xpub             String?          @db.VarChar(500)
  derivationPath   String?          @map("derivation_path") @db.VarChar(100)
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
  accountId           String               @unique @map("account_id") @db.VarChar(255)
  accountBalance      String               @default("0") @map("account_balance") @db.VarChar(255)
  availableBalance    String               @default("0") @map("available_balance") @db.VarChar(255)
  createdAt           DateTime             @default(now()) @map("created_at")
  updatedAt           DateTime             @updatedAt @map("updated_at")
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  depositAddresses    DepositAddress[]

  @@index([userId])
  @@index([blockchain])
  @@index([currency])
  @@map("virtual_accounts")
}

model DepositAddress {
  id               Int            @id @default(autoincrement())
  virtualAccountId Int            @map("virtual_account_id")
  userWalletId     Int?           @map("user_wallet_id")
  blockchain       String?        @db.VarChar(255)
  currency         String?        @db.VarChar(50)
  address          String         @db.VarChar(255)
  index            Int?           @db.Int
  privateKey       String?        @map("private_key") @db.Text // Encrypted
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
```

## API Endpoints

```typescript
// Get user's virtual accounts
GET /api/v2/wallets/virtual-accounts
Headers: Authorization: Bearer {token}

// Get deposit address
GET /api/v2/wallets/deposit-address/:currency/:blockchain
Headers: Authorization: Bearer {token}

// Webhook endpoint
POST /api/v2/webhooks/tatum
Body: { ...webhook payload }
```


