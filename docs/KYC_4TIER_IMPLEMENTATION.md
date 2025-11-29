# 4-Tier KYC System Implementation

## ✅ Implementation Complete

The new 4-tier KYC system has been successfully implemented with all required features.

---

## 📊 Database Schema Updates

### **1. KycTier Enum**
- Added `tier4` to the enum
- Now supports: `tier1`, `tier2`, `tier3`, `tier4`

### **2. User Model**
Added tier tracking fields:
- `currentKycTier` - Current verified tier (highest verified)
- `kycTier1Verified` - Boolean flag for Tier 1
- `kycTier2Verified` - Boolean flag for Tier 2
- `kycTier3Verified` - Boolean flag for Tier 3
- `kycTier4Verified` - Boolean flag for Tier 4

### **3. KycStateTwo Model**
Enhanced with new fields:
- `tier` - Which tier this submission is for
- **Tier 2 fields:**
  - `nin` - NIN Number
  - `address` - User address
  - `country` - User country
  - `documentType` - "drivers_license" | "international_passport"
  - `documentNumber` - Document number
  - `idDocumentUrl` - Uploaded ID document URL
  - `selfieUrl` - Uploaded selfie URL
- **Tier 3 fields:**
  - `proofOfAddressUrl` - Uploaded proof of address
- **Tier 4 fields:**
  - `proofOfFundsUrl` - Uploaded proof of funds
- Added indexes for better query performance

### **4. KycLimits Model**
Added daily/monthly limits:
- `depositDailyLimit` - Daily deposit limit
- `depositMonthlyLimit` - Monthly deposit limit
- `withdrawalDailyLimit` - Daily withdrawal limit
- `withdrawalMonthlyLimit` - Monthly withdrawal limit
- Added unique constraint on `tier`

---

## 🔌 API Endpoints

### **Customer Endpoints**

#### **1. Get KYC Status**
```
GET /api/v2/kyc/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "currentTier": "tier1",
  "tiers": [
    {
      "tier": "tier1",
      "status": "verified",
      "limits": {
        "deposit": { "daily": "100000", "monthly": "500000" },
        "withdrawal": { "daily": "100000", "monthly": "500000" }
      },
      "canUpgrade": true
    },
    {
      "tier": "tier2",
      "status": "unverified",
      "limits": { ... },
      "canUpgrade": true
    }
  ]
}
```

#### **2. Submit Tier 2**
```
POST /api/v2/kyc/tier2/submit
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `firstName` (required)
- `surName` (required)
- `dob` (required)
- `address` (required)
- `country` (required)
- `nin` (required)
- `bvn` (required)
- `documentType` (required: "drivers_license" | "international_passport")
- `documentNumber` (required)
- `idDocument` (file, required)
- `selfie` (file, required)

#### **3. Get Tier 2 Status**
```
GET /api/v2/kyc/tier2/status
Authorization: Bearer <token>
```

#### **4. Submit Tier 3**
```
POST /api/v2/kyc/tier3/submit
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `proofOfAddress` (file, required)

#### **5. Get Tier 3 Status**
```
GET /api/v2/kyc/tier3/status
Authorization: Bearer <token>
```

