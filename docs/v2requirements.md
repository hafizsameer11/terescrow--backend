1. AUTH & ONBOARDING FLOW
1.1 Splash / App Init Screen

UI purpose:

Show logo/loader

Check if user is logged in

If token present → fetch profile + wallets

Decide where to navigate (Dashboard vs Login/KYC)

API Calls:

1️⃣ GET current user

GET /api/v1/auth/me
Authorization: Bearer <access_token>


Response:

{
  "id": 123,
  "email": "user@example.com",
  "phone": "+2348012345678",
  "country": "NG",                // VERY IMPORTANT for routing engine
  "kycStatus": "approved",        // "pending" | "rejected" | "not_submitted"
  "roles": ["customer"],
  "createdAt": "2025-11-26T10:00:00Z"
}


2️⃣ GET wallet overview (new engine)

GET /api/v2/wallets/overview
Authorization: Bearer <access_token>


Response:

{
  "fiatWallets": [
    {
      "currency": "NGN",
      "balance": "50000.00",
      "isPrimary": true,
      "provider": "LOCAL_ADMIN"   // Nigeria engine
    },
    {
      "currency": "GHS",
      "balance": "0",
      "isPrimary": false,
      "provider": "YELLOW_CARD"
    }
  ],
  "cryptoWallets": [
    {
      "symbol": "USDT_TRON",
      "network": "TRON",
      "balance": "120.50",
      "depositAddress": "TRXxxxxx",
      "canWithdraw": true
    },
    {
      "symbol": "BTC",
      "network": "BTC",
      "balance": "0.01",
      "depositAddress": "bc1xxxxxx",
      "canWithdraw": true
    }
  ]
}


Logic:

If no token → go to Login/Signup

If token + kycStatus !== 'approved' → go to KYC flow

Else → go to Dashboard.

1.2 Login Screen

UI:

Email/Phone

Password

“Forgot password?” link

“Continue” button

API:

POST /api/v1/auth/login
Content-Type: application/json


Request:

{
  "identifier": "user@example.com",   // or phone
  "password": "secret123"
}


Response:

{
  "accessToken": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "user": {
    "id": 123,
    "email": "user@example.com",
    "phone": "+2348012345678",
    "country": "NG",
    "kycStatus": "approved"
  }
}

1.3 Signup Screen

UI:

Full name

Email

Phone

Country (Selectable input; default from device)

Password + Confirm password

Agree to T&C

API:

POST /api/v1/auth/register
Content-Type: application/json


Request:

{
  "fullName": "John Doe",
  "email": "user@example.com",
  "phone": "+2348012345678",
  "country": "NG",           // critical for routing (NG vs foreign)
  "password": "secret123",
  "confirmPassword": "secret123"
}


Response:

{
  "message": "Registration successful. Please verify your email/phone.",
  "userId": 123,
  "needsVerification": true
}

1.4 OTP / Verification Screen

UI:

4–6 digit OTP input

Timer / resend OTP

API:

POST /api/v1/auth/verify-otp
Content-Type: application/json


Request:

{
  "userId": 123,
  "channel": "sms",           // or "email"
  "otp": "123456"
}


Response:

{
  "message": "Verification successful",
  "accessToken": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "user": {
    "id": 123,
    "country": "NG",
    "kycStatus": "not_submitted"
  }
}

1.5 Complete Profile Screen (optional but common)

UI:

Show profile fields (pre-filled if exist)

Let user update: gender, DOB, address, etc.

API:

PATCH /api/v1/users/me
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "fullName": "John Doe",
  "dateOfBirth": "1995-05-18",
  "address": "Some street, Lagos",
  "country": "NG"
}


Response:

{
  "message": "Profile updated",
  "user": {
    "id": 123,
    "fullName": "John Doe",
    "country": "NG",
    "kycStatus": "not_submitted"
  }
}

2. KYC SECTION (SECTION 2)

This sits after onboarding and before full wallet/crypto actions.

2.1 KYC Status / Prompt Screen

