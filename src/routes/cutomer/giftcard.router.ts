/**
 * Gift Card Routes (Customer)
 * 
 * All customer-facing gift card endpoints
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getProductsController,
  getProductByIdController,
  getProductCountriesController,
  getProductCardTypesController,
  getCountriesController,
  getCategoriesController,
} from '../../controllers/customer/giftcard.product.controller';
import {
  validatePurchaseController,
  purchaseController,
} from '../../controllers/customer/giftcard.purchase.controller';
import {
  getUserOrdersController,
  getOrderByIdController,
  getCardDetailsController,
} from '../../controllers/customer/giftcard.order.controller';
import {
  giftCardPurchaseValidation,
  giftCardPurchaseValidateValidation,
} from '../../utils/validations';

const giftCardRouter = express.Router();

// ============================================
// Product Catalog Routes
// ============================================

/**
 * @swagger
 * /api/v2/giftcards/products:
 *   get:
 *     summary: Get all gift card products
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get all available gift card products directly from Reloadly.
 *       
 *       **📋 Usage Flow:**
 *       1. Start here to browse available products
 *       2. Use `productId` from response for other endpoints
 *       3. Filter by `countryCode` (get values from `/countries` endpoint)
 *       4. Filter by `category` (get values from `/categories` endpoint)
 *       
 *       **💡 Tip:** This is the main endpoint to get `productId` values needed for purchase.
 *     parameters:
 *       - in: query
 *         name: countryCode
 *         schema:
 *           type: string
 *           example: "US"
 *         description: |
 *           Filter by country code (ISO 2-letter format).
 *           **Get valid values from:** `GET /api/v2/giftcards/countries`
 *           Example: "US", "GB", "NG"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           example: "Gaming"
 *         description: |
 *           Filter by product category.
 *           **Get valid values from:** `GET /api/v2/giftcards/categories`
 *           Example: "Gaming", "Entertainment", "Shopping"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: "Amazon"
 *         description: Search by product name or brand name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 1000
 *         description: Number of products per page (max 1000, but Reloadly returns max 200 per request - we handle pagination automatically)
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productId:
 *                         type: integer
 *                         description: Use this ID for other endpoints (e.g., purchase, get details)
 *                         example: 1234
 *                       productName:
 *                         type: string
 *                         example: "Amazon"
 *                       brandName:
 *                         type: string
 *                         example: "Amazon"
 *                       countryCode:
 *                         type: string
 *                         example: "US"
 *                       currencyCode:
 *                         type: string
 *                         example: "USD"
 *                       minValue:
 *                         type: number
 *                         example: 10.00
 *                       maxValue:
 *                         type: number
 *                         example: 500.00
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     returned:
 *                       type: integer
 *                       description: Actual number of products returned
 */
giftCardRouter.get('/products', getProductsController);

/**
 * @swagger
 * /api/v2/giftcards/countries:
 *   get:
 *     summary: Get all countries from Reloadly
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get all available countries from Reloadly.
 *       
 *       **📋 Usage:**
 *       - Use `isoName` values to filter products: `GET /api/v2/giftcards/products?countryCode={isoName}`
 *       - Use `isoName` as `countryCode` in purchase endpoints
 *       
 *       **💡 Example Flow:**
 *       1. Call this endpoint to get list of countries
 *       2. Use `isoName: "US"` in `/products?countryCode=US` to filter products
 *       3. Use `isoName: "US"` as `countryCode` in `/purchase/validate` and `/purchase`
 *     responses:
 *       200:
 *         description: Countries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 countries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       isoName:
 *                         type: string
 *                         description: Use this value as `countryCode` in other endpoints
 *                         example: "US"
 *                       name:
 *                         type: string
 *                         example: "United States"
 *                       currencyCode:
 *                         type: string
 *                         description: Currency code for this country
 *                         example: "USD"
 *                       currencyName:
 *                         type: string
 *                         example: "US Dollar"
 *                       flag:
 *                         type: string
 *                         nullable: true
 *                         description: Country flag image URL
 *                 total:
 *                   type: integer
 */
