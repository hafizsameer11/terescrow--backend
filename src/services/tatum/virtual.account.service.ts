/**
 * Virtual Account Service
 * 
 * Handles virtual account creation and management
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';
import { randomUUID } from 'crypto';

class VirtualAccountService {
  /**
   * Keep only one USDC variant for frontend display: ERC-20 / Ethereum.
   */
  private isAllowedUsdcAccount(account: {
    currency: string;
    blockchain: string;
    walletCurrency?: { blockchainName?: string | null } | null;
  }) {
    const currency = (account.currency || '').toUpperCase();
    if (currency !== 'USDC') return true;

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
   * Create virtual accounts for a user (all supported currencies)
   */
  async createVirtualAccountsForUser(userId: number) {
    try {
      // Get all supported wallet currencies (both native and tokens)
      // Token currencies like USDT, USDC will share addresses with their base blockchain
      const walletCurrencies = await prisma.walletCurrency.findMany({
        // Create virtual accounts for all currencies (native and tokens)
        // Address sharing logic is handled in deposit.address.service.ts
      });

      const createdAccounts = [];

      for (const currency of walletCurrencies) {
        try {
          // Check if virtual account already exists
          const existing = await prisma.virtualAccount.findFirst({
            where: {
              userId,
              currency: currency.currency,
              blockchain: currency.blockchain,
            },
          });

          if (existing) {
            console.log(`Virtual account for ${currency.currency} already exists for user ${userId}`);
            createdAccounts.push(existing);
            continue;
          }

          // Generate our own accountId (UUID)
          const accountId = randomUUID();
          const accountCode = `user_${userId}_${currency.currency}`;

          // Create virtual account in our own system (not in Tatum)
          const virtualAccount = await prisma.virtualAccount.create({
            data: {
              userId,
              blockchain: currency.blockchain,
              currency: currency.currency,
              customerId: String(userId), // Use userId as customerId
              accountId: accountId,
              accountCode: accountCode,
              active: true,
              frozen: false,
              accountBalance: '0',
              availableBalance: '0',
              accountingCurrency: 'USD',
              currencyId: currency.id,
            },
          });

          createdAccounts.push(virtualAccount);
          console.log(`Virtual account created for user ${userId}, currency: ${currency.currency}`);
        } catch (error: any) {
          console.error(
            `Error creating virtual account for ${currency.currency}:`,
            error.message
          );
          // Continue with other currencies even if one fails
        }
      }

      return createdAccounts;
    } catch (error: any) {
      console.error(`Error creating virtual accounts for user ${userId}:`, error);
      throw new Error(`Failed to create virtual accounts: ${error.message}`);
    }
  }

  /**
   * Get user's virtual accounts
   */
  async getUserVirtualAccounts(userId: number) {
    const accounts = await prisma.virtualAccount.findMany({
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
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return accounts.filter((account) => this.isAllowedUsdcAccount(account));
  }

  /**
   * Get virtual account by ID
   */
  async getVirtualAccountById(accountId: string) {
    return await prisma.virtualAccount.findUnique({
      where: { accountId },
      include: {
        walletCurrency: true,
        depositAddresses: true,
      },
    });
  }

  /**
   * Update virtual account balance from Tatum
   * Note: Since we're not using Tatum virtual accounts, this method is kept for compatibility
   * but balance updates should be handled through webhook processing or manual updates
   */
  async updateBalanceFromTatum(accountId: string) {
    try {
      const account = await this.getVirtualAccountById(accountId);
      if (!account) {
        throw new Error('Virtual account not found');
      }

      // Since we're not using Tatum virtual accounts, we can't fetch balance from Tatum
      // Balance updates should be handled through webhook processing or manual updates
      console.log(`Balance update requested for account ${accountId}, but Tatum account doesn't exist`);
      
      // Return the current account without updating
      return account;
    } catch (error: any) {
      console.error(`Error updating balance for account ${accountId}:`, error);
      throw new Error(`Failed to update balance: ${error.message}`);
    }
  }
}

export default new VirtualAccountService();

