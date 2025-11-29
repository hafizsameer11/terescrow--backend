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
  purchaseController,
} from '../../controllers/customer/giftcard.purchase.controller';
import {
  getUserOrdersController,
  getOrderByIdController,
  getCardDetailsController,
} from '../../controllers/customer/giftcard.order.controller';
import {
  giftCardPurchaseValidation,
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
 *       3. Use `isoName: "US"` in `/products?countryCode=US` to filter products
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
 *       4. Get card types: `GET /api/v2/giftcards/products/1234/types` (if needed)
 *       5. Order gift card: `POST /api/v2/giftcards/purchase`
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
 *       3. Order gift card: `POST /api/v2/giftcards/purchase` (product details fetched from Reloadly API)
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
 *       - This endpoint shows available card delivery types for information purposes
 *       
 *       **💡 Note:** 
 *       - Reloadly's order API doesn't require cardType in the request
 *       - Card type is determined by Reloadly based on product configuration
 *       - This endpoint is for informational purposes only
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
 *                         description: Card delivery type (informational - not required in purchase request)
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
 * /api/v2/giftcards/purchase:
 *   post:
 *     summary: Order a gift card (Reloadly Official API)
 *     tags: [V2 - Gift Cards]
 *     description: |
 *       **V2 API** - Order a gift card product directly from Reloadly.
 *       This endpoint matches Reloadly's official order API structure.
 *       
 *       **📋 Complete Flow:**
 *       1. **Get Products:** `GET /api/v2/giftcards/products` → Get `productId`
 *       2. **Get Product Details:** `GET /api/v2/giftcards/products/{productId}` → Check denomination type and valid prices
 *       3. **Order Gift Card:** `POST /api/v2/giftcards/purchase` (this endpoint) → Create order with Reloadly
 *       
 *       **💡 Important Notes:**
 *       - Product details are fetched from Reloadly API (not database)
 *       - `unitPrice` must match product's denomination requirements:
 *         - For FIXED: must be in `fixedRecipientDenominations` array
 *         - For RANGE: must be between `minRecipientDenomination` and `maxRecipientDenomination`
 *       - Order is created directly with Reloadly and stored in database for tracking
 *       
 *       **💡 Parameter Sources:**
 *       - `productId` → From `GET /api/v2/giftcards/products` (use `productId` field)
 *       - `unitPrice` → Must match product's denomination:
 *         - For FIXED products: Use value from `fixedRecipientDenominations` array
 *         - For RANGE products: Use value between `minRecipientDenomination` and `maxRecipientDenomination`
 *       - Get product details: `GET /api/v2/giftcards/products/{productId}` to see valid prices
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
 *               - quantity
 *               - unitPrice
 *               - senderName
 *             properties:
 *               productId:
 *                 type: integer
 *                 example: 1234
 *                 description: |
 *                   Product ID from Reloadly.
 *                   **Source:** `GET /api/v2/giftcards/products` → use `productId` field
 *               quantity:
 *                 type: integer
 *                 example: 1
 *                 minimum: 1
 *                 description: Number of gift cards to order
 *               unitPrice:
 *                 type: number
 *                 example: 50.00
 *                 description: |
 *                   Price of the gift card to be purchased.
 *                   **IMPORTANT:** Must match product's denomination requirements:
 *                   - For FIXED products: Must be one of the values in `fixedRecipientDenominations` array
 *                   - For RANGE products: Must be between `minRecipientDenomination` and `maxRecipientDenomination`
 *                   **Source:** `GET /api/v2/giftcards/products/{productId}` → check `denominationType` and valid prices
 *               senderName:
 *                 type: string
 *                 example: "John Doe"
 *                 description: Name on the gift card receipt
 *               customIdentifier:
 *                 type: string
 *                 example: "obucks10"
 *                 description: |
 *                   Unique reference for the order (optional).
 *                   If not provided, will be auto-generated.
 *               preOrder:
 *                 type: boolean
 *                 example: false
 *                 default: false
 *                 description: Set to true if user wants to pre-order the gift card
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *                 example: "recipient@example.com"
 *                 description: Recipient's email address (optional). If absent, no email will be sent from Reloadly
 *               recipientPhoneDetails:
 *                 type: object
 *                 description: Recipient's phone details (optional)
 *                 properties:
 *                   countryCode:
 *                     type: string
 *                     example: "+1"
 *                   phoneNumber:
 *                     type: string
 *                     example: "234567890"
 *               productAdditionalRequirements:
 *                 type: object
 *                 description: Additional information required for some products (optional)
 *           examples:
 *             example1:
 *               summary: Basic order (FIXED denomination)
 *               value:
 *                 productId: 1234
 *                 quantity: 1
 *                 unitPrice: 50.00
 *                 senderName: "John Doe"
 *             example2:
 *               summary: Order with all optional fields
 *               value:
 *                 productId: 1234
 *                 quantity: 2
 *                 unitPrice: 100.00
 *                 senderName: "John Doe"
 *                 customIdentifier: "obucks10"
 *                 preOrder: false
 *                 recipientEmail: "recipient@example.com"
 *                 recipientPhoneDetails:
 *                   countryCode: "+1"
 *                   phoneNumber: "234567890"
 *     responses:
 *       200:
 *         description: Purchase completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactionId:
 *                   type: integer
 *                   example: 1
 *                 amount:
 *                   type: number
 *                   example: 34536.21
 *                 discount:
 *                   type: number
 *                   example: 1709.72
 *                 currencyCode:
 *                   type: string
 *                   example: "NGN"
 *                 fee:
 *                   type: number
 *                   example: 1880
 *                 totalFee:
 *                   type: number
 *                   example: 2065.76
 *                 recipientEmail:
 *                   type: string
 *                   example: "anyone@email.com"
 *                 customIdentifier:
 *                   type: string
 *                   example: "obucks1dime0"
 *                 status:
 *                   type: string
 *                   enum: [SUCCESSFUL, PENDING, PROCESSING, REFUNDED, FAILED]
 *                   example: "SUCCESSFUL"
 *                 product:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: integer
 *                     productName:
 *                       type: string
 *                     countryCode:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                     unitPrice:
 *                       type: number
 *                     totalPrice:
 *                       type: number
 *                     currencyCode:
 *                       type: string
 *                     brand:
 *                       type: object
 *                       properties:
 *                         brandId:
 *                           type: integer
 *                         brandName:
 *                           type: string
 *                 transactionCreatedTime:
 *                   type: string
 *                   example: "2022-02-28 13:46:00"
 *                 preOrdered:
 *                   type: boolean
 *                   example: false
 *                 balanceInfo:
 *                   type: object
 *                   properties:
 *                     oldBalance:
 *                       type: number
 *                     newBalance:
 *                       type: number
 *                     cost:
 *                       type: number
 *                     currencyCode:
 *                       type: string
 *                     currencyName:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *                 orderId:
 *                   type: string
 *                   description: Internal order ID for tracking
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

