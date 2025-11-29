# KYC Setup Summary

## 📋 Overview

The system has a **tiered KYC (Know Your Customer) verification system** with 3 tiers (tier1, tier2, tier3). Users submit KYC information which is then reviewed and approved/rejected by admins.

---

## 🗄️ Database Schema

### **KycStateTwo Model**
Stores user KYC submission data:

```prisma
model KycStateTwo {
  id        Int      @id @default(autoincrement())
  userId    Int
  bvn       String   // Bank Verification Number
  surName   String?
  firtName  String?  // Note: Typo in field name (should be firstName)
  dob       String?  // Date of Birth
  status    KycTier  // tier1, tier2, or tier3
  state     String   @default("pending") // "pending", "approved", "rejected"
  reason    String?  // Rejection/approval reason
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}
```

### **KycLimits Model**
Stores transaction limits for each KYC tier:

```prisma
model KycLimits {
  id                Int     @id @default(autoincrement())
  tier              KycTier // tier1, tier2, or tier3
  cryptoBuyLimit    String?
  cryptoSellLimit   String?
  giftCardBuyLimit  String?
  giftCardSellLimit String?
}
```

### **KycTier Enum**
```prisma
enum KycTier {
  tier1
  tier2
  tier3
}
```

---

## 🔌 API Endpoints

### **Customer Endpoints**

#### **1. Submit KYC Request**
```
POST /api/auth/kyc-request
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "surName": "Doe",
  "bvn": "12345678901",
  "dob": "1990-01-01"
}
```

**Response:**
```json
{
  "message": "KycTierTwoRequest found",
  "data": {
    "id": 1,
    "userId": 123,
    "bvn": "12345678901",
    "surName": "Doe",
    "firtName": "John",
    "dob": "1990-01-01",
    "status": "tier1",
    "state": "pending",
    "createdAt": "2025-01-30T10:00:00Z"
  }
}
```

**Controller:** `kycTierTwoRequest` in `src/controllers/customer/utilities.controller.ts`

**Notes:**
- Creates a new KYC submission with `status: "tier1"` and `state: "pending"`
- Requires authenticated user
- BVN is required

---

#### **2. Get KYC Details**
```
GET /api/auth/get-kyc-details
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "KYC details fetched successfully",
  "data": {
    "id": 1,
    "userId": 123,
    "bvn": "12345678901",
    "surName": "Doe",
    "firtName": "John",
    "dob": "1990-01-01",
    "status": "tier1",
    "state": "pending",
    "reason": null,
    "createdAt": "2025-01-30T10:00:00Z"
  }
}
```

**Controller:** `getKycDetails` in `src/controllers/customer/auth.controllers.ts`

**Notes:**
- Returns the first KYC record for the authenticated user
- Returns `null` if no KYC submission exists

---

### **Admin Endpoints**

#### **3. Update KYC Status**
```
POST /api/admin/operations/update-kycstatus/:userId
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "kycStatus": "approved",  // or "rejected"
  "reason": "All information verified successfully"
}
```

**Response:**
```json
{
  "message": "Kyc status updated successfully",
  "data": {
    "count": 1
  }
}
```

**Controller:** `updateKycStatus` in `src/controllers/admin/admin.operation.controller.ts`

**Notes:**
- Updates all KYC records for the user
- Sets `state` field (not `status`)
- Can set reason for approval/rejection

---

#### **4. Get KYC Users (Pending)**
```
GET /api/admin/operations/kyc-users
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "KYC users retrieved successfully",
  "data": [
    {
      "id": 123,
      "email": "user@example.com",
      "firstname": "John",
      "lastname": "Doe",
      "KycStateTwo": {
        "id": 1,
        "userId": 123,
        "bvn": "12345678901",
        "state": "pending",
        "status": "tier1"
      }
    }
  ]
}
```

**Controller:** `kycUser` in `src/controllers/admin/admin.utilities.controllers.ts`

**Notes:**
- Returns all users with pending KYC submissions
- Includes the latest KYC record for each user

---

#### **5. Create KYC Limits**
```
POST /api/admin/operations/create-kyc-limit
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "tier": "tier1",
  "cryptoBuyLimit": "1000000",
  "cryptoSellLimit": "1000000",
  "giftcardBuyLimit": "500000",
  "giftcardSellLimit": "500000"
}
```

