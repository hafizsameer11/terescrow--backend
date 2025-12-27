/**
 * Reloadly Airtime Bill Payment Controllers
 * Dedicated controllers for Reloadly airtime operations
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { reloadlyAirtimeService } from '../../services/reloadly/reloadly.airtime.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Query Reloadly Billers (Operators) for airtime
 * GET /api/v2/bill-payments/reloadly/billers
 */
export const queryReloadlyBillersController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const billers = await reloadlyAirtimeService.getBillers();

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode: 'airtime',
        provider: 'reloadly',
        billers: billers.map(biller => ({
          billerId: biller.billerId,
          billerName: biller.billerName,
          operatorId: biller.operatorId,
          minAmount: biller.operator.minAmount,
          maxAmount: biller.operator.maxAmount,
          denominationType: biller.operator.denominationType,
          country: biller.operator.country,
          logoUrls: biller.operator.logoUrls || [],
          logo: biller.operator.logoUrls && biller.operator.logoUrls.length > 0 
            ? biller.operator.logoUrls[0] 
            : null,
        })),
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query Reloadly billers'));
  }
};

/**
 * Query Reloadly Items (Always empty for airtime - user-specified amounts)
 * GET /api/v2/bill-payments/reloadly/items?billerId=MTN
 */
export const queryReloadlyItemsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { billerId } = req.query;

    if (!billerId || typeof billerId !== 'string') {
      return next(ApiError.badRequest('billerId is required'));
    }

    // Verify biller exists
    const billers = await reloadlyAirtimeService.getBillers();
    const biller = billers.find(b => b.billerId === billerId);
    
    if (!biller) {
      return next(ApiError.badRequest(`Invalid billerId: ${billerId}`));
    }

    // Airtime uses user-specified amounts, so items array is empty
    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode: 'airtime',
        provider: 'reloadly',
        billerId,
        items: [], // Empty - user-specified amounts
        operatorInfo: {
          operatorId: biller.operatorId,
          minAmount: biller.operator.minAmount,
          maxAmount: biller.operator.maxAmount,
          denominationType: biller.operator.denominationType,
        },
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query Reloadly items'));
  }
};

/**
 * Verify Reloadly Recharge Account (Auto-detect operator)
 * POST /api/v2/bill-payments/reloadly/verify-account
 */
export const verifyReloadlyAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { rechargeAccount, billerId } = req.body;

    if (!rechargeAccount || typeof rechargeAccount !== 'string') {
      return next(ApiError.badRequest('rechargeAccount is required'));
    }

    if (!/^0\d{10}$/.test(rechargeAccount)) {
      return next(ApiError.badRequest('Invalid phone number format. Must start with 0 and be 11 digits'));
    }

    // Auto-detect operator from phone number
    const operator = await reloadlyAirtimeService.autoDetectOperator(rechargeAccount, 'NG');

    if (!operator) {
      return res.status(200).json(
        new ApiResponse(200, {
          sceneCode: 'airtime',
          provider: 'reloadly',
          rechargeAccount,
          valid: false,
          error: 'Could not detect operator for this phone number',
        })
      );
    }

    // If billerId provided, verify it matches detected operator
    if (billerId) {
      const billers = await reloadlyAirtimeService.getBillers();
      const biller = billers.find(b => b.billerId === billerId);
      
      if (biller && biller.operatorId !== operator.operatorId) {
        return res.status(200).json(
          new ApiResponse(200, {
            sceneCode: 'airtime',
            provider: 'reloadly',
            rechargeAccount,
            valid: false,
            error: `Phone number operator (${operator.name}) does not match selected biller (${biller.billerName})`,
            detectedOperator: {
              name: operator.name,
              operatorId: operator.operatorId,
            },
          })
        );
      }
    }

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode: 'airtime',
        provider: 'reloadly',
        rechargeAccount,
        biller: operator.name,
        billerId: billerId || operator.name.toUpperCase(),
        valid: true,
        result: {
          operatorId: operator.operatorId,
          operatorName: operator.name,
          country: operator.country,
          minAmount: operator.minAmount,
          maxAmount: operator.maxAmount,
        },
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to verify Reloadly account'));
  }
};

/**
 * Create Reloadly Airtime Order
 * POST /api/v2/bill-payments/reloadly/create-order
 */
