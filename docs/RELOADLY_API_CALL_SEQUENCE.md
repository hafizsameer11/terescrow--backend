# Reloadly Gift Card Implementation - Complete Guide

## 📚 Reference Links

- **Reloadly API Documentation**: https://docs.reloadly.com/
- **Reloadly Gift Cards API**: https://docs.reloadly.com/gift-cards
- **Reloadly Authentication**: https://docs.reloadly.com/authentication
- **Reloadly Countries API**: https://docs.reloadly.com/gift-cards/api-reference/countries
- **Reloadly Products API**: https://docs.reloadly.com/gift-cards/api-reference/products
- **Reloadly Orders API**: https://docs.reloadly.com/gift-cards/api-reference/orders
- **Postman Collection**: `Reloadly Developer APIs.postman_collection.json` (included in project)

---

## 🎯 Overview

This document provides a complete implementation guide for Reloadly gift card purchase system, including:
- Exact API call sequence matching UI flow
- Database schema design
- Implementation plan
- Image management strategy

---

## 📱 UI Flow → Reloadly API Calls (Exact Sequence)

### **Screen 1: Dashboard Screen** (Home)
**User Action**: User sees "Trade giftcards" card and taps it

**No Reloadly API Call Needed**
- This is just navigation
- We might cache product categories from previous sync

---

### **Screen 2: Giftcards Selection Screen**
**User Action**: User sees list of gift cards (Nike, Apple, Google Play, eBay, etc.)

**Reloadly API Call #1: Get All Products**
```
GET https://giftcards.reloadly.com/products
  OR (Sandbox): https://giftcards-sandbox.reloadly.com/products

Headers:
  Authorization: Bearer {access_token}
  Accept: application/com.reloadly.giftcards-v1+json

Query Parameters (optional):
  - countryCode: "US" (filter by country)
  - productName: "Amazon" (search by name)
  - includeRange: true (include variable denomination products)
  - includeFixed: true (include fixed denomination products)
  - page: 1
  - size: 50
```

**Alternative Endpoint** (Products by Country):
```
GET https://giftcards.reloadly.com/countries/{iso}/products
Example: GET https://giftcards.reloadly.com/countries/US/products
```

**Response Structure**:
```json
{
  "content": [
    {
      "productId": 123,
      "productName": "Nike Gift Card",
      "brandName": "Nike",
      "countryCode": "US",
      "currencyCode": "USD",
      "minValue": 25.00,
      "maxValue": 500.00,
      "logoUrls": ["https://..."],
      "logoUrl": "https://...",
      "fixedRecipientDenominations": [],
      "fixedSenderDenominations": [],
      "isGlobal": false,
      "productType": "PHYSICAL"
    }
  ],
  "totalElements": 100,
  "totalPages": 5
}
```

**Our Backend Endpoint**:
```
GET /api/v2/giftcards/products?countryCode=US&page=1&limit=50
```

**What We Do**:
1. Check our database first (cached products)
2. If cache is old (>1 hour) or missing, call Reloadly API
3. **Use Reloadly's images directly** (from `logoUrl` or `logoUrls[0]`)
4. Only use our custom image if Reloadly image is missing
5. Return products with images (priority: Reloadly image → our custom image → placeholder)

---

### **Screen 3: Product Customization Screen (Initial State)**
**User Action**: User taps on "Nike Gift Card" → Opens customization screen

**Reloadly API Call #2: Get Product Details**
```
GET https://giftcards.reloadly.com/products/{productId}
  OR (Sandbox): https://giftcards-sandbox.reloadly.com/products/{productId}

Headers:
  Authorization: Bearer {access_token}
  Accept: application/com.reloadly.giftcards-v1+json

Example:
GET https://giftcards.reloadly.com/products/123
```

**Response**:
```json
{
  "productId": 123,
  "productName": "Nike Gift Card",
  "brandName": "Nike",
  "countryCode": "US",
  "currencyCode": "USD",
  "minValue": 25.00,
  "maxValue": 500.00,
  "isGlobal": false,
  "logoUrls": ["https://..."],
  "logoUrl": "https://...",
  "fixedRecipientDenominations": [25, 50, 100, 200, 500],
  "fixedSenderDenominations": [],
  "productType": "PHYSICAL",
  "redeemInstruction": "Instructions here...",
  "description": "Product description"
}
```

