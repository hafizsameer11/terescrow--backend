import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayBillPaymentService } from '../../services/palmpay/palmpay.billpayment.service';
import { vtpassBillPaymentService } from '../../services/vtpass/vtpass.billpayment.service';
import { reloadlyAirtimeService } from '../../services/reloadly/reloadly.airtime.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';
import { Decimal } from '@prisma/client/runtime/library';
import { PalmPaySceneCode, PalmPayOrderStatus } from '../../types/palmpay.types';

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

    if (provider !== 'palmpay' && provider !== 'vtpass') {
      return next(ApiError.badRequest('provider must be either "palmpay" or "vtpass"'));
    }

    let billers;
    let actualProvider = provider;
    
    // For airtime, always use Reloadly
    if (sceneCode === 'airtime') {
      const reloadlyBillers = await reloadlyAirtimeService.getBillers();
      billers = reloadlyBillers.map(b => ({
        billerId: b.billerId,
        billerName: b.billerName,
        operatorId: b.operatorId,
      }));
      actualProvider = 'reloadly';
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

    if (provider !== 'palmpay' && provider !== 'vtpass') {
      return next(ApiError.badRequest('provider must be either "palmpay" or "vtpass"'));
    }

    let items: any[] = [];
    let actualProvider = provider;
    
    // For airtime, always use Reloadly (returns empty items - user-specified amounts)
    if (sceneCode === 'airtime') {
      items = []; // Reloadly airtime uses user-specified amounts
      actualProvider = 'reloadly';
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

    if (provider !== 'palmpay' && provider !== 'vtpass') {
      return next(ApiError.badRequest('provider must be either "palmpay" or "vtpass"'));
    }

    // For betting (PalmPay only), billerId and itemId are required
    if (provider === 'palmpay' && sceneCode === 'betting' && (!billerId || !itemId)) {
      return next(ApiError.badRequest('billerId and itemId are required for betting'));
    }

    // For electricity (VTpass), itemId (meterType) is required
    if (provider === 'vtpass' && sceneCode === 'electricity' && !itemId) {
      return next(ApiError.badRequest('itemId (meterType: prepaid or postpaid) is required for electricity verification'));
    }

    let result;
    let actualProvider = provider;
    
    // For airtime, use Reloadly auto-detect
    if (sceneCode === 'airtime') {
      const operator = await reloadlyAirtimeService.autoDetectOperator(rechargeAccount, 'NG');
      if (operator) {
        result = {
          biller: operator.name,
          billerId: billerId || operator.name.toUpperCase(),
          valid: true,
        };
      } else {
        // If auto-detect fails, still return valid (basic phone validation)
        result = {
          biller: billerId || 'Unknown',
          billerId: billerId || 'UNKNOWN',
          valid: /^0\d{10}$/.test(rechargeAccount), // Basic phone format validation
        };
      }
      actualProvider = 'reloadly';
    } else if (provider === 'vtpass') {
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

    // Handle different result types from different providers
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
    const { sceneCode, billerId, itemId, rechargeAccount, amount, pin, provider = 'palmpay', phone } = req.body;

    // Validate inputs
    if (!sceneCode || typeof sceneCode !== 'string') {
      return next(ApiError.badRequest('sceneCode is required and must be a string'));
    }

    // Determine actual provider (for airtime, always use Reloadly)
    const actualProvider = sceneCode === 'airtime' ? 'reloadly' : provider;

    if (actualProvider !== 'palmpay' && actualProvider !== 'vtpass' && actualProvider !== 'reloadly') {
      return next(ApiError.badRequest('provider must be either "palmpay" or "vtpass"'));
    }

    // For airtime (Reloadly), itemId is not required
    if (sceneCode === 'airtime') {
      if (!billerId || !rechargeAccount || !amount) {
        return next(ApiError.badRequest('Missing required fields: billerId, rechargeAccount, amount'));
      }
    }
    // For PalmPay (non-airtime), all fields required
    else if (actualProvider === 'palmpay' && (!billerId || !itemId || !rechargeAccount || !amount)) {
      return next(ApiError.badRequest('Missing required fields: billerId, itemId, rechargeAccount, amount'));
    }
    // For VTpass
    else if (actualProvider === 'vtpass') {
      if (!billerId || !rechargeAccount || !amount) {
        return next(ApiError.badRequest('Missing required fields: billerId, rechargeAccount, amount'));
      }
      // For VTpass, itemId is optional for airtime, required for others
      if (sceneCode !== 'airtime' && !itemId) {
        return next(ApiError.badRequest('itemId is required for VTpass ' + sceneCode));
      }
      // Phone is required for VTpass
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
    const outOrderNo = provider === 'vtpass' 
      ? undefined // VTpass generates its own request_id
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

    // Get biller info for VTpass/Reloadly
    let serviceID: string | undefined;
    let billerName: string | undefined;
    let operatorId: number | undefined;
    
    if (actualProvider === 'reloadly' && sceneCode === 'airtime') {
      // Get Reloadly operator info
      const operator = await reloadlyAirtimeService.findOperatorByBillerId(billerId);
      if (!operator) {
        return next(ApiError.badRequest(`Invalid billerId: ${billerId} for Reloadly airtime`));
      }
      operatorId = operator.operatorId;
      billerName = operator.name;
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

      // For airtime, use Reloadly
      if (actualProvider === 'reloadly' && sceneCode === 'airtime') {
        if (!operatorId) {
          throw new Error('Operator ID not found');
        }

        // Create Reloadly top-up
        const reloadlyResponse = await reloadlyAirtimeService.makeTopup(
          operatorId,
          rechargeAccount,
          amountNum,
          transaction.id // Use transaction ID as custom identifier
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
        requestId = reloadlyResponse.customIdentifier || reloadlyResponse.transactionId.toString();
        providerResponse = reloadlyResponse;

        // Update transaction and bill payment
        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayOrderId: requestId,
            palmpayOrderNo: orderNo,
            palmpayStatus: reloadlyResponse.status,
          },
        });

        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            palmpayOrderId: requestId,
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