**Response:**
```json
{
  "message": "KYC limits created successfully",
  "data": {
    "id": 1,
    "tier": "tier1",
    "cryptoBuyLimit": "1000000",
    "cryptoSellLimit": "1000000",
    "giftCardBuyLimit": "500000",
    "giftCardSellLimit": "500000"
  }
}
```

**Controller:** `createKycClimits` in `src/controllers/admin/admin.kyccontroller.ts`

---

#### **6. Get KYC Limits**
```
GET /api/admin/operations/get-kyc-limits
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "KYC limits retrieved successfully",
  "data": [
    {
      "id": 1,
      "tier": "tier1",
      "cryptoBuyLimit": "1000000",
      "cryptoSellLimit": "1000000",
      "giftCardBuyLimit": "500000",
      "giftCardSellLimit": "500000"
    },
    {
      "id": 2,
      "tier": "tier2",
      "cryptoBuyLimit": "5000000",
      "cryptoSellLimit": "5000000",
      "giftCardBuyLimit": "2000000",
      "giftCardSellLimit": "2000000"
    }
  ]
}
```

**Controller:** `getKycLimits` in `src/controllers/admin/admin.kyccontroller.ts`

---

#### **7. Update KYC Limits**
```
POST /api/admin/operations/update-kyc-limit/:kycId
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "tier": "tier1",
  "cryptoBuyLimit": "2000000",
  "cryptoSellLimit": "2000000",
  "giftcardBuyLimit": "1000000",
  "giftcardSellLimit": "1000000"
}
```

**Controller:** `updateKycLimits` in `src/controllers/admin/admin.kyccontroller.ts`

---

## 🔄 KYC Flow

### **Customer Flow:**
1. User submits KYC information via `/api/auth/kyc-request`
   - Provides: firstName, surName, BVN, DOB
   - Status set to `tier1`
   - State set to `pending`
2. User can check status via `/api/auth/get-kyc-details`
3. Admin reviews and approves/rejects via `/api/admin/operations/update-kycstatus/:userId`

### **Admin Flow:**
1. Admin views pending KYC requests via `/api/admin/operations/kyc-users`
2. Admin reviews user information
3. Admin approves or rejects via `/api/admin/operations/update-kycstatus/:userId`
   - Sets `state` to `"approved"` or `"rejected"`
   - Can provide `reason`

---

## 📊 KYC States

The `state` field in `KycStateTwo` can be:
- `"pending"` - Awaiting admin review
- `"approved"` - KYC verified and approved
- `"rejected"` - KYC rejected (with reason)

The `status` field indicates the tier:
- `"tier1"` - Basic tier
- `"tier2"` - Intermediate tier
- `"tier3"` - Advanced tier

---

## ⚠️ Current Issues / Notes

1. **Field Name Typo**: `firtName` should be `firstName` in the database schema
2. **Status vs State Confusion**: 
   - `status` field stores the tier (tier1, tier2, tier3)
   - `state` field stores the approval status (pending, approved, rejected)
3. **No Tier Progression**: Currently, all submissions default to `tier1`. No automatic tier progression logic.
4. **No Document Upload**: Currently only collects BVN, name, and DOB. No document upload functionality.
5. **No Limit Enforcement**: KYC limits are stored but not enforced in transaction flows (TODO in gift card purchase controller).

---

## 🔮 Future Enhancements

1. **Document Upload**: Add support for ID card, proof of address, etc.
2. **Tier Progression**: Automatically upgrade users based on transaction volume or manual admin action
3. **Limit Enforcement**: Check KYC limits before allowing transactions
4. **BVN Verification**: Integrate with BVN verification service
5. **Multi-tier Support**: Allow users to submit for tier2 and tier3
6. **KYC History**: Track all KYC submissions and status changes

---

## 📝 Related Files

- **Schema**: `prisma/schema.prisma` (lines 444-456, 472-479)
- **Customer Controller**: `src/controllers/customer/utilities.controller.ts` (kycTierTwoRequest)
- **Customer Controller**: `src/controllers/customer/auth.controllers.ts` (getKycDetails)
- **Admin Controller**: `src/controllers/admin/admin.operation.controller.ts` (updateKycStatus)
- **Admin Controller**: `src/controllers/admin/admin.utilities.controllers.ts` (kycUser)
- **Admin Controller**: `src/controllers/admin/admin.kyccontroller.ts` (KYC limits)
- **Routes**: `src/routes/cutomer/auth.router.ts` (customer KYC routes)
- **Routes**: `src/routes/admin/operations.router.ts` (admin KYC routes)

---

**Last Updated**: January 2025