**Our Backend Endpoint**:
```
GET /api/v2/giftcards/products/{productId}
```

**What We Return to Frontend**:
```json
{
  "productId": 123,
  "productName": "Nike Gift Card",
  "brandName": "Nike",
  "imageUrl": "https://reloadly.com/...", // Reloadly's logoUrl (primary)
  "minValue": 25.00,
  "maxValue": 500.00,
  "currencyCode": "USD",
  "availableCountries": [
    { "code": "US", "name": "United States", "currency": "USD" }
  ],
  "supportedCardTypes": ["Physical", "E-Code", "Code Only"],
  "fixedDenominations": [25, 50, 100, 200, 500], // If applicable
  "isVariableDenomination": true
}
```

---

### **Screen 4: Country Selection Modal**
**User Action**: User taps "Select country" → Modal opens with countries

**Reloadly API Call #3: Get Countries**

**Option 1: Get All Countries**
```
GET https://giftcards.reloadly.com/countries
  OR (Sandbox): https://giftcards-sandbox.reloadly.com/countries

Headers:
  Authorization: Bearer {access_token}
  Accept: application/com.reloadly.giftcards-v1+json
```

**Option 2: Get Country by ISO**
```
GET https://giftcards.reloadly.com/countries/{iso}
Example: GET https://giftcards.reloadly.com/countries/US
```

**Option 3: Get Products by Country (to see which countries have this product)**
```
GET https://giftcards.reloadly.com/countries/{iso}/products
Example: GET https://giftcards.reloadly.com/countries/US/products
```

**Response** (All Countries):
```json
{
  "content": [
    {
      "isoName": "US",
      "name": "United States",
      "currencyCode": "USD",
      "currencyName": "US Dollar",
      "flag": "https://..."
    },
    {
      "isoName": "GB",
      "name": "United Kingdom",
      "currencyCode": "GBP",
      "currencyName": "British Pound",
      "flag": "https://..."
    }
  ]
}
```

**Our Backend Endpoint**:
```
GET /api/v2/giftcards/products/{productId}/countries
```

**What We Do**:
1. Check if product is global (`isGlobal: true`)
2. If global: Get all countries from Reloadly
3. If not global: Get countries where this product is available (from our synced DB or call `/countries/{iso}/products` for each country)
4. Return available countries

**What We Return**:
```json
{
  "countries": [
    {
      "code": "US",
      "name": "United States",
      "currency": "USD",
      "currencySymbol": "$",
      "flag": "https://..."
    }
  ]
}
```

---

### **Screen 5: Card Type Selection Modal**
**User Action**: User taps "Gift card type" → Modal opens with types

**No Separate Reloadly API Call** - Use product metadata from step 3

**Note**: Reloadly doesn't have a separate endpoint for card types. The card types are determined by:
- `productType` field in product details (e.g., "PHYSICAL", "ECODE")
- Product metadata we maintain in our database

**Our Backend Endpoint**:
```
GET /api/v2/giftcards/products/{productId}/types?countryCode=US
```

**What We Return** (from product metadata or our database):
```json
{
  "cardTypes": [
    {
      "type": "Physical",
      "description": "Physical card shipped to recipient",
      "available": true
    },
    {
      "type": "E-Code",
      "description": "Digital code delivered via email",
      "available": true
    },
    {
      "type": "Code Only",
      "description": "Code without card",
      "available": true
    }
  ]
}
```

**Mapping Logic**:
- If `productType === "PHYSICAL"` → Show "Physical" option
- If `productType === "ECODE"` → Show "E-Code" option
- Most products support multiple types, so we maintain this in our database

---

### **Screen 6: Details Filled (Ready to Proceed)**
**User Action**: User has filled:
- Country: "United States"
- Card Type: "E-Code"
- Amount: "$100.00"
- Quantity: "1"

**No Reloadly API Call Yet** - Just validation on our side

**Our Backend Validation**:
```
POST /api/v2/giftcards/purchase/validate
Body:
{
  "productId": 123,
  "countryCode": "US",
  "cardType": "E-Code",
  "faceValue": 100.00,
  "quantity": 1,
  "currencyCode": "USD"
}
```

