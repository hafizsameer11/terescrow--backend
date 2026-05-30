/**
 * Crypto Rate Controller (Admin)
 */

import { Request, Response } from 'express';
import cryptoRateService, {
  TransactionType,
  parseAdjustmentPercent,
  roundNairaRate,
  usesPercentAdjustment,
} from '../../services/crypto/crypto.rate.service';
import {
  getCryptoDepositFeeConfig,
  updateCryptoDepositFeeConfig,
} from '../../services/crypto/crypto.deposit.fee.service';

export const CRYPTO_RATE_TRANSACTION_TYPES = [
  'BUY',
  'SELL',
  'SWAP',
  'SEND',
  'RECEIVE',
  'GIFT_CARD_BUY',
] as const;

function isValidRateTransactionType(t: string): t is TransactionType {
  return (CRYPTO_RATE_TRANSACTION_TYPES as readonly string[]).includes(t.toUpperCase());
}

export async function getAllRatesController(req: Request, res: Response) {
  try {
    const { rates, baseRates } = await cryptoRateService.getAllRates();

    return res.status(200).json({
      status: 200,
      message: 'Rates retrieved successfully',
      data: rates,
      baseRates,
    });
  } catch (error: any) {
    console.error('Error in getAllRatesController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve rates',
    });
  }
}

export async function getRatesByTypeController(req: Request, res: Response) {
  try {
    const { type } = req.params;

    if (!isValidRateTransactionType(type)) {
      return res.status(400).json({
        status: 400,
        message: `Invalid transaction type. Must be one of: ${CRYPTO_RATE_TRANSACTION_TYPES.join(', ')}`,
      });
    }

    const tx = type.toUpperCase() as TransactionType;
    const rates = await cryptoRateService.getRatesByType(tx);
    const baseRate = await cryptoRateService.getBaseRate(tx);

    return res.status(200).json({
      status: 200,
      message: 'Rates retrieved successfully',
      data: rates,
      baseRate,
    });
  } catch (error: any) {
    console.error('Error in getRatesByTypeController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve rates',
    });
  }
}

export async function setBaseRateController(req: Request, res: Response) {
  try {
    const { transactionType, baseRate } = req.body;
    const changedBy = (req as any).user?.id;

    if (!transactionType || baseRate === undefined) {
      return res.status(400).json({
        status: 400,
        message: 'Missing required fields: transactionType, baseRate',
      });
    }

    if (!isValidRateTransactionType(transactionType)) {
      return res.status(400).json({
        status: 400,
        message: `Invalid transaction type. Must be one of: BUY, SELL`,
      });
    }

    const tx = transactionType.toUpperCase() as TransactionType;
    if (!usesPercentAdjustment(tx)) {
      return res.status(400).json({
        status: 400,
        message: 'Base rate only applies to BUY and SELL',
      });
    }

    const result = await cryptoRateService.setBaseRate(tx, roundNairaRate(parseFloat(baseRate)), changedBy);

    return res.status(200).json({
      status: 200,
      message: 'Base rate updated; tier effective rates recalculated',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in setBaseRateController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to update base rate',
    });
  }
}

export async function createRateController(req: Request, res: Response) {
  try {
    const { transactionType, minAmount, maxAmount, rate, adjustmentPercent } = req.body;
    const changedBy = (req as any).user?.id;

    if (!transactionType || minAmount === undefined) {
      return res.status(400).json({
        status: 400,
        message: 'Missing required fields: transactionType, minAmount',
      });
    }

    if (!isValidRateTransactionType(transactionType)) {
      return res.status(400).json({
        status: 400,
        message: `Invalid transaction type. Must be one of: ${CRYPTO_RATE_TRANSACTION_TYPES.join(', ')}`,
      });
    }

    const tx = transactionType.toUpperCase() as TransactionType;
    const usesPercent = usesPercentAdjustment(tx);

    if (!usesPercent && rate === undefined) {
      return res.status(400).json({
        status: 400,
        message: 'Missing required field: rate',
      });
    }

    const newRate = await cryptoRateService.createRate(
      {
        transactionType: tx,
        minAmount: parseFloat(minAmount),
        maxAmount: maxAmount != null && maxAmount !== '' ? parseFloat(maxAmount) : null,
        rate: rate != null ? roundNairaRate(parseFloat(rate)) : undefined,
        adjustmentPercent:
          adjustmentPercent !== undefined
            ? parseAdjustmentPercent(adjustmentPercent)
            : undefined,
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

export async function updateRateController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { rate, adjustmentPercent } = req.body;
    const changedBy = (req as any).user?.id;

    if (rate === undefined && adjustmentPercent === undefined) {
      return res.status(400).json({
        status: 400,
        message: 'Provide rate (fixed tiers) or adjustmentPercent (BUY/SELL)',
      });
    }

    const updated = await cryptoRateService.updateRate(
      parseInt(id, 10),
      {
        rate: rate !== undefined ? roundNairaRate(parseFloat(rate)) : undefined,
        adjustmentPercent:
          adjustmentPercent !== undefined ? adjustmentPercent : undefined,
      },
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

export async function deleteRateController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await cryptoRateService.deleteRate(parseInt(id, 10));

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

export async function getRateHistoryController(req: Request, res: Response) {
  try {
    const { rateId, transactionType } = req.query;

    const history = await cryptoRateService.getRateHistory(
      rateId ? parseInt(rateId as string, 10) : undefined,
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

export async function getCryptoDepositFeeController(req: Request, res: Response) {
  try {
    const config = await getCryptoDepositFeeConfig();
    return res.status(200).json({
      status: 200,
      message: 'Crypto deposit fee config retrieved',
      data: config,
    });
  } catch (error: any) {
    console.error('Error in getCryptoDepositFeeController:', error);
    return res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve deposit fee config',
    });
  }
}

export async function updateCryptoDepositFeeController(req: Request, res: Response) {
  try {
    const { feePercent, isActive } = req.body ?? {};
    if (feePercent === undefined || feePercent === null) {
      return res.status(400).json({ status: 400, message: 'feePercent is required' });
    }

    const adminUserId = (req as any).user?.id as number | undefined;
    const config = await updateCryptoDepositFeeConfig({
      feePercent: Number(feePercent),
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      updatedByUserId: adminUserId,
    });

    return res.status(200).json({
      status: 200,
      message: 'Crypto deposit fee config updated',
      data: config,
    });
  } catch (error: any) {
    console.error('Error in updateCryptoDepositFeeController:', error);
    const status = error.message?.includes('between 0 and 100') ? 400 : 500;
    return res.status(status).json({
      status,
      message: error.message || 'Failed to update deposit fee config',
    });
  }
}