UI:

Show current status:

“Not submitted” → Show “Start verification”

“Pending” → Show status + message

“Rejected” → Show reason + resubmit button

API:

GET /api/v1/kyc/status
Authorization: Bearer <token>


Response:

{
  "status": "not_submitted",  // "pending" | "approved" | "rejected"
  "rejectionReason": null
}

2.2 KYC Form Screen

UI:

Step-by-step screens:

Personal info

Document upload (front/back of ID)

Selfie / liveness

You can submit via:

A combined multipart/form-data request

Or separate endpoints for text + images

(Clean approach) API:

POST /api/v1/kyc/submit
Authorization: Bearer <token>
Content-Type: multipart/form-data


Form fields:

firstName

lastName

dateOfBirth

idType (e.g. "NATIONAL_ID", "PASSPORT")

idNumber

country

idFront (file)

idBack (file)

selfie (file)

Response:

{
  "message": "KYC submitted successfully",
  "status": "pending"
}

2.3 KYC Result / Blocking Logic

App logic:

After login, if kycStatus !== 'approved', you block:

Buy

Sell

Swap

Withdraw

You only allow:

Viewing balances

Deposit address display

Read-only actions

Optionally poll:

GET /api/v1/kyc/status


every X seconds/minutes or use sockets for real-time update.

3. DASHBOARD & ASSETS (SECTION 3)

This is the main “home” UI: shows wallets, rates, shortcuts to Buy/Sell/Swap.

3.1 Dashboard / Home Screen

UI:

Total portfolio value (in primary fiat, NGN or local)

List of Fiat wallets

List of Crypto wallets

Quick buttons:

Deposit

Withdraw

Buy

Sell

Swap

API (when screen loads):

1️⃣ Get current user (country, kyc, etc.)

GET /api/v1/auth/me


2️⃣ Get wallets overview (we defined earlier)

GET /api/v2/wallets/overview


3️⃣ Get asset list + current prices

GET /api/v2/assets
Authorization: Bearer <token>


Response:

{
  "assets": [
    {
      "symbol": "USDT_TRON",
      "name": "Tether USDT (TRC20)",
      "network": "TRON",
      "iconUrl": "https://cdn/assets/usdt-tron.png",
      "supportedActions": ["BUY", "SELL", "SWAP", "WITHDRAW"]
    },
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "network": "BITCOIN",
      "supportedActions": ["BUY", "SELL", "SWAP", "WITHDRAW"]
    }
  ]
}


4️⃣ Get quick rates for main coins (for displaying approximate values)

GET /api/v2/markets/tickers?fiat=NGN
Authorization: Bearer <token>


Response:

{
  "fiat": "NGN",
  "tickers": [
    {
      "symbol": "USDT_TRON",
      "buyPrice": "1600.00",
      "sellPrice": "1580.00",
      "source": "ADMIN",        // NG user
      "provider": "LOCAL_ADMIN"
    },
    {
      "symbol": "USDT_TRON",
      "buyPrice": "0.85",
      "sellPrice": "0.80",
      "fiat": "GHS",
      "source": "YELLOW_CARD",  // Non-NG user
      "provider": "YELLOW_CARD"
    }
  ]
}


For non-NG user, same endpoint but values are taken from Yellow Card API under the hood.

3.2 Asset Detail Screen

When user taps a specific asset (e.g. USDT TRON):

UI:

Asset name, icon, network

User balance

Approximate value in fiat (NGN or local)

Buttons:

Deposit (show address + QR)

Withdraw

Buy

Sell

Swap

API:

GET /api/v2/wallets/crypto/USDT_TRON
Authorization: Bearer <token>


Response:

{
  "symbol": "USDT_TRON",
  "network": "TRON",
  "balance": "120.50",
  "depositAddress": "TRXxxxxx",
  "approxValue": {
    "fiatCurrency": "NGN",
    "amount": "192800.00"
  }
}


Plus current rate:

