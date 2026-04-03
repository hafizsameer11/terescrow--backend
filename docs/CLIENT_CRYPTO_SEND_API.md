# Customer crypto send — API for mobile/web clients

This document describes **your backend endpoints only**. The app server calls **Tatum** (`TATUM_API_KEY` in server environment). **Clients must never use or embed the Tatum API key.**

---

## Base URL

Use your deployed API origin, for example:

`https://<your-api-host>/api/v2/crypto`

All paths below are relative to that base unless you already include `/api/v2/crypto` in the base.

---

## Authentication

Both endpoints require a logged-in user.

| Method | Header or cookie |
|--------|------------------|
| **Bearer** | `Authorization: Bearer <jwt_access_token>` |
| **Cookie** | `token=<jwt_access_token>` (if your app uses cookie auth) |

Missing or invalid auth → **401** with message like `You are not logged in`.

**Send** (not preview) may return **403** if the user is banned or crypto is frozen for that account.

---

## Standard JSON envelope

Successful responses use:

```json
{
  "status": "success",
  "message": "<human-readable message>",
  "data": { }
}
```

Errors use `status: "error"` (or HTTP 4xx/5xx) with a `message` and often validation `errors` array for **400**.

---

## 1. Preview send (recommended before execute)

**`POST /send/preview`**

Full URL: **`POST /api/v2/crypto/send/preview`**

### Headers

- `Content-Type: application/json`
- `Authorization: Bearer <token>` (or cookie as above)

### Body (JSON)

| Field | Type | Required | Rules |
|-------|------|----------|--------|
| `amount` | number | Yes | `> 0` (min `0.00000001` per validator) |
| `currency` | string | Yes | Non-empty. Examples: `ETH`, `USDT`, `TRX`, `BTC`, `BSC`, `BNB`, `MATIC`, `USDT_TRON`, `USDT_BSC` (must match a `virtual_account.currency` for that user + chain) |
| `blockchain` | string | Yes | Non-empty. Normalized server-side (see **Blockchain values** below) |
| `toAddress` | string | Yes | Non-empty. Format must match the chain (EVM `0x`+40 hex, Tron `T…`, etc.) |

### Example — Ethereum USDT

