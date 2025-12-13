import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayCheckout } from '../../services/palmpay/palmpay.checkout.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';
import { PalmPayCustomerInfo } from '../../types/palmpay.types';

/**
 * Initiate deposit (wallet top-up)
 * POST /api/v2/payments/palmpay/deposit/initiate
 */
export const initiateDepositController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { amount, currency = 'NGN' } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return next(ApiError.badRequest('Amount must be greater than 0'));
    }

    // Convert amount to cents (minimum 10,000 kobo = 100 NGN for bank transfer)
    const amountInCents = Math.round(parseFloat(amount) * 100);
    if (amountInCents < 10000) {
      return next(ApiError.badRequest('Minimum amount is 100.00 NGN (10,000 kobo)'));
    }

    // Generate unique merchant order ID
    const merchantOrderId = `deposit_${uuidv4().replace(/-/g, '')}`.substring(0, 32);

    // Get or create wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, currency);

    // Create transaction record
    const transaction = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        type: 'DEPOSIT',
        status: 'pending',
        currency: currency.toUpperCase(),
        amount: parseFloat(amount),
        fees: 0,
        totalAmount: parseFloat(amount),
        description: `Wallet top-up - ${amount} ${currency}`,
        palmpayOrderId: merchantOrderId,
      },
    });

    // Prepare goodsDetails for bank transfer (use -1 to get virtual account)
    const goodsDetails = JSON.stringify([{ goodsId: '-1' }]);

    // Call PalmPay merchant order API with bank_transfer
    const palmpayResponse = await palmpayCheckout.createOrder({
      orderId: merchantOrderId,
      title: 'Wallet Top-up',
      description: `Deposit to ${currency} wallet`,
      amount: amountInCents,
      currency: currency.toUpperCase(),
      notifyUrl: `${palmpayConfig.getWebhookUrl()}/deposit`,
      callBackUrl: `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/deposit/success`,
      productType: 'bank_transfer',
      goodsDetails: goodsDetails,
      userId: user.id.toString(),
      userMobileNo: user.phoneNumber,
      remark: `Wallet top-up transaction for user ${user.id}`,
    });

    // Save merchant order details including virtual account info
    const merchantOrder = await prisma.palmPayUserVirtualAccount.create({
      data: {
        userId: user.id,
        merchantOrderId: merchantOrderId,
        palmpayOrderNo: palmpayResponse.orderNo,
        amount: parseFloat(amount),
        currency: currency.toUpperCase(),
        orderStatus: palmpayResponse.orderStatus,
        title: 'Wallet Top-up',
        description: `Deposit to ${currency} wallet`,
        payerAccountType: palmpayResponse.payerAccountType?.toString() || null,
        payerAccountId: palmpayResponse.payerAccountId || null,
        payerBankName: palmpayResponse.payerBankName || null,
        payerAccountName: palmpayResponse.payerAccountName || null,
        payerVirtualAccNo: palmpayResponse.payerVirtualAccNo || null,
        checkoutUrl: palmpayResponse.checkoutUrl || null,
        sdkSessionId: palmpayResponse.sdkSessionId || null,
        sdkSignKey: palmpayResponse.sdkSignKey || null,
        payMethod: palmpayResponse.payMethod || null,
        productType: 'bank_transfer',
        notifyUrl: `${palmpayConfig.getWebhookUrl()}/deposit`,
        callBackUrl: `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/deposit/success`,
        remark: `Wallet top-up transaction for user ${user.id}`,
        fiatTransactionId: transaction.id,
        metadata: JSON.stringify(palmpayResponse),
      },
    });

    // Update transaction with PalmPay order number
    await prisma.fiatTransaction.update({
      where: { id: transaction.id },
      data: {
        palmpayOrderNo: palmpayResponse.orderNo,
        palmpayStatus: palmpayResponse.orderStatus.toString(),
        checkoutUrl: palmpayResponse.checkoutUrl,
        redirectUrl: `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/deposit/success`,
      },
    });

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        merchantOrderId: merchantOrderId,
        orderNo: palmpayResponse.orderNo,
        amount: amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        // Virtual account details for bank transfer
        virtualAccount: {
          accountType: palmpayResponse.payerAccountType,
          accountId: palmpayResponse.payerAccountId,
          bankName: palmpayResponse.payerBankName,
          accountName: palmpayResponse.payerAccountName,
          accountNumber: palmpayResponse.payerVirtualAccNo,
        },
        checkoutUrl: palmpayResponse.checkoutUrl,
      }, 'Deposit initiated successfully. Please transfer to the provided virtual account.')
    );
  } catch (error: any) {
    console.error('Deposit initiation error:', error);
    return next(ApiError.internal(error.message || 'Failed to initiate deposit'));
  }
};

/**
 * Check deposit status
 * GET /api/v2/payments/palmpay/deposit/:transactionId
 */
export const checkDepositStatusController = async (
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
          currency: transaction.currency,
          completedAt: transaction.completedAt,
        }, 'Transaction status retrieved')
      );
    }

    // Query PalmPay for latest status
    if (transaction.palmpayOrderNo || transaction.palmpayOrderId) {
      try {
        const palmpayStatus = await palmpayCheckout.queryOrderStatus(
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

        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayStatus: palmpayStatus.orderStatus.toString(),
            status: newStatus,
            ...(palmpayStatus.orderStatus === 2 && palmpayStatus.completedTime && {
              completedAt: new Date(palmpayStatus.completedTime),
            }),
          },
        });

        return res.status(200).json(
          new ApiResponse(200, {
            transactionId: transaction.id,
            orderId: transaction.palmpayOrderId,
            orderNo: transaction.palmpayOrderNo,
            status: newStatus,
            palmpayStatus: palmpayStatus.orderStatus,
            amount: transaction.amount.toString(),
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
        currency: transaction.currency,
      }, 'Transaction status retrieved')
    );
  } catch (error: any) {
    console.error('Check deposit status error:', error);
    return next(ApiError.internal(error.message || 'Failed to check deposit status'));
  }
};

/**
 * Deposit success page controller
 * GET /api/v2/payments/palmpay/deposit/success
 * This is the callback URL that PalmPay redirects to after successful payment
 */
export const depositSuccessController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    return res.status(200).json({
      status: 'success',
      message: 'Deposit completed successfully',
      data: {
        success: true,
        message: 'Your deposit has been processed successfully. Your wallet will be credited shortly.',
      },
    });
  } catch (error: any) {
    console.error('Error in depositSuccessController:', error);
    return res.status(200).json({
      status: 'success',
      message: 'Deposit completed successfully',
      data: {
        success: true,
        message: 'Your deposit has been processed successfully.',
      },
    });
  }
};

