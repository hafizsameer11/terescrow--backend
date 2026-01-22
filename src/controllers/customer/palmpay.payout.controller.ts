import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayBanks } from '../../services/palmpay/palmpay.banks.service';
import { palmpayPayout } from '../../services/palmpay/palmpay.payout.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';

/**
 * Get bank list
 * GET /api/v2/payments/palmpay/banks
 */
export const getBankListController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { businessType = 0 } = req.query;

    const banks = await palmpayBanks.queryBankList(Number(businessType));

    return res.status(200).json(
      new ApiResponse(200, banks, 'Bank list retrieved successfully')
    );
  } catch (error: any) {
    console.error('Get bank list error:', error);
    return next(ApiError.internal(error.message || 'Failed to get bank list'));
  }
};

/**
 * Verify bank account
 * POST /api/v2/payments/palmpay/verify-account
 */
export const verifyBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { bankCode, accountNumber } = req.body;

    if (!bankCode || !accountNumber) {
      return next(ApiError.badRequest('Bank code and account number are required'));
    }

    // Check if it's PalmPay account (bankCode "100033")
    if (bankCode === '100033') {
      const result = await palmpayBanks.queryAccount(accountNumber);
      return res.status(200).json(
        new ApiResponse(200, {
          accountName: result.accountName,
          accountStatus: result.accountStatus,
          isValid: result.accountStatus === 0,
        }, 'Account verified successfully')
      );
    }

    // Regular bank account
    const result = await palmpayBanks.queryBankAccount(bankCode, accountNumber);

    return res.status(200).json(
      new ApiResponse(200, {
        accountName: result.accountName,
        status: result.status,
        isValid: result.status === 'Success',
        errorMessage: result.errorMessage,
      }, 'Account verified successfully')
    );
  } catch (error: any) {
    console.error('Verify account error:', error);
    return next(ApiError.internal(error.message || 'Failed to verify account'));
  }
};

/**
 * Initiate payout (withdrawal)
 * POST /api/v2/payments/palmpay/payout/initiate
 */
