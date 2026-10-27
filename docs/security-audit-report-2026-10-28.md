# Security Audit Report — Tercescrow v2

| Field | Value |
|--------|--------|
| **Date** | 2026-10-28 |
| **Target** | `/var/www/tercescrow-v2` (live `127.0.0.1:5000`, DB `prisma_db`) |
| **Method** | Read-only code review + non-destructive HTTP probes + SELECT-only DB stats |
| **Constraints honored** | No DELETE/UPDATE; no wallet/balance mutations; `uploads/` not modified |
| **Prior baseline** | [pentest-report-2026-10-27.md](./pentest-report-2026-10-27.md) |

### Security score (current)

| Area | Score | Notes |
|------|-------|-------|
| Authentication (JWT) | **8 / 10** | `jwt.verify` + expiry; forged JWT → **401** (live confirmed) |
| Session / lockout | **7 / 10** | Redis rate limits + DB lockout columns present on prod |
| PIN at rest | **8 / 10** | **242/242 hashed** on `prisma_db` (0 plaintext) |
| Admin authorization | **2 / 10** | Many `/api/admin/*` routes unauthenticated or customer-accessible |
| Account takeover surfaces | **1 / 10** | Password reset + PIN set/update without proof of ownership |
| Webhook integrity | **8 / 10** | PalmPay/Obiex verify required; Busha verifies when secret set |
| Race / double-credit | **5 / 10** | Core fiat `FOR UPDATE` strong; refund / legacy crypto gaps remain |
| Abuse / rate limits | **7 / 10** | Login/PIN/OTP/money limits live; Redis fail-open |
| Uploads / CORS | **3 / 10** | Unauthenticated upload + public static; `cors origin: *` |
| **Overall** | **~4 / 10** | P0 takeover/mint from Oct-27 closed; **new/remaining P0 authZ holes are live** |

---

## Executive summary

Yesterday’s P0 issues (unsigned JWT takeover, unsigned PalmPay mint) appear **fixed and live-verified**.

However, this audit found **live, unauthenticated admin APIs** that expose SMTP credentials, master-wallet addresses/balances, dashboard revenue, and role/permission data — and **account-takeover endpoints** that can reset any user’s password or transaction PIN with no session/OTP binding.

**Immediate actions (today):**

1. Rotate the SMTP password exposed via `GET /api/admin/operations/get-smtp` (no auth).
2. Put `authenticateUser` + `authenticateAdmin` on **every** `/api/admin/**` route (deny by default).
3. Disable or hard-bind `POST /api/auth/set-new-password` to a verified OTP/reset token.
4. Require authenticated session (and old PIN / OTP) for `set-pin` / `update-pin`.
5. Remove or authenticate `POST /api/file`; stop serving sensitive uploads as world-readable static files.

---

## Scope & safety

| Done | Not done |
|------|----------|
| Full route/auth middleware mapping | No balance credits/debits |
| Live GET probes of open admin endpoints | No password/PIN changes on real accounts |
| SELECT-only DB PIN/role stats on `prisma_db` | No uploads folder writes/deletes |
| Race-condition code path analysis | No exploit PoCs that mutate money |
| Webhook signature review | No phpMyAdmin / network destructive tests |

Live process: `node -r dotenv/config dist/index.js` (cwd `tercescrow-v2`, DB **`prisma_db`** via strict-style env).  
Note: root `.env` points at `testing_db` (small); do not confuse with production `prisma_db`.

---

## Live confirmation (non-destructive)

| Probe | Result |
|-------|--------|
| Forged JWT → `GET /api/admin/user-balances` | **401** `Invalid access token` |
| `GET /api-docs/`, test routes | **404** (gated off) |
| `GET /api/admin/master-wallet` (no auth) | **200** — wallet addresses returned |
| `GET /api/admin/master-wallet/balances` (no auth) | **200** — balances returned |
| `GET /api/admin/operations/get-smtp` (no auth) | **200** — **includes SMTP password field** |
| `GET /api/admin/operations/get-dashboard-stats` (no auth) | **200** — revenue/user metrics |
| `GET /api/admin/operations/get-roles` (no auth) | **200** — roles + permissions |
| `POST /api/auth/set-pin` (no auth, empty body) | **400** validation only (handler is public) |
| `POST /api/auth/set-new-password` `{userId:999999999}` | **400** User not found (handler is public; would update if id exists) |
| `POST /api/admin/operations/change-status/1` (no auth) | Handler runs (**“User not found”**) — **no auth gate** |

