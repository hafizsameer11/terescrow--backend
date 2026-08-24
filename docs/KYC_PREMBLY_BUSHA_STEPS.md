# KYC Steps — Prembly + Busha (Terescrow)

How identity verification works end-to-end after Prembly integration.

---

## User-facing steps (what the customer does)

### Step 1 — Tier 1 (existing)
Phone / email / basic account (already in app).

### Step 2 — Tier 2 identity form (`/tier2verification`)
Customer enters **once**:

| Field | Why |
|-------|-----|
| Legal first name + surname | Matched to NIN/BVN registry |
| Date of birth | Matched / stored for Busha |
| Address | Stored + sent to Busha address object |
| Country | NG |
| **NIN** (11 digits) | Prembly NIN + face |
| **BVN** (11 digits) | Prembly BVN + face |
| Government ID image (passport or driver’s licence) | Stored; sent to Busha as `image_front` on national-id |
| **Live selfie** (camera, not gallery) | Face match against NIN and BVN photos |

### Step 3 — Automatic verification (no OTP wait when Prembly is configured)
On submit, backend:

1. Saves files under `uploads/`
2. Creates `KycStateTwo` row
3. Calls **Prembly NIN + face** with NIN + selfie  
4. Calls **Prembly BVN + face** with BVN + selfie  
5. Checks face confidence ≥ `PREMBLY_FACE_MATCH_MIN` (default **80**)  
6. Checks submitted name loosely matches Prembly official name  
7. On **pass** → Tier 2 **auto-approved**, user names updated to registry names, Prembly payload stored  
8. On **fail** → submission **rejected** with clear reason (user can retry)

### Step 4 — Busha sync (automatic when ramp is active)
Right after Prembly auto-approve (and also when user taps “Activate crypto”):

1. Create Busha customer `CUS_...` if missing (legal name, phone, DOB, address)  
2. `PUT` customer with **full KYC**:
   - first/last name (Prembly-verified)
   - birth_date (`DD-MM-YYYY`)
   - phone
   - address (split from Tier 2 address)
   - `identifying_information`: **national-id (NIN + ID image)** + **selfie**
3. `POST /verify`  
4. Wait for webhook → Busha `active`  
5. User can buy/sell/receive/send  

Customer does **not** fill a second Busha form.

---

## Backend steps (implementation map)

```
POST /api/v2/kyc/tier2/submit  (multipart)
        │
        ├─ validate + save KycStateTwo + files
        │
        ├─ Prembly nin_face  ──┐
        ├─ Prembly bvn_w_face ─┴─ face confidence + name match
        │
        ├─ FAIL → state=rejected, return 400 with reasons
        │
        └─ PASS → state=approved, kycTier2Verified=true
                    │
                    └─ startBushaKycFromTerescrowProfile (async)
                              │
                              ├─ POST /v1/customers
                              ├─ PUT  /v1/customers/{id}  (all KYC details)
                              ├─ POST /v1/customers/{id}/verify
                              └─ webhooks → active
```

---

## What is saved where

### `KycStateTwo` (your DB — source of truth)
- Form fields + selfie/ID paths  
- `premblyVerified`, `premblyReference`  
- `premblyNinConfidence`, `premblyBvnConfidence`  
- `premblyVerifiedFirstName/LastName/Dob`  
- `premblyPhone`, `premblyGender`  
- `premblyPayload` (full NIN+BVN API responses)

### `BushaCustomer` + Busha remote profile
- Legal name, phone, DOB, NIN  
- Address  
- identifying_information (NIN + ID image + selfie)  
- `providerData.terescrowKyc` snapshot (Prembly ref, BVN, doc type, etc.)

---

## Env vars

```env
# Prembly master switch (default off while testing other flows)
# Set to true when ready to enforce NIN/BVN face verification
PREMBLY_ENABLED=false

# Secret key from Prembly dashboard → Integrations (required when enabled)
PREMBLY_API_KEY=
# Optional — only if your account requires app-id (NIN/BVN face docs often need only x-api-key)
PREMBLY_APP_ID=
PREMBLY_BASE_URL=https://api.prembly.com
PREMBLY_FACE_MATCH_MIN=80
PREMBLY_AUTO_APPROVE=true
```

While `PREMBLY_ENABLED=false`, Tier 2 **auto-approves** without calling Prembly so you can test Busha buy/sell/etc.

---

## Admin override
Admins can still approve/reject via existing operations KYC tools. Prembly auto-approve is the happy path.

---

## Related code
- `src/services/prembly/*`  
- `src/controllers/customer/kyc.tier2.controller.ts`  
- `src/services/busha/busha.kyc.service.ts`  
- `src/services/kyc/terescrow.kyc.profile.service.ts`  
- App: `tier2verification.tsx` (camera selfie), `bushakyc.tsx` (activate crypto)
