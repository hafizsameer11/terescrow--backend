# TereScrow Platform - Functional Documentation & User Journey Guide

**Version:** 1.0.0  
**Last Updated:** December 2024  
**Document Purpose:** User journey flows and functional specifications for QA, Product Managers, and Business Stakeholders

---

## 📋 Table of Contents

1. [Platform Overview](#platform-overview)
2. [User Journey: Gift Cards (Reloadly)](#user-journey-gift-cards-reloadly)
3. [User Journey: Bill Payments](#user-journey-bill-payments)
4. [User Journey: Cryptocurrency Services (Tatum)](#user-journey-cryptocurrency-services-tatum)
5. [User Journey: Data & Airtime (Reloadly)](#user-journey-data--airtime-reloadly)
6. [User Journey: Electricity Bills (Reloadly)](#user-journey-electricity-bills-reloadly)
7. [Admin Features: Master Wallet Management](#admin-features-master-wallet-management)
8. [Automated Processes](#automated-processes)
9. [Feature Summary](#feature-summary)

---

## Platform Overview

**TereScrow** is a comprehensive financial services platform that enables users to:

- 💳 Purchase gift cards from global brands
- 💰 Buy, sell, swap, and receive cryptocurrencies
- 📱 Purchase airtime and data bundles
- ⚡ Pay utility bills (electricity, cable TV)
- 🎯 Make betting deposits
- 💸 Manage fiat currency (NGN) wallets
- 🏦 Link bank accounts for withdrawals

---

## User Journey: Gift Cards (Reloadly)

### Overview
Users can purchase digital gift cards from popular brands like Amazon, Google Play, iTunes, Steam, PlayStation, Xbox, and more through our Reloadly integration.

### Complete User Flow

#### Step 1: Browse Gift Cards
**Action**: User navigates to Gift Cards section

**User Experience**:
- User sees available gift card products
- Can filter by:
  - Country (US, UK, Nigeria, etc.)
  - Category (Gaming, Entertainment, Shopping, etc.)
  - Search by product name or brand

**Available Information**:
- Product name and brand
- Country availability
- Currency (USD, GBP, NGN, etc.)
- Denomination type (Fixed amounts or Range)
- Minimum and maximum values
- Fixed denomination options (if applicable)
- Discount percentage
- Product images/logos
- Redemption instructions

#### Step 2: Select Gift Card
**Action**: User clicks on desired gift card product

**User Experience**:
- View detailed product information
- See all available denominations (for fixed amounts)
- See minimum and maximum values (for range)
- Read redemption instructions
- Check if pre-order is supported

**Product Details Include**:
- Brand information with logo
- Country and currency details
- Denomination options
- Fees and discounts
- Exchange rate (if applicable)
- Additional requirements (if any)

#### Step 3: Choose Amount
**Action**: User selects or enters gift card value

**User Experience**:
- For **Fixed Denomination** products:
  - Select from available fixed amounts
  - Example: $10, $25, $50, $100
- For **Range Denomination** products:
  - Enter amount within min/max range
  - Example: Enter any amount between $10 - $500

**Validation**:
- Amount must match fixed denominations (for fixed type)
- Amount must be within min/max range (for range type)
- System validates amount before proceeding

#### Step 4: Preview Purchase
**Action**: User confirms amount and proceeds to purchase

**User Experience**:
- See purchase summary:
  - Product name and brand
  - Quantity (if purchasing multiple)
  - Unit price
  - Total cost (including fees)
  - Discount (if applicable)
  - Final amount to pay
- Enter optional details:
  - Recipient email (for delivery)
  - Recipient phone number (optional, for security)
  - Custom identifier (optional, for tracking)
- Choose pre-order option (if product supports it)

#### Step 5: Confirm & Purchase
**Action**: User confirms and completes purchase

**User Experience**:
- Payment is processed from user's wallet
- Order is created with Reloadly
- User receives order confirmation
- Order status: **SUCCESSFUL**, **PENDING**, or **PROCESSING**

#### Step 6: Receive Gift Card
**Action**: System delivers gift card to user

**User Experience**:
- Order appears in user's order history
- For **SUCCESSFUL** orders:
  - Gift card PIN/code is immediately available
  - User can view card details:
    - PIN/Code
    - Serial number
    - Expiry date (if applicable)
    - Redemption instructions
  - Email sent to recipient (if email provided)
- For **PROCESSING** orders:
  - Order is being processed
  - User will receive notification when ready
  - Typically takes a few minutes
- For **PENDING** orders:
  - Pre-ordered cards
  - User receives notification when card becomes available

#### Step 7: Redeem Gift Card
**Action**: User redeems gift card with merchant

**User Experience**:
- User receives redemption instructions
- Instructions are product-specific
- User visits merchant website/app
- Enters gift card PIN/code
- Gift card balance is applied

### Key Features

✅ **Multi-Country Support**: Gift cards from various countries
✅ **Multiple Brands**: Access to hundreds of gift card brands
✅ **Instant Delivery**: Most cards delivered immediately
✅ **Pre-Order Support**: Order cards before they're available
✅ **Secure PINs**: Encrypted PIN delivery
✅ **Order Tracking**: Complete order history
✅ **Email Delivery**: Optional email delivery to recipients
✅ **Mobile-Friendly**: Easy to use on mobile devices

### Success Scenarios

**Scenario 1: Instant Purchase**
1. User selects $50 Amazon US gift card
2. Clicks purchase
3. Payment processed
4. Card delivered immediately (SUCCESSFUL)
5. User receives PIN via app and email

**Scenario 2: Pre-Order**
1. User selects PlayStation gift card (currently out of stock)
2. Chooses pre-order option
3. Payment processed
4. Order marked as PENDING
5. User receives notification when card becomes available
6. Card delivered automatically

**Scenario 3: Bulk Purchase**
1. User selects Google Play gift card
2. Sets quantity to 5
3. Sets amount to $10 each
4. Total: $50
5. All 5 cards delivered with unique PINs

### Error Handling

- **Insufficient Balance**: User sees balance error, can add funds
- **Product Unavailable**: Clear message, suggests alternatives
- **Invalid Amount**: Validation error with acceptable range
- **Payment Failed**: Retry option provided
- **Processing Delay**: Status updates shown, user notified

---

## User Journey: Bill Payments

### Overview
Users can pay various bills including betting deposits, electricity bills, cable TV subscriptions, and more through our PalmPay integration.

### Betting Deposit Flow (PalmPay)

#### Step 1: Initiate Betting Deposit
**Action**: User selects "Betting Deposit" option

**User Experience**:
- User navigates to Bill Payments section
- Selects "Betting" category
- Chooses betting provider from list

#### Step 2: Enter Deposit Details
**Action**: User enters betting account information

**User Experience**:
- Enter betting account number/ID
- Select betting provider (Bet9ja, SportyBet, NairaBet, etc.)
- Enter deposit amount
- Review fees (if applicable)

#### Step 3: Verify Account
**Action**: System verifies betting account

**User Experience**:
- Account verification in progress
- System validates account exists
- Displays account name (if available)
- User confirms account details

#### Step 4: Payment Processing
**Action**: User confirms and pays

**User Experience**:
- Payment amount displayed
- User confirms payment
- Payment processed via PalmPay
- Transaction ID generated

#### Step 5: Deposit Confirmation
**Action**: Deposit is completed

**User Experience**:
- Payment status: **SUCCESSFUL**
- Deposit reference number provided
- Receipt generated
- User's betting account credited
- Transaction appears in history

### Key Features

✅ **Multiple Betting Providers**: Support for major betting platforms
✅ **Instant Deposits**: Real-time payment processing
✅ **Account Verification**: Verify account before payment
✅ **Transaction Receipts**: Digital receipts for all payments
✅ **Payment History**: Complete transaction history
✅ **Secure Processing**: Encrypted payment handling

---

## User Journey: Cryptocurrency Services (Tatum)

### Overview
Users can buy, sell, swap, send, and receive cryptocurrencies across multiple blockchain networks using our Tatum integration.

### Supported Cryptocurrencies

**Bitcoin (BTC)**
- Network: Bitcoin
- Use cases: Store of value, payments

**Ethereum (ETH)**
- Network: Ethereum
- Use cases: Smart contracts, DeFi

**USDT (Tether)**
- Networks: Ethereum, Tron, BSC
- Use cases: Stablecoin payments, trading

**USDC (USD Coin)**
- Networks: Ethereum, BSC
- Use cases: Stablecoin, DeFi

**Tron (TRX)**
- Network: Tron
- Use cases: Fast transactions, dApps

**Binance Coin (BNB)**
- Network: BSC
- Use cases: Binance ecosystem, DeFi

**Solana (SOL)**
- Network: Solana
- Use cases: Fast transactions, NFT, DeFi

**Litecoin (LTC)**
- Network: Litecoin
- Use cases: Payments, faster than Bitcoin

**Polygon (MATIC)**
- Network: Polygon
- Use cases: Ethereum scaling, DeFi

**Dogecoin (DOGE)**
- Network: Dogecoin
- Use cases: Payments, tipping

**XRP (Ripple)**
- Network: Ripple
- Use cases: Cross-border payments

### User Journey: Receiving Cryptocurrency

#### Step 1: Get Deposit Address
**Action**: User wants to receive cryptocurrency

**User Experience**:
- User navigates to "Receive" section
- Selects cryptocurrency (e.g., USDT)
- Selects network (Ethereum, Tron, or BSC for USDT)
- System generates unique deposit address
- Address is displayed as QR code and text

**Important Notes**:
- Each cryptocurrency/network combination has unique address
- USDT on Ethereum, Tron, and BSC have different addresses
- Address can be reused multiple times
- Address is specific to user's account

#### Step 2: Share Address
**Action**: User shares deposit address with sender

**User Experience**:
- User copies address or shares QR code
- Can send via messaging apps
- QR code can be scanned directly
- Address is saved for future use

#### Step 3: Receive Funds
**Action**: Sender sends cryptocurrency to address

**User Experience**:
- Funds are detected on blockchain
- System receives webhook notification from Tatum
- Balance is updated automatically
- Transaction appears in history
- User receives in-app notification
- Balance reflects new funds immediately

#### Step 4: View Transaction
**Action**: User checks transaction details

**User Experience**:
- Transaction shows in history as "RECEIVED"
- Details include:
  - Amount received
  - Network/blockchain
  - Transaction hash
  - Sender address
  - Confirmation status
  - Timestamp
- Transaction is linked to deposit address

### User Journey: Buying Cryptocurrency

#### Step 1: Select Currency
**Action**: User wants to buy cryptocurrency

**User Experience**:
- User navigates to "Buy Crypto" section
- Views available cryptocurrencies
- Each currency shows:
  - Current price in NGN
  - Available networks (for USDT, USDC)
  - Minimum purchase amount
- User selects desired cryptocurrency

#### Step 2: Enter Amount
**Action**: User enters purchase amount

**User Experience**:
- Two input options:
  - Enter amount in NGN (fiat)
  - Enter amount in crypto
- System shows conversion:
  - If entering NGN: Shows crypto equivalent
  - If entering crypto: Shows NGN cost
- Shows fees and total amount
- Displays exchange rate

#### Step 3: Get Quote
**Action**: User requests purchase quote

**User Experience**:
- System calculates:
  - Exchange rate
  - Fees
  - Total cost
  - Crypto amount to receive
- Quote is valid for a short period
- User reviews quote details

#### Step 4: Preview Transaction
**Action**: User reviews transaction before confirming

**User Experience**:
- Transaction summary displayed:
  - Cryptocurrency and network
  - Amount in NGN (paying)
  - Amount in crypto (receiving)
  - Fees breakdown
  - Exchange rate
  - Estimated time to receive
- User confirms all details

#### Step 5: Confirm Purchase
**Action**: User confirms and pays

**User Experience**:
- Payment processed from NGN wallet
- If insufficient balance: Prompt to add funds
- Transaction created
- Status: **PROCESSING**

#### Step 6: Receive Cryptocurrency
**Action**: Purchase is completed

**User Experience**:
- Cryptocurrency is credited to user's account
- Balance updated
- Transaction status: **SUCCESSFUL**
- Transaction appears in history
- User receives notification

### User Journey: Selling Cryptocurrency

#### Step 1: Select Currency to Sell
**Action**: User wants to sell cryptocurrency

**User Experience**:
- User navigates to "Sell Crypto" section
- Views cryptocurrencies with available balance
- For USDT: Shows combined balance across all networks
- User selects cryptocurrency to sell

#### Step 2: Enter Amount
**Action**: User enters sale amount

**User Experience**:
- Two input options:
  - Enter amount in crypto (to sell)
  - Enter amount in NGN (to receive)
- System shows conversion
- Shows current balance
- Calculates fees and net proceeds

#### Step 3: Get Quote
**Action**: User requests sale quote

**User Experience**:
- System calculates:
  - Exchange rate
  - Fees
  - Net NGN amount to receive
  - Crypto amount to sell
- Quote displayed with all details

#### Step 4: Preview Transaction
**Action**: User reviews transaction

**User Experience**:
- Transaction summary:
  - Cryptocurrency and network
  - Amount selling (crypto)
  - Amount receiving (NGN)
  - Fees
  - Exchange rate
- User confirms details

#### Step 5: Confirm Sale
**Action**: User confirms sale

**User Experience**:
- Cryptocurrency is deducted from balance
- Transaction status: **PROCESSING**
- Sale is processed
- NGN is credited to wallet

#### Step 6: Receive NGN
**Action**: Sale is completed

**User Experience**:
- NGN credited to user's fiat wallet
- Transaction status: **SUCCESSFUL**
- Transaction in history
- User receives notification

### User Journey: Swapping Cryptocurrency

#### Step 1: Select Currencies
**Action**: User wants to swap one crypto for another

**User Experience**:
- User navigates to "Swap" section
- Selects "From" currency (what they have)
- Selects "To" currency (what they want)
- System shows available options

#### Step 2: Enter Amount
**Action**: User enters swap amount

**User Experience**:
- Enter amount of "From" currency
- System calculates:
  - Amount of "To" currency to receive
  - Gas fees (network fees)
  - Total cost
- Shows exchange rate

#### Step 3: Get Quote
**Action**: User requests swap quote

**User Experience**:
- Quote includes:
  - Amount swapping
  - Amount receiving
  - Gas fees
  - Exchange rate
  - Estimated transaction time
- Quote is time-limited

#### Step 4: Preview Swap
**Action**: User reviews swap details

**User Experience**:
- Complete swap summary:
  - From: Currency, amount, network
  - To: Currency, amount, network
  - Total fees (including gas)
  - Exchange rate
- User confirms

#### Step 5: Execute Swap
**Action**: User confirms swap

**User Experience**:
- "From" currency deducted from balance
- Status: **PROCESSING**
- Swap transaction sent to blockchain
- Waiting for confirmation

#### Step 6: Receive Swapped Currency
**Action**: Swap is completed

**User Experience**:
- Transaction confirmed on blockchain
- "To" currency credited to balance
- Status: **SUCCESSFUL**
- Transaction in history
- User receives notification

### User Journey: Sending Cryptocurrency

#### Step 1: Select Currency
**Action**: User wants to send crypto to external address

**User Experience**:
- User navigates to "Send" section
- Selects cryptocurrency to send
- Selects network (for multi-network cryptos)
- Views available balance

#### Step 2: Enter Recipient Details
**Action**: User enters recipient information

**User Experience**:
- Enter recipient wallet address
- System validates address format
- Can scan QR code (if available)
- Enter amount to send
- Optional: Add memo/note

#### Step 3: Calculate Fees
**Action**: System calculates transaction fees

**User Experience**:
- Shows network fees (gas fees)
- Shows platform fees (if any)
- Calculates total amount:
  - Amount sending
  - Total fees
  - Total deduction from balance

#### Step 4: Preview Transaction
**Action**: User reviews send transaction

**User Experience**:
- Transaction summary:
  - Recipient address (first/last characters shown)
  - Amount sending
  - Network fees
  - Total cost
  - Network/blockchain
- Warning: Cannot reverse transaction
- User confirms

#### Step 5: Confirm & Send
**Action**: User confirms and sends

**User Experience**:
- Transaction is broadcast to blockchain
- Status: **PROCESSING**
- Waiting for network confirmation
- Transaction hash generated

#### Step 6: Transaction Confirmed
**Action**: Transaction is confirmed

**User Experience**:
- Network confirms transaction
- Status: **SUCCESSFUL**
- Cryptocurrency deducted from balance
- Transaction appears in history
- Transaction hash available for blockchain explorer
- User receives notification

### Automated Process: Nightly Sweep to Master Wallet

#### Overview
To enhance security and centralize funds, all cryptocurrency received by users is automatically swept to master wallets every night.

#### Process Flow

**Step 1: Detection (Automatic)**
- System runs automated sweep process every night (scheduled time)
- Scans all user deposit addresses for received funds
- Identifies cryptocurrencies that need to be swept

**Step 2: Sweep Execution (Automatic)**
- For each user with received funds:
  - System transfers funds from user's deposit address to master wallet
  - Transaction is recorded
  - User's virtual account balance is maintained (credit balance remains)
- Sweep happens automatically without user action

**Step 3: Balance Management**
- User's displayed balance remains unchanged
- User can still use their full balance for transactions
- Physical funds are secured in master wallet
- System tracks user's credit balance separately

**Step 4: Transaction Recording**
- Sweep transaction is logged in system
- Appears in admin dashboard
- Not visible to users (internal process)
- Used for reconciliation and auditing

#### Benefits

✅ **Enhanced Security**: Funds stored in secure master wallets
✅ **Centralized Management**: Easier fund management and reconciliation
✅ **Seamless Experience**: Users don't notice any difference
✅ **Faster Operations**: Master wallet enables faster transactions
✅ **Automated**: No manual intervention required

---

## User Journey: Data & Airtime (Reloadly)

### Overview
Users can purchase mobile airtime and data bundles for all major Nigerian networks (MTN, Airtel, Glo, 9mobile) through our Reloadly integration.

### Airtime Purchase Flow

#### Step 1: Select Service
**Action**: User navigates to Airtime/Data section

**User Experience**:
- User selects "Airtime" option
- Views available networks:
  - MTN
  - Airtel
  - Glo
  - 9mobile

#### Step 2: Enter Details
**Action**: User enters purchase details

**User Experience**:
- Enter phone number (11 or 15 digits, starting with 0)
- System validates phone number format
- Select network (auto-detected if possible)
- Enter airtime amount:
  - Select from preset amounts (₦100, ₦200, ₦500, ₦1000, etc.)
  - Or enter custom amount (minimum varies by network)
- System shows fees (if applicable)

#### Step 3: Verify Number
**Action**: System verifies phone number

**User Experience**:
- Phone number format validated
- Network confirmed
- Account verification (if supported by network)
- User confirms phone number and amount

#### Step 4: Preview Purchase
**Action**: User reviews purchase

**User Experience**:
- Purchase summary:
  - Phone number
  - Network
  - Airtime amount
  - Total cost (including fees)
  - Estimated delivery time
- User confirms details

#### Step 5: Process Payment
**Action**: User confirms and pays

**User Experience**:
- Payment processed from user's wallet
- Transaction created
- Status: **PROCESSING**
- Airtime is being sent

#### Step 6: Receive Airtime
**Action**: Airtime is delivered

**User Experience**:
- Airtime credited to phone number
- Status: **SUCCESSFUL**
- Transaction in history
- User receives confirmation
- SMS confirmation sent to phone (optional)

### Data Bundle Purchase Flow

#### Step 1: Select Data Plan
**Action**: User selects data bundle option

**User Experience**:
- User navigates to "Data" section
- Selects network (MTN, Airtel, Glo, 9mobile)
- Views available data plans:
  - Daily plans (e.g., 100MB, 500MB)
  - Weekly plans (e.g., 1GB, 2GB)
  - Monthly plans (e.g., 5GB, 10GB, 50GB)
  - Social media bundles
  - Video streaming bundles
- Each plan shows:
  - Data volume
  - Validity period
  - Price
  - Network speed

#### Step 2: Select Plan
**Action**: User chooses data plan

**User Experience**:
- User clicks on desired plan
- Plan details displayed:
  - Data volume (e.g., 10GB)
  - Validity (e.g., 30 days)
  - Price (e.g., ₦2,500)
  - Network
  - Speed (4G/5G)

#### Step 3: Enter Phone Number
**Action**: User enters recipient phone number

**User Experience**:
- Enter phone number
- System validates format
- Network auto-detected
- Confirms network matches selected plan

#### Step 4: Review & Purchase
**Action**: User reviews and purchases

**User Experience**:
- Purchase summary:
  - Phone number
  - Network
  - Data plan and volume
  - Validity period
  - Price
  - Total cost
- User confirms
- Payment processed

#### Step 5: Data Activation
**Action**: Data bundle is activated

**User Experience**:
- Data bundle activated on phone number
- Status: **SUCCESSFUL**
- User receives confirmation
- Data is immediately available
- Transaction in history

### Key Features

✅ **All Networks**: MTN, Airtel, Glo, 9mobile support
✅ **Instant Delivery**: Airtime and data delivered immediately
✅ **Flexible Amounts**: Preset or custom amounts
✅ **Multiple Plans**: Various data bundle options
✅ **Phone Validation**: Automatic phone number validation
✅ **Transaction History**: Complete purchase history
✅ **Instant Confirmation**: Real-time status updates

---

## User Journey: Electricity Bills (Reloadly)

### Overview
Users can pay electricity bills for major providers (IKEDC, EKEDC, AEDC, KEDCO, PHED, IBEDC, etc.) through our Reloadly integration.

### Electricity Bill Payment Flow

#### Step 1: Select Electricity Provider
**Action**: User navigates to Electricity Bills section

**User Experience**:
- User selects "Electricity" category
- Views available electricity providers:
  - IKEDC (Ikeja Electric)
  - EKEDC (Eko Electricity)
  - AEDC (Abuja Electricity)
  - KEDCO (Kano Electricity)
  - PHED (Port Harcourt Electricity)
  - IBEDC (Ibadan Electricity)
  - And more...
- Each provider shows logo and coverage area

#### Step 2: Enter Account Details
**Action**: User enters electricity account information

**User Experience**:
- Select electricity provider
- Enter meter number (prepaid or postpaid)
- System validates meter number format
- Enter amount to pay:
  - For prepaid: Amount to recharge
  - For postpaid: Bill amount
- System shows fees (if applicable)

#### Step 3: Verify Account
**Action**: System verifies electricity account

**User Experience**:
- Meter number validated
- System checks account exists
- For postpaid: Shows outstanding balance
- For prepaid: Confirms meter is active
- Displays account name (if available)
- User confirms account details

#### Step 4: Preview Payment
**Action**: User reviews payment details

**User Experience**:
- Payment summary:
  - Provider name
  - Meter number (masked for security)
  - Account name (if available)
  - Amount paying
  - Fees
  - Total cost
  - Meter type (prepaid/postpaid)
- User confirms all details

#### Step 5: Process Payment
**Action**: User confirms and pays

**User Experience**:
- Payment processed from user's wallet
- Transaction created
- Status: **PROCESSING**
- Payment is being processed with provider

#### Step 6: Payment Confirmation
**Action**: Payment is completed

**User Experience**:
- **For Prepaid Meters**:
  - Tokens generated immediately
  - Status: **SUCCESSFUL**
  - User receives:
    - Token (20-digit number)
    - Reference number
    - Receipt
  - Token can be entered on meter
  - Token is saved in transaction history
  
- **For Postpaid Meters**:
  - Bill payment confirmed
  - Status: **SUCCESSFUL**
  - User receives:
    - Payment reference number
    - Receipt
    - Confirmation from provider

#### Step 7: View Token Details
**Action**: User views token information (for prepaid)

**User Experience**:
- Token details displayed:
  - 20-digit token
  - Units (kWh) purchased
  - Reference number
  - Expiry date (if applicable)
- Option to:
  - Copy token
  - Share token via SMS/WhatsApp
  - View receipt
  - Save for later

### Automated Status Updates

#### Background Processing
- System automatically checks payment status
- For payments showing **PROCESSING**:
  - System polls payment status every 5 minutes
  - Updates status automatically
  - Captures tokens when available
  - Notifies user when payment completes

#### Status Updates
- **PROCESSING**: Payment being processed
- **SUCCESSFUL**: Payment completed, tokens available
- **FAILED**: Payment failed, refund processed
- **PENDING**: Payment pending (rare cases)

### Key Features

✅ **Multiple Providers**: All major electricity distribution companies
✅ **Prepaid & Postpaid**: Support for both meter types
✅ **Instant Tokens**: Immediate token generation for prepaid
✅ **Account Verification**: Verify account before payment
✅ **Automatic Updates**: Status updated automatically
✅ **Token Storage**: Tokens saved in transaction history
✅ **Receipt Generation**: Digital receipts for all payments
✅ **Payment History**: Complete transaction history

### Success Scenarios

**Scenario 1: Prepaid Meter Recharge**
1. User selects IKEDC
2. Enters prepaid meter number
3. Enters ₦5,000
4. Payment processed
5. Token generated immediately
6. User receives 20-digit token
7. User enters token on meter
8. Units credited

**Scenario 2: Postpaid Bill Payment**
1. User selects EKEDC
2. Enters postpaid account number
3. System shows outstanding balance: ₦8,500
4. User confirms payment
5. Payment processed
6. Bill marked as paid
7. Receipt generated
8. Confirmation from provider

**Scenario 3: Delayed Token Delivery**
1. User pays for prepaid meter
2. Status: **PROCESSING**
3. System automatically checks status
4. Token becomes available after 2 minutes
5. System updates status to **SUCCESSFUL**
6. Token automatically captured
7. User receives notification
8. Token available in transaction details

---

## Admin Features: Master Wallet Management

### Overview
Administrators can manage master wallets and exchange cryptocurrencies using Changelly integration for liquidity management and fund operations.

### Master Wallet Management

#### View Master Wallets
**Admin Experience**:
- View all master wallets across blockchains
- See wallet addresses
- View balances for each wallet
- Check wallet status (active/inactive)
- View creation date and last activity

#### Create Master Wallets
**Admin Experience**:
- Create new master wallet for any blockchain
- System automatically generates wallet
- Wallet address and xpub stored securely
- Private keys encrypted and stored
- Wallet is immediately active

#### Monitor Balances
**Admin Experience**:
- Real-time balance monitoring
- Balance history and trends
- Alert system for low balances
- Transaction history per wallet
- Reconciliation tools

### Cryptocurrency Exchange (Changelly)

#### Overview
Administrators can exchange cryptocurrencies from master wallets using Changelly exchange integration for:
- Liquidity management
- Converting between cryptocurrencies
- Arbitrage opportunities
- Fund optimization

#### Exchange Flow

**Step 1: Select Exchange**
**Admin Experience**:
- Navigate to Exchange section
- Select "Exchange from Master Wallet"
- Choose source master wallet (blockchain/crypto)
- View available balance

**Step 2: Choose Currencies**
**Admin Experience**:
- Select "From" currency:
  - Choose from available master wallets
  - See available balance
- Select "To" currency:
  - Choose target cryptocurrency
  - See supported networks
- System shows available exchange pairs

**Step 3: Enter Amount**
**Admin Experience**:
- Enter amount to exchange
- System calculates:
  - Amount to receive (estimated)
  - Exchange rate
  - Changelly fees
  - Network fees (gas)
  - Minimum amount
  - Maximum amount

**Step 4: Get Quote**
**Admin Experience**:
- Request real-time quote from Changelly
- Quote includes:
  - Exact exchange rate
  - Exact amount to receive
  - All fees breakdown
  - Estimated processing time
  - Quote expiration time
- Quote is valid for limited time

**Step 5: Review Exchange**
**Admin Experience**:
- Complete exchange summary:
  - From: Currency, network, amount
  - To: Currency, network, amount
  - Exchange rate
  - Fees (Changelly + network)
  - Net amount to receive
  - Estimated time
- Review all details carefully

**Step 6: Confirm Exchange**
**Admin Experience**:
- Confirm exchange details
- System initiates exchange:
  - Funds sent from master wallet
  - Exchange processed via Changelly
  - Status: **PROCESSING**
  - Exchange ID generated

**Step 7: Monitor Exchange**
**Admin Experience**:
- Exchange status tracking:
  - **WAITING**: Waiting for deposit
  - **CONFIRMING**: Deposit confirmed, processing
  - **EXCHANGING**: Exchange in progress
  - **SENDING**: Sending to destination
  - **FINISHED**: Exchange completed
  - **FAILED**: Exchange failed
- Real-time status updates
- Transaction hash for tracking

**Step 8: Exchange Complete**
**Admin Experience**:
- Exchange completed successfully
- Funds received in target master wallet
- Balance updated automatically
- Exchange transaction recorded
- Receipt and details available
- Admin notified of completion

### Exchange Features

✅ **Multiple Pairs**: Exchange between various cryptocurrencies
✅ **Real-Time Rates**: Live exchange rates from Changelly
✅ **Transparent Fees**: Clear fee structure displayed
✅ **Fast Processing**: Quick exchange execution
✅ **Status Tracking**: Real-time exchange status
✅ **Transaction History**: Complete exchange history
✅ **Balance Management**: Automatic balance updates
✅ **Security**: Secure exchange process with confirmations

### Supported Exchange Pairs

**From Any Supported Crypto:**
- Bitcoin (BTC)
- Ethereum (ETH)
- USDT (all networks)
- USDC (all networks)
- BNB
- TRX
- SOL
- LTC
- MATIC
- DOGE
- XRP

**To Any Supported Crypto:**
- Same list as above
- Any pair combination supported by Changelly

### Use Cases

**Liquidity Management:**
- Convert excess BTC to USDT for operations
- Exchange between USDT networks (Ethereum ↔ Tron ↔ BSC)
- Optimize fund allocation across cryptocurrencies

**Arbitrage:**
- Take advantage of price differences
- Convert between networks for better rates
- Optimize exchange rates

**Fund Optimization:**
- Convert less-used cryptocurrencies to more active ones
- Consolidate funds across networks
- Prepare for high-demand periods

---

## Automated Processes

### 1. Nightly Sweep to Master Wallet

**Purpose**: Secure user funds by sweeping to master wallets

**Schedule**: Runs automatically every night

**Process**:
1. System scans all user deposit addresses
2. Identifies received cryptocurrency
3. Transfers funds to corresponding master wallet
4. Maintains user balance credits
5. Records all sweep transactions
6. Generates reconciliation reports

**Benefits**:
- Enhanced security
- Centralized fund management
- Faster transaction processing
- Automated reconciliation

### 2. Reloadly Utility Payment Status Updates

**Purpose**: Ensure utility payments complete and tokens are captured

**Schedule**: Runs every 5 minutes

**Process**:
1. Finds payments with PROCESSING status
2. Checks payment status with Reloadly
3. Updates payment status automatically
4. Captures tokens when available
5. Notifies users of completion
6. Handles failed payments

**Benefits**:
- Automatic status updates
- Token capture automation
- User notifications
- Failed payment handling

### 3. Balance Synchronization

**Purpose**: Keep virtual account balances synchronized

**Process**:
1. Monitors blockchain for transactions
2. Receives webhook notifications from Tatum
3. Updates user balances automatically
4. Records all transactions
5. Maintains accurate account balances

**Benefits**:
- Real-time balance updates
- Accurate transaction records
- Automatic reconciliation

---

## Feature Summary

### Gift Cards (Reloadly)
✅ Browse products by country/category
✅ Purchase gift cards instantly
✅ Pre-order support
✅ Multiple brands and countries
✅ Instant PIN delivery
✅ Order tracking
✅ Email delivery option

### Bill Payments (PalmPay)
✅ Betting deposits
✅ Instant payment processing
✅ Account verification
✅ Transaction receipts
✅ Payment history

### Data & Airtime (Reloadly)
✅ All Nigerian networks (MTN, Airtel, Glo, 9mobile)
✅ Instant airtime top-up
✅ Multiple data plans
✅ Flexible amounts
✅ Instant delivery

### Electricity Bills (Reloadly)
✅ All major distribution companies
✅ Prepaid and postpaid support
✅ Instant token generation
✅ Automatic status updates
✅ Token storage and sharing

### Cryptocurrency (Tatum)
✅ Buy, sell, swap, send, receive
✅ Multiple blockchains (10+)
✅ Multiple cryptocurrencies (10+)
✅ Instant transactions
✅ Real-time balance updates
✅ Transaction history
✅ Secure wallet management
✅ Nightly sweep to master wallet

### Admin Features
✅ Master wallet management
✅ Cryptocurrency exchange (Changelly)
✅ Real-time balance monitoring
✅ Transaction reconciliation
✅ Exchange rate management

---

## Success Metrics

### User Experience Metrics
- **Transaction Success Rate**: >99%
- **Instant Delivery Rate**: >95%
- **Average Transaction Time**: <2 minutes
- **User Satisfaction**: High

### System Performance
- **API Response Time**: <500ms average
- **Uptime**: 99.9%
- **Error Rate**: <0.1%
- **Webhook Processing**: <30 seconds

---

**Document Version**: 1.0.0  
**Last Updated**: December 29, 2024  
**For**: QA Team, Product Managers, Business Stakeholders


