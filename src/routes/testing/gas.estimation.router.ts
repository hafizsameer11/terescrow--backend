/**
 * Gas Estimation Testing Routes
 * 
 * Routes for testing gas fee estimation functionality
 */

import express from 'express';
import {
  getGasPriceController,
  estimateGasFeeController,
  checkAddressBalanceController,
} from '../../controllers/testing/gas.estimation.controller';
import { body, query } from 'express-validator';

const gasEstimationRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Testing - Gas Estimation
 *   description: Gas fee estimation testing endpoints for Ethereum transactions
 */

/**
 * @swagger
 * /api/testing/gas/price:
 *   get:
 *     summary: Get current gas price
 *     tags: [Testing - Gas Estimation]
 *     x-order: 0
 *     description: |
 *       Retrieves the current gas price from the Ethereum network.
 *       Returns gas price in both wei and Gwei units.
 *     parameters:
 *       - in: query
 *         name: testnet
 *         schema:
 *           type: string
 *           enum: [true, false, 1, 0]
 *         description: Whether to use testnet, defaults to false
 *         example: false
 *     responses:
 *       200:
 *         description: Gas price retrieved successfully
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
 *                   example: "Gas price retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     gasPrice:
 *                       type: object
 *                       properties:
 *                         wei:
 *                           type: string
 *                           description: Gas price in wei
 *                           example: "20000000000"
 *                         gwei:
 *                           type: string
 *                           description: Gas price in Gwei
 *                           example: "20.00"
 *                     network:
 *                       type: string
 *                       description: Network used
 *                       example: "ethereum-mainnet"
 *       500:
 *         description: Internal server error
 */
gasEstimationRouter.get(
  '/price',
  [
    query('testnet').optional().isIn(['true', 'false', '1', '0']),
  ],
  getGasPriceController
);

/**
 * @swagger
 * /api/testing/gas/estimate:
 *   post:
 *     summary: Estimate gas fee for a transaction
 *     tags: [Testing - Gas Estimation]
 *     x-order: 1
 *     description: |
 *       Estimates the gas fee required for an Ethereum transaction.
 *       Uses Tatum V4 API to estimate gas limit and gas price.
 *       
 *       Returns:
 *       - gasLimit: Estimated gas units required
 *       - gasPrice: Current gas price (wei and Gwei)
 *       - totalFeeEth: Total transaction fee in ETH
 *       - safe/standard/fast: Alternative gas price tiers (if available)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - from
 *               - to
 *               - amount
 *             properties:
 *               from:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: Sender Ethereum address
 *                 example: "0x0974557990949352a20369fbe6210b3ee64####"
 *               to:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: Recipient Ethereum address
 *                 example: "0xcdfeaf3b4a7beb3cc1fafb7ea34dc9a40b61####"
 *               amount:
 *                 type: number
 *                 description: Amount to send in ETH
 *                 example: 0.001
 *               testnet:
 *                 type: boolean
 *                 description: Whether to use testnet, defaults to false
 *                 example: false
 *     responses:
 *       200:
 *         description: Gas fee estimated successfully
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
 *                   example: "Gas fee estimated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     gasLimit:
 *                       type: string
 *                       description: Estimated gas units required
 *                       example: "21000"
 *                     gasPrice:
 *                       type: object
 *                       properties:
 *                         wei:
 *                           type: string
 *                           example: "20000000000"
 *                         gwei:
 *                           type: string
 *                           example: "20.00"
 *                     totalFeeEth:
 *                       type: string
 *                       description: Total transaction fee in ETH
 *                       example: "0.00042"
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         from:
 *                           type: string
 *                         to:
 *                           type: string
 *                         amount:
 *                           type: string
 *                         network:
 *                           type: string
 *       400:
 *         description: Bad request (validation error)
 *       500:
 *         description: Internal server error
 */
gasEstimationRouter.post(
  '/estimate',
  [
    body('from')
      .notEmpty()
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Invalid Ethereum address format for from'),
    body('to')
      .notEmpty()
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Invalid Ethereum address format for to'),
    body('amount')
      .notEmpty()
      .isFloat({ min: 0.00000001 })
      .withMessage('Amount must be a positive number'),
    body('testnet').optional().isBoolean(),
  ],
  estimateGasFeeController
);

/**
 * @swagger
 * /api/testing/gas/balance/check:
 *   get:
 *     summary: Check Ethereum address balance (ETH and USDT)
 *     tags: [Testing - Gas Estimation]
 *     x-order: 2
 *     description: |
 *       Checks the balance of an Ethereum address for both native ETH and USDT token.
 *       Automatically uses USDT contract address from database.
 *       Returns both balances in a single response.
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Ethereum address to check balance for
 *         example: "0x0974557990949352a20369fbe6210b3ee64####"
 *       - in: query
 *         name: testnet
 *         schema:
 *           type: string
 *           enum: [true, false, 1, 0]
 *         description: Whether to use testnet, defaults to false
 *         example: false
 *     responses:
 *       200:
 *         description: Address balances retrieved successfully
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
 *                   example: "Address balances retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       description: Ethereum address checked
 *                     network:
 *                       type: string
 *                       description: Network used
 *                       example: "ethereum-mainnet"
 *                     balances:
 *                       type: object
 *                       description: Balance information for both ETH and USDT
 *                       properties:
 *                         eth:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               example: "Native ETH"
 *                             balance:
 *                               type: string
 *                               example: "1.5"
 *                             symbol:
 *                               type: string
 *                               example: "ETH"
 *                         usdt:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               example: "ERC-20 Token"
 *                             balance:
 *                               type: string
 *                               example: "1000.5"
 *                             symbol:
 *                               type: string
 *                               example: "USDT"
 *                             name:
 *                               type: string
 *                               example: "Tether USD"
 *                             contractAddress:
 *                               type: string
 *                               example: "0xdac17f958d2ee523a2206206994597c13d831ec7"
 *                             decimals:
 *                               type: integer
 *                               example: 6
 *       400:
 *         description: Bad request (validation error)
 *       500:
 *         description: Internal server error
 */
gasEstimationRouter.get(
  '/balance/check',
  [
    query('address')
      .notEmpty()
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Invalid Ethereum address format'),
    query('testnet').optional().isIn(['true', 'false', '1', '0']),
  ],
  checkAddressBalanceController
);

export default gasEstimationRouter;

