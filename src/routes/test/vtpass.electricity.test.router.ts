import { Router } from 'express';
import {
  verifyMeterController,
  purchaseElectricityController,
  queryTransactionStatusController,
  getElectricityTestInfoController,
} from '../../controllers/test/vtpass.electricity.test.controller';

const vtpassElectricityTestRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Test - VTpass Electricity
 *   description: Test endpoints for VTpass Electricity Bill Payment API integration
 */

/**
 * @swagger
 * /api/v2/test/vtpass/electricity/info:
 *   get:
 *     summary: Get Electricity Test Information and Documentation
 *     tags: [V2 - Test - VTpass Electricity]
 *     description: |
 *       Get comprehensive information about available electricity providers, test scenarios, and endpoints.
 *     responses:
 *       200:
 *         description: Test information retrieved successfully
 */
vtpassElectricityTestRouter.get('/info', getElectricityTestInfoController);

/**
 * @swagger
 * /api/v2/test/vtpass/electricity/verify:
 *   post:
 *     summary: Verify Meter Number
 *     tags: [V2 - Test - VTpass Electricity]
 *     description: |
 *       Verify meter number before purchasing electricity.
 *       Supports: IKEDC, EKEDC, KEDCO, PHED, JED
 *       Sandbox prepaid meter: 1111111111111
 *       Sandbox postpaid meter: 1010101010101
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - meterNumber
 *               - meterType
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [ikedc, ekedc, kedco, phed, jed]
 *                 example: "ikedc"
 *                 description: Electricity provider
 *               meterNumber:
 *                 type: string
 *                 example: "1111111111111"
 *                 description: "Meter number (sandbox: 1111111111111 for prepaid, 1010101010101 for postpaid)"
 *               meterType:
 *                 type: string
 *                 enum: [prepaid, postpaid]
 *                 example: "prepaid"
 *                 description: Meter type
 *     responses:
 *       200:
 *         description: Meter verification completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassElectricityTestRouter.post('/verify', verifyMeterController);

/**
 * @swagger
 * /api/v2/test/vtpass/electricity/purchase:
 *   post:
 *     summary: Purchase Electricity (Prepaid or Postpaid)
 *     tags: [V2 - Test - VTpass Electricity]
 *     description: |
 *       Purchase electricity for prepaid (generates token) or postpaid (pays bill) meters.
 *       Supports: IKEDC, EKEDC, KEDCO, PHED, JED
 *       **Note:** This is a test endpoint. Use sandbox credentials for testing.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - meterNumber
 *               - meterType
 *               - amount
 *               - phone
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [ikedc, ekedc, kedco, phed, jed]
 *                 example: "ikedc"
 *                 description: Electricity provider
 *               meterNumber:
 *                 type: string
 *                 example: "1111111111111"
 *                 description: Meter number
 *               meterType:
 *                 type: string
 *                 enum: [prepaid, postpaid]
 *                 example: "prepaid"
 *                 description: Meter type (prepaid generates token, postpaid pays bill)
 *               amount:
 *                 type: number
 *                 example: 2000
 *                 description: Amount in Naira
 *               phone:
 *                 type: string
 *                 pattern: '^0\d{10}$'
 *                 example: "08011111111"
 *                 description: Customer phone number (11 digits, starting with 0)
 *               request_id:
 *                 type: string
 *                 description: Optional custom request ID
 *     responses:
 *       200:
 *         description: Electricity purchase completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassElectricityTestRouter.post('/purchase', purchaseElectricityController);

/**
 * @swagger
 * /api/v2/test/vtpass/electricity/query:
 *   post:
 *     summary: Query Electricity Transaction Status
 *     tags: [V2 - Test - VTpass Electricity]
 *     description: |
 *       Query the status of an electricity transaction using request_id.
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
 *                 example: "202503101430YUs83meikd"
 *     responses:
 *       200:
 *         description: Transaction query completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassElectricityTestRouter.post('/query', queryTransactionStatusController);

export default vtpassElectricityTestRouter;