**What We Do**:
1. Validate amount is within min/max range
2. Validate country is supported for this product
3. Validate card type is available
4. Calculate total (faceValue + our fees)
5. Return validation result with total amount

**Response**:
```json
{
  "valid": true,
  "faceValue": 100.00,
  "fees": 5.00,
  "totalAmount": 105.00,
  "currencyCode": "USD"
}
```

---

### **Screen 7: Transaction Completed**
**User Action**: User taps "Proceed" → Payment processed → Success screen

**Reloadly API Call #4: Create Order** ⭐ **MAIN PURCHASE CALL**
```
POST https://giftcards.reloadly.com/orders
  OR (Sandbox): https://giftcards-sandbox.reloadly.com/orders

Headers:
  Authorization: Bearer {access_token}
  Accept: application/com.reloadly.giftcards-v1+json
  Content-Type: application/json

Body:
{
  "productId": 120,
  "countryCode": "US",
  "quantity": 1,
  "unitPrice": 100.00,
  "customIdentifier": "our-internal-order-id-12345",
  "senderName": "John Doe",
  "recipientEmail": "recipient@example.com",
  "recipientPhoneDetails": {
    "countryCode": "US",
    "phoneNumber": "5551234567"
  }
}
```

**Response**:
```json
{
  "transactionId": 987654321,
  "orderId": 123456789,
  "status": "PENDING",
  "productId": 120,
  "productName": "Nike Gift Card",
  "countryCode": "US",
  "quantity": 1,
  "unitPrice": 100.00,
  "totalPrice": 100.00,
  "currencyCode": "USD",
  "recipientEmail": "recipient@example.com"
}
```

**Our Backend Endpoint**:
```
POST /api/v2/giftcards/purchase
Body:
{
  "productId": 123,
  "countryCode": "US",
  "cardType": "E-Code",
  "faceValue": 100.00,
  "quantity": 1,
  "currencyCode": "USD",
  "paymentMethod": "wallet", // or "card"
  "recipientEmail": "user@example.com",
  "recipientPhone": "+15551234567" // optional
}
```

**What We Do**:
1. ✅ Validate user (KYC check)
2. ✅ Validate product availability
3. ✅ Calculate total (faceValue + our fees)
4. ✅ Process payment (deduct from wallet or charge card)
5. ✅ Create order in our database (status: "pending")
6. ✅ Call Reloadly API to create order
7. ✅ Update our order with Reloadly's response (transactionId, orderId)
8. ✅ Return order details to frontend

**Our Response**:
```json
{
  "orderId": "uuid-12345",
  "reloadlyOrderId": 123456789,
  "reloadlyTransactionId": 987654321,
  "status": "processing",
  "productName": "Nike Gift Card",
  "faceValue": 100.00,
  "totalAmount": 105.00, // including fees
  "currencyCode": "USD",
  "estimatedDelivery": "2025-01-30T10:00:00Z"
}
```

---

### **Screen 8: Card Details Screen**
**User Action**: User taps "View Card Details" → Sees card code, PIN, expiry

**Reloadly API Call #5: Get Card Codes** ⭐ **GET CARD CODE**
```
GET https://giftcards.reloadly.com/orders/transactions/{transactionId}/cards
  OR (Sandbox): https://giftcards-sandbox.reloadly.com/orders/transactions/{transactionId}/cards

Headers:
  Authorization: Bearer {access_token}
  Accept: application/com.reloadly.giftcards-v1+json

Example:
GET https://giftcards.reloadly.com/orders/transactions/987654321/cards
```

**Response** (when order is completed):
```json
{
  "content": [
    {
      "redemptionCode": "SKFKFKFKWC349WVWV", // The gift card code
      "pin": null, // PIN if applicable
      "serialNumber": null, // Serial number if applicable
      "expiryDate": "2028-06-30"
    }
  ]
}
```

**Alternative: Get Transaction Details**
```
GET https://giftcards.reloadly.com/reports/transactions/{transactionId}
```

**Our Backend Endpoint**:
```
GET /api/v2/giftcards/orders/{orderId}/card-details
```