GET /api/v2/markets/quote?symbol=USDT_TRON&fiat=NGN&side=buy
Authorization: Bearer <token>


Response (NG user):

{
  "symbol": "USDT_TRON",
  "fiat": "NGN",
  "side": "buy",
  "pricePerUnit": "1600.00",
  "source": "ADMIN",
  "liquidityProvider": "LOCAL_ADMIN"
}


Response (Foreign user):

{
  "symbol": "USDT_TRON",
  "fiat": "KES",
  "side": "buy",
  "pricePerUnit": "152.00",
  "source": "YELLOW_CARD",
  "liquidityProvider": "YELLOW_CARD"
}


Backend decides the provider using user.country.

4. FIAT WALLET & DEPOSIT SCREEN (SECTION 4)

Now we go deeper into deposit logic because it’s the base for Buy flows.

4.1 Fiat Wallet Detail Screen

UI:

Current fiat balance (e.g. NGN 50,000)

History of deposits/withdrawals

Buttons:

Deposit

Withdraw

API:

GET /api/v2/wallets/fiat/NGN
Authorization: Bearer <token>


Response (NG user):

{
  "currency": "NGN",
  "balance": "50000.00",
  "provider": "LOCAL_ADMIN",
  "depositMethods": ["PAMPAY"],
  "withdrawMethods": ["PAMPAY"],
  "limits": {
    "dailyDepositLimit": "2000000.00",
    "dailyWithdrawLimit": "1000000.00"
  }
}

4.2 Deposit Screen – Nigeria (PalmPay)

UI:

User enters amount (NGN)

Sees fee (if any)

Clicks “Continue to PalmPay”

API:

POST /api/v2/payments/palmpay/deposit/initiate
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "amount": "25000.00",
  "currency": "NGN",
  "reason": "wallet_topup"
}


Response:

{
  "paymentId": "pp_123456",
  "provider": "PAMPAY",
  "status": "pending",
  "redirectUrl": "https://palmpay.com/checkout?ref=pp_123456"
}


Frontend:

Opens redirectUrl in webview or external browser.

Webhook from PalmPay → Backend:

POST /api/v2/webhooks/palmpay
Content-Type: application/json


Payload (example):

{
  "paymentId": "pp_123456",
  "status": "success",
  "amount": "25000.00",
  "currency": "NGN",
  "reference": "wallet_topup",
  "userId": 123,
  "metadata": {}
}


Backend:

Verifies signature

Credits NGN wallet

Marks payment “completed”

You may notify app via:

Push

Socket event

Or app can poll:

GET /api/v2/payments/palmpay/deposit/pp_123456

4.3 Deposit Screen – Foreign Users (Yellow Card)

UI:

User enters amount in local currency (e.g. KES 10,000)

Chooses payment method:

Bank transfer

Mobile money

API:

POST /api/v2/payments/yellowcard/deposit/initiate
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "amount": "10000.00",
  "fiatCurrency": "KES",
  "paymentMethod": "MOBILE_MONEY"      // or "BANK"
}


Response:

{
  "ycDepositId": "yc_dep_123",
  "provider": "YELLOW_CARD",
  "status": "pending",
  "paymentMethod": "MOBILE_MONEY",
  "instructions": {
    "accountName": "Yellow Card Financial",
    "accountNumber": "0712XXXXXX",
    "paymentReference": "TC-USER-123-YCDEP123",
    "expiresAt": "2025-11-27T12:00:00Z"
  }
}


User pays following instructions.

Webhook from Yellow Card → Backend:

POST /api/v2/webhooks/yellowcard/deposit
Content-Type: application/json


Payload example:

{
  "ycDepositId": "yc_dep_123",
  "status": "completed",
  "amountFiat": "10000.00",
  "fiatCurrency": "KES",
  "amountStablecoin": "65.00",       // YC may convert to USDC/USDT
  "stablecoinSymbol": "USDT",
  "userId": 789
}


Backend:

Credits user local fiat wallet OR directly used for buy (depending on UX)