---

## Production DB snapshot (SELECT only)

| Metric | Value |
|--------|-------|
| Users | **33,293** |
| PINs set | 242 |
| PINs bcrypt-hashed | **242 (100%)** |
| PINs plaintext | **0** |
| Roles | admin 2, agent 4, other 3, customer 33,283 active + 1 banned |
| Columns `tokenVersion` / `failedLoginCount` / `lockedUntil` | **Present** |

---

## Findings

### CRITICAL

#### C-01 — Unauthenticated admin operations (incl. SMTP secret leak) — **LIVE**

**Where:** `src/routes/admin/operations.router.ts` (many routes lack any auth middleware)  
**Mount:** `/api/admin/operations`

Examples with **no auth** (live **200**):

- `GET /get-smtp` → returns host, email, **password**
- `GET /get-dashboard-stats` → users, inflow/outflow/revenue
- `GET /get-roles` / `get-roles-list`
- `POST /change-status/:userId` — ban/status change (handler executes without login)
- `POST /create-smtp`, `POST /create-role`, `POST /create-permissions`, department/category CRUD, KYC limits, etc.

**Impact:** Credential theft (SMTP → inbox takeover / OTP interception), competitive intelligence leak, unauthenticated account status changes.

**Fix:** Default-deny: `router.use(authenticateUser, authenticateAdmin)` on the entire operations router; rotate SMTP password immediately.

---

#### C-02 — Unauthenticated master-wallet APIs — **LIVE**

**Where:** `src/routes/admin/master.wallet.router.ts`  
**Mount:** `/api/admin/master-wallet`

Unauthenticated (confirmed **200**):

- `GET /` — list master wallets + addresses  
- `GET /balances` — balances  
- Also unauthenticated in code: `POST /`, `POST /create-all`, `POST /update-all`, `GET /deposit-address/:userId/...`

Fund-moving routes use `staffOps` (admin **or** agent) — better, but agents can still sweep/send.

**Impact:** Full visibility into treasury addresses/balances; unauthenticated create/update of master wallets.

**Fix:** `adminOnly` on all routes; never expose treasury addresses publicly.

---

#### C-03 — Account takeover via `POST /api/auth/set-new-password` — **CODE + LIVE**

**Where:** `auth.router.ts` → `setNewPasswordController` (`auth.controllers.ts` ~576–607)

Accepts `{ userId, password }` with **no JWT**, **no OTP**, **no reset token**.  
`verify-forgot-password-otp` returns a `userId` but is **not required** by this handler.

Also returns `updatedUser` (risk of leaking password hash / PII in response).

**Impact:** Anyone who can guess/enumerate a numeric `userId` can take over that account.

**Fix:** Single-use signed reset token (or server-side OTP session) required; never accept raw `userId` alone; do not echo full user row.

---

#### C-04 — PIN set/update without authentication (email IDOR) — **CODE + LIVE**

**Where:** `POST /api/auth/set-pin`, `POST /api/auth/update-pin`  
**Controllers:** `setPinController` / `updatePinController` — body `{ email, pin }` only.

No JWT, no old PIN, no OTP. Attacker who knows email can set the victim’s transaction PIN and then authorize withdrawals/bills after stealing/using a session (or combining with C-03).

**Fix:** Require `authenticateUser`; bind to `req.user.id`; for update require current PIN + rate limit.

---

#### C-05 — Privilege escalation / admin surfaces for any logged-in customer

| Surface | Issue |
|---------|--------|
| `/api/admin/profit-tracker/*` | `authenticateUser` only — customers can mutate fees/configs/backfill |
| `/api/admin/crypto` rate routes | Same — mutate exchange/deposit fees |
| `/api/admin/giftcards/*` | TODO “Add admin role check” — sync products, Reloadly token |
| `/api/admin/auth` create-agent / create-team-member | Any user can create agents/team |
| `/api/admin/webhooks/migrate-subscriptions` | Any authenticated user can trigger Tatum migrations |

