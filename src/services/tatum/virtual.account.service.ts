/**
 * Virtual Account Service
 * 
 * Handles virtual account creation and management
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';

class VirtualAccountService {
  /**
   * Create virtual accounts for a user (all supported currencies)
   */
  async createVirtualAccountsForUser(userId: number) {
    try {
      // Get all supported wallet currencies
      const walletCurrencies = await prisma.walletCurrency.findMany({
        where: { isToken: false }, // Only create for native currencies initially
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

          // Create virtual account via Tatum API
          const accountData = await tatumService.createVirtualAccount({
            currency: currency.currency,
            customer: {
              externalId: String(userId),
            },
            accountCode: `user_${userId}_${currency.currency}`,
            accountingCurrency: 'USD',
            // xpub is commented out as per the analysis document
            // xpub: masterWallet?.xpub,
          });

          // Store in database
          const virtualAccount = await prisma.virtualAccount.create({
            data: {
              userId,
              blockchain: currency.blockchain,
              currency: currency.currency,
              customerId: accountData.customerId || null,
              accountId: accountData.id,
              accountCode: `user_${userId}_${currency.currency}`,
              active: accountData.active,
              frozen: accountData.frozen,
              accountBalance: accountData.balance.accountBalance,
              availableBalance: accountData.balance.availableBalance,
              accountingCurrency: accountData.accountingCurrency || 'USD',
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
    return await prisma.virtualAccount.findMany({
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
   */
  async updateBalanceFromTatum(accountId: string) {
    try {
      const account = await this.getVirtualAccountById(accountId);
      if (!account) {
        throw new Error('Virtual account not found');
      }

      // Fetch latest balance from Tatum
      const tatumAccount = await tatumService.getVirtualAccount(accountId);

      // Update in database
      return await prisma.virtualAccount.update({
        where: { accountId },
        data: {
          accountBalance: tatumAccount.balance.accountBalance,
          availableBalance: tatumAccount.balance.availableBalance,
          active: tatumAccount.active,
          frozen: tatumAccount.frozen,
        },
      });
    } catch (error: any) {
      console.error(`Error updating balance for account ${accountId}:`, error);
      throw new Error(`Failed to update balance: ${error.message}`);
    }
  }
}

export default new VirtualAccountService();