Updates transaction status


5. BUY CRYPTO (FULL UI + APIs)

We’ll design this as a two-step API:

/quote → calculate & show everything

/execute → actually create the trade

5.1 Buy Crypto – Amount Screen

UI (from asset detail “Buy” button):

Selected asset: USDT_TRON or BTC etc.

User enters:

Either crypto amount (e.g. 100 USDT)

Or fiat amount (e.g. 100,000 NGN)

Shows:

Rate

Estimated fees

Estimated crypto to receive

Liquidity provider (internally)

API (quote):

POST /api/v2/trades/buy/quote
Authorization: Bearer <token>
Content-Type: application/json


Request (example):

{
  "symbol": "USDT_TRON",
  "side": "BUY",
  "inputType": "FIAT",          // "FIAT" or "CRYPTO"
  "fiatCurrency": "NGN",        // for NG user; or "KES", "GHS", ...
  "fiatAmount": "100000.00",    // if inputType = FIAT
  "cryptoAmount": null          // if inputType = CRYPTO, fill this instead
}


Response (NG USER – Nigeria engine):

{
  "symbol": "USDT_TRON",
  "side": "BUY",
  "userCountry": "NG",
  "liquidityProvider": "LOCAL_ADMIN",
  "fiatCurrency": "NGN",
  "fiatAmount": "100000.00",
  "cryptoAmount": "62.50",
  "rate": {
    "pricePerUnit": "1600.00",
    "source": "ADMIN"
  },
  "fees": {
    "platformFee": "500.00",
    "networkFee": "0.50",
    "totalFiat": "100500.00"
  },
  "wallet": {
    "fiatBalance": "50000.00",
    "fiatShortage": "50500.00"        // how much more NGN needed
  },
  "nextAction": "FUND_WALLET",        // or "CAN_EXECUTE"
  "quoteId": "buy_q_123456",
  "expiresAt": "2025-11-27T02:10:00Z"
}


Logic:

If fiatBalance >= totalFiat → nextAction = "CAN_EXECUTE"

Else → user must deposit (nextAction = "FUND_WALLET").

Response (FOREIGN USER – Yellow Card engine):

{
  "symbol": "USDT_TRON",
  "side": "BUY",
  "userCountry": "KE",
  "liquidityProvider": "YELLOW_CARD",
  "fiatCurrency": "KES",
  "fiatAmount": "10000.00",
  "cryptoAmount": "65.00",
  "rate": {
    "pricePerUnit": "153.85",
    "source": "YELLOW_CARD"
  },
  "fees": {
    "platformFee": "100.00",
    "networkFee": "0.30",
    "totalFiat": "10100.00"
  },
  "wallet": {
    "fiatBalance": "0.00",
    "fiatShortage": "10100.00"
  },
  "nextAction": "YELLOW_CARD_DEPOSIT",   // YC must collect fiat
  "quoteId": "buy_q_987654",
  "expiresAt": "2025-11-27T02:10:00Z"
}

5.2 Buy Crypto – Confirmation Screen

Based on nextAction:

Case A – Nigerian with enough NGN balance (CAN_EXECUTE)

UI:

Show summary:

“You pay: 100,500 NGN”

“You get: 62.50 USDT”

Fees breakdown

Button: “Confirm Buy”

API:

POST /api/v2/trades/buy/execute
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "quoteId": "buy_q_123456"
}


Backend logic (NG):

Verify quote still valid

Check NGN wallet balance again

Debit NGN wallet

Trigger Tatum send from Admin Master Wallet → User crypto address

Record trade + ledger entries

Response:

{
  "tradeId": "tr_1001",
  "status": "PROCESSING",          // or "COMPLETED" if you wait
  "symbol": "USDT_TRON",
  "fiatCurrency": "NGN",
  "fiatAmount": "100500.00",
  "cryptoAmount": "62.50",
  "liquidityProvider": "LOCAL_ADMIN",
  "txType": "BUY",
  "estimatedCompletionTime": "2025-11-27T02:12:00Z"
}


