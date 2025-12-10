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

    // Convert amount to cents
    const amountInCents = Math.round(parseFloat(amount) * 100);
    if (amountInCents < 100) {
      return next(ApiError.badRequest('Minimum amount is 1.00 NGN'));
    }

    // Generate unique order ID
    const orderId = `deposit_${uuidv4().replace(/-/g, '')}`.substring(0, 32);

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
        palmpayOrderId: orderId,
      },
    });

    // Prepare customer info
    const customerInfo: PalmPayCustomerInfo = {
      userId: user.id.toString(),
      userName: `${user.firstname} ${user.lastname}`,
      phone: user.phoneNumber,
      email: user.email,
    };

    // Call PalmPay API to create order
    const palmpayResponse = await palmpayCheckout.createOrder({
      orderId,
      title: 'Wallet Top-up',
      description: `Deposit to ${currency} wallet`,
      amount: amountInCents,
      currency: currency.toUpperCase(),
      notifyUrl: palmpayConfig.getWebhookUrl(),
      callBackUrl: `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/deposit/success`,
      orderExpireTime: 3600, // 1 hour
      customerInfo: JSON.stringify(customerInfo),
      remark: `Wallet top-up transaction for user ${user.id}`,
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
        orderId: orderId,
        orderNo: palmpayResponse.orderNo,
        checkoutUrl: palmpayResponse.checkoutUrl,
        amount: amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      }, 'Deposit initiated successfully')
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

