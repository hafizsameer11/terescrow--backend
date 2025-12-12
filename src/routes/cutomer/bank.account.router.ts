/**
 * Bank Account Routes (Customer)
 * 
 * Routes for managing user bank accounts
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getBankAccountsController,
  getBankAccountByIdController,
  createBankAccountController,
  updateBankAccountController,
  deleteBankAccountController,
  setDefaultBankAccountController,
} from '../../controllers/customer/bank.account.controller';
import { body } from 'express-validator';

const bankAccountRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: V2 - Bank Accounts
 *   description: Bank account management endpoints
 */

/**
 * @swagger
 * /api/v2/bank-accounts:
 *   get:
 *     summary: Get all bank accounts
 *     tags: [V2 - Bank Accounts]
 *     x-order: 0
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bank accounts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Bank accounts retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     bankAccounts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           accountName:
 *                             type: string
 *                           accountNumber:
 *                             type: string
 *                           bankName:
 *                             type: string
 *                           bankCode:
 *                             type: string
 *                           isDefault:
 *                             type: boolean
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 */
bankAccountRouter.get('/', authenticateUser, getBankAccountsController);

/**
 * @swagger
 * /api/v2/bank-accounts/{id}:
 *   get:
 *     summary: Get bank account by ID
 *     tags: [V2 - Bank Accounts]
 *     x-order: 1
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bank account ID
 *     responses:
 *       200:
 *         description: Bank account retrieved successfully
 *       404:
 *         description: Bank account not found
 */
bankAccountRouter.get('/:id', authenticateUser, getBankAccountByIdController);

/**
 * @swagger
 * /api/v2/bank-accounts:
 *   post:
 *     summary: Create a new bank account
 *     tags: [V2 - Bank Accounts]
 *     x-order: 2
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - accountNumber
 *               - bankName
 *               - bankCode
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: "Qmardeen Malik"
 *               accountNumber:
 *                 type: string
 *                 example: "1239584226"
 *               bankName:
 *                 type: string
 *                 example: "Access Bank"
 *               bankCode:
 *                 type: string
 *                 example: "044"
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *                 description: Set as default account
 *     responses:
 *       201:
 *         description: Bank account created successfully
 *       400:
 *         description: Validation failed
 */
bankAccountRouter.post(
  '/',
  authenticateUser,
  [
    body('accountName').isString().notEmpty().withMessage('Account name is required'),
    body('accountNumber').isString().notEmpty().withMessage('Account number is required'),
    body('bankName').isString().notEmpty().withMessage('Bank name is required'),
    body('bankCode').isString().notEmpty().withMessage('Bank code is required'),
    body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
  ],
  createBankAccountController
);

/**
 * @swagger
 * /api/v2/bank-accounts/{id}:
 *   put:
 *     summary: Update bank account
 *     tags: [V2 - Bank Accounts]
 *     x-order: 3
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bank account ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountName:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               bankName:
 *                 type: string
 *               bankCode:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Bank account updated successfully
 *       404:
 *         description: Bank account not found
 */
bankAccountRouter.put(
  '/:id',
  authenticateUser,
  [
    body('accountName').optional().isString().notEmpty().withMessage('Account name must be a non-empty string'),
    body('accountNumber').optional().isString().notEmpty().withMessage('Account number must be a non-empty string'),
    body('bankName').optional().isString().notEmpty().withMessage('Bank name must be a non-empty string'),
    body('bankCode').optional().isString().notEmpty().withMessage('Bank code must be a non-empty string'),
    body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
  ],
  updateBankAccountController
);

/**
 * @swagger
 * /api/v2/bank-accounts/{id}:
 *   delete:
 *     summary: Delete bank account
 *     tags: [V2 - Bank Accounts]
 *     x-order: 4
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bank account ID
 *     responses:
 *       200:
 *         description: Bank account deleted successfully
 *       404:
 *         description: Bank account not found
 */
bankAccountRouter.delete('/:id', authenticateUser, deleteBankAccountController);

/**
 * @swagger
 * /api/v2/bank-accounts/{id}/set-default:
 *   put:
 *     summary: Set bank account as default
 *     tags: [V2 - Bank Accounts]
 *     x-order: 5
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bank account ID
 *     responses:
 *       200:
 *         description: Default bank account updated successfully
 *       404:
 *         description: Bank account not found
 */
bankAccountRouter.put('/:id/set-default', authenticateUser, setDefaultBankAccountController);

export default bankAccountRouter;

