import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { palmpayCheckout } from '../../services/palmpay/palmpay.checkout.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';

/**
 * Create merchant order with bank transfer
 * POST /api/v2/payment/merchant/createorder
 * 
 * This endpoint creates a PalmPay merchant order with bank transfer payment method.
 * When productType is "bank_transfer" and goodsId is -1, it returns virtual account details.
 */
export const createMerchantOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const {
      orderId,
      title,
      description,
      userId,
      userMobileNo,
      amount,
      currency = 'NGN',
      notifyUrl,
      callBackUrl,
      remark,
      goodsDetails,
      productType = 'bank_transfer',
    } = req.body;

    // Validate required fields
    if (!orderId || !amount || !currency || !notifyUrl || !callBackUrl) {
      return next(
        ApiError.badRequest(
          'Missing required fields: orderId, amount, currency, notifyUrl, callBackUrl'
        )
      );
    }

    // Validate amount (minimum 10,000 kobo = 100 NGN)
    const amountInCents = Math.round(parseFloat(amount) * 100);
    if (amountInCents < 10000) {
      return next(ApiError.badRequest('Minimum amount is 100.00 NGN (10,000 kobo)'));
    }

    // Validate currency
    if (currency !== 'NGN') {
      return next(ApiError.badRequest('Currently only NGN currency is supported'));
    }

    // Validate productType
    if (productType !== 'bank_transfer') {
      return next(ApiError.badRequest('productType must be "bank_transfer"'));
    }

    // Prepare goodsDetails if not provided (use -1 for bank transfer)
    let finalGoodsDetails = goodsDetails;
    if (!finalGoodsDetails && productType === 'bank_transfer') {
      // Default goodsDetails for bank transfer
      finalGoodsDetails = JSON.stringify([{ goodsId: '-1' }]);
    } else if (finalGoodsDetails && typeof finalGoodsDetails === 'object') {
      // Convert object to JSON string if needed
      finalGoodsDetails = JSON.stringify(finalGoodsDetails);
    }

    // Use user info if available from auth
    const finalUserId = userId || (user ? user.id.toString() : undefined);
    const finalUserMobileNo = userMobileNo || (user ? user.phoneNumber : undefined);

    // Call PalmPay API to create order
    const palmpayResponse = await palmpayCheckout.createOrder({
      orderId,
      title: title || 'Payment Order',
      description: description || 'Payment via bank transfer',
      userId: finalUserId,
      userMobileNo: finalUserMobileNo,
      amount: amountInCents,
      currency: currency.toUpperCase(),
      notifyUrl: notifyUrl || palmpayConfig.getWebhookUrl(),
      callBackUrl: callBackUrl || `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/payment/success`,
      productType: 'bank_transfer',
      goodsDetails: finalGoodsDetails,
      remark: remark || `Merchant order ${orderId}`,
    });

    // Return complete response including virtual account details if available
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          orderNo: palmpayResponse.orderNo,
          orderStatus: palmpayResponse.orderStatus,
          message: palmpayResponse.message,
          checkoutUrl: palmpayResponse.checkoutUrl,
          payerAccountType: palmpayResponse.payerAccountType,
          payerAccountId: palmpayResponse.payerAccountId,
          payerBankName: palmpayResponse.payerBankName,
          payerAccountName: palmpayResponse.payerAccountName,
          payerVirtualAccNo: palmpayResponse.payerVirtualAccNo,
          sdkSessionId: palmpayResponse.sdkSessionId,
          sdkSignKey: palmpayResponse.sdkSignKey,
          currency: palmpayResponse.currency,
          orderAmount: palmpayResponse.orderAmount,
          payMethod: palmpayResponse.payMethod,
        },
        'Merchant order created successfully'
      )
    );
  } catch (error: any) {
    console.error('Create merchant order error:', error);
    return next(
      ApiError.internal(error.message || 'Failed to create merchant order')
    );
  }
};