**Fix:** `authenticateAdmin` on all admin mounts; controller-level defense-in-depth.

---

### HIGH — Race conditions / double-spend

Core fiat path (`fiat.wallet.service.ts`) uses `SELECT … FOR UPDATE` + conditional debit — **good**. Gaps:

| ID | Scenario | Risk |
|----|----------|------|
| **R-01** | Obiex `master_swap` buy: crypto credited then catch refunds NGN | User keeps crypto + NGN |
| **R-02** | PalmPay payout: initiate `catch` `creditWalletAtomic` vs fail webhook refund | Double NGN refund |
| **R-03** | Bill payment: create-order catch refund vs status-job refund (no shared lock) | Double refund (asymmetric amounts) |
| **R-04** | Legacy crypto buy/sell: read balance then absolute write (no row lock) | Concurrent overdraft / lost update |
| **R-05** | Obiex app convert: refund source after target already credited | Double crypto |
| **R-06** | Busha app `reverseBuyDebit` lacks claim used by settlement path | Double NGN credit |
| **R-07** | Referral transfer (if re-enabled): decrement without `FOR UPDATE` | Negative referral balance |

**Positive controls:** PalmPay VA credit idempotency (`palmpayOrderNo` + unique); payout webhook `payoutRefundedAt`; Obiex/Busha deposit claims; giftcard refund claim; Obiex per-user Redis trade lock (fail-open if Redis down).

---

### HIGH — Brute force / abuse

| Control | Status |
|---------|--------|
| Login rate limit (Redis) + DB lockout | Wired in `public.controllers` + `login.lockout.ts` |
| PIN rate limit | Wired on `verify-pin` |
| OTP send rate limit | Wired |
| Money ops rate limit | Default **2 / 60s** (stricter than prior pentest’s 5) |
| Redis unavailable | **Fail-open** (alerts email) — attacker benefit if Redis down |
| `X-Forwarded-For` trusted for IP limits | Spoofable if reverse proxy doesn’t overwrite |
| Password complexity | Still weak / deferred |
| Progressive delay / CAPTCHA | Not present |

Login lockout depends on DB columns — **present on `prisma_db`**.

---

### MEDIUM

| ID | Issue |
|----|--------|
| **M-01** | `POST /api/file` unauthenticated; multer accepts **all** MIME types; `/uploads` static public |
| **M-02** | `cors({ origin: '*' })` — any website can call API from a browser (pair with cookie auth risks; Bearer still stealable via XSS elsewhere) |
| **M-03** | Busha webhook: if `BUSHA_WEBHOOK_SECRET` unset → **signature skipped** (fail-open). Secret is set in strict env; keep required/fail-closed. |
| **M-04** | Tatum HMAC only enforced when configured |
| **M-05** | Private-key export uses `ENCRYPTION_KEY` with insecure fallback string in code |
| **M-06** | `GET /api/auth/delete-customer` — authenticated self-delete via GET (CSRF/prefetch risk) |
| **M-07** | Admin audit middleware exists (good) but cannot audit calls that never authenticate |
| **M-08** | Socket.io CORS permissive (review separately) |

---

## Webhooks (summary)

| Provider | Verification | Notes |
|----------|--------------|-------|
| PalmPay | RSA `sign` required → 401 if missing/invalid | Fixed vs Oct-27 |
| Obiex | HMAC-SHA512 fail-closed if secret missing | Good |
| Busha | HMAC when secret set; **fail-open if unset** | Harden to fail-closed |
| Tatum | HMAC when configured | Ensure always on in prod |

---

## What improved since 2026-10-27

| Prior finding | Status now |
|---------------|------------|
| C-01 JWT not verified | **Fixed** (live 401 on forge) |
| C-02 PalmPay unsigned webhook | **Fixed** in code |
| H-01 Plaintext PINs | **Remediated on prod** (242/242 hashed) |
| M-01 Auth brute force | Rate limits + DB lockout present |
| M-02 Swagger public | **Off** (404) |
| Test routes | **Off** (404) |
| H-02 phpMyAdmin | Not re-tested this pass (prior: IP allowlist) |

---

## Endpoint inventory (high level)

