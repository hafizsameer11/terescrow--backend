# Product Sync - How It Works

## ✅ **Yes, We Use Real Reloadly Products!**

The sync service **fetches actual products directly from Reloadly's API** - no mock data, no hardcoded products.

---

## 🔄 How Product Sync Works

### **1. API Call Flow**

```
Admin triggers sync
    ↓
POST /api/admin/giftcards/sync-products
    ↓
giftCardProductSyncService.syncAllProducts()
    ↓
reloadlyProductsService.getProducts() 
    ↓
🌐 Real API Call: GET https://giftcards.reloadly.com/products
    ↓
Reloadly returns actual product data
    ↓
Products saved to our database
```

### **2. What Gets Synced**

For each product from Reloadly, we sync:
- ✅ Product ID (Reloadly's ID)
- ✅ Product name & brand
- ✅ Country & currency
- ✅ Min/max values
- ✅ Fixed denominations
- ✅ **Real image URLs from Reloadly** (logoUrl, logoUrls)
- ✅ Product type (Physical, E-Code, etc.)
- ✅ Redemption instructions
- ✅ Description
- ✅ Global availability status

### **3. Sync Process Details**

#### **Full Sync** (`syncType: 'full'`)
- Fetches **ALL products** from Reloadly
- Paginates through all pages (50 products per page)
- Creates new products or updates existing ones
- Includes both variable and fixed denomination products

#### **Incremental Sync** (`syncType: 'incremental'`)
- Currently same as full sync
- Future: Only sync products updated since last sync

#### **Manual Sync** (`syncType: 'manual'`)
- Admin-triggered sync
- Same as full sync but logged as manual

### **4. Real API Endpoints Used**

```typescript
// Get all products (paginated)
GET https://giftcards.reloadly.com/products?page=1&size=50&includeRange=true&includeFixed=true

// Get products by country
GET https://giftcards.reloadly.com/countries/{countryCode}/products

// Get specific product
GET https://giftcards.reloadly.com/products/{productId}
```

### **5. Authentication**

Before fetching products:
1. ✅ Gets access token from Reloadly OAuth
2. ✅ Token stored in database (`ReloadlyConfig` table)
3. ✅ Auto-refreshes if expired
4. ✅ Uses token in `Authorization: Bearer {token}` header

---

## 📊 Sync Statistics

The sync tracks:
- **productsSynced**: Total products processed
- **productsCreated**: New products added to DB
- **productsUpdated**: Existing products updated
- **productsFailed**: Products that failed to sync
- **errors**: Detailed error messages

---

## 🎯 Example: Real Product Sync

### **Step 1: Admin Triggers Sync**
```bash
POST /api/admin/giftcards/sync-products
Body: { "syncType": "full" }
```

### **Step 2: Service Fetches from Reloadly**
```typescript
// Calls real Reloadly API
const response = await reloadlyProductsService.getProducts({
  page: 1,
  size: 50,
  includeRange: true,
  includeFixed: true
});
```

### **Step 3: Reloadly Returns Real Data**
```json
{
  "content": [
    {
      "productId": 120,
      "productName": "Nike Gift Card",
      "brandName": "Nike",
      "countryCode": "US",
      "currencyCode": "USD",
      "minValue": 25.00,
      "maxValue": 500.00,
      "logoUrl": "https://reloadly.com/images/nike.jpg",  // Real image!
      "isGlobal": false,
      "productType": "PHYSICAL"
    },
    // ... more real products
  ],
  "totalPages": 50,
  "totalElements": 2500
}
```

### **Step 4: Products Saved to Database**
- Each product stored in `GiftCardProduct` table
- Uses Reloadly's actual product IDs
- Stores real image URLs from Reloadly
- Tracks sync timestamp

---

## 🔍 Verification

### **Check Sync Logs**
```bash
GET /api/admin/giftcards/sync-logs
```

Returns:
```json
{
  "logs": [
    {
      "syncType": "full",
      "productsSynced": 2500,
      "productsCreated": 2450,
      "productsUpdated": 50,
      "productsFailed": 0,
      "status": "success",
      "startedAt": "2025-01-30T10:00:00Z",
      "completedAt": "2025-01-30T10:15:00Z"
    }
  ]
}
```

### **Check Synced Products**
```bash
GET /api/v2/giftcards/products
```

Returns products with:
- Real Reloadly product IDs
- Real product names from Reloadly
- Real image URLs from Reloadly
- Real pricing from Reloadly

---

## 🚀 How to Use

### **1. Initial Setup**
```bash
# 1. Set Reloadly credentials in .env
RELOADLY_CLIENT_ID=your_client_id
RELOADLY_CLIENT_SECRET=your_client_secret
RELOADLY_ENVIRONMENT=sandbox  # or "production"

# 2. Run migration
npx prisma migrate dev

# 3. Generate Prisma Client
npx prisma generate
```

### **2. First Sync**
```bash
# Trigger sync via API
POST /api/admin/giftcards/sync-products
Body: { "syncType": "full" }

# Or use curl
curl -X POST http://localhost:8000/api/admin/giftcards/sync-products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"syncType": "full"}'
```

### **3. View Products**
```bash
# Get all products (now in your database)
GET /api/v2/giftcards/products

# Get specific product
GET /api/v2/giftcards/products/120
```

---

## 📝 Key Points

1. ✅ **100% Real Data**: All products come from Reloadly's live API
2. ✅ **Real Images**: Uses Reloadly's actual image URLs
3. ✅ **Real Pricing**: Min/max values from Reloadly
4. ✅ **Real Product IDs**: Uses Reloadly's product IDs
5. ✅ **Auto-Sync**: Can be scheduled or triggered manually
6. ✅ **Error Handling**: Tracks failed products and continues
7. ✅ **Pagination**: Handles large product catalogs
8. ✅ **Rate Limiting**: Includes delays to avoid API limits

---

## 🔧 Technical Details

### **Service Architecture**
```
giftCardProductSyncService (syncs products)
    ↓ uses
reloadlyProductsService (calls Reloadly API)
    ↓ uses
reloadlyAuthService (manages tokens)
    ↓ uses
reloadlyConfig (configuration)
```

### **Database Models**
- `GiftCardProduct`: Stores synced products
- `GiftCardProductSyncLog`: Tracks sync operations
- `ReloadlyConfig`: Stores API credentials & tokens

### **Error Handling**
- Continues syncing even if some products fail
- Logs all errors with product IDs
- Returns detailed sync results

---

## 🎯 Summary

**The product sync uses 100% real Reloadly products!**

- ✅ Fetches from Reloadly's live API
- ✅ Stores in your database
- ✅ Uses real product IDs, names, images, pricing
- ✅ Tracks sync statistics
- ✅ Handles errors gracefully
- ✅ Supports pagination for large catalogs

**No mock data, no hardcoded products - everything is real!** 🚀

