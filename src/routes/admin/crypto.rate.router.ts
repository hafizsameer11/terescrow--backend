/**
 * Crypto Rate Routes (Admin)
 * 
 * Routes for managing crypto trade rates
 */

import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import {
  getAllRatesController,
  getRatesByTypeController,
  createRateController,
  updateRateController,
  deleteRateController,
  getRateHistoryController,
} from '../../controllers/admin/crypto.rate.controller';

const cryptoRateRouter = express.Router();

/**
 * @swagger
 * /api/admin/crypto/rates:
 *   get:
 *     summary: Get all crypto rates
 *     tags: [Admin - Crypto Rates]
 *     description: Get all rates for all transaction types (BUY, SELL, SWAP, SEND, RECEIVE)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rates retrieved successfully
 */
cryptoRateRouter.get('/rates', authenticateUser, getAllRatesController);

/**
 * @swagger
 * /api/admin/crypto/rates/{type}:
 *   get:
 *     summary: Get rates for a transaction type
 *     tags: [Admin - Crypto Rates]
 *     description: Get all rates for a specific transaction type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [BUY, SELL, SWAP, SEND, RECEIVE]
 *     responses:
 *       200:
 *         description: Rates retrieved successfully
 */
cryptoRateRouter.get('/rates/:type', authenticateUser, getRatesByTypeController);

/**
 * @swagger
 * /api/admin/crypto/rates:
 *   post:
 *     summary: Create a new rate tier
 *     tags: [Admin - Crypto Rates]
 *     description: Create a new rate tier for a transaction type with USD amount range
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionType
 *               - minAmount
 *               - rate
 *             properties:
 *               transactionType:
 *                 type: string
 *                 enum: [BUY, SELL, SWAP, SEND, RECEIVE]
 *               minAmount:
 *                 type: number
 *                 description: Minimum USD amount for this tier
 *               maxAmount:
 *                 type: number
 *                 description: Maximum USD amount (null for unlimited)
 *               rate:
 *                 type: number
 *                 description: Rate in Naira per $1
 *     responses:
 *       201:
 *         description: Rate created successfully
 */
cryptoRateRouter.post('/rates', authenticateUser, createRateController);

/**
 * @swagger
 * /api/admin/crypto/rates/{id}:
 *   put:
 *     summary: Update a rate
 *     tags: [Admin - Crypto Rates]
 *     description: Update the rate value for a specific rate tier
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rate
 *             properties:
 *               rate:
 *                 type: number
 *                 description: New rate in Naira per $1
 *     responses:
 *       200:
 *         description: Rate updated successfully
 */
cryptoRateRouter.put('/rates/:id', authenticateUser, updateRateController);

/**
 * @swagger
 * /api/admin/crypto/rates/{id}:
 *   delete:
 *     summary: Delete a rate
 *     tags: [Admin - Crypto Rates]
 *     description: Deactivate a rate tier
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Rate deleted successfully
 */
cryptoRateRouter.delete('/rates/:id', authenticateUser, deleteRateController);

/**
 * @swagger
 * /api/admin/crypto/rates/history:
 *   get:
 *     summary: Get rate history
 *     tags: [Admin - Crypto Rates]
 *     description: Get rate change history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: rateId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: transactionType
 *         schema:
 *           type: string
 *           enum: [BUY, SELL, SWAP, SEND, RECEIVE]
 *     responses:
 *       200:
 *         description: Rate history retrieved successfully
 */
cryptoRateRouter.get('/rates/history', authenticateUser, getRateHistoryController);

export default cryptoRateRouter;

