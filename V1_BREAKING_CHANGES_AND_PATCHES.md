# V1 Breaking Changes & Safe Patches

> **Implementation status (May 2026):** Patches **1–11** are applied in this repo via `src/config/v1.compat.config.ts`.  
> On the server, add the `.env` block below **before** restarting — defaults match v1 production behavior.

This document lists **only** v2 code changes that can break the **current v1 production flow** (JSON shape changes, permissions, login rules).  

It does **not** cover DB-migration-only issues (missing tables/columns) — those are fixed by migrating `prisma_db`.

Each section includes:
- **Route** affected
- **v1 code** (production behavior)
- **v2 code** (current behavior)
- **Safe patch** — keeps v1 behavior by default; v2 behavior when you opt in via env flag or query param

---

## Recommended `.env` flags (add to v2 before deploy)

```env
# --- V1 compatibility (default: preserve production behavior) ---
BLOCK_UNVERIFIED_LOGIN=false
ENABLE_BANNED_CUSTOMER_CHECKS=false
ENABLE_READ_ONLY_REVIEW_AGENT=true
USE_V1_ADMIN_CUSTOMER_LIST=true
USE_V1_ACCOUNT_ACTIVITY_RESPONSE=true
USE_V1_KYC_UPDATE_LOGIC=true
USE_V1_LEGACY_KYC_TIER=true
AUTO_CHAT_PROCESSING_STATUS=false
USE_V1_ADMIN_CUSTOMER_DETAIL=false
```

Optional helper file (create once):

```typescript
// src/config/v1.compat.config.ts
export const v1Compat = {
  blockUnverifiedLogin: process.env.BLOCK_UNVERIFIED_LOGIN === 'true',
  enableBannedCustomerChecks: process.env.ENABLE_BANNED_CUSTOMER_CHECKS === 'true',
  enableReadOnlyReviewAgent: process.env.ENABLE_READ_ONLY_REVIEW_AGENT !== 'false',
  useV1AdminCustomerList: process.env.USE_V1_ADMIN_CUSTOMER_LIST !== 'false',
  useV1AccountActivityResponse: process.env.USE_V1_ACCOUNT_ACTIVITY_RESPONSE !== 'false',
  useV1KycUpdateLogic: process.env.USE_V1_KYC_UPDATE_LOGIC !== 'false',
  useV1LegacyKycTier: process.env.USE_V1_LEGACY_KYC_TIER !== 'false',
  autoChatProcessingStatus: process.env.AUTO_CHAT_PROCESSING_STATUS === 'true',
  useV1AdminCustomerDetail: process.env.USE_V1_ADMIN_CUSTOMER_DETAIL === 'true',
};
```

---

## 1. Customer login — unverified & banned checks

**Route:** `POST /api/public/login`  
**File:** `src/controllers/public.controllers.ts`

### v1 (production)

```typescript
if (!isUser) {
  return next(ApiError.badRequest('This email is not registerd'));
}
// if(isUser.isVerified===false){
//   return next(ApiError.badRequest('Your account is not verified. Please chceck your email'))
// }
const isMatch = await comparePassword(password, isUser.password);
```

### v2 (current)

```typescript
if (!isUser) {
  return next(ApiError.badRequest('This email is not registerd'));
}

// Check if user has verified their OTP/email
if (isUser.isVerified === false) {
  return next(ApiError.badRequest('Your account is not verified. Please verify your email with the OTP sent to your email address'));
}

if (isUser.role === UserRoles.customer && isUserBanned(isUser.status)) {
  return next(ApiError.forbidden(BANNED_CUSTOMER_MESSAGE));
}

const isMatch = await comparePassword(password, isUser.password);
```

### Safe patch (both modes)