**What We Do**:
1. Get order from our database
2. If status is "processing", poll Reloadly API using `transactionId`
3. Call `GET /orders/transactions/{transactionId}/cards` to get card code
4. If status is "completed", return card details
5. Store card code in our database (encrypted)

**Our Response**:
```json
{
  "orderId": "uuid-12345",
  "status": "completed",
  "productName": "Nike Gift Card",
  "faceValue": 100.00,
  "currencyCode": "USD",
  "cardCode": "SKFKFKFKWC349WVWV",
  "cardPin": null,
  "expiryDate": "2028-06-30",
  "redemptionInstructions": "Instructions here...",
  "cardImageUrl": "https://..."
}
```

---

## 📊 Complete API Call Sequence Summary

```
1. Dashboard Screen
   └─ No API call

2. Giftcards Selection Screen
   └─ GET /products (Reloadly)
      Query: countryCode, productName, includeRange, includeFixed
      └─ Our: GET /api/v2/giftcards/products

3. Product Customization Screen
   └─ GET /products/{productId} (Reloadly)
      └─ Our: GET /api/v2/giftcards/products/{productId}

4. Country Selection Modal
   └─ GET /countries (Reloadly) OR GET /countries/{iso}/products
      └─ Our: GET /api/v2/giftcards/products/{productId}/countries

5. Card Type Selection Modal
   └─ Use product metadata (already have from step 3)
      └─ Our: GET /api/v2/giftcards/products/{productId}/types

6. Details Filled (Validation)
   └─ No Reloadly call (just our validation)
      └─ Our: POST /api/v2/giftcards/purchase/validate

7. Transaction Completed
   └─ POST /orders (Reloadly) ← CREATE ORDER (MAIN CALL)
      └─ Our: POST /api/v2/giftcards/purchase

8. Card Details Screen
   └─ GET /orders/transactions/{transactionId}/cards (Reloadly) ← GET CARD CODE
      └─ Our: GET /api/v2/giftcards/orders/{orderId}/card-details
```

---

## 🔑 Authentication Flow

**Before any API call, we need an access token:**

```
POST https://auth.reloadly.com/oauth/token
Headers:
  Content-Type: application/json

Body:
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "grant_type": "client_credentials",
  "audience": "https://giftcards.reloadly.com" // or "https://giftcards-sandbox.reloadly.com"
}

Response:
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "..."
}
```

**Token Management:**
- Store token in `ReloadlyConfig` table
- Check expiration before each API call
- Auto-refresh if expired
- Use token in `Authorization: Bearer {token}` header

---

## 📊 Database Schema Design

### New Models Required