giftCardRouter.get('/countries', getCountriesController);

/**
 * @swagger
 * /api/v2/giftcards/categories:
 *   get:
 *     summary: Get all categories from Reloadly products
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get all unique product categories from Reloadly.
 *       
 *       **📋 Usage:**
 *       - Use `value` to filter products: `GET /api/v2/giftcards/products?category={value}`
 *       
 *       **💡 Example Flow:**
 *       1. Call this endpoint to get list of categories
 *       2. Use `value: "Gaming"` in `/products?category=Gaming` to filter products by category
 *       
 *       **Note:** Categories are extracted from products since Reloadly doesn't have a dedicated categories endpoint.
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: Category display name
 *                         example: "Gaming"
 *                       value:
 *                         type: string
 *                         description: Use this value as `category` parameter in `/products` endpoint
 *                         example: "Gaming"
 *                 total:
 *                   type: integer
 */
giftCardRouter.get('/categories', getCategoriesController);

/**
 * @swagger
 * /api/v2/giftcards/products/{productId}:
 *   get:
 *     summary: Get product by ID
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get detailed information about a specific gift card product.
 *       
 *       **📋 Usage:**
 *       - Get `productId` from: `GET /api/v2/giftcards/products` (use `productId` field from response)
 *       - Use this endpoint to get full product details before purchase
 *       
 *       **💡 Example Flow:**
 *       1. Browse products: `GET /api/v2/giftcards/products`
 *       2. Select a product (e.g., `productId: 1234`)
 *       3. Get details: `GET /api/v2/giftcards/products/1234`
 *       4. Get card types: `GET /api/v2/giftcards/products/1234/types`
 *       5. Validate purchase: `POST /api/v2/giftcards/purchase/validate`
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1234
 *         description: |
 *           Product ID from Reloadly.
 *           **Get this value from:** `GET /api/v2/giftcards/products` (use `productId` field)
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *       404:
 *         description: Product not found
 */
giftCardRouter.get('/products/:productId', getProductByIdController);

/**
 * @swagger
 * /api/v2/giftcards/products/{productId}/countries:
 *   get:
 *     summary: Get available countries for a product
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get list of countries where this product is available.
 *       
 *       **📋 Usage:**
 *       - Get `productId` from: `GET /api/v2/giftcards/products` (use `productId` field)
 *       - Use returned country codes as `countryCode` in purchase endpoints
 *       
 *       **💡 Example Flow:**
 *       1. Get product: `GET /api/v2/giftcards/products` → find `productId: 1234`
 *       2. Get countries: `GET /api/v2/giftcards/products/1234/countries`
 *       3. Use country code in purchase: `POST /api/v2/giftcards/purchase/validate` with `countryCode: "US"`
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1234
 *         description: |
 *           Product ID from Reloadly.
 *           **Get this value from:** `GET /api/v2/giftcards/products` (use `productId` field)
 *     responses:
 *       200:
 *         description: Countries retrieved successfully
 */
giftCardRouter.get('/products/:productId/countries', getProductCountriesController);

