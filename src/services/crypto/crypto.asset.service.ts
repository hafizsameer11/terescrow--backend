/**
 * Crypto Asset Service
 * 
 * Handles user crypto asset/balance retrieval with USD and Naira conversion
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

class CryptoAssetService {
  /**
   * Get all user assets (virtual accounts) with balances in USD and Naira
   * 
   * Note: Transaction history is not included yet. This will be added when
   * crypto transaction models (Send, Receive, Swap, Sell, Buy) are created.
   * The structure is designed to be easily extended with transaction history.
   */
  async getUserAssets(userId: number) {
    try {
      // Get all virtual accounts for the user with wallet currency details
      const virtualAccounts = await prisma.virtualAccount.findMany({
        where: { userId },
        include: {
          walletCurrency: true,
          depositAddresses: {
            select: {
              id: true,
              address: true,
              blockchain: true,
              currency: true,
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Transform to asset format with USD and Naira conversion
      const assets = virtualAccounts.map((account) => {
        const balance = new Decimal(account.availableBalance || '0');
        const usdPrice = account.walletCurrency?.price 
          ? new Decimal(account.walletCurrency.price.toString())
          : new Decimal('0');
        const nairaPrice = account.walletCurrency?.nairaPrice 
          ? new Decimal(account.walletCurrency.nairaPrice.toString())
          : new Decimal('0');

        // Calculate USD value
        const usdValue = balance.mul(usdPrice);

        // Calculate Naira value (if nairaPrice is set, use it; otherwise use USD price * a default rate)
        // For now, if nairaPrice is 0, we'll calculate from USD price
        let nairaValue: Decimal;
        if (nairaPrice.gt(0)) {
          nairaValue = balance.mul(nairaPrice);
        } else {
          // Fallback: if nairaPrice is not set, we can't calculate Naira value
          nairaValue = new Decimal('0');
        }

        return {
          id: account.id,
          currency: account.currency,
          blockchain: account.blockchain,
          symbol: account.walletCurrency?.symbol || null, // wallet_symbols/xxx.png format
          name: account.walletCurrency?.name || account.currency,
          balance: balance.toString(),
          balanceUsd: usdValue.toString(),
          balanceNaira: nairaValue.toString(),
          price: usdPrice.toString(),
          nairaPrice: nairaPrice.toString(),
          depositAddress: account.depositAddresses[0]?.address || null,
          active: account.active,
          frozen: account.frozen,
          // Note: Transaction history will be added here later when crypto transaction models are created
          // Example: transactions: [] or transactionHistory: []
        };
      });

      // Calculate totals
      const totalUsd = assets.reduce(
        (sum, asset) => sum.plus(new Decimal(asset.balanceUsd)),
        new Decimal('0')
      );
      const totalNaira = assets.reduce(
        (sum, asset) => sum.plus(new Decimal(asset.balanceNaira)),
        new Decimal('0')
      );

      return {
        assets,
        totals: {
          totalUsd: totalUsd.toString(),
          totalNaira: totalNaira.toString(),
        },
        count: assets.length,
        // Note: Transaction history will be added later when crypto transaction models are created
        // This structure is ready to be extended with transaction history per asset
      };
    } catch (error: any) {
      console.error(`Error getting user assets for user ${userId}:`, error);
      throw new Error(`Failed to get user assets: ${error.message}`);
    }
  }

  /**
   * Get single asset (virtual account) detail by ID
   */
  async getAssetDetail(userId: number, virtualAccountId: number) {
    try {
      // Get virtual account with all related data
      const account = await prisma.virtualAccount.findFirst({
        where: {
          id: virtualAccountId,
          userId, // Ensure it belongs to the user
        },
        include: {
          walletCurrency: true,
          depositAddresses: {
            select: {
              id: true,
              address: true,
              blockchain: true,
              currency: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!account) {
        throw new Error('Asset not found');
      }

      // Calculate balances
      const balance = new Decimal(account.availableBalance || '0');
      const accountBalance = new Decimal(account.accountBalance || '0');
      const usdPrice = account.walletCurrency?.price 
        ? new Decimal(account.walletCurrency.price.toString())
        : new Decimal('0');
      const nairaPrice = account.walletCurrency?.nairaPrice 
        ? new Decimal(account.walletCurrency.nairaPrice.toString())
        : new Decimal('0');

      // Calculate USD values
      const availableBalanceUsd = balance.mul(usdPrice);
      const accountBalanceUsd = accountBalance.mul(usdPrice);

      // Calculate Naira values
      let availableBalanceNaira: Decimal;
      let accountBalanceNaira: Decimal;
      if (nairaPrice.gt(0)) {
        availableBalanceNaira = balance.mul(nairaPrice);
        accountBalanceNaira = accountBalance.mul(nairaPrice);
      } else {
        availableBalanceNaira = new Decimal('0');
        accountBalanceNaira = new Decimal('0');
      }

      return {
        id: account.id,
        currency: account.currency,
        blockchain: account.blockchain,
        symbol: account.walletCurrency?.symbol || null, // wallet_symbols/xxx.png format
        name: account.walletCurrency?.name || account.currency,
        accountCode: account.accountCode,
        customerId: account.customerId,
        accountId: account.accountId,
        // Balances
        availableBalance: balance.toString(),
        accountBalance: accountBalance.toString(),
        availableBalanceUsd: availableBalanceUsd.toString(),
        accountBalanceUsd: accountBalanceUsd.toString(),
        availableBalanceNaira: availableBalanceNaira.toString(),
        accountBalanceNaira: accountBalanceNaira.toString(),
        // Prices
        price: usdPrice.toString(),
        nairaPrice: nairaPrice.toString(),
        // Status
        active: account.active,
        frozen: account.frozen,
        // Deposit addresses
        depositAddresses: account.depositAddresses,
        primaryDepositAddress: account.depositAddresses[0]?.address || null,
        // Wallet currency details
        walletCurrency: account.walletCurrency ? {
          id: account.walletCurrency.id,
          tokenType: account.walletCurrency.tokenType,
          contractAddress: account.walletCurrency.contractAddress,
          decimals: account.walletCurrency.decimals,
          isToken: account.walletCurrency.isToken,
          blockchainName: account.walletCurrency.blockchainName,
        } : null,
        // Timestamps
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        // Note: Transaction history will be added here later when crypto transaction models are created
        // Example: transactions: [] or transactionHistory: []
      };
    } catch (error: any) {
      console.error(`Error getting asset detail for user ${userId}, account ${virtualAccountId}:`, error);
      throw new Error(`Failed to get asset detail: ${error.message}`);
    }
  }

  /**
   * Get deposit address for a currency and blockchain
   */
  async getDepositAddress(userId: number, currency: string, blockchain: string) {
    try {
      const virtualAccount = await prisma.virtualAccount.findFirst({
        where: {
          userId,
          currency,
          blockchain,
        },
        include: {
          depositAddresses: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          walletCurrency: true,
        },
      });

      if (!virtualAccount || !virtualAccount.depositAddresses.length) {
        throw new Error('Deposit address not found');
      }

      const depositAddress = virtualAccount.depositAddresses[0];
      const balance = new Decimal(virtualAccount.availableBalance || '0');
      const usdPrice = virtualAccount.walletCurrency?.price 
        ? new Decimal(virtualAccount.walletCurrency.price.toString())
        : new Decimal('0');
      const nairaPrice = virtualAccount.walletCurrency?.nairaPrice 
        ? new Decimal(virtualAccount.walletCurrency.nairaPrice.toString())
        : new Decimal('0');

      return {
        address: depositAddress.address,
        blockchain: depositAddress.blockchain,
        currency: depositAddress.currency,
        virtualAccountId: virtualAccount.id,
        balance: balance.toString(),
        balanceUsd: balance.mul(usdPrice).toString(),
        balanceNaira: nairaPrice.gt(0) ? balance.mul(nairaPrice).toString() : '0',
        symbol: virtualAccount.walletCurrency?.symbol || null,
      };
    } catch (error: any) {
      console.error(`Error getting deposit address for user ${userId}:`, error);
      throw new Error(`Failed to get deposit address: ${error.message}`);
    }
  }

  /**
   * Get transaction history for a specific asset (virtual account)
   * 
   * TODO: This method will be implemented when crypto transaction models are created.
   * It will fetch transactions (Send, Receive, Swap, Sell, Buy) for a specific virtual account.
   * 
   * @param userId - User ID
   * @param virtualAccountId - Virtual account ID
   * @param limit - Number of transactions to return (default: 50)
   * @param offset - Pagination offset (default: 0)
   */
  async getAssetTransactionHistory(
    userId: number,
    virtualAccountId: number,
    limit: number = 50,
    offset: number = 0
  ) {
    // TODO: Implement when crypto transaction models are created
    // This will query SendTransaction, ReceiveTransaction, SwapTransaction, etc.
    // and return formatted transaction history for the asset
    
    return {
      transactions: [],
      total: 0,
      limit,
      offset,
      message: 'Transaction history will be available when crypto transaction models are implemented',
    };
  }
}

export default new CryptoAssetService();

