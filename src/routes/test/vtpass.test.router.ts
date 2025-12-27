import { Router } from 'express';
import {
  testPurchaseController,
  testQueryController,
  testScenariosController,
  generateRequestIdController,
  getTestInfoController,
} from '../../controllers/test/vtpass.test.controller';

const vtpassTestRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Test - VTpass
 *   description: Test endpoints for VTpass MTN VTU API integration
 */

/**
 * @swagger
 * /api/v2/test/vtpass/purchase:
 *   post:
 *     summary: Test Airtime Purchase (All Providers)
 *     tags: [V2 - Test - VTpass]
 *     description: |
 *       Test endpoint for purchasing airtime via VTpass API.
 *       Supports: MTN, GLO, Airtel, 9mobile (etisalat)
 *       **Note:** This is a test endpoint. Use sandbox credentials for testing.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - phone
 *               - amount
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [mtn, glo, airtel, etisalat]
 *                 example: "mtn"
 *                 description: Service provider (mtn, glo, airtel, etisalat)
 *               phone:
 *                 type: string
 *                 pattern: '^0\d{10}$'
 *                 example: "08011111111"
 *                 description: Phone number (11 digits, starting with 0)
 *               amount:
 *                 type: number
 *                 minimum: 50
 *                 example: 100
 *                 description: Amount in NGN (minimum 50)
 *               request_id:
 *                 type: string
 *                 maxLength: 36
 *                 description: Optional custom request ID (auto-generated if not provided)
 *                 example: "2025031010146932932"
 *     responses:
 *       200:
 *         description: Purchase request completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Purchase request completed"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     code:
 *                       type: string
 *                       example: "000"
 *                     message:
 *                       type: string
 *                       example: "TRANSACTION SUCCESSFUL"
 *                     provider:
 *                       type: string
 *                       example: "MTN"
 *                       description: Provider name (MTN, GLO, AIRTEL, ETISALAT)
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         requestId:
 *                           type: string
 *                         transactionId:
 *                           type: string
 *                         status:
 *                           type: string
 *                           example: "delivered"
 *                         amount:
 *                           type: number
 *                         phone:
 *                           type: string
 *                         productName:
 *                           type: string
 *                         commission:
 *                           type: number
 *                         totalAmount:
 *                           type: number
 *                     fullResponse:
 *                       type: object
 *                       description: Complete VTpass API response
 *       400:
 *         description: Validation error (invalid provider, phone, or amount)
 *       500:
 *         description: Server error
 */
vtpassTestRouter.post('/purchase', testPurchaseController);

/**
 * @swagger
 * /api/v2/test/vtpass/query:
 *   post:
 *     summary: Test Query Transaction Status
 *     tags: [V2 - Test - VTpass]
 *     description: |
 *       Test endpoint for querying MTN airtime transaction status via VTpass API.
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
 *                 description: The request_id used when purchasing
 *     responses:
 *       200:
 *         description: Transaction query completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Transaction query completed"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     code:
 *                       type: string
 *                     message:
 *                       type: string
 *                     transaction:
 *                       type: object
 *                     fullResponse:
 *                       type: object
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassTestRouter.post('/query', testQueryController);

/**
 * @swagger
 * /api/v2/test/vtpass/test-scenarios:
 *   post:
 *     summary: Test Sandbox Scenarios
 *     tags: [V2 - Test - VTpass]
 *     description: |
 *       Test different sandbox scenarios provided by VTpass.
 *       Available scenarios: success, pending, unexpected, noResponse, timeout
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scenario
 *             properties:
 *               scenario:
 *                 type: string
 *                 enum: [success, pending, unexpected, noResponse, timeout]
 *                 example: "success"
 *                 description: |
 *                   Test scenario to execute:
 *                   - success: Returns successful response (08011111111)
 *                   - pending: Simulates pending response (201000000000)
 *                   - unexpected: Simulates unexpected response (500000000000)
 *                   - noResponse: Simulates no response (400000000000)
 *                   - timeout: Simulates timeout (300000000000)
 *               provider:
 *                 type: string
 *                 enum: [mtn, glo, airtel, etisalat]
 *                 example: "mtn"
 *                 description: Optional provider (defaults to mtn if not provided)
 *     responses:
 *       200:
 *         description: Test scenario executed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Test scenario 'success' completed"
 *                 data:
 *                   type: object
 *                   properties:
 *                     scenario:
 *                       type: string
 *                     testPhone:
 *                       type: string
 *                     description:
 *                       type: string
 *                     success:
 *                       type: boolean
 *                     code:
 *                       type: string
 *                     message:
 *                       type: string
 *                     transaction:
 *                       type: object
 *                     fullResponse:
 *                       type: object
 *       400:
 *         description: Validation error
 */
