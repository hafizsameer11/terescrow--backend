/**
 * Crypto Rate Controller (Admin)
 * 
 * Handles crypto rate management endpoints
 */

import { Request, Response } from 'express';
import cryptoRateService, { TransactionType } from '../../services/crypto/crypto.rate.service';

/**
 * Get all rates (all transaction types)
 */
export async function getAllRatesController(req: Request, res: Response) {
  try {
    const rates = await cryptoRateService.getAllRates();

    return res.status(200).json({
      status: 200,
      message: 'Rates retrieved successfully',
      data: rates,
    });
  } catch (error: any) {
    console.error('Error in getAllRatesController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve rates',
    });
  }
}

/**
 * Get rates for a specific transaction type
 */
export async function getRatesByTypeController(req: Request, res: Response) {
  try {
    const { type } = req.params;
    
    if (!['BUY', 'SELL', 'SWAP', 'SEND', 'RECEIVE'].includes(type.toUpperCase())) {
      return res.status(400).json({
        status: 400,
        message: 'Invalid transaction type. Must be BUY, SELL, SWAP, SEND, or RECEIVE',
      });
    }

    const rates = await cryptoRateService.getRatesByType(type.toUpperCase() as TransactionType);

    return res.status(200).json({
      status: 200,
      message: 'Rates retrieved successfully',
      data: rates,
    });
  } catch (error: any) {
    console.error('Error in getRatesByTypeController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve rates',
    });
  }
}

/**
 * Create a new rate tier
 */
export async function createRateController(req: Request, res: Response) {
  try {
    const { transactionType, minAmount, maxAmount, rate } = req.body;
    const changedBy = (req as any).user?.id;

    if (!transactionType || minAmount === undefined || !rate) {
      return res.status(400).json({
        status: 400,
        message: 'Missing required fields: transactionType, minAmount, rate',
      });
    }

    if (!['BUY', 'SELL', 'SWAP', 'SEND', 'RECEIVE'].includes(transactionType.toUpperCase())) {
      return res.status(400).json({
        status: 400,
        message: 'Invalid transaction type',
      });
    }

    const newRate = await cryptoRateService.createRate(
      {
        transactionType: transactionType.toUpperCase() as TransactionType,
        minAmount: parseFloat(minAmount),
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        rate: parseFloat(rate),
      },
      changedBy
    );

    return res.status(201).json({
      status: 201,
      message: 'Rate created successfully',
      data: newRate,
    });
  } catch (error: any) {
    console.error('Error in createRateController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to create rate',
    });
  }
}

/**
 * Update an existing rate
 */
export async function updateRateController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { rate } = req.body;
    const changedBy = (req as any).user?.id;

    if (!rate) {
      return res.status(400).json({
        status: 400,
        message: 'Missing required field: rate',
      });
    }

    const updated = await cryptoRateService.updateRate(
      parseInt(id),
      { rate: parseFloat(rate) },
      changedBy
    );

    return res.status(200).json({
      status: 200,
      message: 'Rate updated successfully',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error in updateRateController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to update rate',
    });
  }
}

/**
 * Delete/Deactivate a rate
 */
export async function deleteRateController(req: Request, res: Response) {
  try {
    const { id } = req.params;

    await cryptoRateService.deleteRate(parseInt(id));

    return res.status(200).json({
      status: 200,
      message: 'Rate deleted successfully',
    });
  } catch (error: any) {
    console.error('Error in deleteRateController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to delete rate',
    });
  }
}

/**
 * Get rate history
 */
export async function getRateHistoryController(req: Request, res: Response) {
  try {
    const { rateId, transactionType } = req.query;

    const history = await cryptoRateService.getRateHistory(
      rateId ? parseInt(rateId as string) : undefined,
      transactionType ? (transactionType as TransactionType) : undefined
    );

    return res.status(200).json({
      status: 200,
      message: 'Rate history retrieved successfully',
      data: history,
    });
  } catch (error: any) {
    console.error('Error in getRateHistoryController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve rate history',
    });
  }
}

