# Obiex — Setup & Liquidity (simple guide)

How Obiex works on Tercescrow, and what money needs to sit on the Obiex master account.

---

## Obiex is not like Busha

On **Busha**, buys can be funded with naira (e.g. PalmPay).

On **Obiex**, that does **not** work:

- Deposits must match the user’s legal name (NIN/BVN).
- Money that arrives is **USDT / crypto**, not naira.
- So the PalmPay → buy flow used on Busha **cannot** be used on Obiex.

Instead, Obiex uses **NGNX** (a naira-like balance on Obiex).  
Liquidity = keep **USDT** on the master account, then **swap USDT → NGNX** when more NGNX is needed for users to buy crypto.

---

## How each flow works

### Buy (user gets crypto)

Think of it as: **swap NGNX → crypto** on the master wallet.

1. User pays with **NGN** inside the app.
2. On Obiex, master **NGNX** is swapped into the crypto the user wants.
3. That crypto is credited to the user in the app.

**What must be ready:** enough **NGNX** on the master wallet.  
If NGNX is low → deposit USDT → swap USDT → NGNX (admin).

---

### Sell (user cashes out crypto to NGN)

Think of it as: **swap crypto → NGNX** (the reverse of buy).

1. User sells crypto they already hold.
2. On Obiex, that crypto is swapped back into **NGNX** on the master wallet.
3. User gets **NGN** in the app.

**Do we need to keep extra crypto ready for sells?**  
**No.** A sell only happens if the user already has crypto — from a previous **buy** or **receive**. That crypto is already on Obiex. Sell just turns it back into NGNX.

---

### Receive (user deposits crypto)

1. User gets a deposit address.
2. Crypto arrives and Obiex confirms it.
3. It goes onto the **Obiex master wallet**, and the user’s balance in the app goes up.

So receive is managed on Obiex.  
For automatic credit notifications, the **Obiex webhook** should be set up. Without it, deposits need manual / poll checking.

---

### Withdraw / send (user sends crypto out)

1. App debits the user’s balance.
2. Crypto is sent from the **Obiex master wallet** to their address.

Fees (network etc.) show in the app preview — same style as Busha. No separate gas to manage outside what the app already shows.

---

### Swap (crypto ↔ crypto)

User swaps one coin for another (e.g. USDT → ETH).  
Both sides update on the user’s ledger. Same Obiex master setup.

---

## Liquidity — what to keep on the master account

| Keep on master | What it’s for |
|----------------|---------------|
| **USDT** | Top-up money. Swap to NGNX when buys need more float. |
| **NGNX** | Used when users **buy** (NGNX → crypto). |
| **Crypto** | Comes from user buys & receives. Used when they **sell** (crypto → NGNX) or **withdraw**. No need to park idle crypto just for sells. |

### Simple rule

| Action | What happens on Obiex |
|--------|------------------------|
| **Buy** | NGNX → crypto (need NGNX float) |
| **Sell** | crypto → NGNX (crypto already there from buy/receive) |
| **Receive** | crypto lands on master |
| After user sells received crypto | that value is back as NGNX |

---

## Fees

- Buy / sell / swap / withdraw fees are shown **in the app** (same idea as Busha).
- Crypto send: network fee is in the preview.
- USDT → NGNX (liquidity top-up): normal swap rate — no extra gas for the agency to handle beyond the swap.

---

## One-line summary

**Busha** = naira-friendly funding.  
**Obiex** = keep USDT → swap to NGNX for buys → users buy (NGNX→crypto) / sell (crypto→NGNX) / receive onto master. Webhook for smooth receives.
