/**
 * Crypto Asset Service
 * 
 * Handles user crypto asset/balance retrieval with USD and Naira conversion
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';

class CryptoAssetService {
  /**
   * Keep only one USDC variant for frontend display: ERC-20 / Ethereum.
   */
  private isAllowedUsdcAccount(account: {
    currency: string;
    blockchain: string;
    walletCurrency?: { blockchainName?: string | null } | null;
  }) {
    const currency = (account.currency || '').toUpperCase();
    const isUsdc = currency === 'USDC' || currency.startsWith('USDC_');
    if (!isUsdc) return true;

    const blockchain = (account.blockchain || '').toLowerCase();
    const blockchainName = (account.walletCurrency?.blockchainName || '').toLowerCase();

    return (
      blockchain === 'ethereum' ||
      blockchain === 'eth' ||
      blockchain === 'erc20' ||
      blockchainName.includes('erc-20') ||
      blockchainName.includes('erc20') ||
      blockchainName.includes('ethereum')
    );
  }

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

      const filteredAccounts = virtualAccounts.filter((account) =>
        this.isAllowedUsdcAccount(account)
      );

      // Transform to asset format with USD and Naira conversion
      // Use balances from virtual_account table (database)
      const assets = filteredAccounts.map((account) => {
        // Use balance from virtual_account table
        const balance = new Decimal(account.availableBalance || '0');
        const usdPrice = account.walletCurrency?.price 
          ? new Decimal(account.walletCurrency.price.toString())
          : new Decimal('0');
        const nairaPrice = account.walletCurrency?.nairaPrice 
          ? new Decimal(account.walletCurrency.nairaPrice.toString())
          : new Decimal('0');

        // Calculate USD value
        const usdValue = balance.mul(usdPrice);

        // Calculate Naira value
        let nairaValue: Decimal;
        if (nairaPrice.gt(0)) {
          nairaValue = balance.mul(nairaPrice);
        } else {
          nairaValue = new Decimal('0');
        }

        return {
          id: account.id,
          currency: account.currency,
          blockchain: account.blockchain,
          symbol: account.walletCurrency?.symbol || null,
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

      // Use balance from virtual_account table (database)
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

      // Get transaction history for this virtual account
      let transactions: any[] = [];
      try {
        const transactionHistory = await this.getAssetTransactionHistory(userId, account.id, 50, 0);
        transactions = transactionHistory.transactions || [];
      } catch (error: any) {
        console.error(`Error fetching transaction history:`, error.message);
        // Continue without transactions if there's an error
      }

      return {
        id: account.id,
        currency: account.currency,
        blockchain: account.blockchain,
        symbol: account.walletCurrency?.symbol || null, // Icon path: wallet_symbols/xxx.png
        name: account.walletCurrency?.name || account.currency,
        accountCode: account.accountCode,
        customerId: account.customerId,
        accountId: account.accountId,
        // Balances (from virtual_account table)
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
        // Transaction history
        transactions: transactions,
        transactionCount: transactions.length,
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
   * Get deposit address by virtual account ID
   * This is used when user selects an asset from their assets list
   */
  async getDepositAddressByAccountId(userId: number, virtualAccountId: number) {
    try {
      const virtualAccount = await prisma.virtualAccount.findFirst({
        where: {
          id: virtualAccountId,
          userId, // Ensure it belongs to the user
        },
        include: {
          depositAddresses: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          walletCurrency: true,
        },
      });

      if (!virtualAccount) {
        throw new Error('Virtual account not found');
      }

      if (!virtualAccount.depositAddresses.length) {
        throw new Error('Deposit address not found for this account');
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
        blockchain: depositAddress.blockchain, // Blockchain of the deposit address (base blockchain)
        currency: depositAddress.currency, // Currency of the deposit address (may be base blockchain currency)
        virtualAccountId: virtualAccount.id,
        accountCurrency: virtualAccount.currency, // The currency user selected (e.g., USDT_TRON)
        accountBlockchain: virtualAccount.blockchain, // The blockchain user selected (e.g., tron)
        balance: balance.toString(),
        balanceUsd: balance.mul(usdPrice).toString(),
        balanceNaira: nairaPrice.gt(0) ? balance.mul(nairaPrice).toString() : '0',
        symbol: virtualAccount.walletCurrency?.symbol || null,
        currencyName: virtualAccount.walletCurrency?.name || virtualAccount.currency,
        // Note: For tokens on the same blockchain (e.g., USDT on Tron), 
        // the address will be the same as the native coin (TRON) because addresses are shared within blockchain groups.
        // The 'currency' field shows the address currency (TRON), while 'accountCurrency' shows what user selected (USDT_TRON)
        addressShared: depositAddress.currency !== virtualAccount.currency, // True if address is shared with other currencies
      };
    } catch (error: any) {
      console.error(`Error getting deposit address by account ID for user ${userId}:`, error);
      throw new Error(`Failed to get deposit address: ${error.message}`);
    }
  }

  /**
   * Get total crypto balance for user
   * Returns total balance in USD and Naira from all virtual accounts
   * Uses rates from wallet_currencies table
   */
  async getCryptoBalance(userId: number) {
    try {
      // Get all virtual accounts for the user with wallet currency details
      const virtualAccounts = await prisma.virtualAccount.findMany({
        where: { userId },
        include: {
          walletCurrency: true,
        },
      });

      const filteredAccounts = virtualAccounts.filter((account) =>
        this.isAllowedUsdcAccount(account)
      );

      // Calculate totals
      let totalUsd = new Decimal('0');
      let totalNaira = new Decimal('0');
      const balancesByCurrency: Array<{
        currency: string;
        blockchain: string;
        balance: string;
        balanceUsd: string;
        balanceNaira: string;
      }> = [];

      filteredAccounts.forEach((account) => {
        const balance = new Decimal(account.availableBalance || '0');
        const usdPrice = account.walletCurrency?.price 
          ? new Decimal(account.walletCurrency.price.toString())
          : new Decimal('0');
        const nairaPrice = account.walletCurrency?.nairaPrice 
          ? new Decimal(account.walletCurrency.nairaPrice.toString())
          : new Decimal('0');

        // Calculate USD value
        const usdValue = balance.mul(usdPrice);
        totalUsd = totalUsd.plus(usdValue);

        // Calculate Naira value
        let nairaValue: Decimal;
        if (nairaPrice.gt(0)) {
          nairaValue = balance.mul(nairaPrice);
          totalNaira = totalNaira.plus(nairaValue);
        } else {
          nairaValue = new Decimal('0');
        }

        // Add to breakdown
        balancesByCurrency.push({
          currency: account.currency,
          blockchain: account.blockchain,
          balance: balance.toString(),
          balanceUsd: usdValue.toString(),
          balanceNaira: nairaValue.toString(),
        });
      });

      return {
        totalBalanceUsd: totalUsd.toString(),
        totalBalanceNaira: totalNaira.toString(),
        currencyCount: filteredAccounts.length,
        balances: balancesByCurrency,
      };
    } catch (error: any) {
      console.error(`Error getting crypto balance for user ${userId}:`, error);
      throw new Error(`Failed to get crypto balance: ${error.message}`);
    }
  }

  /**
   * Get transaction history for a specific asset (virtual account)
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
    const cryptoTransactionService = (await import('./crypto.transaction.service')).default;
    return await cryptoTransactionService.getVirtualAccountTransactions(
      userId,
      virtualAccountId,
      limit,
      offset
    );
  }
}

export default new CryptoAssetService();

