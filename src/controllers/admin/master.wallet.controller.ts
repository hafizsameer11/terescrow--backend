/**
 * Master Wallet Controller
 * 
 * Handles master wallet creation and management
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import masterWalletService from '../../services/tatum/master.wallet.service';
import tatumService from '../../services/tatum/tatum.service';
import depositAddressService from '../../services/tatum/deposit.address.service';
import * as masterWalletAdminService from '../../services/admin/master.wallet.admin.service';
import * as depositSweepService from '../../services/admin/deposit.sweep.service';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Create a new master wallet
 * POST /api/admin/master-wallet
 */
export const createMasterWalletController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', errors.array());
    }

    const { blockchain, endpoint } = req.body;

    if (!blockchain || !endpoint) {
      throw ApiError.badRequest('Blockchain and endpoint are required');
    }

    const wallet = await masterWalletService.createMasterWallet(blockchain, endpoint);

    return new ApiResponse(201, { wallet }, 'Master wallet created successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to create master wallet'));
  }
};

/**
 * Get all master wallets
 * GET /api/admin/master-wallet
 */
export const getAllMasterWalletsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const wallets = await masterWalletService.getAllMasterWallets();

    // Remove sensitive data before sending
    const safeWallets = wallets.map((wallet) => ({
      id: wallet.id,
      blockchain: wallet.blockchain,
      address: wallet.address,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    }));

    return new ApiResponse(200, { wallets: safeWallets }, 'Master wallets retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to retrieve master wallets'));
  }
};

/**
 * Create master wallets for all supported blockchains
 * POST /api/admin/master-wallet/create-all
 */
export const createAllMasterWalletsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await masterWalletService.createAllMasterWallets();

    // Remove sensitive data from results
    const safeResults = result.results.map((item: any) => ({
      blockchain: item.blockchain,
      status: item.status,
      wallet: item.wallet
        ? {
            id: item.wallet.id,
            blockchain: item.wallet.blockchain,
            address: item.wallet.address,
            createdAt: item.wallet.createdAt,
            updatedAt: item.wallet.updatedAt,
          }
        : null,
    }));

    return new ApiResponse(200, {
      summary: {
        created: result.success,
        existing: result.existing,
        errorCount: result.errorCount,
      },
      results: safeResults,
      errors: result.errors,
    }, 'Master wallets creation completed').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to create master wallets'));
  }
};

/**
 * Update all existing master wallets with missing address and private key
 * POST /api/admin/master-wallet/update-all
 */
export const updateAllMasterWalletsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await masterWalletService.updateAllMasterWallets();

    // Remove sensitive data from results
    const safeResults = result.results.map((item: any) => ({
      blockchain: item.blockchain,
      status: item.status,
      wallet: item.wallet
        ? {
            id: item.wallet.id,
            blockchain: item.wallet.blockchain,
            address: item.wallet.address,
            createdAt: item.wallet.createdAt,
            updatedAt: item.wallet.updatedAt,
          }
        : null,
      error: item.error || undefined,
    }));

    return new ApiResponse(200, {
      summary: {
        total: result.total,
        updated: result.updated,
        errors: result.errors,
      },
      results: safeResults,
    }, 'Master wallets update completed').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to update master wallets'));
  }
};

/**
 * Get balances for all master wallets
 * GET /api/admin/master-wallet/balances
 */
export const getMasterWalletsBalancesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const wallets = await masterWalletService.getAllMasterWallets();

    // Get balance for each master wallet address using Tatum
    const walletsWithBalances = await Promise.all(
      wallets.map(async (wallet) => {
        let balance = null;
        let error = null;

        if (wallet.address) {
          try {
            // Get only native balance, no tokens for master wallets
            balance = await tatumService.getAddressBalance(wallet.blockchain, wallet.address, false);
          } catch (err: any) {
            error = err.message || 'Failed to get balance';
            console.error(`Error getting balance for ${wallet.blockchain}:`, error);
          }
        }

        return {
          id: wallet.id,
          blockchain: wallet.blockchain,
          address: wallet.address,
          balance: balance || null,
          error: error || null,
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
        };
      })
    );

    return new ApiResponse(
      200,
      { wallets: walletsWithBalances },
      'Master wallet balances retrieved successfully'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to retrieve master wallet balances'));
  }
};

