import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayBillPaymentService } from '../../services/palmpay/palmpay.billpayment.service';
import { vtpassBillPaymentService } from '../../services/vtpass/vtpass.billpayment.service';
import { strowalletBillPaymentService } from '../../services/strowallet/strowallet.billpayment.service';
import { resolveBillPaymentProvider } from '../../services/strowallet/strowallet.billpayment.catalog';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';
import { Decimal } from '@prisma/client/runtime/library';
import { PalmPaySceneCode, PalmPayOrderStatus } from '../../types/palmpay.types';
import { creditReferralCommission, ReferralService } from '../../services/referral/referral.commission.service';

function mapStroWalletStatus(status: 'completed' | 'pending' | 'failed'): number {
  if (status === 'completed') return 2;
  if (status === 'failed') return 3;
  return 1;
}

async function completeBillPaymentIfSuccessful(params: {
  userId: number;
  transactionId: string;
  billPaymentId: string;
  amountNum: number;
  orderStatus: number;
  orderNo: string | null;
  requestId: string | null;
  providerStatus: string;
  providerResponse: unknown;
  billReference?: string | null;
}) {
  await prisma.fiatTransaction.update({
    where: { id: params.transactionId },
    data: {
      palmpayOrderId: params.requestId || undefined,
      palmpayOrderNo: params.orderNo || undefined,
      palmpayStatus: params.providerStatus,
    },
  });

  await prisma.billPayment.update({
    where: { id: params.billPaymentId },
    data: {
      palmpayOrderId: params.requestId || undefined,
      palmpayOrderNo: params.orderNo || undefined,
      palmpayStatus: params.providerStatus,
      providerResponse: JSON.stringify(params.providerResponse),
    },
  });

  if (params.orderStatus === 2) {
    await prisma.fiatTransaction.update({
      where: { id: params.transactionId },
      data: { status: 'completed', completedAt: new Date() },
    });
    await prisma.billPayment.update({
      where: { id: params.billPaymentId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        billReference: params.billReference || params.orderNo || undefined,
      },
    });
    creditReferralCommission(params.userId, ReferralService.BILL_PAYMENT, params.amountNum)
      .catch((err) => console.error('[BillPayment] Referral commission error:', err));
  }
}

/**
 * Query Billers (Operators) for a scene code
 * GET /api/v2/bill-payments/billers?sceneCode=airtime&provider=palmpay|vtpass
 */
export const queryBillersController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, provider = 'palmpay' } = req.query;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    let billers;
    const actualProvider = resolveBillPaymentProvider(sceneCode, typeof provider === 'string' ? provider : undefined);

    if (actualProvider === 'strowallet') {
      billers = strowalletBillPaymentService.wrapBillersForApi(sceneCode);
    } else if (provider === 'vtpass') {
      billers = await vtpassBillPaymentService.queryBillers(sceneCode as any);
    } else {
      billers = await palmpayBillPaymentService.queryBillers(sceneCode as any);
    }

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        provider: actualProvider,
        billers,
      })
    );
  } catch (error: any) {
    next(ApiError.internal(error.message || 'Failed to query billers'));
  }
};

/**
 * Query Items (Packages) for a biller
 * GET /api/v2/bill-payments/items?sceneCode=airtime&billerId=MTN&provider=palmpay|vtpass
 */
