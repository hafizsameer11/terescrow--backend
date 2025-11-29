/**
 * Virtual Account Controller (Customer)
 * 
 * Handles customer-facing virtual account endpoints
 */

import { Request, Response, NextFunction } from 'express';
import virtualAccountService from '../../services/tatum/virtual.account.service';
import depositAddressService from '../../services/tatum/deposit.address.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Get user's virtual accounts
 * GET /api/v2/wallets/virtual-accounts
 */
export const getUserVirtualAccountsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = req.body._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;
    const accounts = await virtualAccountService.getUserVirtualAccounts(userId);

    // Format response
    const formattedAccounts = accounts.map((account) => ({
      id: account.id,
      currency: account.currency,
      blockchain: account.blockchain,
      accountId: account.accountId,
      active: account.active,
      frozen: account.frozen,
      accountBalance: account.accountBalance,
      availableBalance: account.availableBalance,
      depositAddress: account.depositAddresses[0]?.address || null,
      walletCurrency: account.walletCurrency,
      createdAt: account.createdAt,
    }));

    return new ApiResponse(
      200,
      { accounts: formattedAccounts },
      'Virtual accounts retrieved successfully'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to retrieve virtual accounts'));
  }
};

/**
 * Get deposit address for a currency
 * GET /api/v2/wallets/deposit-address/:currency/:blockchain
 */
export const getDepositAddressController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authenticatedUser = req.body._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;
    const { currency, blockchain } = req.params;

    if (!currency || !blockchain) {
      throw ApiError.badRequest('Currency and blockchain are required');
    }

    const depositAddress = await depositAddressService.getDepositAddress(
      userId,
      currency,
      blockchain
    );

    return new ApiResponse(200, depositAddress, 'Deposit address retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return next(ApiError.notFound(error.message));
    }
    next(ApiError.internal('Failed to retrieve deposit address'));
  }
};