/**
 * Get deposit address for a user
 * GET /api/admin/master-wallet/deposit-address/:userId/:currency/:blockchain
 */
export const getDepositAddressController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = parseInt(req.params.userId);
    const { currency, blockchain } = req.params;

    if (isNaN(userId)) {
      return next(ApiError.badRequest('Invalid user ID'));
    }

    if (!currency || !blockchain) {
      return next(ApiError.badRequest('Currency and blockchain are required'));
    }

    const depositAddress = await depositAddressService.getDepositAddress(
      userId,
      currency,
      blockchain
    );

    return new ApiResponse(
      200,
      { depositAddress },
      'Deposit address retrieved successfully'
    ).send(res);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return next(ApiError.notFound(error.message));
    }
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal(error.message || 'Failed to retrieve deposit address'));
  }
};

/**
 * Get balance summary per wallet id (tercescrow, yellowcard, palmpay)
 * GET /api/admin/master-wallet/balances/summary
 */
export const getMasterWalletBalanceSummaryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const summary = await masterWalletAdminService.getMasterWalletBalanceSummary();
    return new ApiResponse(200, { summary }, 'Balance summary retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get balance summary'));
  }
};/**
 * Get assets list (optional walletId)
 * GET /api/admin/master-wallet/assets
 */
export const getMasterWalletAssetsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const walletId = req.query.walletId as string | undefined;
    const assets = await masterWalletAdminService.getMasterWalletAssets(walletId);
    return new ApiResponse(200, { assets }, 'Assets retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get assets'));
  }
};/**
 * Get master wallet transactions
 * GET /api/admin/master-wallet/transactions
 */
export const getMasterWalletTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const assetSymbol = req.query.assetSymbol as string | undefined;
    const walletId = req.query.walletId as string | undefined;
    const transactions = await masterWalletAdminService.getMasterWalletTransactions(
      assetSymbol,
      walletId
    );
    return new ApiResponse(200, { transactions }, 'Transactions retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get transactions'));
  }
};

/**
 * Preview master wallet disburse (fee breakdown; UTXO deducts fee from amount).
 * POST /api/admin/master-wallet/send/estimate
 */
export const getMasterWalletMaxDebitController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const network = String(req.query.network ?? '');
    const symbol = String(req.query.symbol ?? '');
    if (!network || !symbol) {
      return next(ApiError.badRequest('network and symbol query params are required'));
    }
    const { estimateMasterWalletMaxDebit } = await import(
      '../../services/admin/master.wallet.outbound.service'
    );
    const max = await estimateMasterWalletMaxDebit({ network, symbol });
    if (!max) {
      return new ApiResponse(200, null, 'Max debit not applicable for this asset').send(res);
    }
    return new ApiResponse(200, max, 'Max disburse amount').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get max disburse amount'));
  }
};

export const postMasterWalletSendEstimateController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { address, amountCrypto, network, symbol } = req.body;
    if (!address || !symbol || !network || amountCrypto == null || amountCrypto === '') {
      return next(
        ApiError.badRequest('address, symbol, network, and amountCrypto are required')
      );
    }
    const estimate = await masterWalletAdminService.estimateMasterWalletSend({
      address: String(address),
      amountCrypto: String(amountCrypto),
      network: String(network),
      symbol: String(symbol),
    });
    return new ApiResponse(200, estimate, 'Disbursement estimate').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to estimate disbursement'));
  }
};

/**
 * Send from master wallet
 * POST /api/admin/master-wallet/send
 */