export const queryItemsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sceneCode, billerId, provider = 'palmpay' } = req.query;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    if (!billerId || typeof billerId !== 'string') {
      return next(ApiError.badRequest('billerId is required'));
    }

    let items: any = [];
    const actualProvider = resolveBillPaymentProvider(sceneCode, typeof provider === 'string' ? provider : undefined);

    if (actualProvider === 'strowallet') {
      items = await strowalletBillPaymentService.queryItems(sceneCode, billerId);
    } else if (provider === 'vtpass') {
      items = await vtpassBillPaymentService.queryItems(sceneCode as any, billerId);
    } else {
      items = await palmpayBillPaymentService.queryItems(sceneCode as any, billerId);
    }

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        billerId,
        provider: actualProvider,
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
    const { sceneCode, rechargeAccount, billerId, itemId, provider = 'palmpay' } = req.body;

    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    if (!rechargeAccount || typeof rechargeAccount !== 'string') {
      return next(ApiError.badRequest('rechargeAccount is required'));
    }

    if (rechargeAccount.length > 50) { // Increased for meter numbers
      return next(ApiError.badRequest('rechargeAccount must be 50 characters or less'));
    }

    const actualProvider = resolveBillPaymentProvider(sceneCode, typeof provider === 'string' ? provider : undefined);

    if (actualProvider === 'palmpay' && sceneCode === 'betting' && (!billerId || !itemId)) {
      return next(ApiError.badRequest('billerId and itemId are required for betting'));
    }

    let result;
    if (actualProvider === 'strowallet') {
      if (sceneCode === 'electricity') {
        if (!billerId) {
          return next(ApiError.badRequest('billerId is required for electricity verification'));
        }
        result = await strowalletBillPaymentService.verifyMeter({
          billerId,
          meterNumber: rechargeAccount,
        });
      } else if (sceneCode === 'cable') {
        if (!billerId) {
          return next(ApiError.badRequest('billerId is required for cable verification'));
        }
        result = await strowalletBillPaymentService.verifySmartcard({
          billerId,
          smartcardNumber: rechargeAccount,
        });
      } else if (sceneCode === 'education') {
        const valid = /^0\d{10}$/.test(rechargeAccount);
        result = {
          biller: billerId || 'WAEC',
          billerId: billerId || 'WAEC',
          valid,
          error: valid ? undefined : 'Phone number must be 11 digits starting with 0',
        };
      } else {
        result = await strowalletBillPaymentService.verifyAirtimeOrDataPhone(
          rechargeAccount,
          billerId || 'UNKNOWN'
        );
      }
    } else if (provider === 'vtpass') {
      if (sceneCode === 'electricity' && !itemId) {
        return next(ApiError.badRequest('itemId (meterType: prepaid or postpaid) is required for electricity verification'));
      }
      result = await vtpassBillPaymentService.queryRechargeAccount(
        sceneCode as any,
        rechargeAccount,
        billerId,
        itemId
      );
    } else {
      result = await palmpayBillPaymentService.queryRechargeAccount(
        sceneCode as any,
        rechargeAccount,
        billerId,
        itemId
      );
    }

    const billerName = (result as any).biller || (result as any).billerId || undefined;
    const isValid = (result as any).valid !== undefined ? (result as any).valid !== false : true;

    return res.status(200).json(
      new ApiResponse(200, {
        sceneCode,
        provider: actualProvider,
        rechargeAccount,
        biller: billerName,
        valid: isValid,
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
 * IMPORTANT: This debits the user's wallet BEFORE creating the provider order
 * If provider order creation fails, we refund the wallet
 * 
 * Supports both PalmPay and VTpass providers
 */
export const createBillOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { sceneCode, billerId, itemId, rechargeAccount, amount, pin, provider = 'palmpay', phone, itemName } = req.body;

    // Validate inputs
    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    const actualProvider = resolveBillPaymentProvider(sceneCode, typeof provider === 'string' ? provider : undefined);

    if (actualProvider === 'strowallet') {
      if (!billerId || !rechargeAccount || !amount) {
        return next(ApiError.badRequest('Missing required fields: billerId, rechargeAccount, amount'));
      }
      if (sceneCode === 'data' && !itemId) {
        return next(ApiError.badRequest('itemId is required for data'));
      }
      if (sceneCode === 'cable' && !itemId) {
        return next(ApiError.badRequest('itemId is required for cable'));
      }
      if (sceneCode === 'education' && !itemId) {
        return next(ApiError.badRequest('itemId is required for education'));
      }
    } else if (actualProvider === 'palmpay' && (!billerId || !itemId || !rechargeAccount || !amount)) {
      return next(ApiError.badRequest('Missing required fields: billerId, itemId, rechargeAccount, amount'));
    } else if (actualProvider === 'vtpass') {
      if (!billerId || !rechargeAccount || !amount) {
        return next(ApiError.badRequest('Missing required fields: billerId, rechargeAccount, amount'));
      }
      if (sceneCode !== 'airtime' && !itemId) {
        return next(ApiError.badRequest('itemId is required for VTpass ' + sceneCode));
      }
      if (!phone || typeof phone !== 'string') {
        return next(ApiError.badRequest('phone is required for VTpass'));
      }
    }

    // Validate PIN
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return next(ApiError.badRequest('Invalid PIN. Must be 4 digits'));
    }

    // Verify PIN
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { pin: true, phoneNumber: true },
    });

    if (!userRecord?.pin || userRecord.pin !== pin) {
      return next(ApiError.unauthorized('Invalid PIN'));
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return next(ApiError.badRequest('Amount must be greater than 0'));
    }

    // Convert amount to cents (for PalmPay only)
    const amountInCents = Math.round(amountNum * 100);
    if (actualProvider === 'palmpay' && amountInCents < 100) {
      return next(ApiError.badRequest('Minimum amount is 1.00 NGN'));
    }

    // Get user's NGN wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, 'NGN');

    // Check balance
    const balance = parseFloat(wallet.balance.toString());
    if (balance < amountNum) {
      return next(ApiError.badRequest('Insufficient balance'));
    }

    // Generate unique order ID / request ID
    const outOrderNo = actualProvider === 'vtpass'
      ? undefined
      : `bill_${uuidv4().replace(/-/g, '')}`.substring(0, 64);
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
        description: `${sceneCode} payment - ${billerId} - ${rechargeAccount} (${actualProvider})`,
        palmpayOrderId: outOrderNo || undefined,
      },
    });

    let serviceID: string | undefined;
    let billerName: string | undefined;

    if (actualProvider === 'strowallet') {
      const wrapped = strowalletBillPaymentService.wrapBillersForApi(sceneCode);
      const biller = wrapped.data.find((b) => b.billerId === billerId);
      billerName = biller?.billerName || billerId;
    } else if (actualProvider === 'vtpass') {
      const billers = await vtpassBillPaymentService.queryBillers(sceneCode as any);
      const biller = billers.find(b => b.billerId === billerId);
      if (!biller) {
        return next(ApiError.badRequest(`Invalid billerId: ${billerId} for sceneCode: ${sceneCode}`));
      }
      serviceID = biller.serviceID;
      billerName = biller.billerName;
    }

    // Create dedicated BillPayment record
    const billPayment = await prisma.billPayment.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        transactionId: transaction.id,
        provider: actualProvider,
        sceneCode: sceneCode,
        billType: sceneCode.toUpperCase(),
        billerId: billerId,
        billerName: billerName,
        itemId: itemId || '', // Empty for VTpass airtime
        rechargeAccount: rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        status: 'pending',
        palmpayOrderId: outOrderNo || undefined,
      },
    });

    let providerResponse: any;
    let orderNo: string | null = null;
    let orderStatus: number | null = null;
    let requestId: string | null = null;

    try {
      // DEBIT USER WALLET FIRST
      await fiatWalletService.debitWallet(
        wallet.id,
        amountNum,
        transaction.id,
        `Bill payment: ${sceneCode} - ${billerId} (${actualProvider})`
      );

      if (actualProvider === 'strowallet') {
        const contactPhone = (phone || userRecord?.phoneNumber || rechargeAccount).toString();
        let stroResult;

        if (sceneCode === 'airtime') {
          stroResult = await strowalletBillPaymentService.buyAirtime({
            billerId,
            phone: rechargeAccount,
            amount: amountNum,
          });
        } else if (sceneCode === 'data') {
          stroResult = await strowalletBillPaymentService.buyData({
            billerId,
            phone: rechargeAccount,
            amount: amountNum,
            variationCode: itemId,
            planName: itemId,
          });
        } else if (sceneCode === 'electricity') {
          stroResult = await strowalletBillPaymentService.buyElectricity({
            billerId,
            meterNumber: rechargeAccount,
            amount: amountNum,
            phone: contactPhone,
          });
        } else if (sceneCode === 'cable') {
          stroResult = await strowalletBillPaymentService.buyCable({
            billerId,
            smartcardNumber: rechargeAccount,
            amount: amountNum,
            variationCode: itemId,
            planName: (typeof itemName === 'string' && itemName) || itemId,
            phone: contactPhone,
          });
        } else if (sceneCode === 'education') {
          stroResult = await strowalletBillPaymentService.buyEducation({
            billerId,
            phone: rechargeAccount,
            amount: amountNum,
            variationCode: itemId,
          });
        } else {
          throw new Error(`StroWallet does not support sceneCode: ${sceneCode}`);
        }

        orderStatus = mapStroWalletStatus(stroResult.status);
        orderNo = stroResult.transactionId;
        requestId = outOrderNo || stroResult.transactionId;
        providerResponse = stroResult.raw;

        await completeBillPaymentIfSuccessful({
          userId: user.id,
          transactionId: transaction.id,
          billPaymentId: billPayment.id,
          amountNum,
          orderStatus,
          orderNo,
          requestId,
          providerStatus: stroResult.status,
          providerResponse: stroResult.raw,
          billReference: (stroResult as { token?: string | null; pin?: string | null }).token
            || (stroResult as { pin?: string | null }).pin
            || stroResult.transactionId,
        });
      } else if (actualProvider === 'vtpass') {
        // Get meterType for electricity
        const meterType = sceneCode === 'electricity' && itemId 
          ? (itemId === 'prepaid' || itemId === 'postpaid' ? itemId : undefined)
          : undefined;

        if (sceneCode === 'electricity' && !meterType) {
          throw new Error('itemId must be "prepaid" or "postpaid" for electricity');
        }

        // Create VTpass order
        const vtpassResponse = await vtpassBillPaymentService.createOrder({
          sceneCode: sceneCode as any,
          serviceID: serviceID!,
          billerId,
          itemId: itemId || undefined, // Optional for airtime
          rechargeAccount,
          amount: amountNum,
          phone,
          meterType,
        });

        requestId = vtpassResponse.requestId;
        orderNo = vtpassResponse.transactionId;
        orderStatus = vtpassResponse.orderStatus;
        providerResponse = vtpassResponse;

        // Update transaction and bill payment
        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayOrderId: requestId, // Store request_id here
            palmpayOrderNo: orderNo, // Store transactionId here
            palmpayStatus: vtpassResponse.orderStatus === 2 ? 'delivered' : vtpassResponse.orderStatus === 1 ? 'pending' : 'failed',
          },
        });

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            palmpayOrderId: requestId,
            palmpayOrderNo: orderNo,
            palmpayStatus: vtpassResponse.orderStatus === 2 ? 'delivered' : vtpassResponse.orderStatus === 1 ? 'pending' : 'failed',
            providerResponse: JSON.stringify(vtpassResponse),
          },
        });

        // If order status is SUCCESS (2), mark transaction as completed
        if (vtpassResponse.orderStatus === 2) {
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
              billReference: orderNo,
            },
          });

          creditReferralCommission(user.id, ReferralService.BILL_PAYMENT, amountNum)
            .catch((err) => console.error('[BillPayment] Referral commission error:', err));
        }
      } else {
        // PalmPay flow
        const palmpayResponse = await palmpayBillPaymentService.createOrder({
          sceneCode: sceneCode as any,
          outOrderNo: outOrderNo!,
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

        orderNo = palmpayResponse.orderNo;
        orderStatus = palmpayResponse.orderStatus;
        providerResponse = palmpayResponse;

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

          creditReferralCommission(user.id, ReferralService.BILL_PAYMENT, amountNum)
            .catch((err) => console.error('[BillPayment] Referral commission error:', err));
        }
      }
    } catch (error: any) {
      // If provider order creation fails, REFUND the wallet
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
                provider: actualProvider,
              }),
            },
          });
        }
      } catch (refundError) {
        console.error(`Failed to refund wallet after ${provider} error:`, refundError);
        // Log this for manual intervention
      }

      // Update transaction status to failed
      await prisma.fiatTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          errorMessage: error.message || `Failed to create ${actualProvider} order`,
        },
      });

      // Update BillPayment record
      await prisma.billPayment.update({
        where: { id: billPayment.id },
        data: {
          status: 'failed',
          errorMessage: error.message || `Failed to create ${actualProvider} order`,
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
        orderNo: orderNo || null,
        outOrderNo: outOrderNo || requestId || null,
        requestId: requestId || null, // VTpass request ID
        sceneCode,
        provider: actualProvider,
        billerId,
        itemId: itemId || null,
        rechargeAccount,
        amount: amountNum,
        currency: 'NGN',
        orderStatus: orderStatus ?? null,
        status: orderStatus === 2 ? 'completed' : 'pending',
        message: providerResponse?.msg || providerResponse?.response_description || null,
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
          provider: billPayment.provider,
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
    const { page = 1, limit = 20, sceneCode, billerId, status, provider } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {
      userId: user.id,
    };

    if (sceneCode) {
      where.sceneCode = sceneCode;
    }

    if (provider) {
      where.provider = provider;
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
          provider: true,
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

function isElectricityPrepaid(billPayment: {
  sceneCode: string;
  itemId?: string | null;
  billerId?: string | null;
}): boolean {
  if (String(billPayment.sceneCode || '').toLowerCase() !== 'electricity') return false;
  const item = String(billPayment.itemId || '').toLowerCase();
  if (item === 'prepaid') return true;
  const biller = String(billPayment.billerId || '').toLowerCase();
  return biller.includes(':prepaid') || biller.endsWith('prepaid');
}

/** Pull prepaid meter token from provider payload / stored reference. */
export function extractElectricityToken(source: unknown): string | null {
  if (source == null) return null;

  const fromText = (text: string): string | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const labeled = trimmed.match(/Token\s*:?\s*([0-9][0-9\-\s]{6,})/i);
    if (labeled?.[1]) return labeled[1].replace(/\s+/g, '').trim();
    // Digits / digit-dash tokens (typical disco tokens)
    if (/^\d[\d\-]{7,}$/.test(trimmed)) return trimmed;
    return null;
  };

  if (typeof source === 'string') {
    try {
      return extractElectricityToken(JSON.parse(source));
    } catch {
      return fromText(source);
    }
  }

  if (typeof source !== 'object') return null;
  const root = source as Record<string, any>;
  const response = (root.response && typeof root.response === 'object' ? root.response : root) as Record<
    string,
    any
  >;

  const candidates: unknown[] = [
    response.Token,
    response.token,
    response.purchased_code,
    root.Token,
    root.token,
    root.purchased_code,
    root.message,
    response.message,
  ];

  for (const c of candidates) {
    if (c == null) continue;
    const found = fromText(String(c));
    if (found) return found;
  }
  return null;
}

/**
 * Regenerate / re-fetch prepaid electricity token for a past bill payment.
 * POST /api/v2/bill-payments/regenerate-token  body: { billPaymentId }
 */
export const regenerateElectricityTokenController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const billPaymentId = String(req.body?.billPaymentId || req.query?.billPaymentId || '').trim();
    if (!billPaymentId) {
      return next(ApiError.badRequest('billPaymentId is required'));
    }

    const billPayment = await prisma.billPayment.findFirst({
      where: { id: billPaymentId, userId: user.id },
    });
    if (!billPayment) {
      return next(ApiError.notFound('Bill payment not found'));
    }
    if (!isElectricityPrepaid(billPayment)) {
      return next(ApiError.badRequest('Regenerate token is only available for prepaid electricity'));
    }

    let token =
      extractElectricityToken(billPayment.billReference) ||
      extractElectricityToken(billPayment.providerResponse);

    // VTpass: requery by request_id to recover token if missing / incomplete
    if (
      (!token || token === billPayment.palmpayOrderNo || token === billPayment.palmpayOrderId) &&
      String(billPayment.provider || '').toLowerCase() === 'vtpass' &&
      billPayment.palmpayOrderId
    ) {
      try {
        const requery = await vtpassBillPaymentService.queryOrderStatus(billPayment.palmpayOrderId);
        const fromRequery = extractElectricityToken(requery);
        if (fromRequery) {
          token = fromRequery;
          await prisma.billPayment.update({
            where: { id: billPayment.id },
            data: {
              billReference: fromRequery,
              providerResponse: JSON.stringify(requery),
            },
          });
        }
      } catch (err: any) {
        console.error('[regenerate-token] VTpass requery failed:', err?.message || err);
      }
    } else if (token && token !== billPayment.billReference) {
      await prisma.billPayment.update({
        where: { id: billPayment.id },
        data: { billReference: token },
      });
    }

    if (!token) {
      return next(
        ApiError.badRequest(
          'Token not available yet. If payment just completed, wait a moment and try again.'
        )
      );
    }

    return new ApiResponse(
      200,
      {
        billPaymentId: billPayment.id,
        sceneCode: billPayment.sceneCode,
        meterType: 'prepaid',
        rechargeAccount: billPayment.rechargeAccount,
        token,
        billReference: token,
      },
      'Electricity token retrieved'
    ).send(res);
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.internal(error?.message || 'Failed to regenerate electricity token'));
  }
};

