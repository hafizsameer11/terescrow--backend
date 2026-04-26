import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import profitLedgerService from '../profit/profit.ledger.service';

/**
 * Fiat Wallet Service
 * Handles wallet credit/debit operations
 */
class FiatWalletService {
  private async recordProfitForFiatTransaction(transactionId: string) {
    const tx = await prisma.fiatTransaction.findUnique({ where: { id: transactionId } });
    if (!tx) return;

    const type = (tx.type || '').toUpperCase().trim();
    const map: Record<string, string> = {
      DEPOSIT: 'DEPOSIT',
      WITHDRAW: 'WITHDRAWAL',
      WITHDRAWAL: 'WITHDRAWAL',
      BILL_PAYMENT: 'BILL_PAYMENTS',
      BILLPAYMENT: 'BILL_PAYMENTS',
      BILL: 'BILL_PAYMENTS',
    };
    const transactionType = map[type] || type || 'DEPOSIT';

    await profitLedgerService.record({
      sourceTransactionType: 'FIAT_TRANSACTION',
      sourceTransactionId: tx.id,
      transactionType,
      asset: tx.currency,
      service: type.startsWith('BILL') ? tx.billType || 'bill_payment' : undefined,
      amount: tx.amount.toString(),
      amountNgn: tx.totalAmount.toString(),
      meta: {
        fiatTransactionType: tx.type,
        walletId: tx.walletId,
        status: tx.status,
      },
    });
  }

  /**
   * Get or create user's fiat wallet for a currency
   */
  async getOrCreateWallet(userId: number, currency: string) {
    let wallet = await prisma.fiatWallet.findUnique({
      where: {
        userId_currency: {
          userId,
          currency: currency.toUpperCase(),
        },
      },
    });

    if (!wallet) {
      // Check if this is the first wallet (make it primary)
      const existingWallets = await prisma.fiatWallet.count({
        where: { userId },
      });

      wallet = await prisma.fiatWallet.create({
        data: {
          userId,
          currency: currency.toUpperCase(),
          balance: 0,
          isPrimary: existingWallets === 0,
          status: 'active',
        },
      });
    }

    return wallet;
  }

  /**
   * Get wallet by ID
   */
  async getWalletById(walletId: string) {
    return prisma.fiatWallet.findUnique({
      where: { id: walletId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });
  }

  /**
   * Get user's wallets
   */
  async getUserWallets(userId: number) {
    return prisma.fiatWallet.findMany({
      where: { userId, status: 'active' },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  /**
   * Credit wallet (add funds)
   */
  async creditWallet(
    walletId: string,
    amount: number,
    transactionId: string,
    description?: string
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // Get wallet with lock
      const wallet = await tx.fiatWallet.findUnique({
        where: { id: walletId },
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = new Decimal(balanceBefore).plus(amount);

      // Update wallet balance
      await tx.fiatWallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter },
      });

      // Update transaction
      await tx.fiatTransaction.update({
        where: { id: transactionId },
        data: {
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      return {
        walletId,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        amount: amount.toString(),
      };
    });

    await this.recordProfitForFiatTransaction(transactionId);
    return result;
  }

  /**
   * Debit wallet (subtract funds)
   */
  async debitWallet(
    walletId: string,
    amount: number,
    transactionId: string,
    description?: string
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // Get wallet with lock
      const wallet = await tx.fiatWallet.findUnique({
        where: { id: walletId },
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = new Decimal(balanceBefore).minus(amount);

      // Check if sufficient balance
      if (balanceAfter.lessThan(0)) {
        throw new Error('Insufficient balance');
      }

      // Update wallet balance
      await tx.fiatWallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter },
      });

      // Update transaction
      await tx.fiatTransaction.update({
        where: { id: transactionId },
        data: {
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      return {
        walletId,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        amount: amount.toString(),
      };
    });

    await this.recordProfitForFiatTransaction(transactionId);
    return result;
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletId: string) {
    const wallet = await prisma.fiatWallet.findUnique({
      where: { id: walletId },
      select: { balance: true, currency: true },
    });

    return wallet ? {
      balance: wallet.balance.toString(),
      currency: wallet.currency,
    } : null;
  }

  /**
   * Get user's wallet overview
   */
  async getWalletOverview(userId: number) {
    const wallets = await this.getUserWallets(userId);

    const totalBalance = wallets.reduce((sum, wallet) => {
      return sum + parseFloat(wallet.balance.toString());
    }, 0);

    return {
      wallets,
      totalBalance,
      currency: wallets[0]?.currency || 'NGN',
    };
  }
}

// Export singleton instance
export const fiatWalletService = new FiatWalletService();

