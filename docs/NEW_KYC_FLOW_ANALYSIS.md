# New KYC Flow Analysis - 4 Tier System

## 📊 Overview

The new KYC system has **4 tiers** (instead of current 3) with detailed deposit/withdrawal limits and document requirements.

---

## 🎯 Tier Structure

### **Tier 1 - Basic Verification (Current Level)**
**Status:** Verified (Email + Phone verified)

**Limits:**
- **Deposit:**
  - Daily: NGN 100,000
  - Monthly: NGN 500,000
- **Withdrawal:**
  - Daily: NGN 100,000
  - Monthly: NGN 500,000

**Requirements:**
- ✅ Email Verification
- ✅ Phone Verification

**No additional documents needed** (automatic after email/phone verification)

---

### **Tier 2 - Standard Verification**
**Status:** Pending/Unverified → Verified

**Limits:**
- **Deposit:**
  - Daily: NGN 500,000
  - Monthly: NGN 15,000,000
- **Withdrawal:**
  - Daily: NGN 500,000
  - Monthly: NGN 15,000,000

**Requirements:**
1. ✅ BVN Verification
2. ✅ Valid Government ID (Drivers License OR International Passport)
3. ✅ Clear Selfie Image
4. ✅ NIN Number

**Form Fields:**
- Full Name
- Country (dropdown)
- Phone
- Address
- Date of birth (mm/dd/yyyy)
- Email
- NIN Number
- BVN Number
- Document Type (Drivers License / International Passport)
- Document Number
- Upload Document (ID card image)
- Upload Selfie

**Note:** "An OTP will be sent to the number registered on your BVN"

---

### **Tier 3 - Enhanced Verification**
**Status:** Unverified → Verified

**Limits:**
- **Deposit:**
  - Daily: NGN 5,000,000
  - Monthly: NGN 150,000,000
- **Withdrawal:**
  - Daily: NGN 5,000,000
  - Monthly: NGN 150,000,000

**Requirements:**
- ✅ Proof of Address

**Acceptable Documents:**
- Utility bill (Water, Electricity, Gas bill)
- Bank Statement (Last 3 months, name and address must be shown)

**Form Fields:**
- Upload Proof of Address (document)

---

### **Tier 4 - Advanced Verification**
**Status:** Unverified → Verified

**Limits:**
- **Deposit:**
  - Daily: NGN 50,000,000
  - Monthly: NGN 500,000,000
- **Withdrawal:**
  - Daily: NGN 50,000,000
  - Monthly: NGN 500,000,000

**Requirements:**
- ✅ Proof of Funds

**Acceptable Documents:**
- Salary Slip
- Tax Documents
- Sworn Affidavit of source of funds
- Bank Statement (Last 3 months, name and address must be shown)

**Form Fields:**
- Upload Proof of Funds (document)

---

## 🔄 User Flow

### **Initial State (Tier 1)**
1. User registers → Email verification → **Tier 1 automatically achieved**
2. User sees "Update KYC Level" screen showing all 4 tiers
3. Tier 1 shows "Verified" status
4. Other tiers show "Unverified" status

### **Upgrade to Tier 2**
1. User clicks "Upgrade to tier 2" button
2. Modal shows:
   - Requirements list
   - Benefits (increased limits)
3. User clicks "Continue"
4. Form screen appears with fields:
   - Personal info (Full Name, Country, Phone, Address, DOB, Email)
   - NIN Number
   - BVN Number
   - Document Type selection
   - Document Number
   - Upload Document
   - Upload Selfie
5. User submits → Status changes to "Pending"
6. Admin reviews → Approves/Rejects
7. If approved → Status changes to "Verified"

### **Upgrade to Tier 3**
1. User must have Tier 2 verified first
2. User clicks "Upgrade to tier 3"
3. Form screen appears:
   - Upload Proof of Address
   - Instructions on acceptable documents
4. User submits → Status changes to "Pending"
5. Admin reviews → Approves/Rejects

### **Upgrade to Tier 4**
1. User must have Tier 3 verified first
2. User clicks "Upgrade to tier 4"
3. Form screen appears:
   - Upload Proof of Funds
   - Instructions on acceptable documents
4. User submits → Status changes to "Pending"
5. Admin reviews → Approves/Rejects

---

## 📋 Database Schema Changes Needed

### **1. Update KycTier Enum**
```prisma
enum KycTier {
  tier1
  tier2
  tier3
  tier4  // NEW
}
```

### **2. Update KycStateTwo Model**
```prisma
model KycStateTwo {
  id        Int      @id @default(autoincrement())
  userId    Int
  tier      KycTier  // Which tier this submission is for
  
  // Tier 2 Fields
  bvn       String?
  nin       String?  // NEW: NIN Number
  surName   String?
  firtName  String?  // Note: typo in field name
  dob       String?
  address   String?  // NEW
  country   String?  // NEW
  documentType String?  // NEW: "drivers_license" | "international_passport"
  documentNumber String?  // NEW
  idDocumentUrl String?  // NEW: Uploaded ID document
  selfieUrl     String?  // NEW: Uploaded selfie
  
  // Tier 3 Fields
  proofOfAddressUrl String?  // NEW: Uploaded proof of address
  
  // Tier 4 Fields
  proofOfFundsUrl String?  // NEW: Uploaded proof of funds
  
  status    KycTier  // Current tier level
  state     String   @default("pending") // "pending", "approved", "rejected"
  reason    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([tier])
  @@index([state])
}
```

