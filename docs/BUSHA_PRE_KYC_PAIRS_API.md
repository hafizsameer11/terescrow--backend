# Busha Pre-KYC NGN Rates — `/v1/pairs` API Reference

Reference for showing **indicative NGN exchange rates before customer KYC**.  
Source: Busha public API (not Terescrow integration code).

Official docs: https://docs.busha.io/api-reference/pairs/list-pairs

**Last verified:** 2026-08-25 (live call to `https://api.busha.co/v1/pairs?currency=NGN`)

---

## Summary

| Item | Value |
|------|-------|
| Endpoint | `GET /v1/pairs` |
| Base URL (production) | `https://api.busha.co` |
| Auth required | **No** — no Bearer token, no `X-BU-PROFILE-ID`, no customer KYC |
| NGN pairs available | **75 assets** (as of last check) |
| Assets without NGN pair | **MATIC, PI, RMT, TON** |
| Rate type | **Indicative** — not a locked quote; fees not included |

Use this for a **“Today’s rates”** or **pre-KYC rate screen**.  
For amount-specific quotes with fees, use `POST /v1/quotes/unauthenticated` (business API key on backend).

---

## Request

### List all NGN pairs

```http
GET https://api.busha.co/v1/pairs?currency=NGN
```

No headers required.

### cURL

```bash
curl -sS "https://api.busha.co/v1/pairs?currency=NGN"
```

### Query parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `currency` | string | No | Filter pairs by base **or** counter currency. Use `NGN` for all Naira pairs. |
| `type` | string | No | Filter by pair type: `fiat`, `crypto`, `digital`. NGN pairs are usually `fiat`. |
| `limit` | number | No | Limit number of results returned. |
| `cursor` | string | No | Pagination cursor (if Busha returns one in paginated responses). |

### Examples

```bash
# All NGN pairs (recommended for Terescrow rate screen)
curl "https://api.busha.co/v1/pairs?currency=NGN"

# First 10 NGN pairs only
curl "https://api.busha.co/v1/pairs?currency=NGN&limit=10"

# Fiat-type pairs only
curl "https://api.busha.co/v1/pairs?currency=NGN&type=fiat"
```

---

## Response envelope

```json
{
  "status": "success",
  "message": "Fetched pairs successfully",
  "data": [ /* array of pair objects */ ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"success"` on OK |
| `message` | string | Human-readable message |
| `data` | array | List of pair objects |

---

## Pair object (full schema)

Each item in `data`:

```json
{
  "id": "USDTNGN",
  "base": "USDT",
  "base_currency_name": "Tether",
  "counter": "NGN",
  "counter_currency_name": "Naira",
  "type": "fiat",
  "buy_price": {
    "amount": "1398.93",
    "currency": "NGN"
  },
  "sell_price": {
    "amount": "1383.35",
    "currency": "NGN"
  },
  "is_buy_supported": true,
  "is_sell_supported": true,
  "min_buy_amount": {
    "amount": "1.87",
    "counter": {
      "amount": "2616",
      "currency": "NGN"
    },
    "currency": "USDT"
  },
  "min_sell_amount": {
    "amount": "2.06",
    "counter": {
      "amount": "2849.7",
      "currency": "NGN"
    },
    "currency": "USDT"
  },
  "max_buy_amount": {
    "amount": "500000",
    "counter": {
      "amount": "699465000",
      "currency": "NGN"
    },
    "currency": "USDT"
  },
  "max_sell_amount": {
    "amount": "500000",
    "counter": {
      "amount": "691675000",
      "currency": "NGN"
    },
    "currency": "USDT"
  },
  "base_decimal": "2",
  "counter_decimal": "2",
  "percentage_change": "0"
}
```

---

## Field reference

| Field | Type | UI meaning |
|-------|------|------------|
| `id` | string | Pair ID, e.g. `USDTNGN`, `BTCNGN` |
| `base` | string | Crypto/asset code (what user buys/sells) |
| `base_currency_name` | string | Display name, e.g. `"Tether"` |
| `counter` | string | Quote currency — `NGN` for this doc |
| `counter_currency_name` | string | `"Naira"` |
| `type` | string | `fiat` \| `crypto` \| `digital` |
| `buy_price.amount` | string | **Buy rate** — NGN per 1 unit of `base` when user **buys crypto with NGN** |
| `buy_price.currency` | string | Always `NGN` for NGN pairs |
| `sell_price.amount` | string | **Sell rate** — NGN per 1 unit of `base` when user **sells crypto for NGN** |
| `sell_price.currency` | string | Always `NGN` for NGN pairs |
| `is_buy_supported` | boolean | Whether buy direction is enabled |
| `is_sell_supported` | boolean | Whether sell direction is enabled |
| `min_buy_amount` | object | Minimum buy size in `base` + NGN equivalent in `counter` |
| `min_sell_amount` | object | Minimum sell size in `base` + NGN equivalent in `counter` |
| `max_buy_amount` | object | Maximum buy size in `base` + NGN equivalent |
| `max_sell_amount` | object | Maximum sell size in `base` + NGN equivalent |
| `base_decimal` | string | Decimal places for base asset display |
| `counter_decimal` | string | Decimal places for NGN display |
| `percentage_change` | string | 24h change (percent) for rate ticker |

### Buy vs sell (customer-facing)

| Customer action | Rate to show | Busha field |
|-----------------|--------------|-------------|
| User buys USDT with NGN | “1 USDT = ₦X” (higher) | `buy_price.amount` |
| User sells USDT for NGN | “1 USDT = ₦X” (lower) | `sell_price.amount` |

Example (USDTNGN, live sample):

