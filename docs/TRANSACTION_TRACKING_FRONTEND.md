# Transaction Tracking — Frontend Integration Guide

> **Base URL:** `https://backend.tercescrow.site/api/admin`
> **Auth:** Bearer token (admin role required)

This page shows **on-chain crypto deposits** only. Each row includes a `masterWalletStatus` field that tells you whether the received funds have been swept to the master wallet or are still sitting in the user's virtual account.

---

## Types

```typescript
interface TrackingListItem {
  id: number;
  transactionId: string;
  customerName: string;
  customerEmail: string;
  customerId: number;
  status: "pending" | "processing" | "successful" | "failed" | "cancelled";
  masterWalletStatus: "inWallet" | "transferredToMaster" | "unknown";
  txHash: string;
  amount: string;       // crypto amount (e.g. "0.005")
  amountUsd: string;    // USD value (e.g. "250")
  amountNaira: string;  // NGN value (e.g. "100000")
  currency: string;     // e.g. "BTC", "ETH", "USDT"
  blockchain: string;   // e.g. "bitcoin", "ethereum", "tron"
  fromAddress: string;
  toAddress: string;
  confirmations: number;
  blockNumber: string | null;
  date: string;         // ISO 8601
}

interface TrackingStep {
  title: string;
  status: "completed" | "pending" | string;
  date: string;
  details: Record<string, string | number | null>;
}

interface TrackingDetails {
  transactionId: string;
  status: string;
  masterWalletStatus: "inWallet" | "transferredToMaster" | "unknown";
  currency: string;
  blockchain: string;
  amount: string;
  amountUsd: string;
  amountNaira: string;
  fromAddress: string;
  toAddress: string;
  txHash: string;
  blockNumber: string | null;
  confirmations: number;
  customer: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    username: string;
    profilePicture: string | null;
  } | null;
  receivedAsset: {
    id: number;
    accountId: string | null;
    status: string;
    reference: string | null;
    index: number | null;
    transactionDate: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 1. List Received Transactions

```
GET /transaction-tracking
```

### Query Parameters

| Param       | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `search`    | string | No       | Search by txHash, from/to address, customer name, email, or transactionId |
| `startDate` | string | No       | ISO date string — filter from this date |
| `endDate`   | string | No       | ISO date string — filter up to this date |
| `page`      | number | No       | Page number (default: 1) |
| `limit`     | number | No       | Items per page (default: 20, max: 100) |

### Example Request

```
GET /api/admin/transaction-tracking?search=0xabc&startDate=2025-11-01&page=1&limit=20
```

### Example Response

```json
{
  "status": "success",
  "message": "On-chain received transactions retrieved",
  "data": {
    "items": [
      {
        "id": 1,
        "transactionId": "031pxtg2c101",
        "customerName": "Qamar Malik",
        "customerEmail": "qamar@example.com",
        "customerId": 13,
        "status": "successful",
        "masterWalletStatus": "inWallet",
        "txHash": "0xabc123def456789...",
        "amount": "0.005",
        "amountUsd": "250",
        "amountNaira": "100000",
        "currency": "BTC",
        "blockchain": "bitcoin",
        "fromAddress": "bc1qsender123...",
        "toAddress": "bc1qreceiver456...",
        "confirmations": 6,
        "blockNumber": "800123",
        "date": "2025-11-06T10:30:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### Table Columns (suggested)

| Column | Field |
|--------|-------|
| Customer | `customerName` |
| Status | `status` |
| Master Wallet | `masterWalletStatus` |
| TX Hash | `txHash` |
| Amount | `amount` + `currency` (e.g. "0.005 BTC") |
| USD Value | `amountUsd` |
| Blockchain | `blockchain` |
| Date | `date` |

---

## 2. Tracking Steps (Timeline)

```
GET /transaction-tracking/:txId/steps
```

`:txId` = the `transactionId` string from the list (e.g. `"031pxtg2c101"`)

### Example Response

```json
{
  "status": "success",
  "message": "Tracking steps retrieved",
  "data": {
    "steps": [
      {
        "title": "On-chain deposit detected",
        "status": "completed",
        "date": "2025-11-06T10:30:00.000Z",
        "details": {
          "txHash": "0xabc123...",
          "fromAddress": "bc1qsender...",
          "toAddress": "bc1qreceiver...",
          "amount": "0.005",
          "currency": "BTC",
          "blockchain": "bitcoin",
          "blockNumber": "800123"
        }
      },
      {
        "title": "Confirmations",
        "status": "completed",
        "date": "2025-11-06T10:35:00.000Z",
        "details": {
          "confirmations": 6
        }
      },
      {
        "title": "Credited to user wallet",
        "status": "completed",
        "date": "2025-11-06T10:35:00.000Z",
        "details": {
          "amountUsd": "250",
          "amountNaira": "100000",
          "accountId": "acc_abc123"
        }
      },
      {
        "title": "Transfer to master wallet",
        "status": "pending",
        "date": "2025-11-06T10:35:00.000Z",
        "details": {
          "masterWalletStatus": "inWallet"
        }
      }
    ]
  }
}
```

### Rendering the Timeline

Each step is a card in a vertical timeline:

| Step | When `status` = `"completed"` | When `status` = `"pending"` |
|------|-------------------------------|------------------------------|
| On-chain deposit detected | Green check | Should always be completed |
| Confirmations | Green check | Yellow spinner / waiting |
| Credited to user wallet | Green check | Grey / waiting |
| Transfer to master wallet | Green check — funds swept | Yellow — `"inWallet"`, not yet swept |

---

## 3. Transaction Details (Detail Modal)

```
GET /transaction-tracking/:txId/details
```

### Example Response

```json
{
  "status": "success",
  "message": "Transaction details retrieved",
  "data": {
    "transactionId": "031pxtg2c101",
    "status": "successful",
    "masterWalletStatus": "inWallet",
    "currency": "BTC",
    "blockchain": "bitcoin",
    "amount": "0.005",
    "amountUsd": "250",
    "amountNaira": "100000",
    "fromAddress": "bc1qsender...",
    "toAddress": "bc1qreceiver...",
    "txHash": "0xabc123...",
    "blockNumber": "800123",
    "confirmations": 6,
    "customer": {
      "id": 13,
      "firstname": "Qamar",
      "lastname": "Malik",
      "email": "qamar@example.com",
      "username": "qamar",
      "profilePicture": null
    },
    "receivedAsset": {
      "id": 1,
      "accountId": "acc_abc123",
      "status": "inWallet",
      "reference": "ref_xyz",
      "index": 0,
      "transactionDate": "2025-11-06T10:30:00.000Z"
    },
    "createdAt": "2025-11-06T10:30:00.000Z",
    "updatedAt": "2025-11-06T10:35:00.000Z"
  }
}
```

### Detail Modal Layout (suggested)

**Header:**
- Customer name + avatar (`customer.firstname`, `customer.lastname`, `customer.profilePicture`)
- Transaction status badge (`status`)
- Master wallet status badge (`masterWalletStatus`)

**On-chain Info:**
| Label | Field |
|-------|-------|
| TX Hash | `txHash` (link to block explorer) |
| From | `fromAddress` |
| To | `toAddress` |
| Block | `blockNumber` |
| Confirmations | `confirmations` |

**Value:**
| Label | Field |
|-------|-------|
| Crypto Amount | `amount` + `currency` |
| USD Value | `amountUsd` |
| NGN Value | `amountNaira` |
| Blockchain | `blockchain` |

**Received Asset (internal record):**
| Label | Field |
|-------|-------|
| Account ID | `receivedAsset.accountId` |
| Status | `receivedAsset.status` |
| Reference | `receivedAsset.reference` |
| Deposit Date | `receivedAsset.transactionDate` |

---

## masterWalletStatus Values

| Value | Meaning | UI Suggestion |
|-------|---------|---------------|
| `"inWallet"` | Crypto is in user's virtual account, **not yet transferred** to master wallet | Yellow badge: "In Wallet" |
| `"transferredToMaster"` | Crypto has been swept to the master wallet | Green badge: "Transferred" |
| `"unknown"` | No matching received asset record found (edge case) | Grey badge: "Unknown" |

---

## Error Responses

All errors follow the standard envelope:

```json
{
  "status": "error",
  "message": "Received transaction not found",
  "data": null
}
```

| Status | When |
|--------|------|
| 400 | Missing `txId` param |
| 404 | Transaction not found or not a RECEIVE transaction |
| 500 | Internal server error |
