/**
 * Crypto Transaction Controller
 * 
 * Handles HTTP requests for crypto transactions
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import cryptoTransactionService from '../../services/crypto/crypto.transaction.service';
import { prisma } from '../../utils/prisma';
import { randomBytes } from 'crypto';

/**
 * Get user's crypto transactions
 * If IS_MOCK_DATA is enabled and user has no transactions, returns mock data
 */
export const getUserCryptoTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = (req as any).user;
    if (!authenticatedUser || !authenticatedUser.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const userId = authenticatedUser.id;
    const transactionType = req.query.type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Check if mock data is enabled
    const isMockDataEnabled = process.env.IS_MOCK_DATA === 'true' || process.env.ENABLE_MOCK_CRYPTO_TRANSACTIONS === 'true';

    // Get real transactions first
    const result = await cryptoTransactionService.getUserTransactions(
      userId,
      transactionType as any,
      limit,
      offset
    );

    // If mock data is enabled and user has no transactions, return mock data
    if (isMockDataEnabled && result.total === 0) {
      const mockData = await generateMockTransactions(userId);
      return new ApiResponse(
        200,
        {
          ...mockData,
          isMockData: true,
        },
        'Mock crypto transactions retrieved successfully (user has no transactions)'
      ).send(res);
    }

    return new ApiResponse(
      200,
      {
        ...result,
        isMockData: false,
      },
      'Crypto transactions retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getUserCryptoTransactionsController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve crypto transactions'));
  }
};

/**
 * Get transaction by ID
 */
export const getCryptoTransactionByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = (req as any).user;
    if (!authenticatedUser || !authenticatedUser.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const userId = authenticatedUser.id;
    const { transactionId } = req.params;

    const transaction = await cryptoTransactionService.getTransactionById(transactionId, userId);

    if (!transaction) {
      return next(ApiError.notFound('Transaction not found'));
    }

    return new ApiResponse(
      200,
      transaction,
      'Transaction retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getCryptoTransactionByIdController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve transaction'));
  }
};

/**
 * Get transactions for a specific virtual account
 * If IS_MOCK_DATA is enabled and account has no transactions, returns mock data
 */
export const getVirtualAccountTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = (req as any).user;
    if (!authenticatedUser || !authenticatedUser.id) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const userId = authenticatedUser.id;
    const virtualAccountId = parseInt(req.params.virtualAccountId);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (isNaN(virtualAccountId)) {
      return next(ApiError.badRequest('Invalid virtual account ID'));
    }

    // Verify virtual account belongs to user
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: { id: virtualAccountId, userId },
      include: {
        walletCurrency: true,
      },
    });

    if (!virtualAccount) {
      return next(ApiError.notFound('Virtual account not found'));
    }

    // Check if mock data is enabled
    const isMockDataEnabled = process.env.IS_MOCK_DATA === 'true' || process.env.ENABLE_MOCK_CRYPTO_TRANSACTIONS === 'true';

    // Get real transactions first
    const result = await cryptoTransactionService.getVirtualAccountTransactions(
      userId,
      virtualAccountId,
      limit,
      offset
    );

    // If mock data is enabled and account has no transactions, return mock data
    if (isMockDataEnabled && result.total === 0) {
      const mockData = await generateMockTransactions(userId);
      // Filter mock transactions to match the virtual account's currency/blockchain if possible
      const filteredMockData = {
        transactions: mockData.transactions.map((tx: any) => ({
          ...tx,
          currency: virtualAccount.currency,
          blockchain: virtualAccount.blockchain,
          cryptocurrencyType: virtualAccount.walletCurrency?.name || virtualAccount.currency,
        })),
        total: mockData.transactions.length,
        limit,
        offset,
      };
      
      return new ApiResponse(
        200,
        {
          ...filteredMockData,
          isMockData: true,
        },
        'Mock crypto transactions retrieved successfully (account has no transactions)'
      ).send(res);
    }

    return new ApiResponse(
      200,
      {
        ...result,
        isMockData: false,
      },
      'Virtual account transactions retrieved successfully'
    ).send(res);
  } catch (error: any) {
    console.error('Error in getVirtualAccountTransactionsController:', error);
    return next(ApiError.internal(error.message || 'Failed to retrieve transactions'));
  }
};

/**
 * Helper function to generate mock transactions
 */
