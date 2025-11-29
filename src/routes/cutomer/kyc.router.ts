import { Router } from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import upload from '../../middlewares/multer.middleware';
import { getKycStatusController } from '../../controllers/customer/kyc.status.controller';
import {
  submitTier2Controller,
  getTier2StatusController,
} from '../../controllers/customer/kyc.tier2.controller';
import {
  submitTier3Controller,
  getTier3StatusController,
} from '../../controllers/customer/kyc.tier3.controller';
import {
  submitTier4Controller,
  getTier4StatusController,
} from '../../controllers/customer/kyc.tier4.controller';

const kycRouter = Router();

/**
 * @swagger
 * tags:
 *   name: V2 - KYC Management
 *   description: KYC tier verification endpoints
 */

/**
 * @swagger
 * /api/v2/kyc/status:
 *   get:
 *     summary: Get KYC status for all tiers
 *     tags: [V2 - KYC Management]
 *     description: |
 *       **V2 API** - Get KYC status for all 4 tiers with limits and verification status.
 *       Returns current tier, status for each tier (verified/pending/unverified), and transaction limits.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currentTier:
 *                   type: string
 *                   enum: [tier1, tier2, tier3, tier4]
 *                 tiers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tier:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [verified, pending, unverified]
 *                       limits:
 *                         type: object
 *                       canUpgrade:
 *                         type: boolean
 */
kycRouter.get('/status', authenticateUser, getKycStatusController);

/**
 * @swagger
 * /api/v2/kyc/tier2/submit:
 *   post:
 *     summary: Submit Tier 2 KYC verification
 *     tags: [V2 - KYC Management]
 *     description: |
 *       **V2 API** - Submit Tier 2 KYC verification.
 *       Requires Tier 1 to be verified first.
 *       Uploads: Government ID document and selfie image.
 *       An OTP will be sent to the number registered on your BVN.
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - surName
 *               - dob
 *               - address
 *               - country
 *               - nin
 *               - bvn
 *               - documentType
 *               - documentNumber
 *               - idDocument
 *               - selfie
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               surName:
 *                 type: string
 *                 example: "Doe"
 *               dob:
 *                 type: string
 *                 example: "1990-01-01"
 *               address:
 *                 type: string
 *                 example: "123 Main Street, Lagos"
 *               country:
 *                 type: string
 *                 example: "Nigeria"
 *               nin:
 *                 type: string
 *                 example: "12345678901"
 *               bvn:
 *                 type: string
 *                 example: "12345678901"
 *               documentType:
 *                 type: string
 *                 enum: [drivers_license, international_passport]
 *                 example: "international_passport"
 *               documentNumber:
 *                 type: string
 *                 example: "A12345678"
 *               idDocument:
 *                 type: string
 *                 format: binary
 *                 description: Government ID document (image)
 *               selfie:
 *                 type: string
 *                 format: binary
 *                 description: Clear selfie image
 *     responses:
 *       200:
 *         description: Tier 2 submission successful
 *       400:
 *         description: Validation error or Tier 1 not verified
 */
kycRouter.post(
  '/tier2/submit',
  authenticateUser,
  upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  submitTier2Controller
);

/**
 * @swagger
 * /api/v2/kyc/tier2/status:
 *   get:
 *     summary: Get Tier 2 submission status
 *     tags: [V2 - KYC Management]
 *     description: |
 *       **V2 API** - Get Tier 2 KYC submission status.
 *       Returns pending, approved, or rejected status with reason.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tier 2 status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tier:
 *                   type: string
 *                   example: "tier2"
 *                 status:
 *                   type: string
 *                   enum: [verified, pending, unverified]
 *                 submission:
 *                   type: object
 *                   nullable: true
 */
kycRouter.get('/tier2/status', authenticateUser, getTier2StatusController);

/**
 * @swagger
 * /api/v2/kyc/tier3/submit:
 *   post:
 *     summary: Submit Tier 3 KYC verification
 *     tags: [V2 - KYC Management]
 *     description: |
 *       **V2 API** - Submit Tier 3 KYC verification (Proof of Address).
 *       Requires Tier 2 to be verified first.
 *       Acceptable documents: Utility bill, Bank Statement (last 3 months).
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - proofOfAddress
 *             properties:
 *               proofOfAddress:
 *                 type: string
 *                 format: binary
 *                 description: Proof of address document (PDF or image)
 *     responses:
 *       200:
 *         description: Tier 3 submission successful
 *       400:
 *         description: Validation error or Tier 2 not verified
 */
kycRouter.post(
  '/tier3/submit',
  authenticateUser,
  upload.fields([{ name: 'proofOfAddress', maxCount: 1 }]),
  submitTier3Controller
);

/**
 * @swagger
 * /api/v2/kyc/tier3/status:
 *   get:
 *     summary: Get Tier 3 submission status
 *     tags: [V2 - KYC Management]
 *     description: |
 *       **V2 API** - Get Tier 3 KYC submission status.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tier 3 status retrieved
 */
kycRouter.get('/tier3/status', authenticateUser, getTier3StatusController);

/**
 * @swagger
 * /api/v2/kyc/tier4/submit:
 *   post:
 *     summary: Submit Tier 4 KYC verification
 *     tags: [V2 - KYC Management]
 *     description: |
 *       **V2 API** - Submit Tier 4 KYC verification (Proof of Funds).
 *       Requires Tier 3 to be verified first.
 *       Acceptable documents: Salary Slip, Tax Documents, Sworn Affidavit, Bank Statement (last 3 months).
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - proofOfFunds
 *             properties:
 *               proofOfFunds:
 *                 type: string
 *                 format: binary
 *                 description: Proof of funds document (PDF or image)
 *     responses:
 *       200:
 *         description: Tier 4 submission successful
 *       400:
 *         description: Validation error or Tier 3 not verified
 */
kycRouter.post(
  '/tier4/submit',
  authenticateUser,
  upload.fields([{ name: 'proofOfFunds', maxCount: 1 }]),
  submitTier4Controller
);

/**
 * @swagger
 * /api/v2/kyc/tier4/status:
 *   get:
 *     summary: Get Tier 4 submission status
 *     tags: [V2 - KYC Management]
 *     description: |
 *       **V2 API** - Get Tier 4 KYC submission status.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tier 4 status retrieved
 */
kycRouter.get('/tier4/status', authenticateUser, getTier4StatusController);

export default kycRouter;