/**
 * @swagger
 * /api/v2/giftcards/products/{productId}/types:
 *   get:
 *     summary: Get supported card types for a product
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get supported card types for a specific product.
 *       
 *       **📋 Usage:**
 *       - Get `productId` from: `GET /api/v2/giftcards/products` (use `productId` field)
 *       - Use returned `type` values as `cardType` in purchase endpoints
 *       
 *       **💡 Example Flow:**
 *       1. Get product: `GET /api/v2/giftcards/products` → find `productId: 1234`
 *       2. Get card types: `GET /api/v2/giftcards/products/1234/types` → returns `["Physical", "E-Code"]`
 *       3. Use card type in purchase: `POST /api/v2/giftcards/purchase/validate` with `cardType: "E-Code"`
 *       
 *       **Common Card Types:**
 *       - `Physical` - Physical card shipped to recipient
 *       - `E-Code` - Digital code delivered via email
 *       - `Code Only` - Code without card
 *       - `Paper Code` - Paper code format
 *       - `Horizontal Card` - Horizontal card format
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1234
 *         description: |
 *           Product ID from Reloadly.
 *           **Get this value from:** `GET /api/v2/giftcards/products` (use `productId` field)
 *     responses:
 *       200:
 *         description: Card types retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cardTypes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         description: Use this value as `cardType` in purchase endpoints
 *                         example: "E-Code"
 *                       description:
 *                         type: string
 *                         example: "Digital code delivered via email"
 *                       available:
 *                         type: boolean
 *                         example: true
 */
giftCardRouter.get('/products/:productId/types', getProductCardTypesController);

// ============================================
// Purchase Routes
// ============================================

/**
 * @swagger
 * /api/v2/giftcards/purchase/validate:
 *   post:
 *     summary: Validate purchase request before payment
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Validate gift card purchase before processing payment.
 *       Checks product availability, amount limits, and calculates fees.
 *       
 *       **📋 Complete Flow:**
 *       1. **Get Products:** `GET /api/v2/giftcards/products` → Get `productId`
 *       2. **Get Countries:** `GET /api/v2/giftcards/countries` → Get `countryCode` (use `isoName`)
 *       3. **Get Card Types:** `GET /api/v2/giftcards/products/{productId}/types` → Get `cardType` (use `type`)
 *       4. **Get Product Details:** `GET /api/v2/giftcards/products/{productId}` → Check `minValue`, `maxValue`, `currencyCode`
 *       5. **Validate Purchase:** `POST /api/v2/giftcards/purchase/validate` (this endpoint)
 *       6. **Purchase:** `POST /api/v2/giftcards/purchase` (after validation passes)
 *       
 *       **💡 Parameter Sources:**
 *       - `productId` → From `GET /api/v2/giftcards/products` (use `productId` field)
 *       - `countryCode` → From `GET /api/v2/giftcards/countries` (use `isoName` field) OR from `GET /api/v2/giftcards/products/{productId}/countries`
 *       - `cardType` → From `GET /api/v2/giftcards/products/{productId}/types` (use `type` field)
 *       - `currencyCode` → From `GET /api/v2/giftcards/products/{productId}` (use `currencyCode` field)
 *       - `faceValue` → User input (must be between `minValue` and `maxValue` from product details)
 *       - `quantity` → User input (number of cards to purchase)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - countryCode
 *               - cardType
 *               - faceValue
 *               - quantity
 *               - currencyCode
 *             properties:
 *               productId:
 *                 type: integer
 *                 example: 1234
 *                 description: |
 *                   Product ID from Reloadly.
 *                   **Source:** `GET /api/v2/giftcards/products` → use `productId` field
 *               countryCode:
 *                 type: string
 *                 example: "US"
 *                 description: |
 *                   Country code (ISO 2-letter format).
 *                   **Source:** `GET /api/v2/giftcards/countries` → use `isoName` field
 *                   OR `GET /api/v2/giftcards/products/{productId}/countries`
 *               cardType:
 *                 type: string
 *                 example: "E-Code"
 *                 enum: [Physical, E-Code, Code Only, Paper Code, Horizontal Card]
 *                 description: |
 *                   Card delivery type.
 *                   **Source:** `GET /api/v2/giftcards/products/{productId}/types` → use `type` field
 *                   Common values: "Physical", "E-Code", "Code Only"
 *               faceValue:
 *                 type: number
 *                 example: 50.00
 *                 minimum: 0.01
 *                 description: |
 *                   Gift card face value (amount).
 *                   **Validation:** Must be between `minValue` and `maxValue` from product details.
 *                   **Source:** `GET /api/v2/giftcards/products/{productId}` → check `minValue` and `maxValue`
 *               quantity:
 *                 type: integer
 *                 example: 1
 *                 minimum: 1
 *                 description: Number of gift cards to purchase
 *               currencyCode:
 *                 type: string
 *                 example: "USD"
 *                 description: |
 *                   Currency code (3-letter ISO format).
 *                   **Source:** `GET /api/v2/giftcards/products/{productId}` → use `currencyCode` field
 *                   OR `GET /api/v2/giftcards/countries` → use `currencyCode` field
 *           examples:
 *             example1:
 *               summary: Example validation request
 *               value:
 *                 productId: 1234
 *                 countryCode: "US"
 *                 cardType: "E-Code"
 *                 faceValue: 50.00
 *                 quantity: 1
 *                 currencyCode: "USD"
 *     responses:
 *       200:
 *         description: Validation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *                 faceValue:
 *                   type: number
 *                   example: 50.00
 *                 fees:
 *                   type: number
 *                   example: 2.50
 *                 totalAmount:
 *                   type: number
 *                   example: 52.50
 *                 currencyCode:
 *                   type: string
 *                   example: "USD"
 *                 productName:
 *                   type: string
 *                   example: "Amazon"
 *       400:
 *         description: Validation failed (invalid parameters, amount out of range, etc.)
 */
