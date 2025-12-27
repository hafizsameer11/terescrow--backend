import { Router } from 'express';
import {
  getVariationsController,
  verifySmartcardController,
  purchaseChangeBouquetController,
  purchaseRenewBouquetController,
  purchaseSimpleController,
  queryTransactionStatusController,
  getCableTestInfoController,
} from '../../controllers/test/vtpass.cable.test.controller';

const vtpassCableTestRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Test - VTpass Cable TV
 *   description: Test endpoints for VTpass Cable TV Subscription API integration
 */

/**
 * @swagger
 * /api/v2/test/vtpass/cable/info:
 *   get:
 *     summary: Get Cable TV Test Information and Documentation
 *     tags: [V2 - Test - VTpass Cable TV]
 *     description: |
 *       Get comprehensive information about available cable TV providers, test scenarios, and endpoints.
 *     responses:
 *       200:
 *         description: Test information retrieved successfully
 */
vtpassCableTestRouter.get('/info', getCableTestInfoController);

/**
 * @swagger
 * /api/v2/test/vtpass/cable/variations:
 *   get:
 *     summary: Get Bouquet Plans/Variations for a Provider
 *     tags: [V2 - Test - VTpass Cable TV]
 *     description: |
 *       Get available bouquet plans for a cable TV provider.
 *       Supports: DSTV, GOTV, Startimes, Showmax
 *     parameters:
 *       - in: query
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [dstv, gotv, startimes, showmax]
 *         description: Cable TV provider
 *     responses:
 *       200:
 *         description: Variations retrieved successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassCableTestRouter.get('/variations', getVariationsController);

/**
 * @swagger
 * /api/v2/test/vtpass/cable/verify-smartcard:
 *   post:
 *     summary: Verify Smartcard Number (DSTV, GOTV, Startimes)
 *     tags: [V2 - Test - VTpass Cable TV]
 *     description: |
 *       Verify smartcard number before purchasing.
 *       Supports: DSTV, GOTV, Startimes (Showmax does not require verification)
 *       Sandbox smartcard: 1212121212
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - smartcardNumber
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [dstv, gotv, startimes]
 *                 example: "dstv"
 *               smartcardNumber:
 *                 type: string
 *                 example: "1212121212"
 *                 description: "Smartcard number (sandbox: 1212121212)"
 *     responses:
 *       200:
 *         description: Smartcard verification completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassCableTestRouter.post('/verify-smartcard', verifySmartcardController);

/**
 * @swagger
 * /api/v2/test/vtpass/cable/purchase-change:
 *   post:
 *     summary: Purchase/Change Bouquet (DSTV, GOTV)
 *     tags: [V2 - Test - VTpass Cable TV]
 *     description: |
 *       Change or purchase a new bouquet for DSTV or GOTV decoder.
 *       This is for new subscribers or customers changing their bouquet.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - smartcardNumber
 *               - variation_code
 *               - phone
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [dstv, gotv]
 *                 example: "dstv"
 *               smartcardNumber:
 *                 type: string
 *                 example: "1212121212"
 *               variation_code:
 *                 type: string
 *                 example: "dstv-padi"
 *                 description: Variation code from variations endpoint
 *               phone:
 *                 type: string
 *                 pattern: '^0\d{10}$'
 *                 example: "08011111111"
 *               amount:
 *                 type: number
 *                 description: Optional amount (variation_code determines price)
 *               quantity:
 *                 type: number
 *                 description: Optional number of months
 *               request_id:
 *                 type: string
 *                 description: Optional custom request ID
 *     responses:
 *       200:
 *         description: Change bouquet purchase completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassCableTestRouter.post('/purchase-change', purchaseChangeBouquetController);

/**
 * @swagger
 * /api/v2/test/vtpass/cable/purchase-renew:
 *   post:
 *     summary: Renew Bouquet (DSTV, GOTV)
 *     tags: [V2 - Test - VTpass Cable TV]
 *     description: |
 *       Renew the current bouquet for DSTV or GOTV decoder.
 *       Use Renewal_Amount from verify smartcard response (may have discount).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - smartcardNumber
 *               - amount
 *               - phone
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [dstv, gotv]
 *                 example: "dstv"
 *               smartcardNumber:
 *                 type: string
 *                 example: "1212121212"
 *               amount:
 *                 type: number
 *                 example: 1850
 *                 description: Renewal amount from verify response
 *               phone:
 *                 type: string
 *                 pattern: '^0\d{10}$'
 *                 example: "08011111111"
 *               request_id:
 *                 type: string
 *                 description: Optional custom request ID
 *     responses:
 *       200:
 *         description: Renew bouquet purchase completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassCableTestRouter.post('/purchase-renew', purchaseRenewBouquetController);

/**
 * @swagger
 * /api/v2/test/vtpass/cable/purchase:
 *   post:
 *     summary: Purchase Subscription (DSTV, GOTV, Startimes, Showmax)
 *     tags: [V2 - Test - VTpass Cable TV]
 *     description: |
 *       Purchase subscription for DSTV, GOTV, Startimes, or Showmax.
 *       DSTV/GOTV: Uses variation_code for purchase/change bouquet.
 *       Startimes: Uses smartcard number (billersCode).
 *       Showmax: Uses phone number (billersCode).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - billersCode
 *               - variation_code
 *               - phone
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [dstv, gotv, startimes, showmax]
 *                 example: "dstv"
 *               billersCode:
 *                 type: string
 *                 example: "1212121212"
 *                 description: Smartcard number (DSTV/GOTV/Startimes) or phone number (Showmax)
 *               variation_code:
 *                 type: string
 *                 example: "nova"
 *                 description: Variation code from variations endpoint
 *               phone:
 *                 type: string
 *                 pattern: '^0\d{10}$'
 *                 example: "08011111111"
 *               amount:
 *                 type: number
 *                 description: Optional amount (variation_code determines price)
 *               request_id:
 *                 type: string
 *                 description: Optional custom request ID
 *     responses:
 *       200:
 *         description: Purchase completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassCableTestRouter.post('/purchase', purchaseSimpleController);

/**
 * @swagger
 * /api/v2/test/vtpass/cable/query:
 *   post:
 *     summary: Query Cable TV Transaction Status
 *     tags: [V2 - Test - VTpass Cable TV]
 *     description: |
 *       Query the status of a cable TV transaction using request_id.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - request_id
 *             properties:
 *               request_id:
 *                 type: string
 *                 example: "2025031010146932932"
 *     responses:
 *       200:
 *         description: Transaction query completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassCableTestRouter.post('/query', queryTransactionStatusController);

export default vtpassCableTestRouter;