export const initiatePayoutController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { amount, currency = 'NGN', bankCode, accountNumber, accountName, phoneNumber } = req.body;

    // Validate inputs
    if (!amount || amount <= 0) {
      return next(ApiError.badRequest('Amount must be greater than 0'));
    }

    if (!bankCode || !accountNumber) {
      return next(ApiError.badRequest('Bank code and account number are required'));
    }

    // Convert amount to cents
    const amountInCents = Math.round(parseFloat(amount) * 100);
    if (amountInCents < 100) {
      return next(ApiError.badRequest('Minimum amount is 1.00 NGN'));
    }

    // Get or create wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, currency);

    // Estimate fees conservatively (100 NGN or 1% of amount, whichever is higher)
    // This ensures we have enough balance even if actual fees are higher
    const amountDecimal = parseFloat(amount);
    const estimatedFeePercentage = 0.01; // 1%
    const estimatedFeeFixed = 100; // 100 NGN minimum
    const estimatedFee = Math.max(amountDecimal * estimatedFeePercentage, estimatedFeeFixed);
    const totalAmountWithFees = amountDecimal + estimatedFee;

    // Check balance including estimated fees
    const balance = await fiatWalletService.getBalance(wallet.id);
    if (!balance || parseFloat(balance.balance) < totalAmountWithFees) {
      return next(ApiError.badRequest(
        `Insufficient balance. Required: ${totalAmountWithFees.toFixed(2)} ${currency.toUpperCase()} (amount: ${amountDecimal.toFixed(2)} + estimated fees: ${estimatedFee.toFixed(2)}), Available: ${balance?.balance || '0'} ${currency.toUpperCase()}`
      ));
    }

    // Generate unique order ID
    const orderId = `payout_${uuidv4().replace(/-/g, '')}`.substring(0, 32);

    // Create transaction record
    const transaction = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        type: 'WITHDRAW',
        status: 'pending',
        currency: currency.toUpperCase(),
        amount: parseFloat(amount),
        fees: 0, // Will be updated from PalmPay response
        totalAmount: parseFloat(amount),
        description: `Withdrawal to ${accountNumber}`,
        palmpayOrderId: orderId,
        payeeName: accountName,
        payeeBankCode: bankCode,
        payeeBankAccNo: accountNumber,
        payeePhoneNo: phoneNumber,
      },
    });

    // Call PalmPay API to initiate payout
    const palmpayResponse = await palmpayPayout.initiatePayout({
      orderId,
      title: 'Withdrawal',
      description: `Withdrawal to ${accountNumber}`,
      payeeName: accountName || 'Unknown',
      payeeBankCode: bankCode,
      payeeBankAccNo: accountNumber,
      payeePhoneNo: phoneNumber,
      currency: currency.toUpperCase(),
      amount: amountInCents,
      notifyUrl: palmpayConfig.getWebhookUrl(),
      remark: `Withdrawal transaction for user ${user.id}`,
    });

    // Calculate fees
    const fees = palmpayResponse.fee ? palmpayResponse.fee.fee / 100 : 0; // Convert cents to currency
    const totalAmount = parseFloat(amount) + fees;

    // Verify balance again with actual fees (in case actual fees are higher than estimated)
    const currentBalance = await fiatWalletService.getBalance(wallet.id);
    if (!currentBalance || parseFloat(currentBalance.balance) < totalAmount) {
      // Update transaction status to failed due to insufficient balance
      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          palmpayOrderNo: palmpayResponse.orderNo,
          palmpayStatus: palmpayResponse.orderStatus.toString(),
          palmpaySessionId: palmpayResponse.sessionId,
          fees: fees,
          totalAmount: totalAmount,
          status: 'failed',
          errorMessage: `Insufficient balance after fee calculation. Required: ${totalAmount.toFixed(2)} ${currency.toUpperCase()}, Available: ${currentBalance?.balance || '0'} ${currency.toUpperCase()}`,
        },
      });
      return next(ApiError.badRequest(
        `Insufficient balance after fee calculation. Required: ${totalAmount.toFixed(2)} ${currency.toUpperCase()} (amount: ${amountDecimal.toFixed(2)} + fees: ${fees.toFixed(2)}), Available: ${currentBalance?.balance || '0'} ${currency.toUpperCase()}`
      ));
    }

    // Update transaction with PalmPay response
    await prisma.fiatTransaction.update({
      where: { id: transaction.id },
      data: {
        palmpayOrderNo: palmpayResponse.orderNo,
        palmpayStatus: palmpayResponse.orderStatus.toString(),
        palmpaySessionId: palmpayResponse.sessionId,
        fees: fees,
        totalAmount: totalAmount,
        status: palmpayResponse.orderStatus === 2 ? 'completed' : 'pending',
        ...(palmpayResponse.orderStatus === 2 && { completedAt: new Date() }),
      },
    });

    // If payout is immediately successful, debit wallet
    if (palmpayResponse.orderStatus === 2) {
      await fiatWalletService.debitWallet(wallet.id, totalAmount, transaction.id);
    }

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        orderId: orderId,
        orderNo: palmpayResponse.orderNo,
        status: palmpayResponse.orderStatus === 2 ? 'completed' : 'pending',
        amount: amount,
        fees: fees,
        totalAmount: totalAmount,
        currency: currency.toUpperCase(),
        sessionId: palmpayResponse.sessionId,
      }, 'Payout initiated successfully')
    );
  } catch (error: any) {
    console.error('Payout initiation error:', error);
    return next(ApiError.internal(error.message || 'Failed to initiate payout'));
  }
};

/**
 * Check payout status
 * GET /api/v2/payments/palmpay/payout/:transactionId
 */