giftCardRouter.post(
  '/purchase/validate',
  giftCardPurchaseValidateValidation,
  validatePurchaseController
);

/**
 * @swagger
 * /api/v2/giftcards/purchase:
 *   post:
 *     summary: Purchase a gift card
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Purchase a gift card from Reloadly.
 *       Processes payment, creates order with Reloadly, and returns order details.
 *       
 *       **⚠️ IMPORTANT:** Always validate purchase first using `POST /api/v2/giftcards/purchase/validate`
 *       
 *       **📋 Complete Flow:**
 *       1. **Get Products:** `GET /api/v2/giftcards/products` → Get `productId`
 *       2. **Get Countries:** `GET /api/v2/giftcards/countries` → Get `countryCode` (use `isoName`)
 *       3. **Get Card Types:** `GET /api/v2/giftcards/products/{productId}/types` → Get `cardType` (use `type`)
 *       4. **Get Product Details:** `GET /api/v2/giftcards/products/{productId}` → Check `minValue`, `maxValue`, `currencyCode`
 *       5. **Validate Purchase:** `POST /api/v2/giftcards/purchase/validate` → Verify all parameters
 *       6. **Purchase:** `POST /api/v2/giftcards/purchase` (this endpoint) → Process payment and create order
 *       
 *       **💡 Parameter Sources:**
 *       - `productId` → From `GET /api/v2/giftcards/products` (use `productId` field)
 *       - `countryCode` → From `GET /api/v2/giftcards/countries` (use `isoName` field) OR from `GET /api/v2/giftcards/products/{productId}/countries`
 *       - `cardType` → From `GET /api/v2/giftcards/products/{productId}/types` (use `type` field)
 *       - `currencyCode` → From `GET /api/v2/giftcards/products/{productId}` (use `currencyCode` field)
 *       - `faceValue` → User input (must be between `minValue` and `maxValue` from product details)
 *       - `quantity` → User input (number of cards to purchase)
 *       - `paymentMethod` → User selection: "wallet", "card", or "bank_transfer"
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - countryCode
 *               - cardType
 *               - faceValue
 *               - quantity
 *               - currencyCode
 *               - paymentMethod
 *             properties:
 *               productId:
 *                 type: integer
 *                 example: 1234
 *                 description: |
 *                   Product ID from Reloadly.
 *                   **Source:** `GET /api/v2/giftcards/products` → use `productId` field
 *               countryCode:
 *                 type: string
 *                 example: "US"
 *                 description: |
 *                   Country code (ISO 2-letter format).
 *                   **Source:** `GET /api/v2/giftcards/countries` → use `isoName` field
 *                   OR `GET /api/v2/giftcards/products/{productId}/countries`
 *               cardType:
 *                 type: string
 *                 example: "E-Code"
 *                 enum: [Physical, E-Code, Code Only, Paper Code, Horizontal Card]
 *                 description: |
 *                   Card delivery type.
 *                   **Source:** `GET /api/v2/giftcards/products/{productId}/types` → use `type` field
 *                   Common values: "Physical", "E-Code", "Code Only"
 *               faceValue:
 *                 type: number
 *                 example: 50.00
 *                 minimum: 0.01
 *                 description: |
 *                   Gift card face value (amount).
 *                   **Validation:** Must be between `minValue` and `maxValue` from product details.
 *                   **Source:** `GET /api/v2/giftcards/products/{productId}` → check `minValue` and `maxValue`
 *               quantity:
 *                 type: integer
 *                 example: 1
 *                 minimum: 1
 *                 description: Number of gift cards to purchase
 *               currencyCode:
 *                 type: string
 *                 example: "USD"
 *                 description: |
 *                   Currency code (3-letter ISO format).
 *                   **Source:** `GET /api/v2/giftcards/products/{productId}` → use `currencyCode` field
 *                   OR `GET /api/v2/giftcards/countries` → use `currencyCode` field
 *               paymentMethod:
 *                 type: string
 *                 enum: [wallet, card, bank_transfer]
 *                 example: "wallet"
 *                 description: Payment method to use
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *                 example: "recipient@example.com"
 *                 description: |
 *                   Recipient email address (required for E-Code card types).
 *                   Used to deliver digital gift card codes.
 *               recipientPhone:
 *                 type: string
 *                 example: "+1234567890"
 *                 description: |
 *                   Recipient phone number (optional, format: +country code + number).
 *                   Used for SMS delivery if supported.
 *               senderName:
 *                 type: string
 *                 example: "John Doe"
 *                 description: Name of the sender (optional)
 *           examples:
 *             example1:
 *               summary: Purchase E-Code gift card
 *               value:
 *                 productId: 1234
 *                 countryCode: "US"
 *                 cardType: "E-Code"
 *                 faceValue: 50.00
 *                 quantity: 1
 *                 currencyCode: "USD"
 *                 paymentMethod: "wallet"
 *                 recipientEmail: "recipient@example.com"
 *                 senderName: "John Doe"
 *             example2:
 *               summary: Purchase Physical gift card
 *               value:
 *                 productId: 1234
 *                 countryCode: "US"
 *                 cardType: "Physical"
 *                 faceValue: 100.00
 *                 quantity: 1
 *                 currencyCode: "USD"
 *                 paymentMethod: "wallet"
 *                 recipientEmail: "recipient@example.com"
 *                 recipientPhone: "+1234567890"
 *                 senderName: "John Doe"
 *     responses:
 *       200:
 *         description: Purchase completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId:
 *                   type: string
 *                   description: Order ID for tracking
 *                 transactionId:
 *                   type: string
 *                   description: Transaction ID
 *                 status:
 *                   type: string
 *                   example: "processing"
 *                 productName:
 *                   type: string
 *                   example: "Amazon"
 *                 faceValue:
 *                   type: number
 *                   example: 50.00
 *                 totalAmount:
 *                   type: number
 *                   example: 52.50
 *       400:
 *         description: Validation failed (invalid parameters, insufficient balance, etc.)
 *       401:
 *         description: Unauthorized (invalid or missing token)
 */
