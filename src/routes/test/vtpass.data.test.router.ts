import { Router } from 'express';
import {
  getVariationsController,
  purchaseDataController,
  verifySmileEmailController,
  queryTransactionStatusController,
  getDataTestInfoController,
} from '../../controllers/test/vtpass.data.test.controller';

const vtpassDataTestRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Test - VTpass Data
 *   description: Test endpoints for VTpass Data Subscription API integration
 */

/**
 * @swagger
 * /api/v2/test/vtpass/data/info:
 *   get:
 *     summary: Get Data Test Information and Documentation
 *     tags: [V2 - Test - VTpass Data]
 *     description: |
 *       Get comprehensive information about available data providers, test scenarios, and endpoints.
 *     responses:
 *       200:
 *         description: Test information retrieved successfully
 */
vtpassDataTestRouter.get('/info', getDataTestInfoController);

/**
 * @swagger
 * /api/v2/test/vtpass/data/variations:
 *   get:
 *     summary: Get Data Plans/Variations for a Provider
 *     tags: [V2 - Test - VTpass Data]
 *     description: |
 *       Get available data subscription plans for a provider.
 *       Supports: MTN, GLO, Airtel, 9mobile, GLO SME, Smile
 *     parameters:
 *       - in: query
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [mtn, glo, airtel, etisalat, glo-sme, smile]
 *         description: Data provider
 *     responses:
 *       200:
 *         description: Variations retrieved successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassDataTestRouter.get('/variations', getVariationsController);

/**
 * @swagger
 * /api/v2/test/vtpass/data/purchase:
 *   post:
 *     summary: Purchase Data Bundle
 *     tags: [V2 - Test - VTpass Data]
 *     description: |
 *       Purchase data subscription for any provider.
 *       Supports: MTN, GLO, Airtel, 9mobile, GLO SME, Smile
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
 *                 enum: [mtn, glo, airtel, etisalat, glo-sme, smile]
 *                 example: "mtn"
 *               billersCode:
 *                 type: string
 *                 example: "08011111111"
 *                 description: Phone number or account ID for subscription
 *               variation_code:
 *                 type: string
 *                 example: "mtn-10mb-100"
 *                 description: Variation code from variations endpoint
 *               phone:
 *                 type: string
 *                 example: "08011111111"
 *                 description: Phone number of customer/recipient
 *               amount:
 *                 type: number
 *                 description: Optional amount (ignored, variation_code determines price)
 *               request_id:
 *                 type: string
 *                 description: Optional custom request ID
 *     responses:
 *       200:
 *         description: Purchase request completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassDataTestRouter.post('/purchase', purchaseDataController);

/**
 * @swagger
 * /api/v2/test/vtpass/data/verify-smile-email:
 *   post:
 *     summary: Verify Smile Email (Smile Only)
 *     tags: [V2 - Test - VTpass Data]
 *     description: |
 *       Verify Smile email and get account list before purchasing.
 *       Sandbox email: tester@sandbox.com
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "tester@sandbox.com"
 *     responses:
 *       200:
 *         description: Smile email verification completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassDataTestRouter.post('/verify-smile-email', verifySmileEmailController);

/**
 * @swagger
 * /api/v2/test/vtpass/data/query:
 *   post:
 *     summary: Query Data Transaction Status
 *     tags: [V2 - Test - VTpass Data]
 *     description: |
 *       Query the status of a data transaction using request_id.
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
vtpassDataTestRouter.post('/query', queryTransactionStatusController);

export default vtpassDataTestRouter;