```prisma
// Gift Card Product Catalog (Synced from Reloadly + Local Overrides)
model GiftCardProduct {
  id                    Int      @id @default(autoincrement())
  reloadlyProductId     Int      @unique // Reloadly's product ID
  productName           String   // e.g., "Nike Gift Card"
  brandName             String?  // e.g., "Nike"
  countryCode           String   // ISO country code (e.g., "US", "UK")
  currencyCode          String   // e.g., "USD", "GBP"
  minValue              Decimal? @db.Decimal(10, 2) // Minimum card value
  maxValue              Decimal? @db.Decimal(10, 2) // Maximum card value
  fixedValue            Decimal? @db.Decimal(10, 2) // Fixed value if applicable
  isVariableDenomination Boolean @default(true) // Can user choose amount?
  isGlobal              Boolean  @default(false) // Available in multiple countries
  reloadlyImageUrl      String?  // Reloadly's logoUrl (PRIMARY - use this!)
  reloadlyLogoUrls      Json?    // Reloadly's logoUrls array
  imageUrl              String?  // Our uploaded image (ONLY if Reloadly missing)
  description           String?
  redemptionInstructions String? @db.Text
  terms                 String?  @db.Text
  status                String   @default("active") // "active", "inactive", "discontinued"
  category              String?  // e.g., "Fashion", "Gaming", "Retail"
  productType           String?  // "PHYSICAL", "ECODE", etc.
  supportedCardTypes    Json?    // ["Physical", "E-Code", "Code Only"]
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  lastSyncedAt          DateTime? // Last sync with Reloadly
  
  // Relations
  productCountries      GiftCardProductCountry[]
  orders                GiftCardOrder[]
  
  @@index([countryCode])
  @@index([status])
  @@index([brandName])
}

// Product availability by country
model GiftCardProductCountry {
  id                    Int      @id @default(autoincrement())
  productId             Int
  countryCode           String
  currencyCode          String
  minValue              Decimal? @db.Decimal(10, 2)
  maxValue              Decimal? @db.Decimal(10, 2)
  fixedValue            Decimal? @db.Decimal(10, 2)
  isAvailable           Boolean  @default(true)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  product               GiftCardProduct @relation(fields: [productId], references: [id])
  
  @@unique([productId, countryCode])
  @@index([countryCode])
}

// Gift Card Orders
model GiftCardOrder {
  id                    String   @id @default(uuid())
  userId                Int
  productId             Int
  reloadlyOrderId       String?  @unique // Reloadly's order ID
  reloadlyTransactionId String?  @unique // Reloadly's transaction ID (used to get cards)
  
  // Order Details
  quantity              Int      @default(1)
  cardType              String   // "Physical", "E-Code", "Code Only", etc.
  countryCode           String
  currencyCode          String
  faceValue             Decimal  @db.Decimal(10, 2) // Amount user paid for
  totalAmount           Decimal  @db.Decimal(10, 2) // Total including fees
  fees                  Decimal  @db.Decimal(10, 2) // Our fees
  exchangeRate          Decimal? @db.Decimal(10, 6) // If paid in different currency
  
  // Payment
  paymentMethod         String?  // "wallet", "card", "bank_transfer"
  paymentStatus         String   @default("pending") // "pending", "completed", "failed"
  paymentTransactionId  String?  // Link to payment transaction
  
  // Order Status
  status                String   @default("pending") // "pending", "processing", "completed", "failed", "refunded"
  reloadlyStatus        String?  // Reloadly's status
  
  // Card Details (after completion)
  cardCode              String?  // The actual gift card code (from /orders/transactions/{id}/cards)
  cardPin               String?  // PIN if applicable
  cardNumber            String?  // Card number if applicable
  expiryDate            DateTime? // Card expiry date
  cardImageUrl          String?  // Card image if provided
  
  // Recipient Info
  recipientEmail        String?
  recipientPhone        String?
  senderName            String?
  
  // Metadata
  metadata              Json?    // Store additional Reloadly response data
  errorMessage          String?  @db.Text
  refundedAt            DateTime?
  refundReason          String?
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  completedAt           DateTime?
  
  // Relations
  user                  User     @relation(fields: [userId], references: [id])
  product               GiftCardProduct @relation(fields: [productId], references: [id])
  
  @@index([userId])
  @@index([status])
  @@index([reloadlyTransactionId])
  @@index([createdAt])
}

// Reloadly API Configuration
model ReloadlyConfig {
  id                    Int      @id @default(autoincrement())
  environment           String   @default("sandbox") // "sandbox" or "production"
  clientId              String   @db.VarChar(255)
  clientSecret          String   @db.VarChar(255)
  accessToken           String?  @db.Text
  tokenExpiresAt        DateTime?
  isActive              Boolean  @default(true)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  @@unique([environment])
}

// Product Sync Log
model GiftCardProductSyncLog {
  id                    Int      @id @default(autoincrement())
  syncType              String   // "full", "incremental", "manual"
  productsSynced        Int      @default(0)
  productsCreated       Int      @default(0)
  productsUpdated       Int      @default(0)
  productsFailed        Int      @default(0)
  status                String   // "success", "partial", "failed"
  errorMessage          String?  @db.Text
  startedAt             DateTime @default(now())
  completedAt           DateTime?
  
  @@index([startedAt])
}
```

### Extend Existing Models

```prisma
model User {
  // ... existing fields ...
  
  giftCardOrders        GiftCardOrder[]
}

model Transaction {
  // ... existing fields ...
  
  giftCardOrderId       String?  @unique
  giftCardOrder         GiftCardOrder? @relation(fields: [giftCardOrderId], references: [id])
}
```

---

## 🖼️ Image Management Strategy