```typescript
import { v1Compat } from '../config/v1.compat.config';
import { BANNED_CUSTOMER_MESSAGE, isUserBanned } from '../utils/customer.restrictions';

if (!isUser) {
  return next(ApiError.badRequest('This email is not registerd'));
}

if (v1Compat.blockUnverifiedLogin && isUser.isVerified === false) {
  return next(ApiError.badRequest('Your account is not verified. Please verify your email with the OTP sent to your email address'));
}

if (v1Compat.enableBannedCustomerChecks && isUser.role === UserRoles.customer && isUserBanned(isUser.status)) {
  return next(ApiError.forbidden(BANNED_CUSTOMER_MESSAGE));
}

const isMatch = await comparePassword(password, isUser.password);
```

**Success JSON is unchanged** on both versions when login succeeds.

---

## 2. Agent login — unverified block + readOnlyMode field

**Route:** `POST /api/agent/auth/login`  
**File:** `src/controllers/agent/agent.auth.controllers.ts`

### v1 (production)

```typescript
if (!isUser) {
  return next(ApiError.badRequest('This email is not registerd'));
}
const isMatch = await comparePassword(password, isUser.password);
// ...
const resData = {
  id: isUser.id,
  // ...
  role: isUser.role,
  phoneNumber: isUser.phoneNumber,
  // no readOnlyMode
};
```

### v2 (current)

```typescript
if (!isUser) {
  return next(ApiError.badRequest('This email is not registerd'));
}

if (isUser.isVerified === false) {
  return next(ApiError.badRequest('Your account is not verified. Please verify your email with the OTP sent to your email address'));
}

const isMatch = await comparePassword(password, isUser.password);
// ...
const resData = {
  id: isUser.id,
  // ...
  role: isUser.role,
  readOnlyMode: isAppleReviewUser(isUser),
  phoneNumber: isUser.phoneNumber,
};
```

### Safe patch

```typescript
import { v1Compat } from '../../config/v1.compat.config';
import { isAppleReviewUser } from '../../utils/apple.review.user';

if (!isUser) {
  return next(ApiError.badRequest('This email is not registerd'));
}

if (v1Compat.blockUnverifiedLogin && isUser.isVerified === false) {
  return next(ApiError.badRequest('Your account is not verified. Please verify your email with the OTP sent to your email address'));
}

const isMatch = await comparePassword(password, isUser.password);

const resData = {
  id: isUser.id,
  firstname: isUser.firstname,
  lastname: isUser.lastname,
  username: isUser.username,
  profilePicture: isUser.profilePicture,
  email: isUser.email,
  role: isUser.role,
  ...(v1Compat.enableReadOnlyReviewAgent
    ? { readOnlyMode: isAppleReviewUser(isUser) }
    : {}),
  phoneNumber: isUser.phoneNumber,
  country: isUser.country,
  gender: isUser.gender,
  isVerified: isUser.isVerified,
  KycStateTwo: isUser.KycStateTwo,
  assignedDepartments: isUser.agent?.assignedDepartments,
  unReadNotification: getNotificationCount.length,
  customRole: isUser.customRole,
  accountActivity: isUser.AccountActivity,
};
```

---

## 3. Banned customer global middleware (NEW)

**Routes:** `/api/auth/*`, `/api/customer/*`, `/api/public/*` (when JWT present)  
**Files:** `src/index.ts`, `src/middlewares/reject.banned.customer.ts`

### v1 (production)

No middleware. Banned users could still call APIs with a valid token.

### v2 (current) — `src/index.ts`

```typescript
import rejectBannedCustomer from './middlewares/reject.banned.customer';

app.use('/api/v2', rejectBannedCustomer);
app.use('/api/customer', rejectBannedCustomer);
app.use('/api/auth', rejectBannedCustomer);
app.use('/api/public', rejectBannedCustomer);
```

### Safe patch — `src/index.ts`

```typescript
import rejectBannedCustomer from './middlewares/reject.banned.customer';
import { v1Compat } from './config/v1.compat.config';

if (v1Compat.enableBannedCustomerChecks) {
  app.use('/api/v2', rejectBannedCustomer);
  app.use('/api/customer', rejectBannedCustomer);
  app.use('/api/auth', rejectBannedCustomer);
  app.use('/api/public', rejectBannedCustomer);
}
```

Or wrap inside middleware:

```typescript
// src/middlewares/reject.banned.customer.ts — add at top of function:
import { v1Compat } from '../config/v1.compat.config';

export async function rejectBannedCustomer(req, _res, next) {
  if (!v1Compat.enableBannedCustomerChecks) {
    return next();
  }
  // ... existing logic
}
```

---

## 4. Auth middleware — ban + read-only agent

**Route:** All routes using `authenticateUser`  
**File:** `src/middlewares/authenticate.user.ts`

### v1 (production)

```typescript
if (!isUser) {
  throw ApiError.unauthorized('You are not logged in');
}

req.body._user = isUser;
next();
```

### v2 (current)

```typescript
if (!isUser) {
  throw ApiError.unauthorized('You are not logged in');
}

if (isUser.role === UserRoles.customer && isUserBanned(isUser.status)) {
  throw ApiError.forbidden(BANNED_CUSTOMER_MESSAGE);
}

if (isAppleReviewUser(isUser) && !isReadOnlyHttpMethod(req.method)) {
  throw ApiError.forbidden('You do not have permission to perform this action.');
}

const userWithFlags = {
  ...isUser,
  readOnlyMode: isAppleReviewUser(isUser),
};

(req as any).user = userWithFlags;
req.body._user = userWithFlags;
next();
```

### Safe patch

```typescript
import { v1Compat } from '../config/v1.compat.config';
import { BANNED_CUSTOMER_MESSAGE, isUserBanned } from '../utils/customer.restrictions';
import { isAppleReviewUser, isReadOnlyHttpMethod } from '../utils/apple.review.user';

if (!isUser) {
  throw ApiError.unauthorized('You are not logged in');
}

if (v1Compat.enableBannedCustomerChecks && isUser.role === UserRoles.customer && isUserBanned(isUser.status)) {
  throw ApiError.forbidden(BANNED_CUSTOMER_MESSAGE);
}

if (
  v1Compat.enableReadOnlyReviewAgent &&
  isAppleReviewUser(isUser) &&
  !isReadOnlyHttpMethod(req.method)
) {
  throw ApiError.forbidden('You do not have permission to perform this action.');
}

const userPayload = v1Compat.enableReadOnlyReviewAgent
  ? { ...isUser, readOnlyMode: isAppleReviewUser(isUser) }
  : isUser;

(req as any).user = userPayload;
req.body._user = userPayload;
next();
```

---

## 5. WebSocket — banned customer disconnect

**File:** `src/socketConfig.ts`

### v1 (production)

No ban check on socket connect.

### v2 (current)

```typescript
if (role === UserRoles.customer) {
  const customer = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (isUserBanned(customer?.status)) {
    return socket.disconnect();
  }
}
```

### Safe patch

```typescript
import { v1Compat } from './config/v1.compat.config';

if (v1Compat.enableBannedCustomerChecks && role === UserRoles.customer) {
  const customer = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (isUserBanned(customer?.status)) {
    return socket.disconnect();
  }
}
```

---

## 6. Admin customer list — JSON shape (CRITICAL for admin panel)

**Route:** `GET /api/admin/operations/get-all-customers`  
**File:** `src/controllers/admin/admin.operation.controller.ts`

### v1 response

```typescript
const customers = await prisma.user.findMany({
  where: { role: UserRoles.customer },
  include: { inappNotification: { orderBy: { createdAt: 'desc' }, take: 6 }, KycStateTwo: { orderBy: { createdAt: 'desc' }, take: 1 } },
  orderBy: { createdAt: 'desc' },
});

if (!customers || customers.length === 0) {
  return next(ApiError.notFound('Customers not found'));
}

const modifiedCustomers = customers.map(customer => ({
  ...customer,
  KycStateTwo: customer.KycStateTwo.length > 0 ? customer.KycStateTwo[0] : null,
}));

return new ApiResponse(200, modifiedCustomers, 'Customers fetched successfully').send(res);
```

**JSON shape:**
```json
{ "status": 200, "data": [ /* customer[] */ ], "message": "..." }
```