```json
{
  "amount": 10.5,
  "currency": "USDT",
  "blockchain": "ethereum",
  "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

### Example — Tron USDT (ledger currency often `USDT_TRON`)

```json
{
  "amount": 25,
  "currency": "USDT_TRON",
  "blockchain": "tron",
  "toAddress": "TXYZabcdefghijklmnopqrstuvwxyz123"
}
```

### Example — BSC native (ledger may use `BSC`; UI can send `BNB` or `BSC`)

```json
{
  "amount": 0.01,
  "currency": "BSC",
  "blockchain": "bsc",
  "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

### Preview response `data` (main fields)

| Field | Meaning |
|-------|--------|
| `currency`, `blockchain` | Echo/normalized values |
| `amount`, `amountUsd` | Requested amount as strings |
| `toAddress` | Recipient |
| `fromAddress` | **Master wallet address** used for on-chain broadcast (not the user deposit) |
| `gasFee` | Fee estimate object (`eth` / `usd` where applicable + chain-specific extras) |
| `userEthBalance` | On EVM: master **ETH** balance used for gas checks; on other chains, native on master for fees (name kept for compatibility) |
| `hasSufficientEth` | Whether master has enough **native** for gas / native send |
| `cryptoBalanceBefore` / `cryptoBalanceAfter` | User **book** balance before/after (if they sent `amount`) |
| `hasSufficientBalance` | User virtual account ≥ amount |
| `hotWalletBalance` | On-chain spendable asset on **master** for this asset |
| `hasSufficientHotWallet` | Master has ≥ send amount |
| `selectedNetworkMaxSend` | `min(user book, hot wallet asset)` — safe upper bound for this network |
| `canProceed` | `true` only if user book, hot wallet, and native/gas checks all pass |
| `unifiedUsdtTotalBalance` / `unifiedUsdtNetworkBalances` | Present when previewing unified USDT context |
| `virtualAccountId` | Internal id for the resolved virtual account |

Use **`canProceed`** and **`selectedNetworkMaxSend`** in the UI before enabling “Confirm send”.

---

## 2. Execute send

**`POST /send`**

Full URL: **`POST /api/v2/crypto/send`**

Same auth and same **body schema** as preview (`amount`, `currency`, `blockchain`, `toAddress`).

### Success `data`

| Field | Meaning |
|-------|--------|
| `transactionId` | Internal id (e.g. `SEND-<timestamp>-<userId>-<random>`) |
| `amount`, `amountUsd` | Strings |
| `toAddress` | Recipient |
| `txHash` | On-chain transaction id/hash from Tatum/chain |
| `networkFee` | Estimated or implied fee string (units depend on chain; EVM side often ETH-denominated fee estimate) |
| `virtualAccountId` | User virtual account |
| `balanceBefore`, `balanceAfter` | User **book** balance before/after debit |

On-chain send is from the **master wallet**; the user’s balance is debited on success.

---

## Blockchain values (client → server)

Send the network name your UI uses; the server normalizes aliases.

| You may send | Server normalizes to |
|--------------|----------------------|
| `ethereum`, `eth` | `ethereum` |
| `bitcoin`, `btc` | `bitcoin` |
| `bsc`, `binance`, … | `bsc` |
| `tron`, `trx` | `tron` |
| `polygon`, `matic` | `polygon` |
| `doge`, `dogecoin` | `dogecoin` |
| `ltc`, `litecoin` | `litecoin` |

**Rejected** (not implemented for customer send): e.g. `solana`, `sol`, `xrp`, `ripple`, `celo`, `algorand`, `algo`.

**USDT:** For `currency: "USDT"`, `blockchain` selects the network (`ethereum`, `bsc`, `tron`). There is no customer-send USDT mapping for Polygon until `wallet_currencies` + `resolveSendStorageCurrency` support it.

---

## Tatum (operations / handover note)

1. **Server-only:** `TATUM_API_KEY` must be set on the backend. Clients do not call Tatum.
2. **Master wallet:** Each supported `MasterWallet.blockchain` (case-insensitive match to normalized chain) must have **`address` + encrypted `privateKey`** populated. Broadcast and **gas** come from here.
3. **Liquidity:** The master wallet must hold enough of the asset **and** native coin for fees (ETH for ERC-20, TRX for TRC-20, BNB on BSC, etc.), or the API returns a clear error (`Hot wallet … insufficient`, `Master wallet needs … ETH for gas`, etc.).
4. **User balance:** The user’s **virtual account** must have `availableBalance >= amount`. The server may reconcile the book against the user’s **deposit address** on-chain when a deposit address exists.

---

## Common HTTP codes

| Code | Typical cause |
|------|----------------|
| 200 | Preview or send succeeded |
| 400 | Validation failed, insufficient balance, invalid address, master not configured, hot wallet insufficient |
| 401 | Not logged in |
| 403 | Banned / crypto frozen (send only) |
| 500 | Unexpected server error |

---

## Suggested client flow

1. `POST /api/v2/crypto/send/preview` with the same payload you will use for send.  
2. If `data.canProceed !== true`, show reasons (insufficient book vs insufficient hot wallet vs gas).  
3. `POST /api/v2/crypto/send` with the **same** `amount`, `currency`, `blockchain`, `toAddress`.  
4. Store/display `data.txHash` and `data.transactionId` for support.

---

## Related backend files (for your engineering team)

- Routes: `src/routes/cutomer/crypto.send.router.ts`
- Controller: `src/controllers/customer/crypto.send.controller.ts`
- Service: `src/services/crypto/crypto.send.service.ts`
- Chain execution: `src/services/crypto/crypto.send.chain.handlers.ts`
- Tatum usage: `src/services/ethereum/*`, `src/services/tatum/evm.tatum.*`, `src/services/tron/tron.tatum.service.ts`, `src/services/utxo/utxo.tatum.service.ts`