- **Buy USDT:** ₦1,398.93 / USDT  
- **Sell USDT:** ₦1,383.35 / USDT  
- **Min buy:** ~1.87 USDT (~₦2,616)

---

## NGN assets with rates (75)

All returned by `GET /v1/pairs?currency=NGN` as of 2026-08-25:

```
AAVE, ACT, ADA, ALGO, ALICE, APE, ARB, ARKM, ASTER, ATOM, AVAX, AXS, BCH, BNB,
BONK, BTC, BTT, C98, CAKE, CHZ, CNGN, DOGE, DOGS, DOT, ENJ, ENS, ETH, FIL, FLOKI,
GALA, GRAM, GRASS, HIVE, HOME, HYPE, JUP, KAITO, KES, LINK, LTC, LUNA, LUNC, MANA,
MELANIA, MEME, MET, NGNT, NOT, PEAQ, PENGU, PEPE, PLUME, PNUT, POL, RLUSD, S, SAND,
SHIB, SLP, SOL, SUI, SUNDOG, TRUMP, TRX, TWT, UNI, USD, USDC, USDT, WIF, WIN, WLD,
WLFI, XLM, XRP
```

### Major pairs (sample rates at last check)

| Asset | Pair ID | Buy (₦) | Sell (₦) |
|-------|---------|---------|----------|
| USDT | USDTNGN | 1,398.93 | 1,383.35 |
| USDC | USDCNGN | 1,399.91 | 1,383.21 |
| BTC | BTCNGN | 112,785,849.45 | 107,250,447.66 |
| ETH | ETHNGN | 3,544,734.74 | 3,371,168.62 |
| SOL | SOLNGN | 138,298.22 | 131,459.75 |
| XRP | XRPNGN | 2,124.97 | 2,020.24 |
| TRX | TRXNGN | 491.29 | 466.56 |
| DOGE | DOGENGN | 128.28 | 121.87 |

> Rates change frequently. Do not hardcode prices — fetch from API.

---

## Assets listed on Busha but **no NGN pair**

| Asset | Notes |
|-------|-------|
| MATIC | Has `MATICGBP` only |
| PI | Has `PIUSDT`, `PIKES` — no NGN |
| TON | Has `TONGRAM` — no NGN |
| RMT | No trading pair at all |

**UI suggestion:** show “Rate unavailable” or hide these on the pre-KYC NGN screen.

---

## Errors

Typical error shape:

```json
{
  "message": "endpoint not found"
}
```

| HTTP | Meaning |
|------|---------|
| 200 | Success — check `status` in body |
| 4xx/5xx | Request failed — show fallback “Rates temporarily unavailable” |

There is **no single-pair URL** like `/v1/pairs/USDTNGN` (returns `endpoint not found`).  
Filter client-side from the list, or use `?currency=NGN` and find `id === "USDTNGN"`.

---

## Limitations (important for product copy)

1. **Indicative only** — not a locked quote; actual trade rate may differ slightly at execution.
2. **No fees in response** — processing/network fees are not included. Use unauthenticated quotes for fee-aware previews.
3. **No trade execution** — customer still needs Busha profile **active** (KYC) to buy/sell/receive/send.
4. **Rates move** — refresh every 30–60s on a live rate screen.
5. **Not all Busha assets have NGN** — see missing list above (~95%+ coverage).

Suggested disclaimer on pre-KYC screen:

> *Indicative rate only. Complete verification to get an exact quote and trade.*

---

## Suggested Terescrow implementation (offline planning)

### Backend proxy (recommended)

Do **not** call Busha directly from the mobile app. Add a Terescrow endpoint, e.g.:

```
GET /api/v2/busha/rates/public?currency=NGN
```

Backend flow:

1. Call `GET https://api.busha.co/v1/pairs?currency=NGN`
2. Map to app shape: `{ symbol, name, buyRate, sellRate, minBuyNgn, minSellNgn, change24h, canBuy, canSell }`
3. Optionally apply admin markup (`buyMarkupPercent` / `sellMarkupPercent`) on top of Busha prices
4. Cache 30–60 seconds (Redis or in-memory) to avoid hammering Busha

### When to use which Busha API

| Use case | API | KYC needed? |
|----------|-----|-------------|
| Rate ticker / browse before signup | `GET /v1/pairs?currency=NGN` | No |
| “₦5,000 → X USDT” calculator with fees | `POST /v1/quotes/unauthenticated` | No (business key on server) |
| Execute buy/sell/receive/send | `POST /v1/quotes` + transfer | Yes — customer `active` |

### Mobile gating

| User state | Show rates? | Allow trade? |
|------------|---------------|--------------|
| Not logged in | Yes (public rates) | No |
| Logged in, KYC pending | Yes | No |
| KYC active | Yes (can switch to exact quote) | Yes |

---

## Quick test checklist

```bash
# 1. Should return 200 + JSON with ~75 pairs
curl -sS -o /dev/null -w "%{http_code}\n" "https://api.busha.co/v1/pairs?currency=NGN"

# 2. USDTNGN should exist
curl -sS "https://api.busha.co/v1/pairs?currency=NGN" | jq '.data[] | select(.id=="USDTNGN") | {id, buy: .buy_price.amount, sell: .sell_price.amount}'

# 3. Confirm no auth header needed
curl -sS "https://api.busha.co/v1/pairs?currency=NGN" | jq '.status'
```

---

## Related docs

- Terescrow Busha integration: [BUSHA_INTEGRATION_GUIDE.md](./BUSHA_INTEGRATION_GUIDE.md)
- Busha unauthenticated quotes (amount + fees preview): https://docs.busha.io/api-reference/quotes/create-unauthenticated-quotes
- Busha pairs list: https://docs.busha.io/api-reference/pairs/list-pairs