### v2 response

```typescript
// Paginated — default limit 20
return new ApiResponse(200, {
  data: modifiedCustomers,
  total,
  page,
  limit,
  totalPages,
}, 'Customers fetched successfully').send(res);
```

**JSON shape:**
```json
{ "status": 200, "data": { "data": [], "total": 0, "page": 1, "limit": 20, "totalPages": 1 }, "message": "..." }
```

### Safe patch (supports both admin UIs)

```typescript
import { v1Compat } from '../../config/v1.compat.config';

export const getAllCustomers = async (req, res, next) => {
  try {
    const user = req.body._user;
    if (!user || user.role == UserRoles.customer) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    const useV1Shape =
      v1Compat.useV1AdminCustomerList ||
      req.query.legacy === 'true' ||
      req.query.v1 === 'true';

    if (useV1Shape) {
      const customers = await prisma.user.findMany({
        where: { role: UserRoles.customer },
        include: {
          inappNotification: { orderBy: { createdAt: 'desc' }, take: 6 },
          KycStateTwo: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!customers || customers.length === 0) {
        return next(ApiError.notFound('Customers not found'));
      }

      const modifiedCustomers = customers.map((customer) => ({
        ...customer,
        KycStateTwo: customer.KycStateTwo.length > 0 ? customer.KycStateTwo[0] : null,
      }));

      return new ApiResponse(200, modifiedCustomers, 'Customers fetched successfully').send(res);
    }

    // ... existing v2 paginated logic ...
  } catch (error) {
    // ...
  }
};
```

**Tip:** New admin UI can call `?legacy=false` or set `USE_V1_ADMIN_CUSTOMER_LIST=false`.

---

## 7. Admin account activity — JSON shape (CRITICAL)

**Route:** `GET /api/admin/operations/get-account-activity/:id`  
**File:** `src/controllers/admin/admin.utilities.controllers.ts`

### v1 (production)

```typescript
export const getAccountActivityofUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const accitivities = await prisma.accountActivity.findMany({
      where: { userId: parseInt(id, 10) },
    });
    return new ApiResponse(200, accitivities, 'AccountActivites retrieved successfully').send(res);
  } catch (error) {
    // ...
  }
};
```

**JSON:** `data` = array of all activities

### v2 (current)

```typescript
const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '5'), 10) || 5));
// ...
return new ApiResponse(200, {
  data: accitivities,
  total,
  page,
  limit,
  totalPages,
}, 'AccountActivites retrieved successfully').send(res);
```

**JSON:** `data` = `{ data: [], total, page, limit, totalPages }` — default **5 items only**

### Safe patch

```typescript
import { v1Compat } from '../../config/v1.compat.config';

export const getAccountActivityofUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    const useV1Shape =
      v1Compat.useV1AccountActivityResponse ||
      req.query.legacy === 'true';

    if (useV1Shape) {
      const accitivities = await prisma.accountActivity.findMany({
        where: { userId },
      });
      return new ApiResponse(200, accitivities, 'AccountActivites retrieved successfully').send(res);
    }

    // ... existing v2 paginated logic ...
  } catch (error) {
    // ...
  }
};
```

---

## 8. Admin customer detail — extra JSON fields

**Route:** `GET /api/admin/operations/get-customer-details/:id`  
**File:** `src/controllers/admin/admin.operation.controller.ts`

### v1 (production)

```typescript
const customer = await prisma.user.findUnique({
  where: { id: parseInt(userId) },
  include: {
    KycStateTwo: { take: 1, orderBy: { createdAt: 'desc' } },
    AccountActivity: { take: 6, orderBy: { createdAt: 'desc' } },
  },
});

const kycStateTwo = customer.KycStateTwo.length > 0 ? customer.KycStateTwo[0] : null;

return new ApiResponse(200, {
  ...customer,
  KycStateTwo: kycStateTwo,
}, 'Customer details fetched successfully').send(res);
```

### v2 (current) — adds fields

