import { Router } from 'express';
import {
  getVariationsController,
  verifyJambProfileController,
  purchaseEducationController,
  queryTransactionStatusController,
  getEducationTestInfoController,
} from '../../controllers/test/vtpass.education.test.controller';

const vtpassEducationTestRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Test - VTpass Education
 *   description: Test endpoints for VTpass Education Services API integration (WAEC Registration, WAEC Result Checker, JAMB)
 */

/**
 * @swagger
 * /api/v2/test/vtpass/education/info:
 *   get:
 *     summary: Get Education Test Information and Documentation
 *     tags: [V2 - Test - VTpass Education]
 *     description: |
 *       Get comprehensive information about available education services, test scenarios, and endpoints.
 *     responses:
 *       200:
 *         description: Test information retrieved successfully
 */
vtpassEducationTestRouter.get('/info', getEducationTestInfoController);

/**
 * @swagger
 * /api/v2/test/vtpass/education/variations:
 *   get:
 *     summary: Get Service Variations/Plans
 *     tags: [V2 - Test - VTpass Education]
 *     description: |
 *       Get available plans/variations for an education service.
 *       Supports: WAEC Registration, WAEC Result Checker, JAMB
 *     parameters:
 *       - in: query
 *         name: service
 *         required: true
 *         schema:
 *           type: string
 *           enum: [waec-registration, waec, jamb]
 *         description: Education service type
 *     responses:
 *       200:
 *         description: Variations retrieved successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassEducationTestRouter.get('/variations', getVariationsController);

/**
 * @swagger
 * /api/v2/test/vtpass/education/verify-jamb:
 *   post:
 *     summary: Verify JAMB Profile ID
 *     tags: [V2 - Test - VTpass Education]
 *     description: |
 *       Verify JAMB Profile ID before purchasing JAMB PIN.
 *       Sandbox Profile ID: 0123456789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - profileId
 *               - variationCode
 *             properties:
 *               profileId:
 *                 type: string
 *                 example: "0123456789"
 *                 description: "JAMB Profile ID (sandbox: 0123456789)"
 *               variationCode:
 *                 type: string
 *                 enum: [utme-mock, utme-no-mock]
 *                 example: "utme-mock"
 *                 description: Variation code from variations endpoint
 *     responses:
 *       200:
 *         description: JAMB profile verification completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassEducationTestRouter.post('/verify-jamb', verifyJambProfileController);

/**
 * @swagger
 * /api/v2/test/vtpass/education/purchase:
 *   post:
 *     summary: Purchase Education Service
 *     tags: [V2 - Test - VTpass Education]
 *     description: |
 *       Purchase education service (WAEC Registration, WAEC Result Checker, or JAMB PIN).
 *       **Note:** This is a test endpoint. Use sandbox credentials for testing.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - service
 *               - variation_code
 *               - phone
 *             properties:
 *               service:
 *                 type: string
 *                 enum: [waec-registration, waec, jamb]
 *                 example: "waec-registration"
 *                 description: Education service type
 *               variation_code:
 *                 type: string
 *                 example: "waec-registraion"
 *                 description: Variation code from variations endpoint
 *               phone:
 *                 type: string
 *                 pattern: '^0\d{10}$'
 *                 example: "08011111111"
 *                 description: Customer phone number (11 digits, starting with 0)
 *               profileId:
 *                 type: string
 *                 example: "0123456789"
 *                 description: Required for JAMB only - Profile ID
 *               quantity:
 *                 type: number
 *                 example: 1
 *                 description: Quantity to purchase (defaults to 1)
 *               amount:
 *                 type: number
 *                 description: Optional amount (variation_code determines price)
 *               request_id:
 *                 type: string
 *                 description: Optional custom request ID
 *     responses:
 *       200:
 *         description: Education service purchase completed
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
vtpassEducationTestRouter.post('/purchase', purchaseEducationController);

/**
 * @swagger
 * /api/v2/test/vtpass/education/query:
 *   post:
 *     summary: Query Education Transaction Status
 *     tags: [V2 - Test - VTpass Education]
 *     description: |
 *       Query the status of an education transaction using request_id.
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
vtpassEducationTestRouter.post('/query', queryTransactionStatusController);

export default vtpassEducationTestRouter;

