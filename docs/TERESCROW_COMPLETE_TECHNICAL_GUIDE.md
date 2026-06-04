# Terescrow — Complete System Guide

**Audience:** Business partners, product owners, new team members, anyone who needs to understand how the platform works  
**Last updated:** June 2026  
**Live backend:** https://backend.tercescrow.site  
**API documentation (for developers):** https://backend.tercescrow.site/api-docs

This guide explains the **full Terescrow platform** in plain language: what it does, how the pieces connect, what technology powers it, and how to run it on a Mac for testing.

---

## Table of contents

1. [What is Terescrow?](#1-what-is-terescrow)
2. [The three apps that make up the system](#2-the-three-apps-that-make-up-the-system)
3. [How everything connects](#3-how-everything-connects)
4. [Technology & tools used](#4-technology--tools-used)
5. [The backend (server)](#5-the-backend-server)
6. [The customer mobile app](#6-the-customer-mobile-app)
7. [The admin desktop app](#7-the-admin-desktop-app)
8. [How money moves — step by step](#8-how-money-moves--step-by-step)
9. [Two types of crypto balance (virtual vs on-chain)](#9-two-types-of-crypto-balance-virtual-vs-on-chain)
10. [Third-party services we rely on](#10-third-party-services-we-rely-on)
11. [Background tasks that run automatically](#11-background-tasks-that-run-automatically)
12. [Running the system on a Mac (local testing)](#12-running-the-system-on-a-mac-local-testing)
13. [Live production setup](#13-live-production-setup)
14. [Admin panel — what you can do where](#14-admin-panel--what-you-can-do-where)
15. [Glossary](#15-glossary)

---

## 1. What is Terescrow?

Terescrow is a **Nigeria-focused financial platform**. Customers use a mobile app to manage money and crypto. Staff use a desktop admin app to operate the business, support customers, and move funds.

### What customers can do

| Feature | Description |
|---------|-------------|
| **Crypto** | Buy crypto with Naira, sell crypto for Naira, send crypto to other wallets, receive crypto from the blockchain, swap between coins |
| **Naira wallet** | Hold Nigerian Naira, deposit via PalmPay, withdraw to bank |
| **Gift cards** | Buy digital gift cards (Amazon, iTunes, etc.) |
| **Bill payments** | Pay for airtime, data, electricity, and other utilities |
| **Chat with agents** | Talk to a human agent for help or guided trades |
| **KYC** | Verify identity in tiers to unlock higher limits |
| **Referrals** | Invite friends and earn rewards |

### What staff can do (admin panel)

| Feature | Description |
|---------|-------------|
| **Dashboard** | See business stats and recent activity |
| **Customer management** | View profiles, freeze accounts, manage permissions |
| **Live chat** | Respond to customer messages in real time |
| **User Wallets** | See each customer’s crypto split (bought vs deposited) |
| **Deposit Tracking** | Follow inbound crypto deposits and send them to vendors or company wallet |
| **Master Wallet** | Manage the company’s main crypto treasury |
| **Rates** | Set buy/sell prices and fees |
| **Profit Tracker** | Audit how much the business earns per transaction |
| **KYC queue** | Approve or reject verification requests |
| **Daily reports** | Track agent attendance (clock in/out) |
| **Vendors** | Manage payout addresses for partners who receive crypto |

---

## 2. The three apps that make up the system

Everything lives in **three separate code projects** (repositories):

| Project | What it is | Who uses it |
|---------|------------|-------------|
| **terescrow--backend** | The central server — all business logic, payments, and data live here | Runs on a cloud server; users never see it directly |
| **terescrow-frontend** | Customer mobile app (iPhone & Android) | End customers |
| **terescrow-electronjs** | Admin desktop app (Mac & Windows) | Admins and support agents |

**Simple rule:** Mobile app and admin app both talk to the same backend over the internet. The backend is the single source of truth for balances, transactions, and user accounts.

---

## 3. How everything connects

```
┌──────────────────┐     ┌──────────────────┐
│  Customer phone  │     │  Admin Mac/PC    │
│  (mobile app)    │     │  (desktop app)   │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         │    Secure internet     │
         └──────────┬─────────────┘
                    ▼
         ┌──────────────────────┐
         │   Terescrow server   │
         │   (backend)          │
         └──────────┬───────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
 Storage         Task queue      File storage
 (MySQL)         (Redis)         (uploads, images)
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
   Blockchain partner      Payment partner
   (Tatum)                 (PalmPay)
         │                     │
   ChangeNOW, Reloadly, VTPass, email, push notifications...
```

**In plain terms:**

- The **server** receives requests from apps, checks who you are, runs the business rules, and saves results.
- **MySQL** stores all accounts, balances, and transaction history permanently.
- **Redis** handles work that should happen in the background (retries, status checks) so the app stays fast.
- **Tatum** connects us to blockchains — creating wallets, deposit addresses, and sending crypto on-chain.
- **PalmPay** handles Naira payments in and out.
- Other partners handle gift cards, bills, and swaps (details in section 10).

---

## 4. Technology & tools used

This section lists **everything the platform is built with**, grouped by purpose. No coding knowledge required — think of these as the ingredients.

### 4.1 Backend server (`terescrow--backend`)

| Purpose | Technology |
|---------|------------|
| Programming language | **TypeScript** (typed JavaScript) on **Node.js 18+** |
| Web server framework | **Express.js** |
| Data storage | **MySQL** (managed with **Prisma** as the data access layer) |
| Background jobs | **Bull** queue + **Redis** |
| Real-time chat | **Socket.io** |
| User login tokens | **JSON Web Tokens (JWT)** + **bcrypt** for PIN/password hashing |
| HTTP requests to partners | **Axios** |
| Scheduled tasks | **node-cron** |
| API docs | **Swagger** (interactive docs at `/api-docs`) |
| Email | **Nodemailer** (often via Gmail) |
| File uploads | **Multer** |
| Push notifications | **Firebase** (Google) |

**Main npm packages (backend):**

```
express, typescript, prisma, @prisma/client, bull, ioredis, socket.io,
axios, bcryptjs, jsonwebtoken, dotenv, cors, express-validator,
node-cron, nodemailer, multer, uuid, cookie-parser, body-parser,
swagger-ui-express, swagger-jsdoc, mysql2, google-auth-library
```

**Dev tools:** nodemon, ts-node

---

### 4.2 Customer mobile app (`terescrow-frontend`)

| Purpose | Technology |
|---------|------------|
| App framework | **Expo 52** (builds iOS & Android from one codebase) |
| UI library | **React Native 0.76** + **React 18** |
| Navigation | **Expo Router** |
| Server communication | **Axios** + **TanStack React Query** (caching & loading states) |
| Forms | **Formik** + **Yup** validation |
| Real-time chat | **Socket.io client** |
| Secure storage | **Expo Secure Store**, **Async Storage** |
| Biometrics | **Expo Local Authentication** |
| Push notifications | **Expo Notifications** |
| QR codes | **react-native-qrcode-svg** |
| Charts | **react-native-chart-kit** |
| Animations | **Lottie**, **Reanimated** |

**Build & test:** Expo CLI, Jest, patch-package (for small dependency fixes)

---

### 4.3 Admin desktop app (`terescrow-electronjs`)

| Purpose | Technology |
|---------|------------|
| Desktop shell | **Electron 31** (Chromium + Node embedded in a Mac/Windows app) |
| UI | **React 18** + **TypeScript** |
| Styling | **Tailwind CSS** |
| Build tool | **Vite** + **electron-vite** |
| Installer packaging | **electron-builder** (produces `.dmg` on Mac) |
| Server communication | **Axios** + **TanStack React Query** |
| Routing | **React Router** (hash-based) |
| Forms | **Formik** + **Yup** |
| Real-time chat | **Socket.io client** |
| Local settings | **electron-store** |
| Auto-updates | **electron-updater** |
| Notifications in UI | **react-toastify** |

**Product name in builds:** TercescrowAdmin (currently v1.8.9)

---

### 4.4 Infrastructure (live server)

| Purpose | Technology |
|---------|------------|
| Server OS | Linux (typical cloud VPS) |
| Process manager | **PM2** (keeps server and workers running 24/7) |
| HTTPS / routing | **nginx** (reverse proxy in front of Node) |
| Version control | **Git** |
| Local Mac dev | **Homebrew** for Node, MySQL, Redis |

---

## 5. The backend (server)

The backend is the brain of Terescrow. All three apps depend on it.

### What it handles

- User registration, login, PIN, and KYC
- Crypto buy, sell, send, receive, swap
- Naira wallet deposits and withdrawals
- Gift cards and bill payments
- Agent chat messages (real-time)
- Admin operations (treasury, rates, tracking, profit)
- Incoming notifications from blockchain and payment partners

### How it is organized (conceptually)

Think of the backend as layers:

1. **Routes** — front door: each URL path maps to an action (e.g. “buy crypto”, “list customers”).
2. **Controllers** — receive the request, validate input, call the right service.
3. **Services** — where the real business logic lives (calculate fees, update balances, call Tatum/PalmPay).
4. **Jobs & queues** — slow or retryable work (create wallet, retry failed sell, check bill status).
5. **Schedulers** — periodic checks (e.g. poll swap status every few minutes).

### Customer-facing vs admin-facing

| Side | Who calls it | Examples |
|------|--------------|----------|
| **Customer API** | Mobile app | Buy crypto, check balance, pay bills |
| **Admin API** | Desktop admin app | Master wallet, deposit tracking, rates |
| **Agent API** | Admin app (agents) | Chat, customer notes |
| **Webhooks** | External partners call us | “Payment completed”, “Crypto arrived on blockchain” |

### Security basics

- Every request from apps includes a **login token**; expired or invalid tokens are rejected.
- Customer **PIN** is hashed — never stored as plain text.
- Crypto wallet keys are **encrypted** on the server with a secret key (must never be changed casually in production).
- Admin and agent accounts have **role-based access** (not everyone can change rates or move treasury funds).

---

## 6. The customer mobile app

**Repository:** `terescrow-frontend`  
**Platforms:** iOS and Android (via Expo)

### What the customer sees

- One **total crypto balance** per coin (the app adds “bought” and “deposited” amounts together — customers do not need to know the split).
- Naira wallet balance and transaction history.
- Buy / sell / send / receive / swap screens.
- Bills, gift cards, referrals, support, KYC upload.
- Chat with support agents.

### How it connects

The app talks to the live backend at `https://backend.tercescrow.site` (or a local server during development). Login uses email/phone + PIN or password depending on flow.

### Mac setup (to run the mobile app locally)

**You need:** Node.js 18+, Xcode (for iPhone simulator), optional Android Studio.

```bash
cd terescrow-frontend
npm install
npm start          # opens Expo dev tools — scan QR or press i for iOS simulator
npm run ios        # run directly on iOS simulator
npm run android    # run on Android emulator
```

Point the app’s API URL to your backend (production URL or `http://YOUR-MAC-IP:5000` for local testing).

---

## 7. The admin desktop app

**Repository:** `terescrow-electronjs`  
**Platforms:** macOS (primary), Windows, Linux builds available

### Who uses it

- **Admins** — full access: treasury, rates, profit, settings, all customers.
- **Agents** — chat, customers, transactions; some treasury actions; limited dashboard.

### Main screens

| Screen | What it’s for |
|--------|---------------|
| **Dashboard** | Overview stats and recent transactions |
| **Customers** | Search users, open profile, freeze features |
| **Chats / Pending chats** | Live messaging with customers |
| **Transactions** | Crypto, Naira, bills, gift cards — filter and drill down |
| **User Wallets** | See virtual (bought) vs on-chain (deposited) balance per customer |
| **Deposit Tracking** | Track crypto that arrived on the blockchain; send to vendor or company wallet |
| **Master Wallet** | Company treasury — balances, send, sweep, pending owed to customers |
| **Profit Tracker** | Business earnings audit |
| **ChangeNOW Swaps** | Admin-initiated crypto swaps via ChangeNOW |
| **Rates** | Buy/sell tiers, deposit fees, gift card margins |
| **KYC** | Review verification documents |
| **Referrals** | Manage referral program |
| **Support** | Support ticket chats |
| **Daily Report** | Agent clock-in and attendance |
| **Settings** | Vendors, roles, departments, banners |

### How it connects

The admin app is configured to use:

- **API base:** `https://backend.tercescrow.site/api`
- **Login:** same agent/admin accounts as on the server (not customer accounts).

After login, a session token is kept in memory — **closing the app requires logging in again**.

### Mac setup (to run the admin app locally)

**You need:** Node.js 18+, Yarn or npm.

```bash
cd terescrow-electronjs
yarn install       # or npm install
yarn dev           # opens the admin app in development mode with hot reload
yarn build         # creates a Mac .dmg installer (Apple Silicon)
yarn build:intel   # creates a Mac .dmg for Intel Macs
```

To point at a local backend instead of production, change the API URL in the app’s config file to `http://localhost:5000/api`.

---

## 8. How money moves — step by step

These are the main journeys money takes through Terescrow.

### 8.1 New customer signs up

1. Customer registers in the mobile app (email/phone).
2. They receive a one-time code by email.
3. They set a **PIN** for app security.
4. Optionally they complete **KYC** for higher limits.

---

### 8.2 Customer adds Naira (PalmPay deposit)

1. Customer chooses “Add money” in the app.
2. App opens **PalmPay** checkout (card, bank, etc.).
3. Customer pays on PalmPay.
4. PalmPay notifies our server that payment succeeded.
5. Server **credits the customer’s Naira wallet**.
6. Customer sees updated balance in the app.

---

### 8.3 Customer buys crypto (Naira → crypto)

1. Customer picks a coin (e.g. USDT) and amount in Naira.
2. App shows **quote** (rate + fees).
3. Customer confirms.
4. Server **deducts Naira** from their wallet.
5. Server **adds crypto to their account** as **“virtual” balance** (bought with Naira — held in our system ledger, not necessarily moved on blockchain yet).
6. Customer sees higher crypto balance in the app (one total number).
7. Admin panel shows this under **“System pending (virtual)”** on Master Wallet — meaning we owe the customer crypto in our books.

---

### 8.4 Customer receives crypto (blockchain deposit)

1. Customer taps “Receive” and gets a **deposit address** (unique on-chain address).
2. Customer sends crypto from an external wallet to that address.
3. **Tatum** (blockchain partner) detects the incoming transaction and notifies our server.
4. Server **credits “on-chain” balance** (real deposit from blockchain).
5. Customer gets a **push notification** and sees balance increase.
6. Admin sees the deposit in **Deposit Tracking**.
7. Master Wallet **“On-chain pending”** increases — crypto physically sits on deposit addresses until staff move it.

---

### 8.5 Customer sells crypto (crypto → Naira)

1. Customer chooses amount to sell.
2. Server checks they have enough **total** balance (virtual + on-chain combined).
3. Server **uses virtual balance first**, then on-chain if needed (customer doesn’t choose — automatic).
4. If the sell spans both types, the system records it as one sell for the customer but may split internally for accounting.
5. Server **credits Naira** to their wallet.
6. Optionally, crypto may be moved on-chain to the company wallet in the background.

---

### 8.6 Customer sends crypto to someone else

1. Customer enters recipient address and amount.
2. App shows network fee estimate.
3. Customer confirms with PIN.
4. Server debits balance (virtual first, same rule as sell).
5. Server signs and broadcasts transaction on the blockchain via Tatum.
6. Transaction appears in history as “Send”.

---

### 8.7 Customer swaps between coins

1. Customer picks “from” and “to” asset.
2. Server moves value internally between their coin balances (ledger swap).
3. For large treasury operations, admins may use **ChangeNOW** separately in the admin panel.

---

### 8.8 Staff sends a customer’s deposit to a vendor

Used when crypto arrived on-chain and needs to be paid out to a business partner.

1. Staff opens **Deposit Tracking** in admin app.
2. Finds the successful deposit row.
3. Clicks **Disburse** → choose vendor or company master wallet.
4. Server sends crypto **from that customer’s deposit address** on the blockchain.
5. Row status updates (e.g. “Sent to vendor”).

---

### 8.9 Staff sweeps many deposits at once

1. Staff opens **Master Wallet → Sweep**.
2. Selects asset and destination (master wallet or vendor).
3. System batches movement from many customer deposit addresses into one place.
4. Reduces scattered funds across many addresses.

---

### 8.10 Agent chat trade (older flow)

1. Customer opens chat in the app.
2. Agent quotes a rate manually.
3. A **transaction record** is linked to the chat.
4. Settlement may be manual or semi-automated depending on the deal — this path predates full self-serve crypto in the app.

---

### 8.11 Bills and gift cards

**Bills:** Customer pays from Naira wallet → server calls PalmPay, VTPass, or Reloadly → provider delivers service (airtime, electricity token, etc.) → status updated automatically or via background check.

**Gift cards:** Customer pays Naira → Reloadly issues card code → delivered by email or shown in app.

---

## 9. Two types of crypto balance (virtual vs on-chain)

This is an important recent update. It helps staff see **where customer crypto came from**, while customers still see one simple total.

### The two types

| Type | How the customer got it | What it means |
|------|-------------------------|---------------|
| **Virtual (system)** | Bought with Naira in the app | Recorded in our system; company holds obligation to deliver/settle |
| **On-chain (deposit)** | Received from blockchain to their deposit address | Real crypto sitting on a blockchain address |

| What customer sees | What admin sees |
|--------------------|-----------------|
| **One total balance** per coin | **Virtual**, **On-chain**, and **Total** separately |
| Same buy/sell/send experience | User Wallets page + detail popup |
| | Deposit Tracking = on-chain deposits only |
| | Master Wallet: two cards — **On-chain pending** vs **System pending (virtual)** |

### Rules (simple version)

- **Buying crypto** → increases virtual balance.
- **Receiving on blockchain** → increases on-chain balance.
- **Selling or sending** → spends virtual first, then on-chain if needed.
- **Old balances** (before this update) were treated as virtual so history stays consistent.

### Why it matters for operations

- Staff know whether crypto is **already on-chain** (can sweep/disburse) vs **only in the ledger** (customer bought but coins may not have moved yet).
- **Deposit Tracking** “Sold” column shows how much of each deposit was later sold by that customer — helps reconciliation.
- Live blockchain balance can be checked in the user wallet popup (may differ from ledger if something is pending).

---

## 10. Third-party services we rely on

| Partner | What they do for us |
|---------|---------------------|
| **Tatum** | Blockchain wallets, deposit addresses, balance checks, sending transactions, deposit alerts |
| **PalmPay** | Naira deposits, payouts, some bill payments, merchant checkout |
| **ChangeNOW** | Crypto-to-crypto swaps (mainly admin treasury) |
| **Reloadly** | Gift cards, airtime, some utilities |
| **VTPass** | Nigerian bill payments (electricity, TV, etc.) |
| **TronScan** | Optional extra balance lookup for Tron network |
| **Firebase** | Push notifications to mobile app |
| **Gmail / SMTP** | Sending OTP and notification emails |
| **ngrok** (dev only) | Temporary public URL so blockchain webhooks can reach a Mac during local testing |

Each partner needs **API keys and credentials** stored securely in the server’s environment configuration (never committed to Git).

Detailed setup notes for PalmPay and Tatum exist in the backend `docs/` folder for whoever manages server configuration.

---

## 11. Background tasks that run automatically

Some work cannot finish instantly. The system handles it in the background so the app stays responsive.

### What runs on the live server

| Process | What it does |
|---------|--------------|
| **Main API server** | Handles all app requests, chat, and most webhooks |
| **Tatum worker** | Creates wallets, retries failed sells, other blockchain jobs |
| **Bill payment worker** | Checks bill/gift card status until final success or failure |

### Periodic checks (built into main server)

- **ChangeNOW** — poll open swap orders every ~2 minutes until complete.
- **Reloadly** — check utility payment status on a schedule.

### When a blockchain deposit arrives

Tatum calls our server immediately. The server processes the deposit right away (credits user, notifies admin tracking, sends push to customer).

**PM2** on the production server keeps all these processes running and restarts them if they crash.

---

## 12. Running the system on a Mac (local testing)

Use this when a developer or tester wants everything on their Mac before touching production.

### 12.1 Install once (Homebrew)

```bash
brew install node@20 mysql redis
brew services start mysql
brew services start redis
```

Verify: `node -v` (18+), `redis-cli ping` returns `PONG`.

---

### 12.2 Start the backend

```bash
cd terescrow--backend
npm install
```

Create a MySQL database named `terescrow` and add a `.env` file with connection details, secret keys, and partner API keys (get a template from a teammate).

```bash
npm run migrate    # apply server data structure updates
npm run seed       # optional test users
npm run dev        # server at http://localhost:5000
```

Open http://localhost:5000/api-docs to browse API documentation.

**Extra terminals for full testing:**

```bash
npm run queue:work:tatum
npm run queue:work:bill-payments
```

---

### 12.3 Start the admin app (pointed at local server)

```bash
cd terescrow-electronjs
yarn install
# Change API URL in config to http://localhost:5000/api
yarn dev
```

Log in with a test admin/agent account from seed data.

---

### 12.4 Start the mobile app (optional)

```bash
cd terescrow-frontend
npm install
npm start
```

Use your Mac’s local IP (not `localhost`) so a physical phone on the same Wi‑Fi can reach the backend.

---

### 12.5 Testing blockchain deposits locally

Blockchain partners need a **public HTTPS URL** to notify the server. On a Mac, use **ngrok**:

```bash
ngrok http 5000
```

Put the ngrok URL into the Tatum webhook setting so deposits can be tested end-to-end.

---

### 12.6 Typical Mac layout (5 terminal windows)

| Terminal | Command |
|----------|---------|
| 1 | Backend: `npm run dev` |
| 2 | Tatum worker |
| 3 | Bill worker |
| 4 | Admin app: `yarn dev` |
| 5 | Mobile app: `npm start` (optional) |

---

## 13. Live production setup

**Production backend URL:** https://backend.tercescrow.site

### Server requirements

- Linux VPS or cloud server
- Node.js 18+
- MySQL 8+
- Redis
- nginx with SSL certificate (HTTPS)
- PM2 to run server + workers 24/7
- Firewall: only web ports public; database and Redis internal only
- Regular backups of MySQL and secure storage of encryption keys

### Deploy steps (high level)

1. Pull latest code from Git.
2. Install dependencies (`npm install`).
3. Build TypeScript (`npm run build`).
4. Apply any pending data updates (`npm run migration:prod`).
5. Restart PM2 processes (API + workers).

### Admin app distribution

Build on a Mac:

```bash
cd terescrow-electronjs
yarn build        # outputs .dmg in dist/ folder
```

Install the `.dmg` on staff Macs. For wide distribution outside the company, Apple notarization may be required (see project README).

### Mobile app distribution

Built with **Expo EAS** — separate pipeline for App Store and Google Play.

---

## 14. Admin panel — what you can do where

| I want to… | Go to… |
|------------|--------|
| See if a customer bought vs deposited crypto | **User Wallets** → click customer name |
| Track incoming blockchain deposits | **Deposit Tracking** |
| Pay a vendor from a customer’s deposit | **Deposit Tracking** → Disburse |
| Move deposit to company wallet | **Deposit Tracking** → Disburse → Master wallet |
| See company crypto treasury | **Master Wallet** |
| See what we owe customers (split by type) | **Master Wallet** — On-chain pending vs System pending cards |
| Collect crypto from many deposit addresses | **Master Wallet** → Sweep |
| Swap treasury crypto | **Master Wallet** or **ChangeNOW Swaps** |
| Change buy/sell rates | **Rates** |
| Review profit per transaction type | **Profit Tracker** |
| Approve ID documents | **KYC** |
| Message a customer | **Chats** |
| Retry a stuck background job | Navigate to **Crypto Jobs** (URL route; not in sidebar menu) |

---

## 15. Glossary

| Term | Meaning |
|------|---------|
| **Backend / API** | The central server all apps talk to |
| **Virtual balance** | Crypto the customer bought with Naira (system ledger) |
| **On-chain balance** | Crypto received from real blockchain deposit |
| **Master wallet** | Company’s main crypto treasury per blockchain |
| **Deposit address** | Unique blockchain address where one customer receives crypto |
| **Sweep** | Move crypto from many deposit addresses to one place |
| **Disburse** | Send crypto from a tracked deposit to a vendor or master wallet |
| **Webhook** | Automatic message from a partner (“payment done”, “crypto arrived”) |
| **KYC** | Know Your Customer — identity verification |
| **PM2** | Tool that keeps server processes running on production |
| **Expo** | Framework used to build the mobile app for iOS and Android |
| **Electron** | Framework that wraps the admin web UI as a desktop app |
| **JWT** | Secure login token passed with each app request |
| **Redis** | Fast in-memory store used for background job queues |
| **MySQL** | Where all permanent business data is stored |

---

## Quick reference — money flow

```
Customer adds Naira (PalmPay)
    → Naira wallet balance goes up

Customer buys crypto
    → Naira down, virtual crypto balance up
    → Customer app shows higher total crypto

Customer receives crypto on blockchain
    → On-chain crypto balance up
    → Shows in Deposit Tracking for staff

Customer sells crypto
    → Crypto down (virtual first), Naira up

Staff disburses deposit
    → Crypto moves on blockchain from deposit address to vendor/master

Staff sweeps
    → Many deposit addresses → one treasury address
```

---

*This guide describes the system as of June 2026. For API endpoint details, see `terescrow-electronjs/ADMIN_PANEL_API.md` and the live Swagger docs. For server configuration specifics, see the `docs/` folder in the backend repository.*