#### **6. Submit Tier 4**
```
POST /api/v2/kyc/tier4/submit
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `proofOfFunds` (file, required)

#### **7. Get Tier 4 Status**
```
GET /api/v2/kyc/tier4/status
Authorization: Bearer <token>
```

### **Admin Endpoints**

#### **8. Update KYC Status (Enhanced)**
```
POST /api/admin/operations/update-kycstatus/:userId
POST /api/admin/operations/update-kycstatus/:submissionId
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "kycStatus": "approved", // or "rejected"
  "tier": "tier2", // optional, if updating by tier
  "reason": "All documents verified successfully"
}
```

**Features:**
- Can update by submissionId (new)
- Can update by userId + tier (new)
- Automatically updates user tier flags when approved
- Only upgrades tier if new tier is higher than current

---

## 🔄 Auto-Verification Flow

### **Tier 1 Auto-Verification**
When a user verifies their email:
1. `kycTier1Verified` is set to `true`
2. `currentKycTier` is set to `tier1`
3. Default wallet is created

**Location:** `src/controllers/customer/auth.controllers.ts` - `verifyUserController`

---

## 📁 Files Created

### **Services**
- `src/services/kyc/kyc.status.service.ts` - KYC status and tier management

### **Controllers**
- `src/controllers/customer/kyc.status.controller.ts` - Get KYC status
- `src/controllers/customer/kyc.tier2.controller.ts` - Tier 2 submission
- `src/controllers/customer/kyc.tier3.controller.ts` - Tier 3 submission
- `src/controllers/customer/kyc.tier4.controller.ts` - Tier 4 submission

### **Routes**
- `src/routes/cutomer/kyc.router.ts` - All KYC routes

### **Updated Files**
- `prisma/schema.prisma` - Schema updates
- `src/controllers/customer/auth.controllers.ts` - Auto Tier 1 verification
- `src/controllers/admin/admin.operation.controller.ts` - Enhanced approval flow
- `src/index.ts` - Added KYC routes

---

## 🎯 Tier Progression Rules

1. **Tier 1** - Auto-verified after email verification
2. **Tier 2** - Requires Tier 1 verified + submission
3. **Tier 3** - Requires Tier 2 verified + submission
4. **Tier 4** - Requires Tier 3 verified + submission

Users cannot skip tiers. Each tier must be verified before proceeding to the next.

---

## 📋 Next Steps

### **1. Run Migration**
```bash
npx prisma migrate dev --name add_4tier_kyc_system
```

### **2. Seed Default Limits**
Create default KYC limits for all tiers:
```sql
INSERT INTO KycLimits (tier, depositDailyLimit, depositMonthlyLimit, withdrawalDailyLimit, withdrawalMonthlyLimit) VALUES
('tier1', '100000', '500000', '100000', '500000'),
('tier2', '500000', '15000000', '500000', '15000000'),
('tier3', '5000000', '150000000', '5000000', '150000000'),
('tier4', '50000000', '500000000', '50000000', '500000000');
```

### **3. Update Existing Users**
Set Tier 1 for all verified users:
```sql
UPDATE User 
SET kycTier1Verified = true, currentKycTier = 'tier1' 
WHERE isVerified = true;
```

### **4. File Upload Configuration**
Ensure multer is configured correctly for file uploads:
- Files are saved to `uploads/` directory
- Consider moving to cloud storage (S3, Cloudinary) for production

### **5. Limit Enforcement (Future)**
Create middleware to enforce daily/monthly limits:
- Track daily/monthly usage per user
- Check limits before allowing transactions
- Reset counters daily/monthly

---

## 🔐 Security Considerations

1. **File Upload Validation:**
   - Validate file types (images, PDFs)
   - Validate file sizes
   - Scan for malware (in production)

2. **BVN Verification:**
   - Consider integrating with BVN verification service
   - Validate BVN format before submission

3. **Document Verification:**
   - Admin should verify document authenticity
   - Consider OCR for automatic data extraction

---

## 📊 Status Values

- `verified` - Tier is verified and active
- `pending` - Submission is under review
- `unverified` - No submission or not verified

---

## 🎉 Features Implemented

✅ 4-tier KYC system  
✅ Tier progression validation  
✅ File upload support (ID, selfie, proof of address, proof of funds)  
✅ Auto Tier 1 verification on email verification  
✅ KYC status endpoint with all tiers  
✅ Tier-specific submission endpoints  
✅ Admin approval with automatic tier upgrade  
✅ Daily/monthly limit fields in database  
✅ Backward compatibility with existing KYC system  

---

**Last Updated**: January 2025  
**Status**: ✅ Implementation Complete (Pending Migration)

