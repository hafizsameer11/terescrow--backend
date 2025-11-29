# Changes to Existing Routes/Controllers

This document lists all changes made to existing (old) routes and controllers during the 4-tier KYC system implementation.

---

## 📝 Modified Files

### **1. `src/controllers/customer/auth.controllers.ts`**

#### **Function: `verifyUserController`**
**Location:** Line ~266-280

**Changes:**
- ✅ Added automatic Tier 1 verification when user verifies email
- ✅ Sets `kycTier1Verified = true` and `currentKycTier = 'tier1'` on email verification
- ✅ Creates default wallet after email verification (existing functionality)

**Code Added:**
```typescript
// Auto-set Tier 1 verification
await prisma.user.update({
  where: { id: updateUser.id },
  data: {
    kycTier1Verified: true,
    currentKycTier: 'tier1',
  },
});
```

**Impact:** 
- Low risk - only adds new functionality
- Backward compatible - existing flow still works
- All users who verify email will automatically get Tier 1

---

### **2. `src/controllers/customer/utilities.controller.ts`**

#### **Function: `kycTierTwoRequest`**
**Location:** Line ~10-44

**Changes:**
- ✅ Added required `tier` field to KYC submission
- ✅ Changed `tier: 'tier2'` (was missing, causing TypeScript error)
- ✅ Made `bvn` nullable (changed from required to `bvn || ''`)

**Code Changed:**
```typescript
// BEFORE:
data: {
  firtName: firstName,
  bvn: bvn,
  surName: surName,
  dob: dob || '',
  userId: userId,
  status: 'tier1'
}

// AFTER:
data: {
  firtName: firstName,
  bvn: bvn || '',
  surName: surName,
  dob: dob || '',
  userId: userId,
  tier: 'tier2',  // ✅ ADDED - Required field
  status: 'tier2' // ✅ CHANGED - Now tier2 instead of tier1
}
```

**Impact:**
- **Breaking Change** - `tier` field is now required
- Backward compatible - defaults to tier2 for legacy submissions
- Existing API endpoint `/api/auth/kyc-request` still works but now creates tier2 submissions

**Note:** This is the legacy KYC endpoint. New code should use `/api/v2/kyc/tier2/submit`

---

### **3. `src/controllers/admin/admin.operation.controller.ts`**

#### **Function: `updateKycStatus`**
**Location:** Line ~857-886

**Changes:**
- ✅ Enhanced to support updating by `submissionId` (new)
- ✅ Enhanced to support updating by `userId + tier` (new)
- ✅ Automatically updates user tier verification flags when approved
- ✅ Only upgrades tier if new tier is higher than current
- ✅ Maintains backward compatibility with old `userId` only approach

**Code Changes:**
```typescript
// BEFORE:
// Only supported: POST /api/admin/operations/update-kycstatus/:userId
// Updated ALL pending submissions for user

// AFTER:
// Supports multiple formats:
// 1. POST /api/admin/operations/update-kycstatus/:submissionId (new)
// 2. POST /api/admin/operations/update-kycstatus/:userId with { tier: "tier2" } (new)
// 3. POST /api/admin/operations/update-kycstatus/:userId (old - still works)

// NEW: Automatically updates user tier flags
if (kycStatus === 'approved' && submission.tier) {
  // Updates kycTier1Verified, kycTier2Verified, etc.
  // Updates currentKycTier if new tier is higher
}
```

**Request Body (Enhanced):**
```json
{
  "kycStatus": "approved",  // or "rejected"
  "tier": "tier2",          // NEW: Optional, for tier-specific updates
  "reason": "All documents verified"
}
```

**Impact:**
- **Backward Compatible** - Old format still works
- **Enhanced Functionality** - Can now update specific submissions
- **Automatic Tier Upgrade** - User tier flags updated automatically

---

## 🔄 API Endpoint Changes

### **Existing Endpoints (Still Work)**

1. **`POST /api/auth/kyc-request`** ✅ Still works
   - Now creates tier2 submissions (was tier1)
   - Requires `tier` field internally (handled automatically)

2. **`POST /api/admin/operations/update-kycstatus/:userId`** ✅ Still works
   - Enhanced with new features
   - Backward compatible

### **New Endpoints (V2)**

All new endpoints are under `/api/v2/kyc/*`:
- `GET /api/v2/kyc/status`
- `POST /api/v2/kyc/tier2/submit`
- `GET /api/v2/kyc/tier2/status`
- `POST /api/v2/kyc/tier3/submit`
- `GET /api/v2/kyc/tier3/status`
- `POST /api/v2/kyc/tier4/submit`
- `GET /api/v2/kyc/tier4/status`

---

## 📊 Database Schema Changes

### **User Model**
- ✅ Added `currentKycTier` (nullable enum)
- ✅ Added `kycTier1Verified` (boolean, default false)
- ✅ Added `kycTier2Verified` (boolean, default false)
- ✅ Added `kycTier3Verified` (boolean, default false)
- ✅ Added `kycTier4Verified` (boolean, default false)

### **KycStateTwo Model**
- ✅ Added `tier` field (required enum) - **BREAKING CHANGE**
- ✅ Added `updatedAt` field (required datetime)
- ✅ Added Tier 2 fields: `nin`, `address`, `country`, `documentType`, `documentNumber`, `idDocumentUrl`, `selfieUrl`
- ✅ Added Tier 3 field: `proofOfAddressUrl`
- ✅ Added Tier 4 field: `proofOfFundsUrl`
- ✅ Made `bvn` nullable (was required)

### **KycLimits Model**
- ✅ Added `depositDailyLimit`
- ✅ Added `depositMonthlyLimit`
- ✅ Added `withdrawalDailyLimit`
- ✅ Added `withdrawalMonthlyLimit`
- ✅ Added unique constraint on `tier`

### **KycTier Enum**
- ✅ Added `tier4`

---

## ⚠️ Breaking Changes

1. **`KycStateTwo.tier` field is now required**
   - All KYC submissions must specify a tier
   - Old code creating KycStateTwo without `tier` will fail
   - **Fixed in:** `utilities.controller.ts` - `kycTierTwoRequest`

2. **`KycStateTwo.bvn` is now nullable**
   - Was required, now optional
   - Only required for Tier 2 submissions

---

## ✅ Backward Compatibility

- ✅ Old KYC endpoint `/api/auth/kyc-request` still works
- ✅ Old admin approval endpoint still works
- ✅ Existing KYC submissions in database are preserved
- ✅ Legacy `status` field still maintained for backward compatibility

---

## 🔍 Migration Notes

After running the migration:
1. Existing `KycStateTwo` records will have `tier` set to `'tier1'` (default)
2. Existing users will have all tier flags set to `false` (except those who verify email after migration)
3. You may want to update existing verified users to have `kycTier1Verified = true`

---

**Last Updated**: January 2025  
**Status**: ✅ Changes Documented