export const checkPayoutStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { transactionId } = req.params;

    // Get transaction
    const transaction = await prisma.fiatTransaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true },
    });

    if (!transaction) {
      return next(ApiError.notFound('Transaction not found'));
    }

    if (transaction.userId !== user.id) {
      return next(ApiError.unauthorized('Unauthorized access'));
    }

    // If transaction is already completed, return current status
    if (transaction.status === 'completed') {
      return res.status(200).json(
        new ApiResponse(200, {
          transactionId: transaction.id,
          orderId: transaction.palmpayOrderId,
          orderNo: transaction.palmpayOrderNo,
          status: transaction.status,
          amount: transaction.amount.toString(),
          fees: transaction.fees.toString(),
          totalAmount: transaction.totalAmount.toString(),
          currency: transaction.currency,
          completedAt: transaction.completedAt,
        }, 'Transaction status retrieved')
      );
    }

    // Query PalmPay for latest status
    if (transaction.palmpayOrderNo || transaction.palmpayOrderId) {
      try {
        const palmpayStatus = await palmpayPayout.queryPayStatus(
          transaction.palmpayOrderId || undefined,
          transaction.palmpayOrderNo || undefined
        );

        // Update transaction status
        let newStatus = transaction.status;
        if (palmpayStatus.orderStatus === 2) {
          newStatus = 'completed';
        } else if (palmpayStatus.orderStatus === 3) {
          newStatus = 'failed';
        } else if (palmpayStatus.orderStatus === 4) {
          newStatus = 'cancelled';
        }

        // Update fees if available
        const fees = palmpayStatus.fee ? palmpayStatus.fee.fee / 100 : transaction.fees.toNumber();
        const totalAmount = transaction.amount.toNumber() + fees;

        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayStatus: palmpayStatus.orderStatus.toString(),
            palmpaySessionId: palmpayStatus.sessionId,
            status: newStatus,
            fees: fees,
            totalAmount: totalAmount,
            ...(palmpayStatus.orderStatus === 2 && palmpayStatus.completedTime && {
              completedAt: new Date(palmpayStatus.completedTime),
            }),
          },
        });

        // If payout is successful and wallet hasn't been debited, check balance and debit it now
        if (palmpayStatus.orderStatus === 2 && transaction.status !== 'completed') {
          // Check balance before debiting (in case user spent money between initiation and completion)
          const currentBalance = await fiatWalletService.getBalance(transaction.walletId);
          if (!currentBalance || parseFloat(currentBalance.balance) < totalAmount) {
            // Update transaction status to failed due to insufficient balance
            await prisma.fiatTransaction.update({
              where: { id: transaction.id },
              data: {
                status: 'failed',
                errorMessage: `Insufficient balance when processing withdrawal. Required: ${totalAmount.toFixed(2)} ${transaction.currency}, Available: ${currentBalance?.balance || '0'} ${transaction.currency}`,
              },
            });
            return next(ApiError.badRequest(
              `Insufficient balance when processing withdrawal. Required: ${totalAmount.toFixed(2)} ${transaction.currency}, Available: ${currentBalance?.balance || '0'} ${transaction.currency}`
            ));
          }
          
          await fiatWalletService.debitWallet(transaction.walletId, totalAmount, transaction.id);
        }

        return res.status(200).json(
          new ApiResponse(200, {
            transactionId: transaction.id,
            orderId: transaction.palmpayOrderId,
            orderNo: transaction.palmpayOrderNo,
            status: newStatus,
            palmpayStatus: palmpayStatus.orderStatus,
            amount: transaction.amount.toString(),
            fees: fees.toString(),
            totalAmount: totalAmount.toString(),
            currency: transaction.currency,
            completedAt: palmpayStatus.completedTime ? new Date(palmpayStatus.completedTime).toISOString() : null,
          }, 'Transaction status retrieved')
        );
      } catch (error: any) {
        console.error('Error querying PalmPay status:', error);
        // Return current transaction status if query fails
      }
    }

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        orderId: transaction.palmpayOrderId,
        orderNo: transaction.palmpayOrderNo,
        status: transaction.status,
        amount: transaction.amount.toString(),
        fees: transaction.fees.toString(),
        totalAmount: transaction.totalAmount.toString(),
        currency: transaction.currency,
      }, 'Transaction status retrieved')
    );
  } catch (error: any) {
    console.error('Check payout status error:', error);
    return next(ApiError.internal(error.message || 'Failed to check payout status'));
  }
};

