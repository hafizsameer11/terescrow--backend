# TereScrow Backend - Complete Project Documentation

**Version:** 1.0.0  
**Last Updated:** December 2024  
**Document Purpose:** Comprehensive documentation for QA, Project Managers, and stakeholders

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Overview](#architecture-overview)
4. [Database Schema](#database-schema)
5. [API Endpoints Summary](#api-endpoints-summary)
6. [Key Features & Modules](#key-features--modules)
7. [External Integrations](#external-integrations)
8. [Queue System & Background Jobs](#queue-system--background-jobs)
9. [Security Features](#security-features)
10. [Environment Configuration](#environment-configuration)
11. [Deployment Information](#deployment-information)
12. [Testing Guidelines](#testing-guidelines)
13. [Recent Changes & Updates](#recent-changes--updates)
14. [Troubleshooting Guide](#troubleshooting-guide)

---

## Project Overview

**TereScrow Backend** is a comprehensive financial services platform that provides:

- **Cryptocurrency Management**: Buy, sell, swap, send, and receive cryptocurrencies across multiple blockchains
- **Fiat Currency Services**: Deposit, withdraw, and manage NGN wallets
- **Gift Card Services**: Purchase gift cards from Reloadly
- **Bill Payments**: Utility bills, airtime, data bundles via Reloadly and VTPass
- **KYC Verification**: Multi-tier KYC system for user verification
- **Payment Processing**: PalmPay integration for deposits and payouts
- **Support System**: Customer support chat and ticket management
- **Referral System**: User referral and reward management

### Project Goals

- Provide secure, scalable financial services
- Support multiple cryptocurrencies and blockchain networks
- Integrate with third-party payment providers
- Ensure compliance with KYC/AML regulations
- Deliver excellent user experience through reliable APIs

---

## Technology Stack

### Core Technologies

- **Runtime**: Node.js (TypeScript)
- **Framework**: Express.js
- **Database**: MySQL (via Prisma ORM)
- **Queue System**: Bull (Redis-based)
- **WebSocket**: Socket.io (real-time communication)
- **API Documentation**: Swagger/OpenAPI

### Key Dependencies

```json
{
  "express": "^4.21.2",
  "typescript": "^5.6.2",
  "prisma": "6.19.0",
  "bull": "^4.16.5",
  "ioredis": "^5.8.2",
  "socket.io": "^4.8.1",
  "axios": "^1.13.2",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.2",
  "node-cron": "^4.2.1",
  "swagger-ui-express": "^5.0.1"
}
```

### Development Tools

- **Nodemon**: Auto-restart during development
- **ts-node**: TypeScript execution
- **Prisma Studio**: Database GUI

---

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│              (Mobile Apps, Web Frontend)                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Express)                     │
│              Authentication & Authorization                  │
└────────┬───────────┬───────────┬──────────────┬─────────────┘
         │           │           │              │
         ▼           ▼           ▼              ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│   V2 APIs   │ │  Admin   │ │  Agent   │ │  Webhooks    │
│  (Customer) │ │   APIs   │ │   APIs   │ │   (Tatum,    │
│             │ │          │ │          │ │   PalmPay)   │
└──────┬──────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘
       │             │            │               │
       ▼             ▼            ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐   │
│  │  Crypto  │ │  Fiat    │ │ GiftCard │ │ BillPay    │   │
│  │ Services │ │ Services │ │ Services │ │ Services   │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘   │
│       │            │            │              │          │
│  ┌────┴────────────────────────────────────────┴──────┐   │
│  │         External API Integrations                  │   │
│  │  (Tatum, Reloadly, VTPass, PalmPay)               │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Database   │    │     Redis    │    │   WebSocket  │
│    (MySQL)   │    │   (Queue)    │    │   (Socket.io)│
└──────────────┘    └──────────────┘    └──────────────┘
```

### Directory Structure

```
src/
├── config/                 # Configuration files
│   ├── redis.config.ts    # Redis connection config
│   └── swagger.config.ts  # API documentation config
│
├── controllers/            # Request handlers
│   ├── admin/             # Admin controllers
│   ├── agent/             # Agent controllers
│   ├── customer/          # Customer controllers
│   ├── webhooks/          # Webhook handlers
│   └── test/              # Test controllers
│
├── services/               # Business logic layer
│   ├── crypto/            # Cryptocurrency services
│   ├── fiat/              # Fiat currency services
│   ├── giftcard/          # Gift card services
│   ├── kyc/               # KYC verification services
│   ├── palmpay/           # PalmPay integration
│   ├── reloadly/          # Reloadly integration
│   ├── tatum/             # Tatum blockchain services
│   ├── transaction/       # Transaction services
│   ├── user/              # User services
│   └── vtpass/            # VTPass integration
│
├── routes/                 # Route definitions
│   ├── admin/             # Admin routes
│   ├── agent/             # Agent routes
│   ├── cutomer/           # Customer routes (V2)
│   ├── webhooks/          # Webhook routes
│   └── test/              # Test routes
│
├── middlewares/            # Express middlewares
│   ├── authenticate.user.ts    # JWT authentication
│   └── multer.middleware.ts    # File upload handling
│
├── queue/                  # Queue system
│   ├── queue.manager.ts   # Queue management
│   ├── worker.ts          # Job worker
│   └── jobs/              # Job processors
│
├── schedulers/             # Cron schedulers
│   └── reloadly.utility.status.scheduler.ts
│
├── utils/                  # Utility functions
│   ├── ApiError.ts        # Error handling
│   ├── ApiResponse.ts     # Response formatting
│   ├── prisma.ts          # Prisma client
│   └── ...
│
├── types/                  # TypeScript type definitions
│   ├── palmpay.types.ts
│   ├── reloadly.types.ts
│   └── vtpass.types.ts
│
└── index.ts               # Application entry point
```

---

## Database Schema

### Core Models

#### User Management
- **User**: User accounts with KYC tiers, referral codes
- **UserOTP**: One-time passwords for email verification
- **CustomRole**: Custom roles for admin users
- **RolePermission**: Permissions for custom roles

#### Cryptocurrency
- **MasterWallet**: Master wallets for each blockchain
- **UserWallet**: Per-user wallets (one per blockchain)
- **WalletCurrency**: Supported cryptocurrencies
- **VirtualAccount**: Tatum virtual accounts (one per user per currency)
- **DepositAddress**: Deposit addresses for virtual accounts
- **CryptoTransaction**: All cryptocurrency transactions
- **ReceivedAsset**: Tracks received cryptocurrency assets
- **ReceiveTransaction**: Links transactions to users

#### Fiat Currency
- **FiatWallet**: User NGN wallets
- **FiatTransaction**: Fiat currency transactions
- **UserBankAccount**: User bank account details

#### Gift Cards
- **GiftCardProduct**: Gift card products (synced from Reloadly)
- **GiftCardOrder**: Gift card purchase orders
- **GiftCardProductSyncLog**: Product sync history

#### Bill Payments
- **BillPayment**: All bill payment transactions
- **Category**: Bill payment categories

#### Payments
- **PalmPayUserVirtualAccount**: PalmPay virtual accounts
- **PalmPayTransaction**: PalmPay transaction records

#### KYC & Verification
- **KycStateTwo**: KYC Tier 2 verification data
- **AccountActivity**: User activity logs

#### Support & Communication
- **Chat**: Support chat sessions
- **Message**: Chat messages
- **SupportChat**: Customer support chats
- **InAppNotification**: In-app notifications

#### Referrals
- **User.referredBy**: Self-referential relationship for referrals

### Key Relationships

```
User
├── UserWallet (1:many)
├── VirtualAccount (1:many)
├── FiatWallet (1:many)
├── CryptoTransaction (1:many)
├── FiatTransaction (1:many)
├── GiftCardOrder (1:many)
├── BillPayment (1:many)
└── Referrals (self-referential)

VirtualAccount
├── DepositAddress (1:many)
└── CryptoTransaction (1:many)

MasterWallet
└── WalletCurrency (1:many, via blockchain)

GiftCardOrder
└── GiftCardProduct (many:1)
```

---

## API Endpoints Summary

### V2 Customer APIs (Primary)

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify` - Email verification
- `POST /api/auth/forgot-password` - Password reset

#### Cryptocurrency - Buy Flow
- `GET /api/v2/crypto/buy/currencies` - Get available currencies for purchase
- `POST /api/v2/crypto/buy/quote` - Calculate purchase quote
- `POST /api/v2/crypto/buy/preview` - Preview transaction
- `POST /api/v2/crypto/buy` - Execute purchase

#### Cryptocurrency - Sell Flow
- `GET /api/v2/crypto/sell/currencies` - Get available currencies (with balances)
- `POST /api/v2/crypto/sell/quote` - Calculate sale quote
- `POST /api/v2/crypto/sell/preview` - Preview transaction
- `POST /api/v2/crypto/sell` - Execute sale

#### Cryptocurrency - Send Flow
- `POST /api/v2/crypto/send/preview` - Preview send transaction
- `POST /api/v2/crypto/send` - Send crypto to external address

#### Cryptocurrency - Swap Flow
- `GET /api/v2/crypto/swap/currencies` - Get available currencies for swap
- `POST /api/v2/crypto/swap/quote` - Calculate swap quote
- `POST /api/v2/crypto/swap/preview` - Preview swap
- `POST /api/v2/crypto/swap` - Execute swap

#### Cryptocurrency - Assets
- `GET /api/v2/crypto/assets` - Get all user crypto assets
- `GET /api/v2/crypto/assets/:id` - Get asset details
- `GET /api/v2/crypto/receive/:accountId` - Get deposit address (by account)
- `GET /api/v2/crypto/deposit-address/:currency/:blockchain` - Get deposit address

#### Cryptocurrency - Transactions
- `GET /api/v2/crypto/transactions` - Get all transactions
- `GET /api/v2/crypto/transactions/:transactionId` - Get transaction details
- `GET /api/v2/crypto/transactions/usdt/transactions` - Get USDT transactions (all networks)
- `GET /api/v2/crypto/assets/:virtualAccountId/transactions` - Get asset transactions

#### Cryptocurrency - Wallets
- `GET /api/v2/crypto/wallets` - Get all user wallets
- `POST /api/v2/crypto/wallets/export` - Export mnemonic
- `POST /api/v2/crypto/wallets/export-key` - Export private key
- `POST /api/v2/crypto/wallets/:blockchain/generate` - Generate wallet for blockchain

#### Gift Cards
- `GET /api/v2/giftcards/products` - Get all products
- `GET /api/v2/giftcards/products/:productId` - Get product details
- `GET /api/v2/giftcards/countries` - Get available countries
- `GET /api/v2/giftcards/categories` - Get product categories
- `POST /api/v2/giftcards/purchase` - Purchase gift card

#### Gift Card Orders
- `GET /api/v2/giftcards/orders` - Get user orders
- `GET /api/v2/giftcards/orders/:orderId` - Get order details
- `GET /api/v2/giftcards/orders/:orderId/card` - Get card details (PINs)

#### Bill Payments
- `GET /api/v2/bill-payments/categories` - Get bill categories
- `POST /api/v2/bill-payments/vtpass/*` - VTPass bill payments
- `POST /api/v2/bill-payments/reloadly/*` - Reloadly airtime/data
- `POST /api/v2/bill-payments/reloadly/utilities/*` - Reloadly utility bills

#### PalmPay
- `POST /api/v2/payments/palmpay/deposit/*` - PalmPay deposits
- `POST /api/v2/payments/palmpay/payout/*` - PalmPay payouts
- `POST /api/v2/payment/merchant/*` - PalmPay merchant orders

#### Fiat Wallets
- `GET /api/v2/wallets` - Get fiat wallets
- `POST /api/v2/wallets/deposit` - Deposit funds
- `POST /api/v2/wallets/withdraw` - Withdraw funds

#### KYC
- `GET /api/v2/kyc/status` - Get KYC status
- `POST /api/v2/kyc/submit` - Submit KYC documents

#### Bank Accounts
- `GET /api/v2/bank-accounts` - Get user bank accounts
- `POST /api/v2/bank-accounts` - Add bank account
- `DELETE /api/v2/bank-accounts/:id` - Delete bank account

#### Referrals
- `GET /api/v2/referrals/stats` - Get referral statistics
- `GET /api/v2/referrals/earnings` - Get referral earnings

#### Transaction Overview
- `GET /api/v2/transactions/overview` - Get transaction overview with charts

#### Support
- `GET /api/v2/support/chats` - Get support chats
- `POST /api/v2/support/chats` - Create support chat
- `POST /api/v2/support/chats/:chatId/messages` - Send message

### Admin APIs

#### Master Wallets
- `GET /api/admin/master-wallet` - Get all master wallets
- `POST /api/admin/master-wallet` - Create master wallet
- `POST /api/admin/master-wallet/create-all` - Create all master wallets

#### Crypto Rates
- `GET /api/admin/crypto/rates` - Get crypto rates
- `POST /api/admin/crypto/rates` - Update crypto rates

#### Gift Cards
- `GET /api/admin/giftcards/products` - Get all products
- `POST /api/admin/giftcards/products/sync` - Sync products from Reloadly

#### Operations
- `GET /api/admin/operations/*` - Admin operations

### Webhooks

- `POST /api/v2/webhooks/tatum` - Tatum blockchain webhooks
- `POST /api/v2/webhooks/palmpay` - PalmPay webhooks

### Testing Routes

- `/api/v2/test/vtpass/*` - VTPass test endpoints
- `/api/testing/gas` - Gas estimation testing

### API Documentation

- `GET /api-docs` - Swagger UI documentation (interactive)

---

## Key Features & Modules

### 1. Cryptocurrency Management

#### Supported Blockchains
- Bitcoin (BTC)
- Ethereum (ETH)
- Binance Smart Chain (BSC)
- Tron (TRX)
- Solana (SOL)
- Litecoin (LTC)
- Polygon (MATIC)
- Dogecoin (DOGE)
- XRP (Ripple)

#### Supported Cryptocurrencies
- Bitcoin (BTC)
- Ethereum (ETH)
- USDT (Ethereum, Tron, BSC)
- USDC (Ethereum, BSC)
- TRX (Tron)
- BNB (BSC)
- SOL (Solana)
- LTC (Litecoin)
- MATIC (Polygon)
- DOGE (Dogecoin)
- XRP (Ripple)

#### Features
- **Per-User Wallets**: Each user has a unique wallet per blockchain
- **Virtual Accounts**: Tatum virtual accounts for each currency
- **Deposit Addresses**: Unique addresses for receiving crypto
- **Address Reuse**: Shared addresses within blockchain groups (e.g., ETH, USDT, USDC share same address)
- **Buy/Sell/Swap**: Convert between crypto and fiat (NGN)
- **Send Crypto**: Send to external addresses
- **Transaction History**: Complete transaction tracking
- **Private Key Encryption**: AES-256-CBC encryption for security

### 2. Gift Card Services

#### Features
- **Product Catalog**: Real-time product data from Reloadly
- **Multi-Country**: Support for multiple countries
- **Categories**: Entertainment, Gaming, Shopping, etc.
- **Purchase Flow**: Complete purchase with PIN delivery
- **Order Tracking**: Track order status and history
- **Pre-Order Support**: Pre-order gift cards when available

#### Supported Products
- Amazon, Google Play, iTunes, Steam, PlayStation, Xbox, and more

### 3. Bill Payments

#### Providers
- **Reloadly**: Airtime, data bundles, utility bills
- **VTPass**: Comprehensive bill payment services

#### Supported Services
- Mobile Airtime (MTN, Airtel, Glo, 9mobile)
- Data Bundles
- Electricity Bills
- Cable TV Subscriptions
- Education Payments

### 4. Fiat Currency Services

#### Features
- **NGN Wallets**: Fiat currency wallets
- **Deposits**: PalmPay integration for deposits
- **Withdrawals**: Bank account payouts
- **Transaction History**: Complete fiat transaction tracking

### 5. KYC Verification

#### Tiers
- **Tier 1**: Basic verification (email, phone)
- **Tier 2**: BVN verification
- **Tier 3**: Document upload
- **Tier 4**: Advanced verification

### 6. Payment Processing

#### PalmPay Integration
- **Deposits**: Deposit funds via PalmPay
- **Payouts**: Send funds to bank accounts
- **Merchant Orders**: Process merchant payments
- **Webhook Processing**: Real-time payment status updates

### 7. Support System

#### Features
- **Support Chats**: Customer support chat system
- **Message System**: Real-time messaging via WebSocket
- **File Attachments**: Support for file uploads
- **Agent Assignment**: Assign chats to support agents

### 8. Referral System

#### Features
- **Referral Codes**: Unique codes for each user
- **Referral Tracking**: Track referrals and earnings
- **Rewards**: Referral bonuses and commissions

---

## External Integrations

### 1. Tatum API

**Purpose**: Blockchain infrastructure and cryptocurrency services

**Services Used**:
- Master wallet creation
- User wallet generation
- Virtual account management
- Deposit address generation
- Webhook subscriptions
- Transaction monitoring

**Configuration**:
```env
TATUM_API_KEY=your_tatum_api_key
TATUM_BASE_URL=https://api.tatum.io/v3
TATUM_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/tatum
```

**Key Features**:
- Multi-blockchain support
- Automatic webhook processing
- Balance updates via webhooks
- Address reuse within blockchain groups

### 2. Reloadly API

**Purpose**: Gift cards, airtime, data bundles, utility bills

**Services Used**:
- Gift card product catalog
- Gift card purchases
- Airtime top-ups
- Data bundle purchases
- Utility bill payments

**Configuration**:
```env
RELOADLY_CLIENT_ID=your_client_id
RELOADLY_CLIENT_SECRET=your_client_secret
RELOADLY_ENVIRONMENT=sandbox  # or production
```

**Endpoints**:
- Gift Cards: `https://giftcards.reloadly.com` (or sandbox)
- Topups/Utilities: `https://topups.reloadly.com` (or sandbox)

### 3. VTPass API

**Purpose**: Bill payment services

**Services Used**:
- Airtime purchases
- Data bundle purchases
- Cable TV subscriptions
- Electricity bills
- Education payments

**Configuration**:
```env
VTPASS_API_KEY=your_api_key
VTPASS_PUBLIC_KEY=your_public_key
VTPASS_USERNAME=your_username
VTPASS_ENVIRONMENT=sandbox  # or production
```

### 4. PalmPay API

**Purpose**: Payment processing (deposits, payouts)

**Services Used**:
- Deposit processing
- Bank account payouts
- Merchant order processing
- Webhook processing

**Configuration**:
```env
PALMPAY_PRIVATE_KEY=your_base64_private_key
PALMPAY_API_KEY=your_api_key
PALMPAY_ENVIRONMENT=sandbox  # or production
PALMPAY_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/palmpay
```

---

## Queue System & Background Jobs

### Queue Infrastructure

**Technology**: Bull (Redis-based job queue)

**Purpose**: Asynchronous processing of time-consuming operations

### Queue Types

1. **tatum** - Tatum-related jobs
   - Virtual account creation
   - Webhook processing

2. **bill-payments** - Bill payment jobs
   - Payment status checks
   - Reloadly utility payment status updates

### Schedulers

1. **Reloadly Utility Status Scheduler**
   - Checks processing Reloadly utility payments every 5 minutes
   - Queues status check jobs for incomplete payments
   - Prevents duplicate job queuing

### Running Workers

```bash
# Start worker for bill payments
npm run queue:work:bill-payments

# Start worker for Tatum jobs
npm run queue:work:tatum

# Clear queue
npm run queue:clear
```

### Redis Configuration

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Optional
```

---

## Security Features

### 1. Authentication & Authorization

- **JWT Tokens**: Secure token-based authentication
- **Password Hashing**: bcryptjs for password encryption
- **Role-Based Access**: Admin, Agent, Customer roles
- **Custom Roles**: Configurable permissions for admin users

### 2. Data Encryption

- **Private Keys**: AES-256-CBC encryption for cryptocurrency private keys
- **Mnemonics**: Encrypted storage of wallet mnemonics
- **Encryption Key**: 32-character key stored in environment variables

### 3. Input Validation

- **express-validator**: Request validation middleware
- **Type Safety**: TypeScript for compile-time type checking
- **SQL Injection Prevention**: Prisma ORM with parameterized queries

### 4. Webhook Security

- **Signature Verification**: PalmPay webhook signature verification
- **Reference Tracking**: Prevent duplicate webhook processing

### 5. Error Handling

- **Custom Error Classes**: Structured error responses
- **Error Logging**: Comprehensive error logging
- **Graceful Degradation**: Fallback mechanisms for external API failures

---

## Environment Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL=mysql://user:password@host:port/database

# Server
PORT=5000
BASE_URL=https://yourdomain.com
NODE_ENV=production

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key!!

# Redis (Queue System)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Tatum API
TATUM_API_KEY=your_tatum_api_key
TATUM_BASE_URL=https://api.tatum.io/v3
TATUM_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/tatum

# Reloadly API
RELOADLY_CLIENT_ID=your_client_id
RELOADLY_CLIENT_SECRET=your_client_secret
RELOADLY_ENVIRONMENT=sandbox  # or production

# VTPass API
VTPASS_API_KEY=your_api_key
VTPASS_PUBLIC_KEY=your_public_key
VTPASS_USERNAME=your_username
VTPASS_ENVIRONMENT=sandbox  # or production

# PalmPay API
PALMPAY_PRIVATE_KEY=your_base64_private_key
PALMPAY_API_KEY=your_api_key
PALMPAY_MERCHANT_ID=your_merchant_id
PALMPAY_APP_ID=your_app_id
PALMPAY_ENVIRONMENT=sandbox  # or production
PALMPAY_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/palmpay

# Email (Optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_password

# Firebase (Optional - for push notifications)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
```

---

## Deployment Information

### Build Process

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run database migrations
npm run migration:prod

# Start production server
npm start
```

### Development

```bash
# Start development server with auto-reload
npm run dev

# Start queue worker
npm run queue:work
```

### Database Migrations

```bash
# Create migration
npm run migration:create --name migration_name

# Run migrations (development)
npm run migrate

# Run migrations (production)
npm run migration:prod
```

### Prerequisites

1. **Node.js** (v18+)
2. **MySQL** (v8+)
3. **Redis** (for queue system)
4. **Environment Variables** (configured)

### Health Checks

- Health check endpoint: `GET /` (returns "Hello World!")
- Swagger docs: `GET /api-docs`

---

## Testing Guidelines

### Manual Testing Checklist

#### Authentication
- [ ] User registration
- [ ] Email verification
- [ ] Login/logout
- [ ] Password reset

#### Cryptocurrency
- [ ] Generate wallet for each blockchain
- [ ] Get deposit address
- [ ] Buy crypto (NGN → Crypto)
- [ ] Sell crypto (Crypto → NGN)
- [ ] Swap crypto (Crypto → Crypto)
- [ ] Send crypto to external address
- [ ] View transaction history
- [ ] USDT transactions across networks

#### Gift Cards
- [ ] Browse products
- [ ] Filter by country/category
- [ ] Purchase gift card
- [ ] View order details
- [ ] Retrieve card PINs

#### Bill Payments
- [ ] Purchase airtime
- [ ] Purchase data bundle
- [ ] Pay utility bills (Reloadly)
- [ ] Pay cable TV (VTPass)
- [ ] View payment history

#### Fiat Wallets
- [ ] Deposit funds (PalmPay)
- [ ] Withdraw to bank account
- [ ] View transaction history

#### KYC
- [ ] Submit KYC documents
- [ ] Check KYC status
- [ ] Tier progression

### API Testing

**Swagger UI**: Access at `/api-docs` for interactive API testing

**Postman**: Collection available at `Reloadly Developer APIs.postman_collection.json`

### Test Routes

- `/api/v2/test/vtpass/*` - VTPass test endpoints
- `/api/testing/gas` - Gas estimation testing

---

## Recent Changes & Updates

### December 2024

#### Gift Card Product API Enhancement
- **Issue**: Gift card products were missing many fields from Reloadly API response
- **Fix**: Updated `getProductsController` and `getProductByIdController` to include all Reloadly API fields:
  - `global`, `status`, `supportsPreOrder`
  - `senderFee`, `senderFeePercentage`, `discountPercentage`
  - `denominationType`, `recipientCurrencyCode`, `senderCurrencyCode`
  - `minRecipientDenomination`, `maxRecipientDenomination`
  - `minSenderDenomination`, `maxSenderDenomination`
  - `fixedRecipientDenominations`, `fixedSenderDenominations`
  - `brand` object (with brandId, brandName, logoUrl)
  - `category` object (with id, name)
  - `country` object (with isoName, name, flagUrl)
  - `additionalRequirements`
  - `recipientCurrencyToSenderCurrencyExchangeRate`
- **Impact**: Frontend now receives complete product data matching Reloadly API structure

#### Gift Card Order Request Fix
- **Issue**: Reloadly API 500 error when purchasing gift cards
- **Fix**: Updated request body to only include optional fields when they have values:
  - `preOrder` only included if `true`
  - `recipientEmail` only included if explicitly provided
  - `recipientPhoneDetails` only included if both countryCode and phoneNumber provided
  - `productAdditionalRequirements` only included if provided
- **Impact**: Request body now matches Reloadly API architecture requirements

#### Reloadly Utility Payment Status Scheduler
- **Feature**: Automated status checking for processing Reloadly utility payments
- **Implementation**: 
  - Scheduler runs every 5 minutes
  - Checks for payments with "PROCESSING" status
  - Queues status check jobs
  - Prevents duplicate job queuing
  - Captures PINs/tokens when available
- **Impact**: Ensures utility payments complete successfully and tokens are captured

#### USDT Transactions Endpoint
- **Feature**: New endpoint to get all USDT transactions across all networks
- **Endpoint**: `GET /api/v2/crypto/transactions/usdt/transactions`
- **Features**:
  - Combines USDT transactions from Ethereum, Tron, and BSC
  - Supports filtering by transaction type
  - Pagination support
  - Includes swap transactions involving USDT

#### Phone Number Validation Update
- **Change**: Updated Reloadly airtime phone number validation
- **Previous**: Only 11 digits (0 + 10 digits)
- **New**: Supports 11 or 15 digits (0 + 10 or 14 digits)
- **Impact**: Supports international phone numbers for airtime purchases

### Previous Updates

- Solana and XRP wallet generation fixes
- Dynamic blockchain support from database
- Virtual account creation for new blockchains
- Webhook subscription fixes for Dogecoin and XRP
- Reloadly gift card API base URL corrections
- USDT currency consolidation for sell flow

---

## Troubleshooting Guide

### Common Issues

#### 1. Database Connection Errors

**Error**: `Can't reach database server`

**Solutions**:
- Check `DATABASE_URL` in `.env`
- Verify MySQL server is running
- Check network connectivity
- Verify database credentials

#### 2. Redis Connection Errors

**Error**: `Redis connection failed`

**Solutions**:
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_HOST` and `REDIS_PORT` in `.env`
- Start Redis: `brew services start redis` (macOS) or `sudo systemctl start redis` (Linux)

#### 3. Tatum API Errors

**Error**: `Tatum API error: Invalid API key`

**Solutions**:
- Verify `TATUM_API_KEY` in `.env`
- Check API key is active in Tatum dashboard
- Ensure webhook URL is publicly accessible

#### 4. Encryption Key Errors

**Error**: `Invalid encryption key length`

**Solutions**:
- Ensure `ENCRYPTION_KEY` is exactly 32 characters
- Generate new key: `openssl rand -hex 16`

#### 5. Queue Jobs Not Processing

**Error**: Jobs stuck in queue

**Solutions**:
- Verify queue worker is running: `npm run queue:work`
- Check Redis connection
- Clear stuck jobs: `npm run queue:clear`
- Check worker logs for errors

#### 6. Webhook Not Receiving Events

**Error**: Tatum/PalmPay webhooks not arriving

**Solutions**:
- Verify webhook URL is publicly accessible
- Use ngrok for local testing: `ngrok http 5000`
- Check webhook URL in external service dashboard
- Verify webhook endpoint is registered

#### 7. Gift Card Purchase 500 Error

**Error**: `Reloadly API error: Your request could not be processed`

**Solutions**:
- Check request body matches Reloadly API schema
- Verify optional fields are only included when they have values
- Check Reloadly API logs for detailed error
- Verify product ID exists and is active
- Check denomination values are valid for product

### Debug Mode

Enable detailed logging:
```env
NODE_ENV=development
DEBUG=*
```

### Logs Location

- Application logs: Console output
- Queue logs: Worker console output
- Error logs: Console with stack traces

### Support Channels

- Check Swagger docs: `/api-docs`
- Review error logs in console
- Check database for transaction records
- Verify external API status

---

## Additional Resources

### Documentation Files

- `docs/TATUM_COMPLETE_IMPLEMENTATION_GUIDE.md` - Complete Tatum implementation
- `docs/RELOADLY_IMPLEMENTATION_SUMMARY.md` - Reloadly integration details
- `docs/PALMPAY_API_IMPLEMENTATION.md` - PalmPay integration guide
- `docs/V2_APIS_SUMMARY.md` - V2 API overview

### API Collections

- Postman Collection: `Reloadly Developer APIs.postman_collection.json`

### External Links

- Tatum Dashboard: https://dashboard.tatum.io/
- Reloadly Dashboard: https://www.reloadly.com/
- VTPass Documentation: https://vtpass.com/
- PalmPay Documentation: https://developer.palmpay.com/

---

## Contact & Support

For technical questions or issues:
1. Check this documentation
2. Review error logs
3. Consult Swagger API docs at `/api-docs`
4. Contact development team

---

**Document Version**: 1.0.0  
**Last Updated**: December 29, 2024  
**Maintained By**: Development Team