giftCardRouter.post(
  '/purchase',
  authenticateUser,
  giftCardPurchaseValidation,
  purchaseController
);

// ============================================
// Order Management Routes
// ============================================

/**
 * @swagger
 * /api/v2/giftcards/orders:
 *   get:
 *     summary: Get user's gift card orders
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get list of all gift card orders for authenticated user.
 *       
 *       **📋 Usage:**
 *       - Returns all orders created by the authenticated user
 *       - Use `orderId` from response to get order details or card details
 *       
 *       **💡 Example Flow:**
 *       1. Purchase gift card: `POST /api/v2/giftcards/purchase` → Get `orderId`
 *       2. List orders: `GET /api/v2/giftcards/orders` → See all your orders
 *       3. Get order details: `GET /api/v2/giftcards/orders/{orderId}`
 *       4. Get card details: `GET /api/v2/giftcards/orders/{orderId}/card-details` (for completed orders)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: Filter orders by status
 *         example: "completed"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *         description: Number of orders per page
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *       401:
 *         description: Unauthorized
 */
giftCardRouter.get('/orders', authenticateUser, getUserOrdersController);

/**
 * @swagger
 * /api/v2/giftcards/orders/{orderId}:
 *   get:
 *     summary: Get order by ID
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get detailed information about a specific gift card order.
 *       
 *       **📋 Usage:**
 *       - Get `orderId` from: `POST /api/v2/giftcards/purchase` (response contains `orderId`)
 *       - OR from: `GET /api/v2/giftcards/orders` (use `orderId` field from orders list)
 *       
 *       **💡 Example Flow:**
 *       1. Purchase gift card: `POST /api/v2/giftcards/purchase` → Get `orderId: "order_123"`
 *       2. Get order details: `GET /api/v2/giftcards/orders/order_123`
 *       3. If order is completed, get card details: `GET /api/v2/giftcards/orders/order_123/card-details`
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           example: "order_123"
 *         description: |
 *           Order ID.
 *           **Source:** `POST /api/v2/giftcards/purchase` → use `orderId` field from response
 *           OR `GET /api/v2/giftcards/orders` → use `orderId` field from orders list
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *       404:
 *         description: Order not found
 */