export const createReloadlyBillOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { billerId, rechargeAccount, amount, pin } = req.body;

    // Validate inputs
    if (!billerId || !rechargeAccount || !amount) {
      return next(ApiError.badRequest('Missing required fields: billerId, rechargeAccount, amount'));
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

    // Get operator info
    const billers = await reloadlyAirtimeService.getBillers();
    const biller = billers.find(b => b.billerId === billerId);
    
    if (!biller) {
      return next(ApiError.badRequest(`Invalid billerId: ${billerId}`));
    }

    // Validate amount against operator limits
    if (amountNum < biller.operator.minAmount) {
      return next(ApiError.badRequest(`Minimum amount is ${biller.operator.minAmount} ${biller.operator.destinationCurrencyCode || 'NGN'}`));
    }
    if (amountNum > biller.operator.maxAmount) {
      return next(ApiError.badRequest(`Maximum amount is ${biller.operator.maxAmount} ${biller.operator.destinationCurrencyCode || 'NGN'}`));
    }

    // Get user's NGN wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, 'NGN');

    // Check balance
    const balance = parseFloat(wallet.balance.toString());
    if (balance < amountNum) {
      return next(ApiError.badRequest('Insufficient balance'));
    }

    // Generate unique transaction ID
    const transactionId = uuidv4();
    const customIdentifier = `reloadly_${transactionId.replace(/-/g, '')}`.substring(0, 64);

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
        description: `Airtime payment - ${billerId} - ${rechargeAccount} (reloadly)`,
        palmpayOrderId: customIdentifier,
      },
    });

    // Create dedicated BillPayment record
    const billPayment = await prisma.billPayment.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        transactionId: transaction.id,
        provider: 'reloadly',
        sceneCode: 'airtime',
        billType: 'AIRTIME',
        billerId: billerId,
        billerName: biller.billerName,
        itemId: '', // Empty for airtime
        rechargeAccount: rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        status: 'pending',
        palmpayOrderId: customIdentifier, // Store custom identifier here
      },
    });

    let reloadlyResponse: any;
    let orderNo: string | null = null;
    let orderStatus: number | null = null;

    try {
      // DEBIT USER WALLET FIRST
      await fiatWalletService.debitWallet(
        wallet.id,
        amountNum,
        transaction.id,
        `Airtime payment: ${billerId} - ${rechargeAccount} (reloadly)`
      );

      // Create Reloadly top-up
      reloadlyResponse = await reloadlyAirtimeService.makeTopup(
        biller.operatorId,
        rechargeAccount,
        amountNum,
        customIdentifier
      );

      // Map Reloadly status to our order status format
      const statusMap: Record<string, number> = {
        'SUCCESSFUL': 2,
        'PENDING': 1,
        'FAILED': 3,
        'REFUNDED': 3,
      };
      orderStatus = statusMap[reloadlyResponse.status] || 1;
      orderNo = reloadlyResponse.transactionId.toString();

      // Update transaction and bill payment
      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          palmpayOrderId: customIdentifier,
          palmpayOrderNo: orderNo,
          palmpayStatus: reloadlyResponse.status,
        },
      });

      await prisma.billPayment.update({
        where: { id: billPayment.id },
        data: {
          palmpayOrderId: customIdentifier,
          palmpayOrderNo: orderNo,
          palmpayStatus: reloadlyResponse.status,
          providerResponse: JSON.stringify(reloadlyResponse),
        },
      });

      // If order status is SUCCESSFUL, mark transaction as completed
      if (reloadlyResponse.status === 'SUCCESSFUL') {
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
            billReference: reloadlyResponse.operatorTransactionId || orderNo,
          },
        });
      }
    } catch (error: any) {
      // If Reloadly order creation fails, REFUND the wallet
      try {
        const currentWallet = await prisma.fiatWallet.findUnique({
          where: { id: wallet.id },
        });

        if (currentWallet) {
          const refundAmount = new Decimal(currentWallet.balance).plus(amountNum);
          await prisma.fiatWallet.update({
            where: { id: wallet.id },
            data: { balance: refundAmount },
          });

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
              description: `Refund for failed airtime payment: ${transaction.id}`,
              metadata: JSON.stringify({
                refundFor: transaction.id,
                reason: error.message,
                provider: 'reloadly',
              }),
            },
          });
        }
      } catch (refundError) {
        console.error('Failed to refund wallet after Reloadly error:', refundError);
      }

      // Update transaction status to failed
      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          errorMessage: error.message || 'Failed to create Reloadly order',
        },
      });

      await prisma.billPayment.update({
        where: { id: billPayment.id },
        data: {
          status: 'failed',
          errorMessage: error.message || 'Failed to create Reloadly order',
        },
      }).catch(() => {});

      throw error;
    }

    return res.status(200).json(
      new ApiResponse(200, {
        billPaymentId: billPayment.id,
        transactionId: transaction.id,
        orderNo: orderNo || null,
        outOrderNo: customIdentifier,
        requestId: customIdentifier,
        sceneCode: 'airtime',
        provider: 'reloadly',
        billerId,
        itemId: null,
        rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        orderStatus: orderStatus ?? null,
        status: orderStatus === 2 ? 'completed' : 'pending',
        message: reloadlyResponse?.status || null,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to create Reloadly airtime order'));
  }
};

/**
 * Query Reloadly Order Status
 * GET /api/v2/bill-payments/reloadly/order-status?billPaymentId=xxx
 */
export const queryReloadlyOrderStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { billPaymentId, transactionId } = req.query;
    const user = req.body._user;

    let billPayment;

    if (billPaymentId) {
      billPayment = await prisma.billPayment.findFirst({
        where: {
          id: billPaymentId as string,
          userId: user.id,
          provider: 'reloadly',
        },
        include: { transaction: true },
      });
    } else if (transactionId) {
      billPayment = await prisma.billPayment.findFirst({
        where: {
          transactionId: transactionId as string,
          userId: user.id,
          provider: 'reloadly',
        },
        include: { transaction: true },
      });
    } else {
      return next(ApiError.badRequest('Either billPaymentId or transactionId must be provided'));
    }

    if (!billPayment) {
      return next(ApiError.notFound('Reloadly bill payment not found'));
    }

    // If we have a Reloadly transaction ID, query real-time status
    let realtimeStatus = null;
    if (billPayment.palmpayOrderNo) {
      try {
        const reloadlyStatus = await reloadlyAirtimeService.getTopupStatus(
          parseInt(billPayment.palmpayOrderNo)
        );
        realtimeStatus = reloadlyStatus;
        
        // Update database if status changed
        if (reloadlyStatus.status !== billPayment.palmpayStatus) {
          const statusMap: Record<string, number> = {
            'SUCCESSFUL': 2,
            'PENDING': 1,
            'FAILED': 3,
            'REFUNDED': 3,
          };
          const newOrderStatus = statusMap[reloadlyStatus.status] || 1;

          await prisma.billPayment.update({
            where: { id: billPayment.id },
            data: {
              palmpayStatus: reloadlyStatus.status,
              providerResponse: JSON.stringify(reloadlyStatus.transaction),
              ...(reloadlyStatus.status === 'SUCCESSFUL' && {
                status: 'completed',
                completedAt: new Date(),
                billReference: reloadlyStatus.transaction.operatorTransactionId || billPayment.palmpayOrderNo,
              }),
            },
          });

          if (reloadlyStatus.status === 'SUCCESSFUL') {
            await prisma.fiatTransaction.update({
              where: { id: billPayment.transactionId },
              data: {
                status: 'completed',
                completedAt: new Date(),
              },
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch real-time status from Reloadly:', error);
      }
    }

    const statusMap: Record<string, number> = {
      'SUCCESSFUL': 2,
      'PENDING': 1,
      'FAILED': 3,
      'REFUNDED': 3,
    };
    const orderStatus = billPayment.palmpayStatus 
      ? statusMap[billPayment.palmpayStatus] || 1
      : null;

    return res.status(200).json(
      new ApiResponse(200, {
        orderStatus: {
          requestId: billPayment.palmpayOrderId || null,
          orderNo: billPayment.palmpayOrderNo || null,
          billerId: billPayment.billerId || null,
          orderStatus: orderStatus,
          amount: billPayment.amount ? billPayment.amount.toNumber() : null,
          sceneCode: billPayment.sceneCode,
          currency: billPayment.currency || 'NGN',
          errorMsg: billPayment.errorMessage || null,
          completedTime: billPayment.completedAt ? billPayment.completedAt.getTime() : null,
        },
        billPayment: {
          id: billPayment.id,
          transactionId: billPayment.transactionId,
          provider: billPayment.provider,
          status: billPayment.status,
          sceneCode: billPayment.sceneCode,
          billType: billPayment.billType,
          billerId: billPayment.billerId,
          billerName: billPayment.billerName,
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
        realtimeStatus: realtimeStatus ? {
          status: realtimeStatus.status,
          transaction: realtimeStatus.transaction,
        } : null,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query Reloadly order status'));
  }
};

/**
 * Get Reloadly Bill Payment History
 * GET /api/v2/bill-payments/reloadly/history
 */
export const getReloadlyBillPaymentHistoryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { page = 1, limit = 20, billerId, status } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {
      userId: user.id,
      provider: 'reloadly',
      sceneCode: 'airtime',
    };

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
          provider: true,
          sceneCode: true,
          billType: true,
          billerId: true,
          billerName: true,
          itemId: true,
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
    next(ApiError.internal(error.message || 'Failed to get Reloadly bill payment history'));
  }
};

