/**
 * Gas Estimation Controller (Testing)
 * 
 * Handles gas fee estimation testing endpoints
 */

import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { ethereumGasService } from '../../services/ethereum/ethereum.gas.service';
import { ethereumBalanceService } from '../../services/ethereum/ethereum.balance.service';
import { prisma } from '../../utils/prisma';

/**
 * Get current gas price
 * GET /api/testing/gas/price
 */
export const getGasPriceController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { testnet } = req.query;
    const useTestnet = testnet === 'true' || testnet === '1';

    const gasPrice = await ethereumGasService.getGasPrice(useTestnet);

    return res.status(200).json(
      new ApiResponse(200, {
        gasPrice: {
          wei: gasPrice.wei,
          gwei: gasPrice.gwei,
        },
        network: useTestnet ? 'ethereum-sepolia' : 'ethereum-mainnet',
      }, 'Gas price retrieved successfully')
    );
  } catch (error: any) {
    console.error('Error in getGasPriceController:', error);
    return next(ApiError.internal(error.message || 'Failed to get gas price'));
  }
};

/**
 * Estimate gas fee for a transaction
 * POST /api/testing/gas/estimate
 */
export const estimateGasFeeController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { from, to, amount, testnet } = req.body;

    // Validate required fields
    if (!from || !to || !amount) {
      return next(ApiError.badRequest('Missing required fields: from, to, amount'));
    }

    // Validate address format
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethAddressRegex.test(from)) {
      return next(ApiError.badRequest('Invalid from address format'));
    }
    if (!ethAddressRegex.test(to)) {
      return next(ApiError.badRequest('Invalid to address format'));
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return next(ApiError.badRequest('Amount must be a positive number'));
    }

    const useTestnet = testnet === true || testnet === 'true' || testnet === '1';

    // Get gas fee estimate
    const estimate = await ethereumGasService.estimateGasFee(
      from,
      to,
      amount.toString(),
      useTestnet
    );

    // Format the response
    const formattedEstimate = ethereumGasService.formatGasEstimate(estimate);

    return res.status(200).json(
      new ApiResponse(200, {
        ...formattedEstimate,
        transaction: {
          from,
          to,
          amount: amount.toString(),
          network: useTestnet ? 'ethereum-sepolia' : 'ethereum-mainnet',
        },
      }, 'Gas fee estimated successfully')
    );
  } catch (error: any) {
    console.error('Error in estimateGasFeeController:', error);
    
    if (error.message.includes('Invalid') || error.message.includes('format')) {
      return next(ApiError.badRequest(error.message));
    }
    
    return next(ApiError.internal(error.message || 'Failed to estimate gas fee'));
  }
};

/**
 * Check Ethereum address balance
 * GET /api/testing/balance/check
 * Checks both native ETH and USDT balances automatically
 */
export const checkAddressBalanceController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { address, testnet } = req.query;

    // Validate address
    if (!address || typeof address !== 'string') {
      return next(ApiError.badRequest('Address is required'));
    }

    // Validate address format
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethAddressRegex.test(address)) {
      return next(ApiError.badRequest('Invalid Ethereum address format'));
    }

    const useTestnet = testnet === 'true' || testnet === '1';

    // Get USDT token info from database
    const usdtCurrency = await prisma.walletCurrency.findFirst({
      where: {
        currency: 'USDT',
        blockchain: 'ethereum',
      },
    });

    console.log('USDT Currency from DB:', JSON.stringify(usdtCurrency, null, 2));

    if (!usdtCurrency || !usdtCurrency.contractAddress) {
      return next(ApiError.badRequest('USDT contract address not configured in database. Please contact support.'));
    }

    console.log('Checking balances for address:', address);
    console.log('USDT Contract Address:', usdtCurrency.contractAddress);
    console.log('USDT Decimals:', usdtCurrency.decimals);
    console.log('Testnet:', useTestnet);

    // Check both ETH and USDT balances in parallel
    const [ethBalance, usdtBalance] = await Promise.all([
      ethereumBalanceService.getETHBalance(address, useTestnet),
      ethereumBalanceService.getERC20Balance(
        usdtCurrency.contractAddress,
        address,
        usdtCurrency.decimals || 6,
        useTestnet
      ),
    ]);

    console.log('ETH Balance result:', ethBalance);
    console.log('USDT Balance result:', usdtBalance);

    const balanceData = {
      address,
      network: useTestnet ? 'ethereum-sepolia' : 'ethereum-mainnet',
      balances: {
        eth: {
          type: 'Native ETH',
          balance: ethBalance,
          symbol: 'ETH',
        },
        usdt: {
          type: 'ERC-20 Token',
          balance: usdtBalance,
          symbol: usdtCurrency.symbol || 'USDT',
          name: usdtCurrency.name || 'Tether USD',
          contractAddress: usdtCurrency.contractAddress.toLowerCase(),
          decimals: usdtCurrency.decimals || 6,
        },
      },
    };

    return res.status(200).json(
      new ApiResponse(200, balanceData, 'Address balances retrieved successfully')
    );
  } catch (error: any) {
    console.error('Error in checkAddressBalanceController:', error);
    
    if (error.message.includes('Invalid') || error.message.includes('format')) {
      return next(ApiError.badRequest(error.message));
    }
    
    return next(ApiError.internal(error.message || 'Failed to check address balance'));
  }
};

