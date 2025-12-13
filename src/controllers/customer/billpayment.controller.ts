import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayBillPaymentService } from '../../services/palmpay/palmpay.billpayment.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';
import { Decimal } from '@prisma/client/runtime/library';
import { PalmPaySceneCode, PalmPayOrderStatus } from '../../types/palmpay.types';

/**
 * Query Billers (Operators) for a scene code
 * GET /api/v2/bill-payments/billers?sceneCode=airtime
 */
export const queryBillersController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode } = req.query;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    const billers = await palmpayBillPaymentService.queryBillers(sceneCode as any);

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        billers,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query billers'));
  }
};

/**
 * Query Items (Packages) for a biller
 * GET /api/v2/bill-payments/items?sceneCode=airtime&billerId=MTN
 */
export const queryItemsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, billerId } = req.query;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    if (!billerId || typeof billerId !== 'string') {
      return next(ApiError.badRequest('billerId is required'));
    }

    const items = await palmpayBillPaymentService.queryItems(
      sceneCode as any,
      billerId
    );

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        billerId,
        items,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query items'));
  }
};

/**
 * Verify Recharge Account
 * POST /api/v2/bill-payments/verify-account
 */
export const verifyAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, rechargeAccount, billerId, itemId } = req.body;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    if (!rechargeAccount || typeof rechargeAccount !== 'string') {
      return next(ApiError.badRequest('rechargeAccount is required'));
    }

    if (rechargeAccount.length > 15) {
      return next(ApiError.badRequest('rechargeAccount must be 15 characters or less'));
    }

    // For betting, billerId and itemId are required
    if (sceneCode === 'betting' && (!billerId || !itemId)) {
      return next(ApiError.badRequest('billerId and itemId are required for betting'));
    }

    const result = await palmpayBillPaymentService.queryRechargeAccount(
      sceneCode as any,
      rechargeAccount,
      billerId,
      itemId
    );

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        rechargeAccount,
        biller: result.biller,
        valid: true,
        result,
      })
    );
  } catch (error: any) {
    // If account is invalid, return error but don't crash
    if (error.message?.includes('INVALID_RECHARGE_ACCOUNT')) {
      return res.status(200).json(
        new ApiResponse(200, {
          valid: false,
          error: error.message,
        })
      );
    }
    next(ApiError.internal(error.message || 'Failed to verify account'));
  }
};

/**
 * Create Bill Payment Order
 * POST /api/v2/bill-payments/create-order
 * 
 * IMPORTANT: This debits the user's wallet BEFORE creating the PalmPay order
 * If PalmPay order creation fails, we refund the wallet
 */