### Primary Strategy: Use Reloadly's Images

**99% of the time, Reloadly provides images**, so we use them directly:
- Store `logoUrl` from Reloadly API response in `reloadlyImageUrl`
- Store `logoUrls` array in `reloadlyLogoUrls`
- Use Reloadly's images directly in frontend
- No need to download or upload images

### Image Priority Logic

```typescript
function getProductImage(product: GiftCardProduct): string {
  // 1. Try Reloadly's primary image (logoUrl)
  if (product.reloadlyImageUrl) {
    return product.reloadlyImageUrl; // ✅ Use this!
  }
  
  // 2. Try Reloadly's logoUrls array
  if (product.reloadlyLogoUrls && product.reloadlyLogoUrls.length > 0) {
    return product.reloadlyLogoUrls[0]; // ✅ Use first logo
  }
  
  // 3. Only use our custom image if Reloadly doesn't have one
  if (product.imageUrl) {
    return product.imageUrl; // Fallback
  }
  
  // 4. Default placeholder
  return '/images/giftcard-placeholder.png';
}
```

### When We Need Custom Images (Edge Cases Only)

**Only upload custom images when:**
1. Reloadly image is NULL/empty
2. Reloadly image URL is broken (404)
3. Quality improvement needed (optional)

**Admin Upload Feature** (Optional):
- Only show "Upload Image" button if Reloadly image is missing
- Store in `imageUrl` field
- Use as fallback

---

## 🔄 Product Sync Flow

### Initial Sync
1. Fetch all products from Reloadly (`GET /products`)
2. Store in our database with Reloadly's image URLs
3. Map countries and card types
4. Only flag products missing images for manual upload

### Incremental Sync (Scheduled Job)
1. Run daily/hourly sync
2. Check for new products
3. Update existing products
4. Mark discontinued products
5. Log sync results

### Manual Sync (Admin Triggered)
- Admin can trigger sync from admin panel
- Useful for testing or immediate updates

---

## 🛣️ Our API Endpoints Design

### Product Catalog Endpoints

```
GET /api/v2/giftcards/products
  Query: countryCode, category, search, page, limit
  Response: List of products with images (Reloadly's or ours)

GET /api/v2/giftcards/products/{productId}
  Response: Full product details including available countries, card types, value ranges

GET /api/v2/giftcards/products/{productId}/countries
  Response: Available countries for this product

GET /api/v2/giftcards/products/{productId}/types
  Response: Supported card types (Physical, E-Code, etc.)
```

### Purchase Endpoints

```
POST /api/v2/giftcards/purchase/validate
  Body: productId, countryCode, cardType, faceValue, quantity
  Response: Validation result with total amount

POST /api/v2/giftcards/purchase
  Body: productId, countryCode, cardType, faceValue, quantity, paymentMethod, recipientEmail
  Response: Order created, payment required

GET /api/v2/giftcards/orders
  Query: status, page, limit
  Response: User's orders

GET /api/v2/giftcards/orders/{orderId}
  Response: Order details with status

GET /api/v2/giftcards/orders/{orderId}/card-details
  Response: Card code, PIN, expiry, redemption instructions
```

### Admin Endpoints

```
POST /api/admin/giftcards/sync-products
  Sync products from Reloadly to our DB

POST /api/admin/giftcards/products/{productId}/upload-image
  Upload custom image (ONLY if Reloadly image missing)

GET /api/admin/giftcards/sync-logs
  View sync history
```

---

## 🔄 Background Processing

### Order Status Polling (if not using webhooks)
```
While order.status === "processing":
  Every 10 seconds:
    GET /orders/transactions/{transactionId}/cards (Reloadly)
    Update our database
    If cardCode received:
      Store card code
      Update status to "completed"
      Notify user
      Stop polling
```

### Webhook Alternative (Recommended)
```
Reloadly sends webhook to:
  POST /api/webhooks/reloadly
  
We:
  1. Verify webhook signature
  2. Update order status
  3. Call GET /orders/transactions/{transactionId}/cards to get card code
  4. Store card code if completed
  5. Notify user
```

---

## 🔐 Security & Validation