vtpassTestRouter.post('/test-scenarios', testScenariosController);

/**
 * @swagger
 * /api/v2/test/vtpass/generate-request-id:
 *   get:
 *     summary: Generate VTpass Request ID
 *     tags: [V2 - Test - VTpass]
 *     description: |
 *       Generate a valid VTpass request_id following their format requirements.
 *       Format: YYYYMMDDHHII + alphanumeric suffix
 *       Requirements:
 *       - MUST BE 12 CHARACTERS OR MORE
 *       - FIRST 12 CHARACTERS MUST BE NUMERIC
 *       - FIRST 12 CHARACTERS MUST COMPRISE OF TODAY'S DATE
 *       - Date and Time in Africa/Lagos Timezone (GMT +1)
 *       
 *       **Use this request_id when requesting live API keys from VTpass**
 *     responses:
 *       200:
 *         description: Request ID generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Request ID generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 *                       example: "202202071830YUs83meikd"
 *                     breakdown:
 *                       type: object
 *                       properties:
 *                         dateTimePart:
 *                           type: string
 *                           example: "202202071830"
 *                         suffixPart:
 *                           type: string
 *                           example: "YUs83meikd"
 *                         dateTime:
 *                           type: object
 *                           properties:
 *                             year:
 *                               type: string
 *                             month:
 *                               type: string
 *                             day:
 *                               type: string
 *                             hours:
 *                               type: string
 *                             minutes:
 *                               type: string
 *                             formatted:
 *                               type: string
 *                               example: "2022-02-07 18:30 (Lagos Time)"
 *                     format:
 *                       type: string
 *                       example: "YYYYMMDDHHII + alphanumeric suffix"
 *                     requirements:
 *                       type: object
 *                       properties:
 *                         totalLength:
 *                           type: number
 *                         dateTimeLength:
 *                           type: number
 *                         isValid:
 *                           type: boolean
 *                         timezone:
 *                           type: string
 *                           example: "Africa/Lagos (GMT +1)"
 *                     note:
 *                       type: string
 *                       example: "Use this request_id when requesting live API keys from VTpass"
 */
vtpassTestRouter.get('/generate-request-id', generateRequestIdController);

/**
 * @swagger
 * /api/v2/test/vtpass/info:
 *   get:
 *     summary: Get Test Information and Documentation
 *     tags: [V2 - Test - VTpass]
 *     description: |
 *       Get comprehensive information about available providers, test scenarios, and endpoints.
 *       This is useful for understanding how to test the VTpass airtime integration.
 *     responses:
 *       200:
 *         description: Test information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Test information retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     providers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "mtn"
 *                           name:
 *                             type: string
 *                             example: "MTN"
 *                           serviceID:
 *                             type: string
 *                             example: "mtn"
 *                           description:
 *                             type: string
 *                             example: "MTN Nigeria Airtime VTU"
 *                     testScenarios:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           scenario:
 *                             type: string
 *                             example: "success"
 *                           phone:
 *                             type: string
 *                             example: "08011111111"
 *                           description:
 *                             type: string
 *                     endpoints:
 *                       type: object
 *                       description: Available test endpoints with examples
 *                     environment:
 *                       type: object
 *                       properties:
 *                         sandbox:
 *                           type: string
 *                         live:
 *                           type: string
 *                         current:
 *                           type: string
 *                     notes:
 *                       type: array
 *                       items:
 *                         type: string
 */
vtpassTestRouter.get('/info', getTestInfoController);

export default vtpassTestRouter;