export const createBillOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { sceneCode, billerId, itemId, rechargeAccount, amount, pin } = req.body;

    // Validate inputs
    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    if (!billerId || !itemId || !rechargeAccount || !amount) {
      return next(ApiError.badRequest('Missing required fields: billerId, itemId, rechargeAccount, amount'));
    }

    // Validate PIN
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return next(ApiError.badRequest('Invalid PIN. Must be 4 digits'));
    }

    // Verify PIN
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { pin: true },
    });

    if (!userRecord?.pin || userRecord.pin !== pin) {
      return next(ApiError.unauthorized('Invalid PIN'));
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return next(ApiError.badRequest('Amount must be greater than 0'));
    }

    // Convert amount to cents
    const amountInCents = Math.round(amountNum * 100);
    if (amountInCents < 100) {
      return next(ApiError.badRequest('Minimum amount is 1.00 NGN'));
    }

    // Get user's NGN wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, 'NGN');

    // Check balance
    const balance = parseFloat(wallet.balance.toString());
    if (balance < amountNum) {
      return next(ApiError.badRequest('Insufficient balance'));
    }

    // Generate unique order ID
    const outOrderNo = `bill_${uuidv4().replace(/-/g, '')}`.substring(0, 64);
    const transactionId = uuidv4();

    // Create transaction record (status: pending)
    const transaction = await prisma.fiatTransaction.create({
      data: {
        id: transactionId,
        userId: user.id,
        walletId: wallet.id,
        type: 'BILL_PAYMENT',
        status: 'pending',
        currency: 'NGN',
        amount: amountNum,
        fees: 0,
        totalAmount: amountNum,
        description: `${sceneCode} payment - ${billerId} - ${rechargeAccount}`,
        palmpayOrderId: outOrderNo,
      },
    });

    // Create dedicated BillPayment record
    const billPayment = await prisma.billPayment.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        transactionId: transaction.id,
        sceneCode: sceneCode,
        billType: sceneCode.toUpperCase(),
        billerId: billerId,
        itemId: itemId,
        rechargeAccount: rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        status: 'pending',
        palmpayOrderId: outOrderNo,
      },
    });

    let palmpayResponse;
    try {
      // DEBIT USER WALLET FIRST
      await fiatWalletService.debitWallet(
        wallet.id,
        amountNum,
        transaction.id,
        `Bill payment: ${sceneCode} - ${billerId}`
      );

      // Create PalmPay order
      palmpayResponse = await palmpayBillPaymentService.createOrder({
        sceneCode: sceneCode as any,
        outOrderNo,
        amount: amountInCents,
        notifyUrl: `${palmpayConfig.getWebhookUrl()}/bill-payment`,
        billerId,
        itemId,
        rechargeAccount,
        title: `${sceneCode} Payment`,
        description: `${sceneCode} payment for ${rechargeAccount}`,
        relationId: user.id.toString(),
      });

      // Validate PalmPay response
      if (!palmpayResponse || !palmpayResponse.orderNo || palmpayResponse.orderStatus === undefined) {
        throw new Error(
          `Invalid PalmPay response: ${JSON.stringify(palmpayResponse)}`
        );
      }

      // Update transaction with PalmPay order number
      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          palmpayOrderNo: palmpayResponse.orderNo,
          palmpayStatus: palmpayResponse.orderStatus?.toString() || null,
        },
      });

      // Update BillPayment record
      await prisma.billPayment.update({
        where: { id: billPayment.id },
        data: {
          palmpayOrderNo: palmpayResponse.orderNo,
          palmpayStatus: palmpayResponse.orderStatus?.toString() || null,
          providerResponse: JSON.stringify(palmpayResponse),
        },
      });

      // If order status is SUCCESS (2), mark transaction as completed
      if (palmpayResponse.orderStatus === 2) {
        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            billReference: palmpayResponse.orderNo,
          },
        });
      }
    } catch (error: any) {
      // If PalmPay order creation fails, REFUND the wallet
      try {
        // Get current wallet balance
        const currentWallet = await prisma.fiatWallet.findUnique({
          where: { id: wallet.id },
        });

        if (currentWallet) {
          // Refund the amount
          const refundAmount = new Decimal(currentWallet.balance).plus(amountNum);
          await prisma.fiatWallet.update({
            where: { id: wallet.id },
            data: { balance: refundAmount },
          });

          // Create refund transaction record
          await prisma.fiatTransaction.create({
            data: {
              id: uuidv4(),
              userId: user.id,
              walletId: wallet.id,
              type: 'BILL_PAYMENT',
              status: 'completed',
              currency: 'NGN',
              amount: amountNum,
              fees: 0,
              totalAmount: amountNum,
              description: `Refund for failed bill payment: ${transaction.id}`,
              metadata: JSON.stringify({
                refundFor: transaction.id,
                reason: error.message,
              }),
            },
          });
        }
      } catch (refundError) {
        console.error('Failed to refund wallet after PalmPay error:', refundError);
        // Log this for manual intervention
      }

      // Update transaction status to failed
      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          errorMessage: error.message || 'Failed to create PalmPay order',
        },
      });

      // Update BillPayment record
      await prisma.billPayment.update({
        where: { id: billPayment.id },
        data: {
          status: 'failed',
          errorMessage: error.message || 'Failed to create PalmPay order',
        },
      }).catch(() => {
        // BillPayment might not exist if creation failed early
      });

      throw error;
    }

    return res.status(200).json(
      new ApiResponse(200, {
        billPaymentId: billPayment.id,
        transactionId: transaction.id,
        orderNo: palmpayResponse?.orderNo || null,
        outOrderNo,
        sceneCode,
        billerId,
        itemId,
        rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        orderStatus: palmpayResponse?.orderStatus ?? null,
        status: palmpayResponse?.orderStatus === 2 ? 'completed' : 'pending',
        message: palmpayResponse?.msg || null,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to create bill payment order'));
  }
};

/**
 * Query Bill Payment Order Status
 * GET /api/v2/bill-payments/order-status?sceneCode=airtime&orderNo=xxx
 * OR
 * GET /api/v2/bill-payments/order-status?billPaymentId=xxx
 */
export const queryOrderStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, outOrderNo, orderNo, billPaymentId } = req.query;
    const user = req.body._user;

    let billPayment;

    // If billPaymentId is provided, query by that first
    if (billPaymentId) {
      billPayment = await prisma.billPayment.findFirst({
        where: {
          id: billPaymentId as string,
          userId: user.id, // Ensure user owns this bill payment
        },
        include: { transaction: true },
      });

      if (!billPayment) {
        return next(ApiError.notFound('Bill payment not found'));
      }
    } else {
      // Query by sceneCode and order numbers
      const where: any = {
        userId: user.id,
      };

      if (sceneCode && typeof sceneCode === 'string') {
        where.sceneCode = sceneCode;
      }

      if (outOrderNo || orderNo) {
        where.OR = [];
        if (outOrderNo) {
          where.OR.push({ palmpayOrderId: outOrderNo as string });
        }
        if (orderNo) {
          where.OR.push({ palmpayOrderNo: orderNo as string });
        }
      } else {
        return next(ApiError.badRequest('Either billPaymentId, outOrderNo, or orderNo must be provided'));
      }

      billPayment = await prisma.billPayment.findFirst({
        where,
        include: { transaction: true },
      });

      if (!billPayment) {
        return next(ApiError.notFound('Bill payment not found'));
      }
    }

    // Build response from database record
    const palmpayStatus = billPayment.palmpayStatus ? parseInt(billPayment.palmpayStatus) : null;
    
    return res.status(200).json(
      new ApiResponse(200, {
        orderStatus: {
          outOrderNo: billPayment.palmpayOrderId || null,
          orderNo: billPayment.palmpayOrderNo || null,
          billerId: billPayment.billerId || null,
          itemId: billPayment.itemId || null,
          orderStatus: palmpayStatus,
          amount: billPayment.amount ? billPayment.amount.toNumber() : null,
          sceneCode: billPayment.sceneCode,
          currency: billPayment.currency || 'NGN',
          errorMsg: billPayment.errorMessage || null,
          completedTime: billPayment.completedAt ? billPayment.completedAt.getTime() : null,
        },
        billPayment: {
          id: billPayment.id,
          transactionId: billPayment.transactionId,
          status: billPayment.status,
          sceneCode: billPayment.sceneCode,
          billType: billPayment.billType,
          billerId: billPayment.billerId,
          billerName: billPayment.billerName,
          itemId: billPayment.itemId,
          itemName: billPayment.itemName,
          rechargeAccount: billPayment.rechargeAccount,
          amount: billPayment.amount.toString(),
          currency: billPayment.currency,
          palmpayOrderId: billPayment.palmpayOrderId,
          palmpayOrderNo: billPayment.palmpayOrderNo,
          palmpayStatus: billPayment.palmpayStatus,
          billReference: billPayment.billReference,
          errorMessage: billPayment.errorMessage,
          createdAt: billPayment.createdAt,
          completedAt: billPayment.completedAt,
        },
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query order status'));
  }
};

/**
 * Get Bill Payment History
 * GET /api/v2/bill-payments/history
 */
export const getBillPaymentHistoryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { page = 1, limit = 20, sceneCode, billerId, status } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {
      userId: user.id,
    };

    if (sceneCode) {
      where.sceneCode = sceneCode;
    }

    if (billerId) {
      where.billerId = billerId;
    }

    if (status) {
      where.status = status;
    }

    const [billPayments, total] = await Promise.all([
      prisma.billPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
        select: {
          id: true,
          transactionId: true,
          sceneCode: true,
          billType: true,
          billerId: true,
          billerName: true,
          itemId: true,
          itemName: true,
          rechargeAccount: true,
          amount: true,
          currency: true,
          status: true,
          palmpayOrderId: true,
          palmpayOrderNo: true,
          palmpayStatus: true,
          billReference: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.billPayment.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(200, {
        billPayments,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to get bill payment history'));
  }
};