### Purchase Validation
- ✅ User must be authenticated
- ✅ KYC must be approved
- ✅ Sufficient wallet balance (if using wallet)
- ✅ Product must be active
- ✅ Amount within min/max range
- ✅ Country must be supported
- ✅ Card type must be supported

### Rate Limiting
- Limit purchase requests per user
- Prevent duplicate orders
- Validate against fraud patterns

---

## 📦 Implementation Phases

### Phase 1: Database & Models
- [ ] Create Prisma schema
- [ ] Run migrations
- [ ] Create TypeScript types

### Phase 2: Reloadly Service Layer
- [ ] Authentication service (token management)
- [ ] Products service
- [ ] Orders service
- [ ] Webhook handler

### Phase 3: Product Sync
- [ ] Initial sync script
- [ ] Scheduled sync job
- [ ] Admin sync endpoint
- [ ] Image upload functionality (optional - only for missing images)

### Phase 4: API Endpoints
- [ ] Product catalog endpoints
- [ ] Purchase endpoints
- [ ] Order management endpoints
- [ ] Admin endpoints

### Phase 5: Purchase Flow
- [ ] Purchase controller
- [ ] Payment integration
- [ ] Order processing
- [ ] Webhook handling

### Phase 6: Testing & Documentation
- [ ] Unit tests
- [ ] Integration tests
- [ ] API documentation
- [ ] Error handling

---

## 🧪 Testing Strategy

### Test Scenarios
1. **Product Sync**
   - Sync all products
   - Handle missing images
   - Update existing products

2. **Purchase Flow**
   - Successful purchase
   - Insufficient balance
   - Product unavailable
   - Invalid amount
   - Reloadly API failure

3. **Order Status**
   - Pending → Processing → Completed
   - Failed orders
   - Refund scenarios

---

## 📝 Environment Variables

```env
# Reloadly Configuration
RELOADLY_CLIENT_ID=your_client_id
RELOADLY_CLIENT_SECRET=your_client_secret
RELOADLY_ENVIRONMENT=sandbox # or production
RELOADLY_BASE_URL=https://giftcards.reloadly.com
RELOADLY_SANDBOX_URL=https://giftcards-sandbox.reloadly.com
RELOADLY_AUTH_URL=https://auth.reloadly.com

# Image Storage (Optional - only if needed)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

## 🚨 Error Handling

### Reloadly API Errors
- Handle rate limiting (429)
- Handle authentication failures (401)
- Handle invalid requests (400)
- Handle service unavailability (503)

### Our System Errors
- Database connection issues
- Payment processing failures
- Image upload failures (if needed)
- Order creation failures

---

## 📊 Monitoring & Logging

### Key Metrics
- Sync success rate
- Purchase success rate
- Average order processing time
- Reloadly API response times
- Error rates by type

### Logging
- All API calls to Reloadly
- Order status changes
- Sync operations
- Error details

---

## 🎯 Key Points Summary

1. **Authentication**: Get token first from `/oauth/token`
2. **Products List**: `GET /products` (with optional filters)
3. **Product Details**: `GET /products/{productId}`
4. **Countries**: `GET /countries` or `GET /countries/{iso}/products`
5. **Card Types**: Use product metadata (no separate API)
6. **Purchase**: `POST /orders` ← **Main purchase call**
7. **Card Code**: `GET /orders/transactions/{transactionId}/cards` ← **Get card code**
8. **Images**: Use Reloadly's `logoUrl` directly (99% of cases)

---

## 📚 Additional Reloadly Endpoints (From Postman Collection)

### Account Management
```
GET /accounts/balance
  Get Reloadly account balance
```

### Discounts
```
GET /discounts
  Get all available discounts

GET /products/{productId}/discounts
  Get discounts for specific product
```

### Transactions/Reports
```
GET /reports/transactions
  Query: startDate, endDate, page, size
  Get transaction history

GET /reports/transactions/{transactionId}
  Get specific transaction details
```

### Redeem Instructions
```
GET /redeem-instructions
  Get all redeem instructions

GET /redeem-instructions/{brandId}
  Get redeem instructions for specific brand
```

---

**Last Updated**: January 2025  
**Status**: 📋 Ready for Implementation  
**Postman Collection**: Included in project root