async function generateMockTransactions(userId: number) {
  // Get user's virtual accounts
  const virtualAccounts = await prisma.virtualAccount.findMany({
    where: { userId },
    include: {
      walletCurrency: true,
    },
    take: 1,
  });

  if (virtualAccounts.length === 0) {
    // Return default mock data if no virtual account
    const now = new Date();
    const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    return {
      transactions: [
        {
          id: `mock_buy_${randomBytes(8).toString('hex')}`,
          transactionType: 'BUY',
          status: 'successful',
          currency: 'BTC',
          blockchain: 'bitcoin',
          tradeType: 'Crypto Buy',
          cryptocurrencyType: 'Bitcoin',
          from: '0xe5090999686896869FeJkld90',
          to: 'Your Crypto wallet',
          amount: '100BTC',
          amountUsd: '$100.00',
          amountNaira: 'NGN200,000.00',
          rate: 'NGN118/$',
          txHash: `0x${randomBytes(32).toString('hex')}`,
          createdAt: new Date(pastDate.getTime() + 1 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(pastDate.getTime() + 1 * 24 * 60 * 60 * 1000),
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    };
  }

  const virtualAccount = virtualAccounts[0];
  const now = new Date();
  const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

  // Generate mock transactions based on the transaction detail screens
  const mockTransactions = [
    // Crypto Buy
    {
      id: `mock_buy_${randomBytes(8).toString('hex')}`,
      transactionType: 'BUY',
      status: 'successful',
      currency: virtualAccount.currency,
      blockchain: virtualAccount.blockchain,
      tradeType: 'Crypto Buy',
      cryptocurrencyType: virtualAccount.walletCurrency?.name || virtualAccount.currency,
      from: '0xe5090999686896869FeJkld90',
      to: 'Your Crypto wallet',
      amount: `100${virtualAccount.currency}`,
      amountUsd: '$100.00',
      amountNaira: 'NGN200,000.00',
      rate: 'NGN118/$',
      txHash: `0x${randomBytes(32).toString('hex')}`,
      createdAt: new Date(pastDate.getTime() + 1 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(pastDate.getTime() + 1 * 24 * 60 * 60 * 1000),
    },
    // Crypto Sell
    {
      id: `mock_sell_${randomBytes(8).toString('hex')}`,
      transactionType: 'SELL',
      status: 'successful',
      currency: virtualAccount.currency,
      blockchain: virtualAccount.blockchain,
      tradeType: 'Crypto Sell',
      cryptocurrencyType: virtualAccount.walletCurrency?.name || virtualAccount.currency,
      from: 'Your Crypto wallet',
      to: 'Tercescrow',
      amount: `100${virtualAccount.currency}`,
      amountUsd: '$100.00',
      youReceived: 'NGN200,000.00',
      rate: 'NGN118/$',
      txHash: `0x${randomBytes(32).toString('hex')}`,
      createdAt: new Date(pastDate.getTime() + 2 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(pastDate.getTime() + 2 * 24 * 60 * 60 * 1000),
    },
    // Crypto Transfer/Send
    {
      id: `mock_send_${randomBytes(8).toString('hex')}`,
      transactionType: 'SEND',
      status: 'successful',
      currency: virtualAccount.currency,
      blockchain: virtualAccount.blockchain,
      tradeType: 'Crypto Transfer',
      cryptocurrencyType: virtualAccount.walletCurrency?.name || virtualAccount.currency,
      from: '0xe5090999686896869FeJkld90',
      to: '0xe5090999686896869FeJkld90',
      amount: `100${virtualAccount.currency}`,
      amountUsd: '$100.00',
      amountNaira: 'NGN200,000.00',
      rate: 'NGN118/$',
      txHash: `0x${randomBytes(32).toString('hex')}`,
      createdAt: new Date(pastDate.getTime() + 3 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(pastDate.getTime() + 3 * 24 * 60 * 60 * 1000),
    },
    // Crypto Deposit/Receive
    {
      id: `mock_receive_${randomBytes(8).toString('hex')}`,
      transactionType: 'RECEIVE',
      status: 'successful',
      currency: virtualAccount.currency,
      blockchain: virtualAccount.blockchain,
      tradeType: 'Crypto Deposit',
      cryptocurrencyType: virtualAccount.walletCurrency?.name || virtualAccount.currency,
      from: '0xe5090999686896869FeJkld90',
      to: 'Your Crypto wallet',
      amount: `100${virtualAccount.currency}`,
      amountUsd: '$100.00',
      amountNaira: 'NGN200,000.00',
      rate: 'NGN118/$',
      txHash: `0x${randomBytes(32).toString('hex')}`,
      confirmations: 12,
      createdAt: new Date(pastDate.getTime() + 4 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(pastDate.getTime() + 4 * 24 * 60 * 60 * 1000),
    },
  ];

  return {
    transactions: mockTransactions,
    total: mockTransactions.length,
    limit: 50,
    offset: 0,
  };
}

