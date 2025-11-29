# V2 APIs Summary

## 📋 Overview

All new APIs implemented are clearly marked as **V2** in Swagger documentation. This document tracks all V2 endpoints for easy reference.

---

## 🎯 V2 API Categories

### 1. **V2 - PIN Management** (2 endpoints)
New PIN functionality for user accounts.

### 2. **V2 - Gift Cards** (9 endpoints)
Complete gift card purchase system integrated with Reloadly.

### 3. **V2 - Admin - Gift Cards** (5 endpoints)
Admin endpoints for managing gift card products and sync.

---

## 📍 V2 API Endpoints

### **V2 - PIN Management**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/set-pin` | Set a new 4-digit PIN for user account |
| `POST` | `/api/auth/update-pin` | Update an existing 4-digit PIN |

**Swagger Tag**: `V2 - PIN Management`

---

### **V2 - Gift Cards (Customer)**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/giftcards/products` | Get all gift card products |
| `GET` | `/api/v2/giftcards/products/{productId}` | Get product by ID |
| `GET` | `/api/v2/giftcards/products/{productId}/countries` | Get available countries for product |
| `GET` | `/api/v2/giftcards/products/{productId}/types` | Get supported card types |
| `POST` | `/api/v2/giftcards/purchase/validate` | Validate purchase before payment |
| `POST` | `/api/v2/giftcards/purchase` | Purchase a gift card |
| `GET` | `/api/v2/giftcards/orders` | Get user's gift card orders |
| `GET` | `/api/v2/giftcards/orders/{orderId}` | Get order by ID |
| `GET` | `/api/v2/giftcards/orders/{orderId}/card-details` | Get card code, PIN, expiry |

**Swagger Tag**: `V2 - Gift Cards`

---

### **V2 - Admin - Gift Cards**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/giftcards/sync-products` | Sync products from Reloadly |
| `GET` | `/api/admin/giftcards/sync-logs` | Get product sync logs |
| `POST` | `/api/admin/giftcards/products/{productId}/upload-image` | Upload custom product image |
| `GET` | `/api/admin/giftcards/reloadly/token-status` | Get Reloadly token status |
| `POST` | `/api/admin/giftcards/reloadly/refresh-token` | Refresh Reloadly token |

**Swagger Tag**: `V2 - Admin - Gift Cards`

---

## 🔍 How to View in Swagger

1. **Start the server**:
   ```bash
   npm run dev
   ```

2. **Open Swagger UI**:
   ```
   http://localhost:8000/api-docs
   ```

3. **Filter by V2**:
   - Look for tags starting with `V2 -`
   - All new APIs are grouped under:
     - `V2 - PIN Management`
     - `V2 - Gift Cards`
     - `V2 - Admin - Gift Cards`

---

## 📊 API Statistics

- **Total V2 Endpoints**: 16
- **PIN Management**: 2 endpoints
- **Gift Cards (Customer)**: 9 endpoints
- **Gift Cards (Admin)**: 5 endpoints

---

## 🎨 Swagger Features

### **Clear V2 Identification**
- All V2 APIs have tags starting with `V2 -`
- Each endpoint has description: `**V2 API** - ...`
- Easy to filter and identify new APIs

### **Grouped by Functionality**
- PIN APIs grouped together
- Gift card customer APIs grouped together
- Gift card admin APIs grouped together

### **Detailed Descriptions**
- Each endpoint explains what it does
- Notes if it's a new V2 feature
- Includes usage context

---

## 🔄 Version Tracking

### **API Version**: 2.0.0
- Swagger info version updated to `2.0.0`
- Description mentions V2 features

### **What Changed in V2**:
1. ✅ **PIN Management** - New feature for user PINs
2. ✅ **Gift Card Purchase** - Complete Reloadly integration
3. ✅ **Product Sync** - Admin tools for syncing products
4. ✅ **Order Management** - Track and manage gift card orders

---

## 📝 Notes

- All V2 endpoints are clearly marked in Swagger
- Old APIs (v1) remain unchanged
- V2 APIs use `/api/v2/` prefix for gift cards
- PIN APIs use `/api/auth/` but tagged as V2
- Admin gift card APIs use `/api/admin/giftcards/` and tagged as V2

---

## 🚀 Quick Reference

### **View All V2 APIs in Swagger**:
```
http://localhost:8000/api-docs
```

### **Filter by Tag**:
- Click on any `V2 -` tag to see all related endpoints
- Or use Swagger's tag filter

### **Test V2 APIs**:
- All endpoints are ready to test in Swagger UI
- Use "Try it out" button for each endpoint

---

**Last Updated**: January 2025  
**Status**: ✅ All V2 APIs documented and tagged in Swagger

