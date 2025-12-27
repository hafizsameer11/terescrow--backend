/**
 * Reloadly Utilities Bill Payment Controllers
 * Dedicated controllers for Reloadly utility payments (Electricity, Water, TV, Internet)
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { reloadlyUtilitiesService } from '../../services/reloadly/reloadly.utilities.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Query Reloadly Utility Billers
 * GET /api/v2/bill-payments/reloadly/utilities/billers
 */
export const queryReloadlyUtilityBillersController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type, countryISOCode, serviceType } = req.query;
    
    const billers = await reloadlyUtilitiesService.getBillers({
      type: type as string,
      countryISOCode: countryISOCode as string,
      serviceType: serviceType as string,
    });

    return res.status(200).json(
      new ApiResponse(200, {
        provider: 'reloadly',
        billers: billers.map(biller => ({
          billerId: biller.id.toString(),
          billerName: biller.name,
          countryIsoCode: biller.countryIsoCode,
          type: biller.type,
          serviceType: biller.serviceType,
          minAmount: biller.minLocalTransactionAmount,
          maxAmount: biller.maxLocalTransactionAmount,
          currency: biller.localTransactionCurrencyCode,
          localAmountSupported: biller.localAmountSupported,
          requiresInvoice: biller.requiresInvoice,
        })),
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query Reloadly utility billers'));
  }
};

/**
 * Query Reloadly Utility Items (Always empty - user-specified amounts)
 * GET /api/v2/bill-payments/reloadly/utilities/items?billerId=1
 */
export const queryReloadlyUtilityItemsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { billerId } = req.query;

    if (!billerId || typeof billerId !== 'string') {
      return next(ApiError.badRequest('billerId is required'));
    }

    const billerIdNum = parseInt(billerId, 10);
    if (isNaN(billerIdNum)) {
      return next(ApiError.badRequest(`Invalid billerId: ${billerId}. Must be a number`));
    }

    // Verify biller exists
    const biller = await reloadlyUtilitiesService.getBillerById(billerIdNum);
    
    if (!biller) {
      return next(ApiError.badRequest(`Invalid billerId: ${billerId}`));
    }

    // Utilities use user-specified amounts, so items array is empty
    return res.status(200).json(
      new ApiResponse(200, {
        provider: 'reloadly',
        billerId,
        items: [], // Empty - user-specified amounts
        billerInfo: {
          billerName: biller.name,
          type: biller.type,
          serviceType: biller.serviceType,
          minAmount: biller.minLocalTransactionAmount,
          maxAmount: biller.maxLocalTransactionAmount,
          currency: biller.localTransactionCurrencyCode,
        },
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query Reloadly utility items'));
  }
};

/**
 * Verify Reloadly Utility Account (Basic validation)
 * POST /api/v2/bill-payments/reloadly/utilities/verify-account
 */
export const verifyReloadlyUtilityAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { rechargeAccount, billerId } = req.body;

    if (!rechargeAccount || typeof rechargeAccount !== 'string') {
      return next(ApiError.badRequest('rechargeAccount is required'));
    }

    if (!billerId) {
      return next(ApiError.badRequest('billerId is required'));
    }

    const billerIdNum = parseInt(billerId.toString(), 10);
    if (isNaN(billerIdNum)) {
      return next(ApiError.badRequest(`Invalid billerId: ${billerId}. Must be a number`));
    }

    // Verify biller exists
    const biller = await reloadlyUtilitiesService.getBillerById(billerIdNum);
    
    if (!biller) {
      return res.status(200).json(
        new ApiResponse(200, {
          provider: 'reloadly',
          rechargeAccount,
          valid: false,
          error: `Invalid billerId: ${billerId}`,
        })
      );
    }

    // Basic validation - Reloadly doesn't provide account verification endpoint
    // We just validate the account number format is not empty
    const isValid = rechargeAccount.trim().length > 0;

    return res.status(200).json(
      new ApiResponse(200, {
        provider: 'reloadly',
        rechargeAccount,
        biller: biller.name,
        billerId: biller.id.toString(),
        valid: isValid,
        result: {
          billerId: biller.id,
          billerName: biller.name,
          type: biller.type,
          serviceType: biller.serviceType,
          countryIsoCode: biller.countryIsoCode,
        },
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to verify Reloadly utility account'));
  }
};

/**
 * Create Reloadly Utility Payment Order
 * POST /api/v2/bill-payments/reloadly/utilities/create-order
 */
export const createReloadlyUtilityBillOrderController = async (
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

    // Get biller info
    const billerIdNum = parseInt(billerId.toString(), 10);
    if (isNaN(billerIdNum)) {
      return next(ApiError.badRequest(`Invalid billerId: ${billerId}. Must be a number`));
    }

    const biller = await reloadlyUtilitiesService.getBillerById(billerIdNum);
    
    if (!biller) {
      return next(ApiError.badRequest(`Invalid billerId: ${billerId}`));
    }

    // Validate amount against biller limits
    if (amountNum < biller.minLocalTransactionAmount) {
      return next(ApiError.badRequest(`Minimum amount is ${biller.minLocalTransactionAmount} ${biller.localTransactionCurrencyCode}`));
    }
    if (amountNum > biller.maxLocalTransactionAmount) {
      return next(ApiError.badRequest(`Maximum amount is ${biller.maxLocalTransactionAmount} ${biller.localTransactionCurrencyCode}`));
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
    const customIdentifier = `reloadly_util_${transactionId.replace(/-/g, '')}`.substring(0, 64);

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
        description: `Utility payment - ${biller.name} - ${rechargeAccount} (reloadly)`,
        palmpayOrderId: customIdentifier,
      },
    });

    // Determine sceneCode from biller type
    const sceneCodeMap: Record<string, string> = {
      'ELECTRICITY_BILL_PAYMENT': 'electricity',
      'WATER_BILL_PAYMENT': 'water',
      'TV_BILL_PAYMENT': 'cable',
      'INTERNET_BILL_PAYMENT': 'internet',
    };
    const sceneCode = sceneCodeMap[biller.type] || 'electricity';

    // Create dedicated BillPayment record
    const billPayment = await prisma.billPayment.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        transactionId: transaction.id,
        provider: 'reloadly',
        sceneCode: sceneCode,
        billType: biller.type,
        billerId: billerId.toString(),
        billerName: biller.name,
        itemId: '', // Empty for utilities
        rechargeAccount: rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        status: 'pending',
        palmpayOrderId: customIdentifier,
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
        `Utility payment: ${biller.name} - ${rechargeAccount} (reloadly)`
      );

      // Create Reloadly utility payment
      reloadlyResponse = await reloadlyUtilitiesService.payBill({
        billerId: billerIdNum,
        subscriberAccountNumber: rechargeAccount,
        amount: amountNum,
        referenceId: customIdentifier,
        useLocalAmount: true, // Use NGN
      });

      // Map Reloadly status to our order status format
      const statusMap: Record<string, number> = {
        'SUCCESSFUL': 2,
        'PROCESSING': 1,
        'FAILED': 3,
        'REFUNDED': 3,
      };
      orderStatus = statusMap[reloadlyResponse.status] || 1;
      orderNo = reloadlyResponse.id.toString();

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
            billReference: reloadlyResponse.referenceId || orderNo,
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
              description: `Refund for failed utility payment: ${transaction.id}`,
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
          errorMessage: error.message || 'Failed to create Reloadly utility order',
        },
      });

      await prisma.billPayment.update({
        where: { id: billPayment.id },
        data: {
          status: 'failed',
          errorMessage: error.message || 'Failed to create Reloadly utility order',
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
        sceneCode: sceneCode,
        provider: 'reloadly',
        billerId: billerId.toString(),
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
    next(ApiError.internal(error.message || 'Failed to create Reloadly utility order'));
  }
};

/**
 * Query Reloadly Utility Order Status
 * GET /api/v2/bill-payments/reloadly/utilities/order-status?billPaymentId=xxx
 */
export const queryReloadlyUtilityOrderStatusController = async (
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
      return next(ApiError.notFound('Reloadly utility bill payment not found'));
    }

    // If we have a Reloadly transaction ID, query real-time status
    let realtimeStatus = null;
    if (billPayment.palmpayOrderNo) {
      try {
        const reloadlyStatus = await reloadlyUtilitiesService.getTransactionById(
          parseInt(billPayment.palmpayOrderNo)
        );
        realtimeStatus = reloadlyStatus;
        
        // Update database if status changed
        if (reloadlyStatus.transaction.status !== billPayment.palmpayStatus) {
          const statusMap: Record<string, number> = {
            'SUCCESSFUL': 2,
            'PROCESSING': 1,
            'FAILED': 3,
            'REFUNDED': 3,
          };
          const newOrderStatus = statusMap[reloadlyStatus.transaction.status] || 1;

          await prisma.billPayment.update({
            where: { id: billPayment.id },
            data: {
              palmpayStatus: reloadlyStatus.transaction.status,
              providerResponse: JSON.stringify(reloadlyStatus),
              ...(reloadlyStatus.transaction.status === 'SUCCESSFUL' && {
                status: 'completed',
                completedAt: new Date(),
                billReference: reloadlyStatus.transaction.billDetails?.billerReferenceId || billPayment.palmpayOrderNo,
              }),
            },
          });

          if (reloadlyStatus.transaction.status === 'SUCCESSFUL') {
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
      'PROCESSING': 1,
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
          code: realtimeStatus.code,
          message: realtimeStatus.message,
          transaction: realtimeStatus.transaction,
        } : null,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query Reloadly utility order status'));
  }
};

/**
 * Get Reloadly Utility Payment History
 * GET /api/v2/bill-payments/reloadly/utilities/history
 */
export const getReloadlyUtilityBillPaymentHistoryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { page = 1, limit = 20, billerId, status, type } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {
      userId: user.id,
      provider: 'reloadly',
    };

    if (billerId) {
      where.billerId = billerId;
    }

    if (status) {
      where.status = status;
    }

    if (type) {
      where.billType = type;
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
    next(ApiError.internal(error.message || 'Failed to get Reloadly utility payment history'));
  }
};