You may later update status via:

GET /api/v2/trades/tr_1001

Case B – Nigerian with insufficient NGN balance (FUND_WALLET)

Flow:

Show NGN shortfall.

Click “Fund NGN Wallet” → call PalmPay deposit initiate (already defined).

After PalmPay webhook + wallet credit, user taps “Refresh quote” (optional) then “Confirm Buy” again (same as Case A).

Case C – Foreign user (YELLOW_CARD_DEPOSIT)

UI:

After quote:

Show Yellow Card deposit instructions screen (like deposit flow, but tied to this quote).

API to initiate YC deposit for BUY:

POST /api/v2/trades/buy/yellowcard/initiate
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "quoteId": "buy_q_987654",
  "paymentMethod": "MOBILE_MONEY"   // or "BANK"
}


Response:

{
  "ycBuyId": "yc_buy_123",
  "status": "PENDING_PAYMENT",
  "instructions": {
    "accountName": "Yellow Card Financial",
    "accountNumber": "0712XXXXXX",
    "paymentReference": "TC-USER-789-YCBUY123",
    "expiresAt": "2025-11-27T03:00:00Z"
  }
}


User pays → Yellow Card → webhook:

POST /api/v2/webhooks/yellowcard/buy


Backend:

Marks YC side as “PAID”

Option A: Immediately credit user’s crypto wallet when YC sends it

Option B: First virtually credit and wait for actual on-chain transfer then mark “CONFIRMED”

You can expose a status endpoint:

GET /api/v2/trades/buy/yellowcard/yc_buy_123
Authorization: Bearer <token>

6. SELL CRYPTO (FULL UI + APIs)

Same pattern: /quote then /execute.

6.1 Sell Crypto – Amount Screen

From asset detail: user taps “Sell”.

UI:

Choose:

Crypto amount, or

“Sell max”

Show fiat value, rate, fee

Show where fiat goes:

NG: “NGN Wallet”

Foreign: “Local bank / Mobile Money via Yellow Card”

API (quote):

POST /api/v2/trades/sell/quote
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "symbol": "USDT_TRON",
  "side": "SELL",
  "cryptoAmount": "50.00",
  "fiatCurrency": "NGN"
}


Response (NG USER – Nigeria engine):

{
  "symbol": "USDT_TRON",
  "side": "SELL",
  "userCountry": "NG",
  "liquidityProvider": "LOCAL_ADMIN",
  "cryptoAmount": "50.00",
  "fiatCurrency": "NGN",
  "fiatAmount": "79000.00",
  "rate": {
    "pricePerUnit": "1580.00",
    "source": "ADMIN"
  },
  "fees": {
    "platformFee": "400.00",
    "networkFee": "0.40",
    "totalFiatToReceive": "78600.00"
  },
  "payoutMode": "CREDIT_WALLET",         // credited to NGN wallet first
  "quoteId": "sell_q_111222",
  "expiresAt": "2025-11-27T02:20:00Z"
}


Response (FOREIGN USER – Yellow Card engine):

{
  "symbol": "USDT_TRON",
  "side": "SELL",
  "userCountry": "KE",
  "liquidityProvider": "YELLOW_CARD",
  "cryptoAmount": "50.00",
  "fiatCurrency": "KES",
  "fiatAmount": "7700.00",
  "rate": {
    "pricePerUnit": "154.00",
    "source": "YELLOW_CARD"
  },
  "fees": {
    "platformFee": "300.00",
    "networkFee": "0.50",
    "totalFiatToReceive": "7400.00"
  },
  "payoutMode": "DIRECT_PAYOUT",          // YC pays directly to bank/MM
  "quoteId": "sell_q_333444",
  "requiresPayoutDetails": true,
  "expiresAt": "2025-11-27T02:20:00Z"
}

6.2 Sell Crypto – Confirm Screen
Case A – Nigeria (credit NGN wallet + batch sweep)

UI:

