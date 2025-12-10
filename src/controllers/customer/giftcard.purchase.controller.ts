/**
 * Gift Card Purchase Controller
 * 
 * Handles gift card purchase flow according to Reloadly's official API:
 * - Fetch product details from Reloadly API (not database)
 * - Create order directly with Reloadly
 * - Store order in database for tracking
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { reloadlyOrdersService } from '../../services/reloadly/reloadly.orders.service';
import { reloadlyProductsService } from '../../services/reloadly/reloadly.products.service';
import { ReloadlyOrderRequest, ReloadlyOrderResponse } from '../../types/reloadly.types';

/**
 * Process gift card purchase
 * POST /api/v2/giftcards/purchase
 * 
 * According to Reloadly official documentation:
 * - productId (required)
 * - quantity (required)
 * - unitPrice (required) - must be from fixedRecipientDenominations or within min/max range
 * - senderName (required)
 * - customIdentifier (optional)
 * - preOrder (optional, default false)
 * - recipientEmail (optional)
 * - recipientPhoneDetails (optional)
 * - productAdditionalRequirements (optional)
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

    // Extract order data from request body (matching Reloadly's structure)
    const {
      productId,
      quantity,
      unitPrice,
      senderName,
      customIdentifier,
      preOrder = false,
      recipientEmail,
      recipientPhoneDetails,
      productAdditionalRequirements,
    } = req.body as ReloadlyOrderRequest & {
      recipientPhoneDetails?: {
        countryCode?: string;
        phoneNumber?: string;
      };
    };

    // Validate required fields
    if (!productId || !quantity || !unitPrice || !senderName) {
      throw ApiError.badRequest('Missing required fields: productId, quantity, unitPrice, senderName');
    }

    // Fetch product details from Reloadly API only (not database)
    let product;
    try {
      product = await reloadlyProductsService.getProductById(productId);
    } catch (error) {
      throw ApiError.notFound(`Product ${productId} not found in Reloadly`);
    }

    // Validate unitPrice against product's denomination requirements
    if (product.denominationType === 'FIXED') {
      // For FIXED denomination, unitPrice must be in fixedRecipientDenominations
      const fixedDenominations = product.fixedRecipientDenominations || [];
      if (!fixedDenominations.includes(unitPrice)) {
        throw ApiError.badRequest(
          `Invalid unitPrice. For this product, unitPrice must be one of: ${fixedDenominations.join(', ')}`
        );
      }
    } else if (product.denominationType === 'RANGE') {
      // For RANGE denomination, unitPrice must be within min/max
      const minPrice = product.minRecipientDenomination || 0;
      const maxPrice = product.maxRecipientDenomination || Infinity;
      if (unitPrice < minPrice || unitPrice > maxPrice) {
        throw ApiError.badRequest(
          `Invalid unitPrice. For this product, unitPrice must be between ${minPrice} and ${maxPrice}`
        );
      }
    }

    // Ensure product exists in database BEFORE creating order (for foreign key constraint)
    // We only use Reloadly product data, but need DB record for the order
    const isVariableDenomination = !product.fixedRecipientDenominations || product.fixedRecipientDenominations.length === 0;
    const imageUrl = product.logoUrl || (product.logoUrls && product.logoUrls.length > 0 ? product.logoUrls[0] : null);
    
    // Handle redeemInstruction - it can be a string or an object with concise/verbose
    let redemptionInstructions: string | null = null;
    if (product.redeemInstruction) {
      if (typeof product.redeemInstruction === 'string') {
        redemptionInstructions = product.redeemInstruction;
      } else if (typeof product.redeemInstruction === 'object') {
        // If it's an object, prefer verbose, fallback to concise, or stringify the whole object
        const redeemObj = product.redeemInstruction as any;
        redemptionInstructions = redeemObj.verbose || redeemObj.concise || JSON.stringify(redeemObj);
      }
    }
    
    const dbProduct = await prisma.giftCardProduct.upsert({
      where: { reloadlyProductId: product.productId },
      update: {
        // Update product info if it exists (but we don't use this data, only for FK)
        productName: product.productName,
        brandName: product.brandName || null,
        countryCode: product.countryCode || 'US',
        currencyCode: product.currencyCode || 'USD',
        minValue: product.minRecipientDenomination ? parseFloat(String(product.minRecipientDenomination)) : null,
        maxValue: product.maxRecipientDenomination ? parseFloat(String(product.maxRecipientDenomination)) : null,
        fixedValue: product.fixedRecipientDenominations && product.fixedRecipientDenominations.length === 1
          ? parseFloat(String(product.fixedRecipientDenominations[0]))
          : null,
        isVariableDenomination,
        reloadlyImageUrl: imageUrl || null,
        reloadlyLogoUrls: product.logoUrls ? JSON.stringify(product.logoUrls) : null,
        productType: product.productType || null,
        redemptionInstructions,
        description: product.description || null,
        lastSyncedAt: new Date(),
      },
      create: {
        // Create product in DB (only for FK constraint, we use Reloadly data)
        reloadlyProductId: product.productId,
        productName: product.productName,
        brandName: product.brandName || null,
        countryCode: product.countryCode || 'US',
        currencyCode: product.currencyCode || 'USD',
        minValue: product.minRecipientDenomination ? parseFloat(String(product.minRecipientDenomination)) : null,
        maxValue: product.maxRecipientDenomination ? parseFloat(String(product.maxRecipientDenomination)) : null,
        fixedValue: product.fixedRecipientDenominations && product.fixedRecipientDenominations.length === 1
          ? parseFloat(String(product.fixedRecipientDenominations[0]))
          : null,
        isVariableDenomination,
        isGlobal: product.isGlobal || false,
        reloadlyImageUrl: imageUrl || null,
        reloadlyLogoUrls: product.logoUrls ? JSON.stringify(product.logoUrls) : null,
        productType: product.productType || null,
        redemptionInstructions,
        description: product.description || null,
        status: 'active',
        lastSyncedAt: new Date(),
      },
    });

    // Generate custom identifier if not provided
    const orderCustomIdentifier = customIdentifier || `GC-${userId}-${Date.now()}`;

    // Prepare Reloadly order request
    const reloadlyOrderRequest: ReloadlyOrderRequest = {
      productId,
      quantity,
      unitPrice,
      senderName,
      customIdentifier: orderCustomIdentifier,
      preOrder,
      recipientEmail: recipientEmail || user.email,
      recipientPhoneDetails: recipientPhoneDetails
        ? {
            countryCode: recipientPhoneDetails.countryCode,
            phoneNumber: recipientPhoneDetails.phoneNumber,
          }
        : undefined,
      productAdditionalRequirements,
    };

    // Create order in Reloadly
    let reloadlyOrder: ReloadlyOrderResponse;
    try {
      reloadlyOrder = await reloadlyOrdersService.createOrder(reloadlyOrderRequest);
    } catch (error: any) {
      throw ApiError.internal(
        `Failed to create order with Reloadly: ${error.message || 'Unknown error'}`
      );
    }

    // Store order in database for tracking
    const order = await prisma.giftCardOrder.create({
      data: {
        userId,
        productId: dbProduct.id, // Use internal database ID, not Reloadly product ID
        quantity: reloadlyOrder.product.quantity,
        currencyCode: reloadlyOrder.currencyCode,
        faceValue: reloadlyOrder.product.unitPrice,
        totalAmount: reloadlyOrder.amount,
        fees: reloadlyOrder.fee,
        paymentMethod: 'wallet', // TODO: Get from request if payment method is passed
        paymentStatus: 'completed', // TODO: Update based on actual payment processing
        status: reloadlyOrder.status === 'SUCCESSFUL' ? 'completed' : 'pending',
        recipientEmail: reloadlyOrder.recipientEmail,
        senderName: reloadlyOrderRequest.senderName,
        countryCode: reloadlyOrder.product.countryCode || product.countryCode || 'US', // Get from order or product
        cardType: 'E-Code', // Default to E-Code (Reloadly doesn't specify card type in order API)
        reloadlyOrderId: String(reloadlyOrder.transactionId),
        reloadlyTransactionId: String(reloadlyOrder.transactionId),
        reloadlyStatus: reloadlyOrder.status,
        metadata: JSON.stringify(reloadlyOrder),
        completedAt: reloadlyOrder.status === 'SUCCESSFUL' ? new Date() : null,
      },
    });

    // If order is immediately successful, try to fetch card code
    if (reloadlyOrder.status === 'SUCCESSFUL' && reloadlyOrder.transactionId) {
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
            },
          });
        }
      } catch (cardError) {
        // Card code not available yet, will be fetched later via polling
        console.log('Card code not available yet, will poll later');
      }
    }

    // Return response matching Reloadly's structure
    return new ApiResponse(200, {
      transactionId: reloadlyOrder.transactionId,
      amount: reloadlyOrder.amount,
      discount: reloadlyOrder.discount,
      currencyCode: reloadlyOrder.currencyCode,
      fee: reloadlyOrder.fee,
      totalFee: reloadlyOrder.totalFee,
      recipientEmail: reloadlyOrder.recipientEmail,
      customIdentifier: reloadlyOrder.customIdentifier,
      status: reloadlyOrder.status,
      product: reloadlyOrder.product,
      transactionCreatedTime: reloadlyOrder.transactionCreatedTime,
      preOrdered: reloadlyOrder.preOrdered,
      balanceInfo: reloadlyOrder.balanceInfo,
      orderId: order.id, // Our internal order ID
    }, 'Gift card order created successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to process purchase'));
  }
};
