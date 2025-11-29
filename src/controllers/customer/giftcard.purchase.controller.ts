/**
 * Gift Card Purchase Controller
 * 
 * Handles gift card purchase flow:
 * - Validate purchase request
 * - Process purchase (payment + Reloadly order)
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { reloadlyOrdersService } from '../../services/reloadly/reloadly.orders.service';
import { GiftCardPurchaseValidationRequest, GiftCardPurchaseRequest } from '../../types/reloadly.types';

/**
 * Validate purchase request (before payment)
 */
export const validatePurchaseController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', errors.array());
    }

    const validationData: GiftCardPurchaseValidationRequest = req.body;
    const { productId, countryCode, cardType, faceValue, quantity, currencyCode } = validationData;

    // Get product
    const product = await prisma.giftCardProduct.findFirst({
      where: {
        OR: [
          { id: productId },
          { reloadlyProductId: productId },
        ],
        status: 'active',
      },
    });

    if (!product) {
      throw ApiError.notFound('Product not found or inactive');
    }

    // Validate country
    if (!product.isGlobal && product.countryCode !== countryCode) {
      throw ApiError.badRequest('Product not available in selected country');
    }

    // Validate amount
    if (product.minValue && faceValue < Number(product.minValue)) {
      throw ApiError.badRequest(`Minimum value is ${product.minValue} ${currencyCode}`);
    }

    if (product.maxValue && faceValue > Number(product.maxValue)) {
      throw ApiError.badRequest(`Maximum value is ${product.maxValue} ${currencyCode}`);
    }

    // Validate card type
    const supportedTypes = product.supportedCardTypes
      ? (typeof product.supportedCardTypes === 'string' 
          ? JSON.parse(product.supportedCardTypes) 
          : product.supportedCardTypes) as string[]
      : ['Physical', 'E-Code', 'Code Only'];

    if (!supportedTypes.includes(cardType)) {
      throw ApiError.badRequest(`Card type ${cardType} not supported for this product`);
    }

    // Calculate fees (example: 5% fee)
    const feePercentage = 0.05; // 5%
    const fees = faceValue * feePercentage;
    const totalAmount = faceValue + fees;

    return new ApiResponse(200, {
      valid: true,
      faceValue,
      fees,
      totalAmount,
      currencyCode,
      productName: product.productName,
    }, 'Purchase validation successful').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to validate purchase'));
  }
};

/**
 * Process gift card purchase
 */
