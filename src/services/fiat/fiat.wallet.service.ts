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
    if (type === 'CRYPTO_BUY' || type === 'CRYPTO_SELL' || type === 'GIFT_CARD_SELL') return;
    const map: Record<string, string> = {
      DEPOSIT: 'DEPOSIT',
      WITHDRAW: 'WITHDRAWAL',
      WITHDRAWAL: 'WITHDRAWAL',
      BILL_PAYMENT: 'BILL_PAYMENTS',
      BILLPAYMENT: 'BILL_PAYMENTS',
      BILL: 'BILL_PAYMENTS',
      GIFT_CARD_SELL: 'GIFT_CARD_SELL',
      GIFT_CARD_BUY: 'GIFT_CARD_BUY',
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
   * Debit wallet (subtract funds).
   * Uses row lock + conditional update to prevent concurrent overdraft races.
   * Pass leaveTransactionPending=true for bill/payout flows that only complete after provider success.
   */
  async debitWallet(
    walletId: string,
    amount: number,
    transactionId: string,
    description?: string,
    opts?: { leaveTransactionPending?: boolean; skipTransactionUpdate?: boolean }
  ) {
    const leavePending = opts?.leaveTransactionPending === true;
    const skipTxnUpdate = opts?.skipTransactionUpdate === true;
    const result = await prisma.$transaction(async (tx) => {
      // Row lock so parallel debit/refund cannot read stale balance
      const locked = await tx.$queryRaw<
        Array<{ id: string; balance: any; status: string }>
      >`SELECT id, balance, status FROM FiatWallet WHERE id = ${walletId} FOR UPDATE`;

      const wallet = locked[0];
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (wallet.status !== 'active') {
        throw new Error('Wallet is not active');
      }

      const balanceBefore = new Decimal(wallet.balance);
      const balanceAfter = balanceBefore.minus(amount);

      if (balanceAfter.lessThan(0)) {
        throw new Error('Insufficient balance');
      }

      const updated = await tx.$executeRaw`
        UPDATE FiatWallet
        SET balance = ${balanceAfter.toFixed(2)}, updatedAt = NOW(3)
        WHERE id = ${walletId} AND balance >= ${amount}
      `;
      if (!updated) {
        throw new Error('Insufficient balance');
      }

      if (!skipTxnUpdate) {
        await tx.fiatTransaction.update({
          where: { id: transactionId },
          data: {
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfter,
            ...(leavePending
              ? {}
              : { status: 'completed', completedAt: new Date() }),
          },
        });
      }

      return {
        walletId,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        amount: amount.toString(),
      };
    });

    if (!leavePending && !skipTxnUpdate) {
      await this.recordProfitForFiatTransaction(transactionId);
    }
    return result;
  }

  /**
   * Credit wallet with row lock (safe under concurrent refunds).
   */
  async creditWalletAtomic(walletId: string, amount: number) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; balance: any; status: string }>
      >`SELECT id, balance, status FROM FiatWallet WHERE id = ${walletId} FOR UPDATE`;
      const wallet = locked[0];
      if (!wallet) throw new Error('Wallet not found');
      if (wallet.status !== 'active') throw new Error('Wallet is not active');
      const balanceBefore = new Decimal(wallet.balance);
      const balanceAfter = balanceBefore.plus(amount);
      await tx.fiatWallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter },
      });
      return {
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
      };
    });
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

    let busha: { enabled: boolean; balances?: any[]; error?: string } = { enabled: false };
    try {
      const { bushaConfig } = await import('../busha/busha.config');
      const settings = await (prisma as any).bushaConfig.findUnique({ where: { id: 1 } });
      if (bushaConfig.isConfigured() && settings?.isActive) {
        const customer = await (prisma as any).bushaCustomer.findUnique({ where: { userId } });
        if (customer) {
          const { getBushaCustomerWallet } = await import('../admin/busha.admin.service');
          const wallet = await getBushaCustomerWallet(customer.id);
          busha = {
            enabled: true,
            balances: (wallet.balances || []).map((b: any) => ({
              currency: b.currency,
              type: b.type,
              available: b.available?.amount,
              pending: b.pending?.amount,
              total: b.total?.amount,
            })),
          };
        } else {
          busha = { enabled: true, balances: [] };
        }
      }
    } catch (error: any) {
      busha = { enabled: false, error: error?.message || 'Busha wallet unavailable' };
    }

    return {
      wallets,
      totalBalance,
      currency: wallets[0]?.currency || 'NGN',
      busha,
    };
  }
}

// Export singleton instance
export const fiatWalletService = new FiatWalletService();

