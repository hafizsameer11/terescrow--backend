# Admin ChangeNOW swaps

Admin-only module to quote, create, and track **ChangeNOW** exchanges. Pay-in is sent **from either a customer deposit (received asset)** or the **EVM master wallet**; payout goes to an **admin-saved address**.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `CHANGENOW_API_KEY` | Yes (for quotes, create, status) | Partner API key from ChangeNOW |
| `CHANGENOW_API_BASE` | No | Default `https://api.changenow.io` |

**Auth:** Protected calls send **`x-changenow-api-key: <key>`** (per `changenow.md`).

**Cross-check with repo `changenow.md`:**

| Doc endpoint | Our client | Notes |
|--------------|------------|--------|
| `GET .../min-amount` + header + optional `fromNetwork`/`toNetwork` | `getMinAmount` | Sends header when `CHANGENOW_API_KEY` is set; networks from currency list guess, then API response. |
| `GET .../range` | `getRange` | Same header/network pattern as min-amount. |
| `GET .../available-pairs` | implemented | Exposed to frontend as `GET /api/admin/changenow/available-pairs`. |
| `GET .../network-fee` | implemented | Exposed to frontend as `GET /api/admin/changenow/network-fee`. |
| `GET .../markets/estimate` | not used | Doc: informational only; we use `GET .../exchange/estimated-amount` for swap quotes (partner API). |
| `GET .../exchanges` (list) | implemented | Exposed as `GET /api/admin/changenow/partner-exchanges` for partner-level reconciliation. |
| Status values `waiting`…`verifying` | `mapRemoteStatusToLocal` | `verifying` → local `exchanging`. |

Create exchange: `POST /v2/exchange` with JSON per ChangeNOW example (`type: direct`, networks, etc.) and **`x-changenow-api-key`** — see [`changenow.client.ts`](../src/services/changenow/changenow.client.ts).

## ChangeNOW HTTP API (v2)

| Action | Method | Path |
|--------|--------|------|
| Currencies | GET | `/v2/exchange/currencies` (public) |
| Min amount | GET | `/v2/exchange/min-amount?fromCurrency=&toCurrency=&flow=standard` |
| Range | GET | `/v2/exchange/range?fromCurrency=&toCurrency=&flow=standard` |
| Estimate | GET | `/v2/exchange/estimated-amount?...` + header `x-changenow-api-key` |
| Create | POST | `/v2/exchange` — JSON like official example: `fromNetwork`, `toNetwork`, `type: "direct"`, `flow: "standard"`, empty strings for optional fields; **no `apiKey` in body** |
| Status | GET | `/v2/exchange/by-id?id=` + header `x-changenow-api-key` |

## Base path

All routes: **`/api/admin/changenow`**  
Middleware: `authenticateUser` + `authenticateAdmin` (JWT or cookie `token`).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/currencies` | Cached ChangeNOW currency list (~1h) |
| GET | `/map-internal` | `WalletCurrency` rows with resolved ChangeNOW ticker (DB map or fallback) |
| PUT | `/ticker-mappings/:walletCurrencyId` | Body: `{ "changenowTicker": "usdterc20" }` — persist override |
| GET | `/quote?fromTicker=&toTicker=&amount=` | Min check + estimated receive |
| GET | `/available-pairs?fromCurrency=&toCurrency=&fromNetwork=&toNetwork=&flow=standard` | Deterministic pair/network discovery from ChangeNOW |
| GET | `/network-fee?fromTicker=&toTicker=&amount=&fromNetwork=&toNetwork=&convertedCurrency=usd&convertedNetwork=usd` | Exchange network fee estimate from ChangeNOW |
| GET | `/partner-exchanges?limit=10&offset=0&sortDirection=DESC&sortField=updatedAt&dateField=updatedAt&dateFrom=&dateTo=&requestId=&userId=&payoutAddress=&statuses=` | Partner-level list from `GET /v2/exchanges` |
| GET | `/payout-addresses` | List saved payout addresses for this admin |
| POST | `/payout-addresses` | Body: `address`, optional `label`, `extraId`, `toNetworkHint`, `isDefault` |
| PATCH | `/payout-addresses/:id` | Update fields / archive via `archived: true` |
| DELETE | `/payout-addresses/:id` | Soft-archive |
| POST | `/swaps` | Create ChangeNOW exchange + broadcast pay-in (see below) |
| GET | `/swaps` | Query: `page`, `limit`, optional `status` |
| GET | `/swaps/:id` | Detail |
| POST | `/swaps/:id/refresh` | Pull latest status from ChangeNOW |

## Create swap (`POST /swaps`)

**From customer deposit (EVM only: ethereum, bsc, polygon)**

```json
{
  "sourceType": "received_asset",
  "receiveTransactionId": "RECEIVE-...",
  "fromTicker": "usdterc20",
  "toTicker": "eth",
  "amountFrom": "10",
  "payoutAddressId": 1,
  "refundAddress": "0x..."
}
```

`fromTicker` must match the internal resolver for that receive’s `VirtualAccount.currencyId` (use `GET /map-internal` and the receive’s asset).

**From master wallet (EVM)**

```json
{
  "sourceType": "master_wallet",
  "masterWalletBlockchain": "ethereum",
  "walletCurrencyId": 5,
  "fromTicker": "usdterc20",
  "toTicker": "btc",
  "amountFrom": "50",
  "payoutAddressId": 1,
  "refundAddress": "0x..."
}
```

`masterWalletBlockchain`: `ethereum` | `bsc` | `polygon` (must match the selected `walletCurrencyId` row).

## Ticker mapping

- Table `wallet_currency_changenow_tickers` links `WalletCurrency.id` → ChangeNOW `ticker`.
- If no row exists, `changenow.ticker.service` uses **fallbacks** (e.g. ERC-20 USDT on ethereum → `usdterc20`).
- Override incorrect fallbacks with `PUT /ticker-mappings/:walletCurrencyId`.

## Background poller

`startChangeNowSwapStatusScheduler()` runs every **2 minutes** and refreshes orders in `awaiting_payin`, `payin_broadcast`, or `exchanging` via `GET /v2/exchange/by-id`.

## Data model (Prisma)

- `AdminExchangePayoutAddress` — per-admin payout addresses (and optional memo/`extraId`).
- `ChangeNowSwapOrder` — full swap + pay-in/out hashes, ChangeNOW id, status.
- `WalletCurrencyChangeNowTicker` — optional explicit ticker map.

## Limitations (current)

- Pay-in from **received_asset** is implemented for **EVM** chains only (ethereum, bsc, polygon). Tron/Bitcoin deposits are not wired yet.
- Master pay-in is **EVM** only.
- `POST /api/admin/master-wallet/swap` remains a legacy stub; use **`POST /api/admin/changenow/swaps`** for real swaps.
