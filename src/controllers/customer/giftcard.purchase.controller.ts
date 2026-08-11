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
import { creditReferralCommission, ReferralService } from '../../services/referral/referral.commission.service';
import { reloadlyProductsService } from '../../services/reloadly/reloadly.products.service';
import { Decimal } from '@prisma/client/runtime/library';
import { ReloadlyOrderRequest, ReloadlyOrderResponse } from '../../types/reloadly.types';
import { sendGiftCardOrderEmail } from '../../utils/authUtils';
import {
  debitWalletForGiftCardPurchase,
  refundGiftCardWalletDebit,
} from '../../services/giftcard/giftcard.purchase.wallet.service';
import { resolveGiftCardProvider } from '../../services/giftcard/giftcard.provider';
import { pagocardGiftcardsService } from '../../services/pagocard/pagocard.giftcards.service';
import { resolvePagocardSku, upsertPagocardGiftcardProduct } from '../../services/giftcard/giftcard.pagocard.store';

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

    const authenticatedUser = (req as any).user || req.body._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;
    const { getCustomerRestrictions, isFeatureFrozen, FEATURE_GIFT_CARD } = await import('../../utils/customer.restrictions');
    const restrictions = await getCustomerRestrictions(userId);
    if (restrictions.banned) return next(ApiError.forbidden('Your account has been banned. Contact support.'));
    if (isFeatureFrozen(restrictions, FEATURE_GIFT_CARD)) return next(ApiError.forbidden('Gift card purchase is temporarily disabled for your account.'));

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const {
      productId,
      sku,
      quantity,
      unitPrice,
      senderName,
      customIdentifier,
      preOrder = false,
      recipientEmail,
      recipientPhoneDetails,
      productAdditionalRequirements,
      provider,
    } = req.body as ReloadlyOrderRequest & {
      sku?: string;
      provider?: string;
      recipientPhoneDetails?: {
        countryCode?: string;
        phoneNumber?: string;
      };
    };

    const giftProvider = resolveGiftCardProvider(provider);

    if (giftProvider === 'pagocard') {
      const pagocardSku = resolvePagocardSku({ sku, productId: productId as string | number });
      if (!pagocardSku || !quantity || !unitPrice || !senderName) {
        throw ApiError.badRequest('Missing required fields: sku/productId, quantity, unitPrice, senderName');
      }

      const product = await pagocardGiftcardsService.getGiftcardBySku(pagocardSku);
      const unitPriceNum = typeof unitPrice === 'number' ? unitPrice : parseFloat(String(unitPrice));
      const quantityNum = typeof quantity === 'number' ? quantity : parseInt(String(quantity), 10);

      if (Number.isNaN(unitPriceNum) || unitPriceNum <= 0) {
        throw ApiError.badRequest('Invalid unitPrice');
      }
      if (Number.isNaN(quantityNum) || quantityNum < 1) {
        throw ApiError.badRequest('Invalid quantity');
      }

      const fixedAmounts = product.fixedAmounts || [];
      if (fixedAmounts.length > 0 && !fixedAmounts.includes(unitPriceNum)) {
        throw ApiError.badRequest(
          `Invalid unitPrice. For this product, unitPrice must be one of: ${fixedAmounts.join(', ')}`
        );
      }
      if (product.minAmount != null && unitPriceNum < product.minAmount) {
        throw ApiError.badRequest(`Invalid unitPrice. Minimum amount is ${product.minAmount}`);
      }
      if (product.maxAmount != null && unitPriceNum > product.maxAmount) {
        throw ApiError.badRequest(`Invalid unitPrice. Maximum amount is ${product.maxAmount}`);
      }

      const availability = await pagocardGiftcardsService.checkSkuAvailability(
        pagocardSku,
        quantityNum,
        unitPriceNum
      );
      if (!availability.available) {
        throw ApiError.badRequest(availability.message || 'Selected gift card is not available');
      }

      const dbProduct = await upsertPagocardGiftcardProduct(product);
      const orderCustomIdentifier = customIdentifier || `GC-${userId}-${Date.now()}`;
      const emailToSend = recipientEmail || user.email;
      const totalFaceValue = unitPriceNum * quantityNum;

      const walletDebit = await debitWalletForGiftCardPurchase({
        userId,
        unitPrice: unitPriceNum,
        quantity: quantityNum,
        productCurrencyCode: product.currency || 'USD',
        productName: product.title || product.name || `Gift Card ${pagocardSku}`,
      });

      let pagocardOrder;
      try {
        pagocardOrder = await pagocardGiftcardsService.purchaseGiftcard({
          sku: pagocardSku,
          quantity: quantityNum,
          amount: unitPriceNum,
        });
      } catch (error: any) {
        const msg = error?.message || 'Unknown error';
        await refundGiftCardWalletDebit({
          userId,
          walletId: walletDebit.walletId,
          amountNgn: walletDebit.amountNgn,
          originalFiatTxId: walletDebit.fiatTransactionId,
          errorMessage: msg,
        }).catch((refundErr) =>
          console.error('[GIFT CARD PURCHASE] Refund after Pagocard failure failed:', refundErr)
        );
        return next(ApiError.internal(`Failed to create order with Pagocard: ${msg}`));
      }

      let cardCode = pagocardOrder.cardCode || undefined;
      let cardPin = pagocardOrder.cardPin || undefined;
      let shareLink = pagocardOrder.shareLink || null;

      if ((!cardCode || !shareLink) && pagocardOrder.referenceCode) {
        try {
          const orderDetails = await pagocardGiftcardsService.getGiftcardOrder(pagocardOrder.referenceCode);
          cardCode = cardCode || orderDetails.cardCode || undefined;
          cardPin = cardPin || orderDetails.cardPin || undefined;
          shareLink = shareLink || orderDetails.shareLink || null;
        } catch (detailsError) {
          console.log('[GIFT CARD PURCHASE] Pagocard order details not ready yet');
        }
      }

      const isSuccessful = ['success', 'successful', 'completed', 'delivered'].includes(
        pagocardOrder.status.toLowerCase()
      );

      const order = await prisma.giftCardOrder.create({
        data: {
          userId,
          productId: dbProduct.id,
          quantity: quantityNum,
          currencyCode: product.currency || 'USD',
          faceValue: unitPriceNum,
          totalAmount: totalFaceValue,
          fees: 0,
          exchangeRate: new Decimal(walletDebit.ngnPerUsd),
          paymentMethod: 'wallet',
          paymentStatus: isSuccessful ? 'completed' : 'pending',
          paymentTransactionId: walletDebit.fiatTransactionId,
          status: isSuccessful ? 'completed' : 'processing',
          recipientEmail: emailToSend,
          senderName,
          countryCode: product.region || 'US',
          cardType: 'E-Code',
          reloadlyOrderId: pagocardOrder.referenceCode,
          reloadlyTransactionId: pagocardOrder.referenceCode,
          reloadlyStatus: pagocardOrder.status,
          cardCode: cardCode || null,
          cardPin: cardPin || null,
          metadata: JSON.stringify({
            provider: 'pagocard',
            pagocard: pagocardOrder.raw,
            shareLink,
            billing: {
              fiatTransactionId: walletDebit.fiatTransactionId,
              chargedNgn: walletDebit.amountNgn,
              usdNotional: walletDebit.usdNotional,
              ngnPerUsd: walletDebit.ngnPerUsd,
            },
          }),
          completedAt: isSuccessful ? new Date() : null,
        },
      });

      if (emailToSend) {
        try {
          await sendGiftCardOrderEmail(emailToSend, {
            transactionId: pagocardOrder.referenceCode as unknown as number,
            productName: product.title || product.name || `Gift Card ${pagocardSku}`,
            brandName: product.title || product.name,
            countryCode: product.region,
            quantity: quantityNum,
            unitPrice: unitPriceNum,
            currencyCode: product.currency || 'USD',
            totalAmount: totalFaceValue,
            fee: 0,
            status: isSuccessful ? 'SUCCESSFUL' : pagocardOrder.status.toUpperCase(),
            cardCode,
            cardPin,
            expiryDate: null,
            redemptionInstructions: product.instructions || shareLink || undefined,
            transactionCreatedTime: new Date().toISOString(),
            senderName,
          });
        } catch (emailError) {
          console.error('[GIFT CARD PURCHASE] Failed to send email:', emailError);
        }
      }

      if (isSuccessful) {
        creditReferralCommission(userId, ReferralService.GIFT_CARD_BUY, totalFaceValue)
          .catch((err) => console.error('[GiftCardPurchase] Referral commission error:', err));
      }

      return new ApiResponse(200, {
        transactionId: pagocardOrder.referenceCode,
        amount: totalFaceValue,
        discount: 0,
        currencyCode: product.currency || 'USD',
        fee: 0,
        totalFee: 0,
        recipientEmail: emailToSend,
        customIdentifier: orderCustomIdentifier,
        status: isSuccessful ? 'SUCCESSFUL' : pagocardOrder.status.toUpperCase(),
        product: {
          productId: pagocardSku,
          productName: product.title || product.name || `Gift Card ${pagocardSku}`,
          brand: product.title || product.name ? { brandName: product.title || product.name } : undefined,
          countryCode: product.region || 'US',
          quantity: quantityNum,
          unitPrice: unitPriceNum,
          currencyCode: product.currency || 'USD',
        },
        transactionCreatedTime: new Date().toISOString(),
        preOrdered: false,
        orderId: order.id,
        provider: 'pagocard',
        shareLink,
        cardCode,
        cardPin,
        chargedNgn: walletDebit.amountNgn,
        usdNotionalBilled: walletDebit.usdNotional,
        ngnPerUsdApplied: walletDebit.ngnPerUsd,
        fiatTransactionId: walletDebit.fiatTransactionId,
      }, 'Gift card order created successfully').send(res);
    }

    // Reloadly flow
    const reloadlyBody = req.body as ReloadlyOrderRequest & {
      recipientPhoneDetails?: {
        countryCode?: string;
        phoneNumber?: string;
      };
    };

    if (!reloadlyBody.productId || !reloadlyBody.quantity || !reloadlyBody.unitPrice || !reloadlyBody.senderName) {
      throw ApiError.badRequest('Missing required fields: productId, quantity, unitPrice, senderName');
    }

    const {
      productId: reloadlyProductId,
      quantity: reloadlyQuantity,
      unitPrice: reloadlyUnitPrice,
      senderName: reloadlySenderName,
      customIdentifier: reloadlyCustomIdentifier,
      preOrder: reloadlyPreOrder = false,
      recipientEmail: reloadlyRecipientEmail,
      recipientPhoneDetails: reloadlyRecipientPhoneDetails,
      productAdditionalRequirements: reloadlyProductAdditionalRequirements,
    } = reloadlyBody;

    let product;
    try {
      product = await reloadlyProductsService.getProductById(Number(reloadlyProductId));
    } catch (error) {
      throw ApiError.notFound(`Product ${reloadlyProductId} not found in Reloadly`);
    }

    if (product.denominationType === 'FIXED') {
      const fixedDenominations = product.fixedRecipientDenominations || [];
      if (!fixedDenominations.includes(reloadlyUnitPrice)) {
        throw ApiError.badRequest(
          `Invalid unitPrice. For this product, unitPrice must be one of: ${fixedDenominations.join(', ')}`
        );
      }
    } else if (product.denominationType === 'RANGE') {
      const minPrice = product.minRecipientDenomination || 0;
      const maxPrice = product.maxRecipientDenomination || Infinity;
      if (reloadlyUnitPrice < minPrice || reloadlyUnitPrice > maxPrice) {
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
    
    const unitPriceNum = typeof reloadlyUnitPrice === 'number' ? reloadlyUnitPrice : parseFloat(String(reloadlyUnitPrice));
    const quantityNum = typeof reloadlyQuantity === 'number' ? reloadlyQuantity : parseInt(String(reloadlyQuantity), 10);

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
    const orderCustomIdentifier = reloadlyCustomIdentifier || `GC-${userId}-${Date.now()}`;
    const emailToSendToReloadly = reloadlyRecipientEmail || user.email;

    const reloadlyOrderRequest: ReloadlyOrderRequest = {
      productId: Number(reloadlyProductId),
      quantity: reloadlyQuantity,
      unitPrice: reloadlyUnitPrice,
      senderName: reloadlySenderName,
      customIdentifier: orderCustomIdentifier,
      recipientEmail: emailToSendToReloadly,
      ...(reloadlyPreOrder === true && { preOrder: true }),
      ...(reloadlyRecipientPhoneDetails?.countryCode && reloadlyRecipientPhoneDetails?.phoneNumber && {
        recipientPhoneDetails: {
          countryCode: reloadlyRecipientPhoneDetails.countryCode,
          phoneNumber: reloadlyRecipientPhoneDetails.phoneNumber,
        },
      }),
      ...(reloadlyProductAdditionalRequirements && { productAdditionalRequirements: reloadlyProductAdditionalRequirements }),
    };

    // Log the complete request object before sending to Reloadly
    console.log('[GIFT CARD PURCHASE] Complete Reloadly Order Request:', JSON.stringify(reloadlyOrderRequest, null, 2));

    // Debit NGN wallet using admin-configured GIFT_CARD_BUY tiers (NGN per USD of face value)
    const walletDebit = await debitWalletForGiftCardPurchase({
      userId,
      unitPrice: unitPriceNum,
      quantity: quantityNum,
      productCurrencyCode: product.currencyCode || 'USD',
      productName: product.productName,
    });

    let reloadlyOrder: ReloadlyOrderResponse;
    try {
      reloadlyOrder = await reloadlyOrdersService.createOrder(reloadlyOrderRequest);
    } catch (error: any) {
      const msg = error?.message || 'Unknown error';
      await refundGiftCardWalletDebit({
        userId,
        walletId: walletDebit.walletId,
        amountNgn: walletDebit.amountNgn,
        originalFiatTxId: walletDebit.fiatTransactionId,
        errorMessage: msg,
      }).catch((refundErr) =>
        console.error('[GIFT CARD PURCHASE] Refund after Reloadly failure failed:', refundErr)
      );
      return next(ApiError.internal(`Failed to create order with Reloadly: ${msg}`));
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
        exchangeRate: new Decimal(walletDebit.ngnPerUsd),
        paymentMethod: 'wallet',
        paymentStatus: 'completed',
        paymentTransactionId: walletDebit.fiatTransactionId,
        status: reloadlyOrder.status === 'SUCCESSFUL' ? 'completed' : 'pending',
        recipientEmail: reloadlyOrder.recipientEmail,
        senderName: reloadlyOrderRequest.senderName,
        countryCode: reloadlyOrder.product.countryCode || product.countryCode || 'US', // Get from order or product
        cardType: 'E-Code', // Default to E-Code (Reloadly doesn't specify card type in order API)
        reloadlyOrderId: String(reloadlyOrder.transactionId),
        reloadlyTransactionId: String(reloadlyOrder.transactionId),
        reloadlyStatus: reloadlyOrder.status,
        metadata: JSON.stringify({
          reloadly: reloadlyOrder,
          billing: {
            fiatTransactionId: walletDebit.fiatTransactionId,
            chargedNgn: walletDebit.amountNgn,
            usdNotional: walletDebit.usdNotional,
            ngnPerUsd: walletDebit.ngnPerUsd,
          },
        }),
        completedAt: reloadlyOrder.status === 'SUCCESSFUL' ? new Date() : null,
      },
    });

    // If order is immediately successful, try to fetch card code
    let cardCode: string | undefined;
    let cardPin: string | undefined;
    let expiryDate: Date | null = null;
    
    if (reloadlyOrder.status === 'SUCCESSFUL' && reloadlyOrder.transactionId) {
      try {
        const cardCodes = await reloadlyOrdersService.getCardCodes(reloadlyOrder.transactionId);
        
        if (cardCodes.content && cardCodes.content.length > 0) {
          const cardCodeData = cardCodes.content[0];
          cardCode = cardCodeData.redemptionCode;
          cardPin = cardCodeData.pin;
          expiryDate = cardCodeData.expiryDate ? new Date(cardCodeData.expiryDate) : null;
          
          await prisma.giftCardOrder.update({
            where: { id: order.id },
            data: {
              cardCode: cardCode,
              cardPin: cardPin || null,
              expiryDate: expiryDate,
            },
          });
        }
      } catch (cardError) {
        // Card code not available yet, will be fetched later via polling
        console.log('Card code not available yet, will poll later');
      }
    }

    // Send email notification to user
    // Use the same email that was sent to Reloadly
    if (emailToSendToReloadly) {
      try {
        // Get redemption instructions from product
        let redemptionInstructions: string | null = null;
        if (product.redeemInstruction) {
          if (typeof product.redeemInstruction === 'string') {
            redemptionInstructions = product.redeemInstruction;
          } else if (typeof product.redeemInstruction === 'object') {
            const redeemObj = product.redeemInstruction as any;
            redemptionInstructions = redeemObj.verbose || redeemObj.concise || JSON.stringify(redeemObj);
          }
        }

        await sendGiftCardOrderEmail(emailToSendToReloadly, {
          transactionId: reloadlyOrder.transactionId,
          productName: reloadlyOrder.product.productName,
          brandName: reloadlyOrder.product.brand?.brandName,
          countryCode: reloadlyOrder.product.countryCode,
          quantity: reloadlyOrder.product.quantity,
          unitPrice: reloadlyOrder.product.unitPrice,
          currencyCode: reloadlyOrder.product.currencyCode || reloadlyOrder.currencyCode,
          totalAmount: reloadlyOrder.amount,
          fee: reloadlyOrder.fee,
          status: reloadlyOrder.status,
          cardCode: cardCode,
          cardPin: cardPin,
          expiryDate: expiryDate,
          redemptionInstructions: redemptionInstructions,
          transactionCreatedTime: reloadlyOrder.transactionCreatedTime,
          senderName: reloadlySenderName,
        });
        console.log(`[GIFT CARD PURCHASE] Email sent to ${emailToSendToReloadly} for order #${reloadlyOrder.transactionId}`);
      } catch (emailError) {
        // Don't fail the order if email fails - just log it
        console.error('[GIFT CARD PURCHASE] Failed to send email:', emailError);
      }
    }

    if (reloadlyOrder.status === 'SUCCESSFUL') {
      creditReferralCommission(userId, ReferralService.GIFT_CARD_BUY, reloadlyOrder.amount)
        .catch((err) => console.error('[GiftCardPurchase] Referral commission error:', err));
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
      chargedNgn: walletDebit.amountNgn,
      usdNotionalBilled: walletDebit.usdNotional,
      ngnPerUsdApplied: walletDebit.ngnPerUsd,
      fiatTransactionId: walletDebit.fiatTransactionId,
    }, 'Gift card order created successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to process purchase'));
  }
};
