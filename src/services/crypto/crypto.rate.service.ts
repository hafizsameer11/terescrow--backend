/**
 * Crypto Rate Service
 * 
 * Handles crypto trade rates management (buy, sell, swap, send, receive)
 * with USD amount-based tiers and history logging
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export type TransactionType = 'BUY' | 'SELL' | 'SWAP' | 'SEND' | 'RECEIVE';

export interface CreateCryptoRateInput {
  transactionType: TransactionType;
  minAmount: number; // USD amount
  maxAmount?: number | null; // USD amount (null for unlimited)
  rate: number; // Naira per $1
}

export interface UpdateCryptoRateInput {
  rate: number; // Naira per $1
}

class CryptoRateService {
  /**
   * Get all rates for a transaction type
   */
  async getRatesByType(transactionType: TransactionType) {
    return await prisma.cryptoRate.findMany({
      where: {
        transactionType,
        isActive: true,
      },
      orderBy: [
        { minAmount: 'asc' },
      ],
    });
  }

  /**
   * Get all rates (all transaction types)
   */
  async getAllRates() {
    const types: TransactionType[] = ['BUY', 'SELL', 'SWAP', 'SEND', 'RECEIVE'];
    const rates: { [key: string]: any[] } = {};

    for (const type of types) {
      rates[type] = await this.getRatesByType(type);
    }

    return rates;
  }

  /**
   * Get rate for a specific transaction type and USD amount
   */
  async getRateForAmount(transactionType: TransactionType, usdAmount: number) {
    const rate = await prisma.cryptoRate.findFirst({
      where: {
        transactionType,
        isActive: true,
        minAmount: { lte: usdAmount },
        OR: [
          { maxAmount: { gte: usdAmount } },
          { maxAmount: null },
        ],
      },
      orderBy: { minAmount: 'desc' }, // Get the highest tier that matches
    });

    return rate;
  }

  /**
   * Create a new rate tier
   */
  async createRate(data: CreateCryptoRateInput, changedBy?: number) {
    // Check for overlapping ranges
    const existing = await prisma.cryptoRate.findFirst({
      where: {
        transactionType: data.transactionType,
        isActive: true,
        OR: [
          {
            AND: [
              { minAmount: { lte: data.minAmount } },
              {
                OR: [
                  { maxAmount: { gte: data.minAmount } },
                  { maxAmount: null },
                ],
              },
            ],
          },
          {
            AND: [
              { minAmount: { lte: data.maxAmount || 999999999 } },
              {
                OR: [
                  { maxAmount: { gte: data.maxAmount || 999999999 } },
                  { maxAmount: null },
                ],
              },
            ],
          },
        ],
      },
    });

    if (existing) {
      throw new Error('Rate tier overlaps with existing tier');
    }

    // Create the rate
    const rate = await prisma.cryptoRate.create({
      data: {
        transactionType: data.transactionType,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount,
        rate: data.rate,
      },
    });

    // Log to history
    await prisma.cryptoRateHistory.create({
      data: {
        cryptoRateId: rate.id,
        transactionType: rate.transactionType,
        minAmount: rate.minAmount,
        maxAmount: rate.maxAmount,
        oldRate: null,
        newRate: rate.rate,
        changedBy: changedBy || null,
      },
    });

    return rate;
  }

  /**
   * Update an existing rate
   */
  async updateRate(rateId: number, data: UpdateCryptoRateInput, changedBy?: number) {
    const existing = await prisma.cryptoRate.findUnique({
      where: { id: rateId },
    });

    if (!existing) {
      throw new Error('Rate not found');
    }

    // Update the rate
    const updated = await prisma.cryptoRate.update({
      where: { id: rateId },
      data: {
        rate: data.rate,
      },
    });

    // Log to history
    await prisma.cryptoRateHistory.create({
      data: {
        cryptoRateId: updated.id,
        transactionType: updated.transactionType,
        minAmount: updated.minAmount,
        maxAmount: updated.maxAmount,
        oldRate: existing.rate,
        newRate: updated.rate,
        changedBy: changedBy || null,
      },
    });

    return updated;
  }

  /**
   * Delete/Deactivate a rate
   */
  async deleteRate(rateId: number) {
    return await prisma.cryptoRate.update({
      where: { id: rateId },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Get rate history
   */
  async getRateHistory(rateId?: number, transactionType?: TransactionType) {
    const where: any = {};
    if (rateId) {
      where.cryptoRateId = rateId;
    }
    if (transactionType) {
      where.transactionType = transactionType;
    }

    return await prisma.cryptoRateHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to last 100 changes
    });
  }
}

export default new CryptoRateService();