| Prefix | Auth expectation | Actual posture |
|--------|------------------|----------------|
| `/api/auth/*` | Mixed public/auth | **Dangerous public:** set-pin, update-pin, set-new-password |
| `/api/public/*` | Public + rate limits | Login lockout/rate limit present |
| `/api/v2/crypto/*`, wallets, bills, payouts, obiex, busha, kyc, referrals | `authenticateUser` | Generally OK; money races as above |
| `/api/v2/webhooks/*` | Signature | Mostly OK |
| `/api/admin/*` (busha, obiex, freeze, balances, fraud, VA review, …) | Admin | Many properly `adminOnly` |
| `/api/admin/operations`, master-wallet, profit, crypto rates, giftcards, … | Admin | **Broken / partial** |
| `/api/agent/*` | Agent | Review ongoing |
| `/api/file`, `/uploads` | Should be restricted | **Open** |
| `/api/v2/test/*`, `/api/testing/*` | Off unless env | Off |

---

## Remediation priority

### P0 — same day

1. Rotate SMTP credentials (and any passwords that might have been reset via open endpoints historically).
2. Add global admin middleware: no `/api/admin` route without `authenticateUser` + role check.
3. Fix password reset + PIN endpoints (token binding).
4. Disable unauthenticated master-wallet GETs/POSTs.

### P1 — this week

5. Unify all money **refunds** through idempotent helpers (txn `FOR UPDATE` + claim flag) — fix R-01…R-03.
6. Port legacy crypto buy/sell to `debitWallet` / locked updates.
7. Auth + virus-scan/type allowlist for uploads; signed URLs instead of public `/uploads`.
8. Busha/Tatum: fail-closed without webhook secrets.
9. Restrict CORS to known app origins.

### P2 — hardening

10. CAPTCHA / progressive delay after login failures.  
11. Remove encryption-key fallback; require env.  
12. Agent vs admin least privilege on master-wallet send/sweep.  
13. Redis fail-closed for money ops (or circuit-break trades when Redis down).

---

## Live money-path pentest (2026-10-28, authorized)

Account: `hmstech11@gmail.com` (id `43937`). Small amounts. Withdraw destinations = **Obiex amount-locked one-time VAs** (`POST /ngn-payments/deposits/accounts/issue`). Bill provider = **Strowallet** (merchant float empty → expected fail). Rate/lock Redis keys cleared after tests. `uploads/` untouched.

### Snapshot vs final

| | NGN |
|--|-----|
| Start | **19,590.27** |
| End | **19,240.27** |
| Net | **−350.00** (= two completed withdraws only; bills fully refunded) |

### Withdraw → Obiex VA

| Test | Amount | Fee | Result |
|------|--------|-----|--------|
| Single payout to VA `5265518876` | ₦150 | ₦50 | **completed** (PalmPay orderNo `41261027224156501217`) |
| Concurrent **5×** same VA `5251542791` ₦100 | ₦100 | ₦50 | **1× 200 completed**; **4× 400** (lock / money rate) — **no double payout** |

Debit math matched ledger: `totalAmount` 200 + 150 = 350.

### Bill payment → Strowallet (real)

| Test | Result |
|------|--------|
| Single MTN airtime ₦50 | Debit → Strowallet **Insufficient balance** → **refunded=true**; wallet unchanged |
| Concurrent 6× + wave 4× | 1 in-flight succeeds path; others **lock** / **Max 2 per 60s**; **3** bills `failed`+`refunded`; **no double-refund** (balance stayed flat across waves) |

### Verdict (money races under live limits)

- Per-user **withdraw lock** + **money rate (2/60s)** prevented parallel double-spend to PalmPay.
- Strowallet fail path: **debit-first + in-request refund** restored balance; concurrent extras blocked before second debit in most cases.
- Residual risk from code review (refund helper races if Redis fail-open / catch vs job) **not triggered** under current Redis-up limits.

### Not reverted to start balance

PalmPay→Obiex transfers are intentional retention on Obiex NGNX (minus Obiex VA deposit fee ~₦100 each). Bills already refunded. No pending withdraw/bill left.

---

## Disclaimer

Initial pass was read-only. Live money tests above were explicitly authorized by the owner (withdraw to Obiex VA; real Strowallet bills). SMTP password was observed via an unauthenticated API earlier — **rotate it**. `uploads/` was not modified.