export const postMasterWalletSendController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { address, amountCrypto, amountDollar, network, symbol, vendorId } = req.body;
    if (!address || !symbol || !network) {
      return next(ApiError.badRequest('address, symbol, and network are required'));
    }
    const result = await masterWalletAdminService.createMasterWalletSend({
      address,
      amountCrypto,
      amountDollar,
      network,
      symbol,
      vendorId,
    });
    if (!result.success) {
      return next(
        ApiError.badRequest(
          result.error ?? 'Disburse failed',
          { txId: result.txId, status: result.status }
        )
      );
    }
    return new ApiResponse(
      200,
      {
        success: true,
        txId: result.txId,
        txHash: result.txHash,
        status: result.status ?? 'successful',
        requestedAmount: result.requestedAmount,
        recipientAmount: result.recipientAmount,
        networkFee: result.networkFee,
      },
      result.txHash ? 'Disbursement broadcast on-chain' : 'Disbursement recorded'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Send failed'));
  }
};

function staffUser(req: Request) {
  const user = (req as any).user;
  if (!user?.id) return null;
  return { id: user.id as number, role: String(user.role || 'unknown') };
}

/**
 * GET /api/admin/master-wallet/sweep/preview?currency=&blockchain=
 */
export const getDepositSweepPreviewController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currency = String(req.query.currency || '').trim();
    const blockchain = req.query.blockchain ? String(req.query.blockchain) : undefined;
    const target = String(req.query.target || 'master').toLowerCase() === 'vendor' ? 'vendor' : 'master';
    const vendorId = req.query.vendorId ? parseInt(String(req.query.vendorId), 10) : undefined;
    if (!currency) return next(ApiError.badRequest('currency is required'));
    const preview = await depositSweepService.getDepositSweepPreview({
      currency,
      blockchain,
      target,
      vendorId: Number.isFinite(vendorId) ? vendorId : undefined,
    });
    return new ApiResponse(200, preview, 'Sweep preview retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to load sweep preview'));
  }
};

/**
 * POST /api/admin/master-wallet/sweep — dryRun:true for preview only
 */
export const postDepositSweepController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const staff = staffUser(req);
    if (!staff) return next(ApiError.unauthorized('Authentication required'));

    const currency = String(req.body?.currency || '').trim();
    const blockchain = req.body?.blockchain ? String(req.body.blockchain) : undefined;
    const dryRun = req.body?.dryRun === true || req.body?.dryRun === 'true';
    const target = String(req.body?.target || 'master').toLowerCase() === 'vendor' ? 'vendor' : 'master';
    const vendorId = req.body?.vendorId != null ? parseInt(String(req.body.vendorId), 10) : undefined;
    if (!currency) return next(ApiError.badRequest('currency is required'));

    const result = await depositSweepService.executeDepositSweep({
      currency,
      blockchain,
      target,
      vendorId: Number.isFinite(vendorId) ? vendorId : undefined,
      dryRun,
      performedByUserId: staff.id,
      performedByRole: staff.role,
    });
    return new ApiResponse(
      200,
      result,
      dryRun ? 'Sweep dry-run completed' : 'Sweep batch completed'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Sweep failed'));
  }
};

/**
 * Swap on master wallet
 * POST /api/admin/master-wallet/swap
 */
export const postMasterWalletSwapController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fromSymbol, toSymbol, fromAmount, toAmount, receivingWallet } = req.body;
    if (!fromSymbol || !toSymbol || !fromAmount || !toAmount) {
      return next(ApiError.badRequest('fromSymbol, toSymbol, fromAmount, toAmount are required'));
    }
    const result = await masterWalletAdminService.createMasterWalletSwap({
      fromSymbol,
      toSymbol,
      fromAmount,
      toAmount,
      receivingWallet,
    });
    if (!result.success) {
      return next(ApiError.badRequest(result.error ?? 'Swap failed'));
    }
    return new ApiResponse(200, { success: true, txId: result.txId }, 'Swap initiated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Swap failed'));
  }
};