```typescript
return new ApiResponse(200, {
  ...customer,
  KycStateTwo: kycStateTwo,
  fiatWallets: undefined,
  virtualAccounts: undefined,
  featureFreezes: undefined,
  ipAddress: null,
  tier,
  nairaBalance,
  cryptoBalance,
  referralCode: customer.referralCode ?? null,
  cryptoAssets,
  frozenFeatures: customer.featureFreezes.map((f) => f.feature),
}, 'Customer details fetched successfully').send(res);
```

### Safe patch

```typescript
import { v1Compat } from '../../config/v1.compat.config';

const kycStateTwo = customer.KycStateTwo.length > 0 ? customer.KycStateTwo[0] : null;

if (v1Compat.useV1AdminCustomerDetail || req.query.legacy === 'true') {
  return new ApiResponse(200, {
    ...customer,
    KycStateTwo: kycStateTwo,
  }, 'Customer details fetched successfully').send(res);
}

// v2 enriched response (requires fiatWallets / virtualAccounts tables after migration)
// ... existing v2 logic ...
```

Default `USE_V1_ADMIN_CUSTOMER_DETAIL=false` keeps v1 shape until you flip the flag after admin UI is updated.

---

## 9. Admin KYC status update — logic change (CRITICAL)

**Route:** `POST /api/admin/operations/update-kycstatus/:userId`  
**File:** `src/controllers/admin/admin.operation.controller.ts`

### v1 (production)

```typescript
export const updateKycStatus = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const { kycStatus } = req.body;
    const { reason } = req.body;
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) {
      return next(ApiError.notFound('User not found'));
    }
    const updateKycStates = await prisma.kycStateTwo.updateMany({
      where: { userId: parseInt(userId) },
      data: {
        state: kycStatus,
        reason: reason || "Your Information has been verified successfully",
      },
    });
    if (!updateKycStates) {
      return next(ApiError.badRequest('Failed to update kyc status'));
    }
    return new ApiResponse(200, updateKycStates, 'Kyc status updated successfully').send(res);
  } catch (error) {
    // ...
  }
};
```

**Behavior:** Updates **all** `KycStateTwo` rows for user (any state).  
**Response:** `{ count: N }` from `updateMany`.

### v2 (current) — problems for v1 admin

1. First tries `KycStateTwo.id = :userId` (wrong — treats user id as submission id)
2. Fallback only updates `state: 'pending'` rows (not all)
3. Can return single submission object instead of `{ count }`
4. Requires `kycStatus` in body or 400

### Safe patch — keep v1 logic, add v2 as opt-in

```typescript
import { v1Compat } from '../../config/v1.compat.config';

export const updateKycStatus = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const { kycStatus, tier, reason } = req.body;

    if (v1Compat.useV1KycUpdateLogic || req.query.legacy === 'true') {
      const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
      if (!user) {
        return next(ApiError.notFound('User not found'));
      }
      const updateKycStates = await prisma.kycStateTwo.updateMany({
        where: { userId: parseInt(userId) },
        data: {
          state: kycStatus,
          reason: reason || 'Your Information has been verified successfully',
        },
      });
      return new ApiResponse(200, updateKycStates, 'Kyc status updated successfully').send(res);
    }

    // ... existing full v2 logic (tier flags, submission by id, etc.) ...
  } catch (error) {
    // ...
  }
};
```

---

## 10. Legacy KYC submit — tier stored in DB

**Route:** `POST /api/auth/kyc-request`  
**File:** `src/controllers/customer/utilities.controller.ts`

### v1 (production)

```typescript
const kycTierTwoRequest = await prisma.kycStateTwo.create({
  data: {
    firtName: firstName,
    bvn: bvn,
    surName: surName,
    dob: dob || '',
    userId: userId,
    status: 'tier1',
  },
});
```

### v2 (current)

```typescript
const kycTierTwoRequest = await prisma.kycStateTwo.create({
  data: {
    firtName: firstName,
    bvn: bvn || '',
    surName: surName,
    dob: dob || '',
    userId: userId,
    tier: 'tier2',
    status: 'tier2',
  },
});
```