giftCardRouter.get('/orders/:orderId', authenticateUser, getOrderByIdController);

/**
 * @swagger
 * /api/v2/giftcards/orders/{orderId}/card-details:
 *   get:
 *     summary: Get card details (code, PIN, expiry) for an order
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Get gift card code, PIN, and expiry date for a completed order.
 *       Fetches card details from Reloadly if order is processing or completed.
 *       
 *       **📋 Usage:**
 *       - Get `orderId` from: `POST /api/v2/giftcards/purchase` (response contains `orderId`)
 *       - OR from: `GET /api/v2/giftcards/orders` (use `orderId` field from orders list)
 *       - Only available for orders with status: `completed` or `processing`
 *       
 *       **💡 Example Flow:**
 *       1. Purchase gift card: `POST /api/v2/giftcards/purchase` → Get `orderId: "order_123"`
 *       2. Check order status: `GET /api/v2/giftcards/orders/order_123` → Wait for status to be "completed"
 *       3. Get card details: `GET /api/v2/giftcards/orders/order_123/card-details` → Get gift card code and PIN
 *       
 *       **⚠️ Note:** Card details are only available after the order is processed by Reloadly.
 *       For E-Code cards, codes are also sent to recipient email.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           example: "order_123"
 *         description: |
 *           Order ID.
 *           **Source:** `POST /api/v2/giftcards/purchase` → use `orderId` field from response
 *           OR `GET /api/v2/giftcards/orders` → use `orderId` field from orders list
 *     responses:
 *       200:
 *         description: Card details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId:
 *                   type: string
 *                   example: "order_123"
 *                 cardCode:
 *                   type: string
 *                   description: Gift card code/redeem code
 *                   example: "ABC123XYZ789"
 *                 pin:
 *                   type: string
 *                   nullable: true
 *                   description: PIN number (if required)
 *                   example: "1234"
 *                 expiryDate:
 *                   type: string
 *                   format: date
 *                   nullable: true
 *                   description: Card expiry date
 *                   example: "2025-12-31"
 *       404:
 *         description: Order not found or card details not available yet
 */
giftCardRouter.get('/orders/:orderId/card-details', authenticateUser, getCardDetailsController);

export default giftCardRouter;