export const purchaseController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', errors.array());
    }

    const purchaseData: GiftCardPurchaseRequest = req.body;
    const authenticatedUser = req.body._user;

    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // TODO: Check KYC status
    // TODO: Check wallet balance if paymentMethod is 'wallet'

    // Get product
    const product = await prisma.giftCardProduct.findFirst({
      where: {
        OR: [
          { id: purchaseData.productId },
          { reloadlyProductId: purchaseData.productId },
        ],
        status: 'active',
      },
    });

    if (!product) {
      throw ApiError.notFound('Product not found or inactive');
    }

    // Validate purchase (same as validate endpoint)
    if (!product.isGlobal && product.countryCode !== purchaseData.countryCode) {
      throw ApiError.badRequest('Product not available in selected country');
    }

    if (product.minValue && purchaseData.faceValue < Number(product.minValue)) {
      throw ApiError.badRequest(`Minimum value is ${product.minValue} ${purchaseData.currencyCode}`);
    }

    if (product.maxValue && purchaseData.faceValue > Number(product.maxValue)) {
      throw ApiError.badRequest(`Maximum value is ${product.maxValue} ${purchaseData.currencyCode}`);
    }

    // Calculate fees
    const feePercentage = 0.05; // 5%
    const fees = purchaseData.faceValue * feePercentage;
    const totalAmount = purchaseData.faceValue + fees;

    // TODO: Process payment (deduct from wallet or charge card)
    // For now, we'll assume payment is successful

    // Create order in our database
    const order = await prisma.giftCardOrder.create({
      data: {
        userId,
        productId: product.id,
        quantity: purchaseData.quantity,
        cardType: purchaseData.cardType,
        countryCode: purchaseData.countryCode,
        currencyCode: purchaseData.currencyCode,
        faceValue: purchaseData.faceValue,
        totalAmount,
        fees,
        paymentMethod: purchaseData.paymentMethod,
        paymentStatus: 'completed', // TODO: Update based on actual payment processing
        status: 'pending',
        recipientEmail: purchaseData.recipientEmail,
        recipientPhone: purchaseData.recipientPhone,
        senderName: purchaseData.senderName || `${user.firstname} ${user.lastname}`,
      },
    });

    // Create order in Reloadly
    try {
      const reloadlyOrder = await reloadlyOrdersService.createOrder({
        productId: product.reloadlyProductId,
        countryCode: purchaseData.countryCode,
        quantity: purchaseData.quantity,
        unitPrice: purchaseData.faceValue,
        customIdentifier: order.id,
        senderName: purchaseData.senderName || `${user.firstname} ${user.lastname}`,
        recipientEmail: purchaseData.recipientEmail || user.email,
        recipientPhoneDetails: purchaseData.recipientPhone
          ? {
              countryCode: purchaseData.countryCode,
              phoneNumber: purchaseData.recipientPhone.replace(/^\+/, ''),
            }
          : undefined,
      });

      // Update order with Reloadly response
      await prisma.giftCardOrder.update({
        where: { id: order.id },
        data: {
          reloadlyOrderId: String(reloadlyOrder.orderId),
          reloadlyTransactionId: String(reloadlyOrder.transactionId),
          reloadlyStatus: reloadlyOrder.status,
          status: reloadlyOrder.status === 'SUCCESS' ? 'completed' : 'processing',
          metadata: JSON.parse(JSON.stringify(reloadlyOrder)),
          completedAt: reloadlyOrder.status === 'SUCCESS' ? new Date() : null,
        },
      });

      // If order is immediately successful, fetch card code
      if (reloadlyOrder.status === 'SUCCESS' && reloadlyOrder.transactionId) {
        try {
          const cardCodes = await reloadlyOrdersService.getCardCodes(reloadlyOrder.transactionId);
          
          if (cardCodes.content && cardCodes.content.length > 0) {
            const cardCode = cardCodes.content[0];
            
            await prisma.giftCardOrder.update({
              where: { id: order.id },
              data: {
                cardCode: cardCode.redemptionCode,
                cardPin: cardCode.pin || null,
                expiryDate: cardCode.expiryDate ? new Date(cardCode.expiryDate) : null,
                status: 'completed',
                completedAt: new Date(),
              },
            });
          }
        } catch (cardError) {
          // Card code not available yet, will be fetched later
          console.log('Card code not available yet, will poll later');
        }
      }

      // Get updated order
      const updatedOrder = await prisma.giftCardOrder.findUnique({
        where: { id: order.id },
        include: {
          product: true,
        },
      });

      return new ApiResponse(200, {
        orderId: updatedOrder!.id,
        reloadlyOrderId: updatedOrder!.reloadlyOrderId,
        reloadlyTransactionId: updatedOrder!.reloadlyTransactionId,
        status: updatedOrder!.status,
        productName: updatedOrder!.product.productName,
        faceValue: Number(updatedOrder!.faceValue),
        totalAmount: Number(updatedOrder!.totalAmount),
        currencyCode: updatedOrder!.currencyCode,
        estimatedDelivery: updatedOrder!.completedAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }, 'Purchase completed successfully').send(res);
    } catch (reloadlyError) {
      // Reloadly order failed, update our order
      await prisma.giftCardOrder.update({
        where: { id: order.id },
        data: {
          status: 'failed',
          errorMessage: reloadlyError instanceof Error ? reloadlyError.message : 'Reloadly order failed',
        },
      });

      // TODO: Refund payment
      throw ApiError.internal('Failed to create order with Reloadly. Payment will be refunded.');
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to process purchase'));
  }
};