### **3. Update KycLimits Model**
```prisma
model KycLimits {
  id                Int     @id @default(autoincrement())
  tier              KycTier
  
  // Deposit Limits
  depositDailyLimit    String?  // NEW: Daily deposit limit
  depositMonthlyLimit  String?  // NEW: Monthly deposit limit
  
  // Withdrawal Limits
  withdrawalDailyLimit   String?  // NEW: Daily withdrawal limit
  withdrawalMonthlyLimit String?  // NEW: Monthly withdrawal limit
  
  // Legacy fields (keep for backward compatibility)
  cryptoBuyLimit    String?
  cryptoSellLimit   String?
  giftCardBuyLimit  String?
  giftCardSellLimit String?
}
```

### **4. Add User Tier Tracking**
```prisma
model User {
  // ... existing fields ...
  currentKycTier    KycTier?  // NEW: Current verified tier (highest verified)
  kycTier1Verified  Boolean   @default(true)  // NEW: Auto-verified after email
  kycTier2Verified  Boolean   @default(false)
  kycTier3Verified  Boolean   @default(false)
  kycTier4Verified  Boolean   @default(false)
}
```

---

## 🔌 API Endpoints Needed

### **Customer Endpoints**

#### **1. Get KYC Status & Limits**
```
GET /api/v2/kyc/status
```
Returns current tier, all tier limits, and verification status for each tier.

#### **2. Submit Tier 2 Verification**
```
POST /api/v2/kyc/tier2/submit
```
Accepts: Personal info, NIN, BVN, document uploads, selfie.

#### **3. Submit Tier 3 Verification**
```
POST /api/v2/kyc/tier3/submit
```
Accepts: Proof of address document.

#### **4. Submit Tier 4 Verification**
```
POST /api/v2/kyc/tier4/submit
```
Accepts: Proof of funds document.

#### **5. Get Tier Submission Status**
```
GET /api/v2/kyc/tier/:tier/status
```
Returns status of specific tier submission (pending/approved/rejected).

### **Admin Endpoints**

#### **6. Get Pending KYC Submissions**
```
GET /api/admin/kyc/pending?tier=tier2
```
Filter by tier.

#### **7. Approve/Reject Tier Submission**
```
POST /api/admin/kyc/:submissionId/approve
POST /api/admin/kyc/:submissionId/reject
```

#### **8. Manage KYC Limits**
```
POST /api/admin/kyc/limits
GET /api/admin/kyc/limits
PUT /api/admin/kyc/limits/:tierId
```

---

## 📝 Implementation Checklist

### **Phase 1: Database Schema**
- [ ] Add `tier4` to `KycTier` enum
- [ ] Update `KycStateTwo` model with new fields
- [ ] Update `KycLimits` model with daily/monthly limits
- [ ] Add tier tracking fields to `User` model
- [ ] Create migration

### **Phase 2: Tier 1 Auto-Verification**
- [ ] Auto-set `kycTier1Verified = true` on email verification
- [ ] Set `currentKycTier = tier1` on email verification

### **Phase 3: Tier 2 Implementation**
- [ ] Create Tier 2 submission endpoint
- [ ] Add file upload for ID document and selfie
- [ ] Add BVN verification (if needed)
- [ ] Add NIN field
- [ ] Update admin approval flow

### **Phase 4: Tier 3 Implementation**
- [ ] Create Tier 3 submission endpoint
- [ ] Add file upload for proof of address
- [ ] Update admin approval flow

### **Phase 5: Tier 4 Implementation**
- [ ] Create Tier 4 submission endpoint
- [ ] Add file upload for proof of funds
- [ ] Update admin approval flow

### **Phase 6: Limits & Enforcement**
- [ ] Update `KycLimits` with daily/monthly limits
- [ ] Create limit checking middleware
- [ ] Enforce limits in deposit/withdrawal flows
- [ ] Track daily/monthly usage per user

### **Phase 7: Status & UI Support**
- [ ] Create KYC status endpoint (shows all tiers)
- [ ] Return tier limits in response
- [ ] Return verification status per tier

---

## 🚨 Important Notes

1. **Tier Progression:** Users must verify lower tiers before higher tiers
2. **Document Storage:** Need file upload/storage solution (S3, Cloudinary, etc.)
3. **BVN Verification:** May need to integrate with BVN verification service
4. **Limit Tracking:** Need to track daily/monthly usage per user per tier
5. **Status Display:** UI shows "Verified", "Pending", or "Unverified" per tier
6. **Current Tier:** User's `currentKycTier` is the highest verified tier

---

## 📊 Limit Summary Table

| Tier | Deposit Daily | Deposit Monthly | Withdrawal Daily | Withdrawal Monthly |
|------|---------------|-----------------|------------------|-------------------|
| Tier 1 | NGN 100,000 | NGN 500,000 | NGN 100,000 | NGN 500,000 |
| Tier 2 | NGN 500,000 | NGN 15,000,000 | NGN 500,000 | NGN 15,000,000 |
| Tier 3 | NGN 5,000,000 | NGN 150,000,000 | NGN 5,000,000 | NGN 150,000,000 |
| Tier 4 | NGN 50,000,000 | NGN 500,000,000 | NGN 50,000,000 | NGN 500,000,000 |

---

**Last Updated**: January 2025