Show:

“You sell: 50 USDT”

“You receive: 78,600 NGN (credited to NGN wallet)”

Button: “Confirm Sell”

API:

POST /api/v2/trades/sell/execute
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "quoteId": "sell_q_111222"
}


Backend logic (NG):

Check crypto balance ≥ amount

Virtually debit user’s crypto wallet (immediately)

Mark crypto as frozen for batch sweep

Credit NGN wallet with totalFiatToReceive

Create a BatchSweepItem row linked to this sell trade

Cron job at ~00:00:

Aggregates all frozen crypto per coin

Performs batch Tatum transfer → Admin Master Wallet

Marks items “swept”

Response:

{
  "tradeId": "tr_sell_500",
  "status": "COMPLETED",
  "type": "SELL",
  "symbol": "USDT_TRON",
  "cryptoAmount": "50.00",
  "fiatCurrency": "NGN",
  "fiatAmount": "78600.00",
  "creditedToWallet": true,
  "walletCurrency": "NGN"
}


User then later goes to Withdraw NGN (Section 8).

Case B – Foreign Users (Yellow Card)

Flow:

User gets quote

On confirm, they must provide payout details (bank/mobile money)

API:

POST /api/v2/trades/sell/execute
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "quoteId": "sell_q_333444",
  "payoutDetails": {
    "method": "MOBILE_MONEY",
    "phoneNumber": "+2547XXXXXXX",
    "accountName": "John Doe"
  }
}


Backend logic (Foreign):

For some assets:

Either user sends crypto to YC deposit address (you show address after execute)

Or you sweep to YC from master wallet (depends on architecture finalization)

Call YC Sell API to initiate sell

YC receives crypto, converts

YC pays user via provided payout method

Immediate response:

{
  "tradeId": "tr_sell_501",
  "status": "PENDING_CRYPTO_TRANSFER",
  "type": "SELL",
  "symbol": "USDT_TRON",
  "cryptoAmount": "50.00",
  "fiatCurrency": "KES",
  "fiatAmount": "7400.00",
  "liquidityProvider": "YELLOW_CARD",
  "payout": {
    "method": "MOBILE_MONEY",
    "maskedDestination": "+2547*****89"
  },
  "depositInstructions": {
    "cryptoAddress": "TRX_YC_DEPOSIT_ADDRESS",
    "memo": "optional"
  }
}


Later you can expose:

GET /api/v2/trades/tr_sell_501


for status updates.

7. SWAP (INTERNAL + ADMIN/CHANGENOW)
7.1 User Swap Screen

UI:

From asset detail “Swap” or from Swap tab:

Select From Asset (e.g. USDT_TRON)

Select To Asset (e.g. BTC)

Enter amount

Show rate, estimated to receive, fee.

API (quote):

POST /api/v2/swap/quote
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "fromSymbol": "USDT_TRON",
  "toSymbol": "BTC",
  "amountFrom": "50.00"
}


Response:

{
  "fromSymbol": "USDT_TRON",
  "toSymbol": "BTC",
  "amountFrom": "50.00",
  "amountTo": "0.0012",
  "rate": {
    "priceFromTo": "41666.67",  // 1 BTC = 41666.67 USDT for example
    "source": "ADMIN"           // you set these rates in admin panel
  },
  "fees": {
    "platformFeeFrom": "0.50",
    "totalFromDebited": "50.50"
  },
  "swapType": "INTERNAL_VIRTUAL",
  "quoteId": "swap_q_999",
  "expiresAt": "2025-11-27T02:30:00Z"
}


API (execute):

POST /api/v2/swap/execute
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "quoteId": "swap_q_999"
}


Backend logic:

Check user has amountFrom + fee

Debit fromSymbol wallet

Credit toSymbol wallet

No blockchain, no ChangeNOW here

Only internal ledger moves

Response:

{
  "swapId": "sw_123",
  "status": "COMPLETED",
  "fromSymbol": "USDT_TRON",
  "amountFrom": "50.50",
  "toSymbol": "BTC",
  "amountTo": "0.0012"
}