### Safe patch

```typescript
import { v1Compat } from '../../config/v1.compat.config';

const kycData: any = {
  firtName: firstName,
  bvn: bvn || '',
  surName: surName,
  dob: dob || '',
  userId: userId,
};

if (v1Compat.useV1LegacyKycTier) {
  kycData.status = 'tier1';
  // omit tier — or set tier: 'tier1' after DB migration adds column
} else {
  kycData.tier = 'tier2';
  kycData.status = 'tier2';
}

const kycTierTwoRequest = await prisma.kycStateTwo.create({ data: kycData });
```

After DB migration, v1 mode can set `tier: 'tier1'` explicitly when column exists.

---

## 11. Agent chat — auto `pending` → `processing`

**Route:** Agent send-message flow  
**File:** `src/controllers/agent/agent.chat.controllers.ts`

### v1 (production)

```typescript
if (chat) {
  const updatedChat = await prisma.chat.update({
    where: { id: chat.id },
    data: {
      updatedAt: new Date(),
    },
  });
}
```

### v2 (current)

```typescript
if (chat) {
  await prisma.chat.update({
    where: { id: chat.id },
    data: {
      updatedAt: new Date(),
      ...(chat.chatDetails?.status === ChatStatus.pending
        ? {
            chatDetails: {
              update: { status: ChatStatus.processing },
            },
          }
        : {}),
    },
  });
}
```

### Safe patch

```typescript
import { v1Compat } from '../../config/v1.compat.config';

if (chat) {
  await prisma.chat.update({
    where: { id: chat.id },
    data: {
      updatedAt: new Date(),
      ...(v1Compat.autoChatProcessingStatus &&
      chat.chatDetails?.status === ChatStatus.pending
        ? {
            chatDetails: {
              update: { status: ChatStatus.processing },
            },
          }
        : {}),
    },
  });
}
```

---

## Quick reference — what breaks what

| Change | Who breaks | Patch flag |
|--------|------------|------------|
| Unverified login block | Mobile customers | `BLOCK_UNVERIFIED_LOGIN=false` |
| Banned login + middleware + socket | Banned customers | `ENABLE_BANNED_CUSTOMER_CHECKS=false` |
| Admin customer list pagination | Admin panel | `USE_V1_ADMIN_CUSTOMER_LIST=true` |
| Account activity pagination | Admin panel | `USE_V1_ACCOUNT_ACTIVITY_RESPONSE=true` |
| KYC update logic | Admin KYC approve | `USE_V1_KYC_UPDATE_LOGIC=true` |
| Legacy KYC tier1→tier2 | Mobile KYC | `USE_V1_LEGACY_KYC_TIER=true` |
| Chat processing status | Agent/admin chat UI | `AUTO_CHAT_PROCESSING_STATUS=false` |
| Customer detail extra fields | Admin (strict parsers) | `USE_V1_ADMIN_CUSTOMER_DETAIL=true` |

---

## Files unchanged (v1 routes safe)

No JSON or permission changes in these — keep as-is:

- `src/controllers/customer/chat.controllers.ts`
- `src/controllers/agent/agent.operations.controllers.ts`
- `src/routes/cutomer/chat.router.ts` (swagger comments only in v2)
- `GET /api/public/departments`, `/categories`, `/subcategories`, `/countries`
- `POST /api/customer/send-message`, `GET /api/customer/get-chat/:id`, etc.

---

## Suggested work order in offline repo

1. Add `src/config/v1.compat.config.ts` + `.env` flags  
2. Apply patches **1–5** (login + permissions) — highest user impact  
3. Apply patches **6–7** (admin JSON) — highest admin panel impact  
4. Apply patch **9** (KYC admin)  
5. Apply patches **10–11** (mobile KYC + agent chat)  
6. Run DB migration on staging  
7. Flip flags one-by-one as admin/mobile apps are updated  

---

*Generated from diff of `/var/www/terescrow-v1` vs `/var/www/tercescrow-v2` — production v1 flow compatibility.*
