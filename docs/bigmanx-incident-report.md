# Bigmanx — Incident Report

| Field | Detail |
|-------|--------|
| Name | Alfred Ekwunife |
| App name | Bigmanx |
| Email | Femicolp@gmail.com |
| Phone | 08100257913 |
| User ID | 61712 |
| Status | **Banned** — wallet frozen; deposit, withdrawal, crypto, and gift-card locked |

---

## Summary

User ran a parallel / brute-force betting pattern. Those attempts were automatically rejected and blocked. Large withdrawal attempts were blocked immediately by the system (no payout created). The account was banned. Normal activity within his deposits is listed below. A few ordinary payments separately could not complete when PalmPay funding was unavailable.

---

## 1. Deposits — ₦96,880

Permanent VA: `0100850438`

| Amount | Time (UTC) | Payer | Bank | Order |
|--------|------------|-------|------|-------|
| ₦10,000 | 26 Oct 16:26 | LONGY FLEX | KUDA | MI2114755419032506368 |
| ₦1,880 | 26 Oct 23:12 | DAVID STEVEN | OPAY | MI2114857463667896320 |
| ₦48,500 | 26 Oct 23:41 | DAVID STEVEN | PALMPAY | MI2114864857244372992 |
| ₦36,000 | 27 Oct 00:01 | DAVID STEVEN | PALMPAY | MI2114869790756790272 |
| ₦500 | 27 Oct 00:11 | DAVID STEVEN | OPAY | MI2114872500021248000 |

---

## 2. Normal completed activity

### Betting / airtime — ₦49,978

| Amount | Time (UTC) | Detail | Order |
|--------|------------|--------|-------|
| ₦200 | 26 Oct 21:32 | Betting 15797441 | z23cybw15200 |
| ₦1,700 | 26 Oct 23:08 | Betting 15797441 | z23cygdg9500 |
| ₦1,777 | 26 Oct 23:08 | Betting 15797441 | z23cygdic800 |
| ₦500 | 26 Oct 23:13 | Betting 15797441 | z23cygla5200 |
| ₦500 | 26 Oct 23:38 | Betting 9133320754 | z23cyhrl5200 |
| ₦200 | 26 Oct 23:47 | Betting 9133320754 | z23cyi686300 |
| ₦37,000 | 26 Oct 23:50 | Betting 9133320754 | z23cyibc5200 |
| ₦8,001 | 26 Oct 23:54 | Betting 15797441 | z23cyihs5200 |
| ₦100 | 27 Oct 00:14 | Airtime MTN 09169450738 | — |

### Withdrawals completed

| Amount | Time (UTC) | To | Account |
|--------|------------|-----|---------|
| ₦3,700 | 4 Oct 00:01 | KIRA AI-ALFRED… | 6747373330 |
| ₦8,000 | 26 Oct 23:07 | Alfred Ekwunife | 8937117130 |
| ₦200 | 27 Oct 00:12 | DAVID STEVEN | 7026423794 |

Completed spend remained within his deposited funds.

---

## 3. Bill payment abuse — parallel / brute force

On 26–27 Oct he fired **many betting (bill payment) requests in parallel** — a brute-force pattern, not normal single payments.

Examples of volume:

- 26 Oct 23:49–23:50 — parallel multi-request bursts  
- 27 Oct 00:02–00:05 — repeated parallel attempts  
- 27 Oct 00:03 — 66 attempts in one minute

**Outcome:** the brute-force / parallel attempts were **automatically rejected and blocked by the system due to rate limiting**. They did not succeed. The account was then **automatically banned** and features frozen.

---

## 4. Large withdrawal attempts — blocked immediately

He tried several large withdrawals to DAVID STEVEN / `7026423794`, one after another.

**Outcome:** the system **immediately blocked** those attempts. **No payout was created** and **nothing was paid out**. His **withdraw feature was blocked immediately**.

---

## 5. Ordinary funding note

Outside the abuse bursts above, a few normal-sized payment attempts did not complete because **PalmPay funding was not available** at that moment. That is unrelated to the rate-limit blocks and the ban.

---

## 6. Final status

| Item | Result |
|------|--------|
| Deposited | ₦96,880 |
| Normal completed payments | ₦49,978 |
| Normal completed withdrawals | ₦11,900 |
| Large withdrawal attempts | **Blocked immediately — no payout created; withdraw feature blocked** |
| Parallel / brute-force betting | **Blocked by rate limiting; account banned** |
| Account | Banned and frozen |

---

## Conclusion

A limited set of normal transactions completed within his deposits. Parallel / brute-force betting was **automatically rejected and blocked due to rate limiting**, and the account was banned. Large withdrawal attempts were **blocked immediately** by the system — no payout created, nothing paid out. A few ordinary payments separately could not complete when PalmPay funding was unavailable.

---

## 7. System security controls already in place

Money requests are protected by the following controls:

| Control               | What it does                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Redis locks**       | Only one bill payment or withdrawal can run at a time per user — parallel requests are queued and if brute force attack automatically blocked |
| **Money rate limits** | Limits how many withdraw / bill / betting requests a user can send in a short period.                                                         |

These controls are live on production and are what blocked the parallel / brute-force behaviour on this account.