7.2 Admin Swap (ChangeNOW – Master Wallet)

Admin UI (not in mobile app):

Select:

From Asset (master wallet)

To Asset

Amount

View quote

Confirm swap

API (admin only):

POST /api/v2/admin/swap/changenow/quote
Authorization: Bearer <admin_token>
Content-Type: application/json


Request:

{
  "fromSymbol": "USDT_TRON",
  "toSymbol": "BTC",
  "amountFrom": "1000.00"
}


Response:

{
  "fromSymbol": "USDT_TRON",
  "toSymbol": "BTC",
  "amountFrom": "1000.00",
  "amountToEstimated": "0.025",
  "provider": "CHANGENOW",
  "rateId": "cn_rate_abc",
  "fees": {
    "cnFee": "5.00",
    "networkFee": "0.80"
  },
  "quoteId": "admin_swap_q_123"
}


Execute:

POST /api/v2/admin/swap/changenow/execute
Authorization: Bearer <admin_token>
Content-Type: application/json


Request:

{
  "quoteId": "admin_swap_q_123"
}


Backend:

Calls ChangeNOW create-exchange

Sends crypto from master wallet (Tatum) to ChangeNOW address

Waits for exchange completion

Receives BTC into master BTC wallet

Updates master balances

8. WITHDRAW FIAT
8.1 Withdraw NGN (Nigeria – PalmPay)

UI:

NGN wallet screen → “Withdraw”

User enters:

Amount

Bank name

Account number / Beneficiary

API (quote – optional if you show fees):

POST /api/v2/wallets/fiat/NGN/withdraw/quote
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "amount": "50000.00",
  "bankCode": "044",
  "accountNumber": "0123456789"
}


Response:

{
  "amount": "50000.00",
  "currency": "NGN",
  "fees": {
    "payoutFee": "50.00"
  },
  "totalDebit": "50050.00",
  "canProceed": true,
  "quoteId": "wd_ngn_q_123"
}


Execute:

POST /api/v2/wallets/fiat/NGN/withdraw/execute
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "quoteId": "wd_ngn_q_123",
  "bankCode": "044",
  "accountNumber": "0123456789",
  "accountName": "John Doe"
}


Backend:

Checks NGN wallet ≥ totalDebit

Debits wallet

Calls PalmPay payout API

Returns PENDING or COMPLETED

8.2 Withdraw Fiat – Foreign (Yellow Card)

UI:

Fiat wallet screen (e.g. GHS, KES)

User enters:

Amount

Payout method (Bank, Mobile Money)

Payout details

API (execute directly – YC handles fees):

POST /api/v2/wallets/fiat/{currency}/withdraw
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "amount": "3000.00",
  "method": "MOBILE_MONEY",
  "destination": {
    "phoneNumber": "+2547XXXXXXX",
    "accountName": "John Doe"
  }
}


Backend:

Debits local fiat wallet

Calls Yellow Card payout API

YC pays user

Save transaction

Response:

{
  "withdrawalId": "wd_yc_789",
  "status": "PENDING",
  "currency": "KES",
  "amount": "3000.00",
  "provider": "YELLOW_CARD",
  "payout": {
    "method": "MOBILE_MONEY",
    "maskedDestination": "+2547*****89"
  }
}

9. CRYPTO WITHDRAW

UI:

From asset detail: “Withdraw”

Fields:

Recipient address

Network fee info

Amount

API (quote):

POST /api/v2/wallets/crypto/USDT_TRON/withdraw/quote
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "toAddress": "TRXxxxxxDEST",
  "amount": "30.00"
}


Response:

{
  "symbol": "USDT_TRON",
  "amount": "30.00",
  "networkFee": "0.50",
  "totalDebit": "30.50",
  "canProceed": true,
  "quoteId": "wd_crypto_q_456"
}


Execute:

POST /api/v2/wallets/crypto/USDT_TRON/withdraw/execute
Authorization: Bearer <token>
Content-Type: application/json


Request:

{
  "quoteId": "wd_crypto_q_456",
  "toAddress": "TRXxxxxxDEST"
}


Backend:

Checks crypto balance

Calls Tatum off-chain/on-chain withdrawal

Returns transaction hash when available

10. SELL GIFT (CHAT + ADMIN CREDIT)
10.1 User Side – via Chat (existing system)

UI:

User opens chat screen (existing v1)

Chooses “Sell Gift Card” option

Sends details & image

For new v2, we add one endpoint that the agent/admin uses after agreeing on amount.

10.2 Admin Side – Approve & Credit Wallet

API: Create Gift Sell Request (optional from UI or chat command)

POST /api/v2/gift-sell/requests
Authorization: Bearer <agent_or_admin_token>
Content-Type: application/json


Request:

{
  "userId": 123,
  "cardType": "AMAZON",
  "faceValue": "100.00",
  "currency": "USD",
  "negotiatedPayout": "65000.00",
  "fiatCurrency": "NGN",
  "chatId": 999
}


Response:

{
  "requestId": "gift_001",
  "status": "PENDING"
}


Admin Approves & Credits NGN Wallet:

POST /api/v2/admin/gift-sell/gift_001/approve
Authorization: Bearer <admin_token>
Content-Type: application/json


Request:

{
  "approve": true,
  "payoutAmount": "65000.00",
  "walletCurrency": "NGN",
  "note": "Gift card verified and accepted."
}


Backend:

Credits NGN wallet of userId

Updates GiftSellRequest.status = "APPROVED"

Creates transaction log record

Response:

{
  "requestId": "gift_001",
  "status": "APPROVED",
  "creditedAmount": "65000.00",
  "walletCurrency": "NGN"
}

11. TRANSACTION HISTORY (For History Screen)

UI: “Transactions” tab:

Filter by:

Type: BUY, SELL, SWAP, DEPOSIT, WITHDRAW, GIFT_SELL

Asset / Currency

API:

GET /api/v2/transactions?type=ALL&page=1&pageSize=20
Authorization: Bearer <token>


Response:

{
  "page": 1,
  "pageSize": 20,
  "total": 123,
  "items": [
    {
      "id": "tr_1001",
      "type": "BUY",
      "symbol": "USDT_TRON",
      "fiatCurrency": "NGN",
      "fiatAmount": "100500.00",
      "cryptoAmount": "62.50",
      "status": "COMPLETED",
      "provider": "LOCAL_ADMIN",
      "createdAt": "2025-11-27T01:10:00Z"
    },
    {
      "id": "tr_sell_500",
      "type": "SELL",
      "symbol": "USDT_TRON",
      "fiatCurrency": "NGN",
      "fiatAmount": "78600.00",
      "status": "COMPLETED",
      "provider": "LOCAL_ADMIN",
      "createdAt": "2025-11-27T01:30:00Z"
    },
    {
      "id": "wd_ngn_700",
      "type": "FIAT_WITHDRAW",
      "fiatCurrency": "NGN",
      "fiatAmount": "50000.00",
      "status": "PENDING",
      "provider": "PAMPAY",
      "createdAt": "2025-11-27T01:40:00Z"
    },
    {
      "id": "gift_001",
      "type": "GIFT_SELL",
      "fiatCurrency": "NGN",
      "fiatAmount": "65000.00",
      "status": "COMPLETED",
      "provider": "LOCAL_ADMIN",
      "createdAt": "2025-11-27T01:50:00Z"
    }
  ]
}


This gives you a full UI → API map for:

Auth / KYC / Dashboard / Assets

Fiat wallet & deposit

Buy Crypto (NG vs Foreign + YC)

Sell Crypto (NG vs Foreign + YC)

Swap (user internal + admin ChangeNOW)

Withdraw Fiat (PalmPay + YC)

Crypto withdraw

Sell Gift via chat + admin credit

Transactions history