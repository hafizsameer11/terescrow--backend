/**
 * Gift Card Order Controller
 * 
 * Handles order management endpoints:
 * - Get user's orders
 * - Get order by ID
 * - Get card details (code, PIN, etc.)
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { reloadlyOrdersService } from '../../services/reloadly/reloadly.orders.service';
import { sendGiftCardOrderEmail } from '../../utils/authUtils';

/**
 * Get user's gift card orders
 */
export const getUserOrdersController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;

    if (!user || !user.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = user.id;

    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = {
      userId,
    };

    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.giftCardOrder.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              productName: true,
              brandName: true,
              reloadlyImageUrl: true,
              imageUrl: true,
            },
          },
        },
      }),
      prisma.giftCardOrder.count({ where }),
    ]);

    const formattedOrders = orders.map((order) => ({
      orderId: order.id,
      reloadlyOrderId: order.reloadlyOrderId,
      status: order.status,
      productName: order.product.productName,
      brandName: order.product.brandName,
      productImage: order.product.reloadlyImageUrl || order.product.imageUrl,
      faceValue: Number(order.faceValue),
      totalAmount: Number(order.totalAmount),
      currencyCode: order.currencyCode,
      quantity: order.quantity,
      cardType: order.cardType,
      createdAt: order.createdAt,
      completedAt: order.completedAt,
    }));

    return new ApiResponse(200, {
      orders: formattedOrders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    }, 'Orders retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to fetch orders'));
  }
};

/**
 * Get order by ID
 */
export const getOrderByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const user = req.body._user;

    if (!user || !user.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = user.id;

    const order = await prisma.giftCardOrder.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        product: {
          select: {
            productName: true,
            brandName: true,
            reloadlyImageUrl: true,
            imageUrl: true,
            redemptionInstructions: true,
          },
        },
      },
    });

    if (!order) {
      throw ApiError.notFound('Order not found');
    }

    const formattedOrder = {
      orderId: order.id,
      reloadlyOrderId: order.reloadlyOrderId,
      reloadlyTransactionId: order.reloadlyTransactionId,
      status: order.status,
      productName: order.product.productName,
      brandName: order.product.brandName,
      productImage: order.product.reloadlyImageUrl || order.product.imageUrl,
      faceValue: Number(order.faceValue),
      totalAmount: Number(order.totalAmount),
      fees: Number(order.fees),
      currencyCode: order.currencyCode,
      quantity: order.quantity,
      cardType: order.cardType,
      countryCode: order.countryCode,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      recipientEmail: order.recipientEmail,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      completedAt: order.completedAt,
    };

    return new ApiResponse(200, formattedOrder, 'Order retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to fetch order'));
  }
};

/**
 * Get card details (code, PIN, expiry) for an order
 */
export const getCardDetailsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const user = req.body._user;

    if (!user || !user.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = user.id;

    const order = await prisma.giftCardOrder.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        product: {
          select: {
            productName: true,
            brandName: true,
            reloadlyImageUrl: true,
            imageUrl: true,
            redemptionInstructions: true,
          },
        },
        user: {
          select: {
            email: true,
            firstname: true,
          },
        },
      },
    });

    if (!order) {
      throw ApiError.notFound('Order not found');
    }

    // If order is still processing, try to fetch card code from Reloadly
    if (order.status === 'processing' && order.reloadlyTransactionId) {
      try {
        const cardCodes = await reloadlyOrdersService.getCardCodes(
          parseInt(order.reloadlyTransactionId, 10)
        );

        if (cardCodes.content && cardCodes.content.length > 0) {
          const cardCode = cardCodes.content[0];

          // Check if card code was already available (to avoid duplicate emails)
          const hadCardCode = !!order.cardCode;

          // Update order with card code
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

          // Reload order with all relations needed
          const updatedOrder = await prisma.giftCardOrder.findUnique({
            where: { id: order.id },
            include: {
              product: {
                select: {
                  productName: true,
                  brandName: true,
                  reloadlyImageUrl: true,
                  imageUrl: true,
                  redemptionInstructions: true,
                },
              },
              user: {
                select: {
                  email: true,
                  firstname: true,
                },
              },
            },
          });

          // Send email if card code just became available (wasn't available before)
          if (updatedOrder && !hadCardCode) {
            const emailToSend = updatedOrder.recipientEmail || updatedOrder.user?.email || order.user?.email;
            if (emailToSend) {
              try {
                await sendGiftCardOrderEmail(emailToSend, {
                  transactionId: parseInt(updatedOrder.reloadlyTransactionId || order.reloadlyTransactionId || '0', 10),
                  productName: updatedOrder.product.productName,
                  brandName: updatedOrder.product.brandName || undefined,
                  countryCode: updatedOrder.countryCode || order.countryCode || undefined,
                  quantity: updatedOrder.quantity,
                  unitPrice: Number(updatedOrder.faceValue),
                  currencyCode: updatedOrder.currencyCode,
                  totalAmount: Number(updatedOrder.totalAmount),
                  fee: Number(updatedOrder.fees),
                  status: 'SUCCESSFUL',
                  cardCode: cardCode.redemptionCode,
                  cardPin: cardCode.pin,
                  expiryDate: cardCode.expiryDate ? new Date(cardCode.expiryDate) : null,
                  redemptionInstructions: updatedOrder.product.redemptionInstructions || undefined,
                  transactionCreatedTime: updatedOrder.createdAt.toISOString(),
                  senderName: updatedOrder.senderName || updatedOrder.user?.firstname || order.user?.firstname || undefined,
                });
                console.log(`[GIFT CARD ORDER] Email sent to ${emailToSend} for order #${order.id} with card code`);
              } catch (emailError) {
                // Don't fail the request if email fails - just log it
                console.error('[GIFT CARD ORDER] Failed to send email:', emailError);
              }
            }
          }

          if (updatedOrder) {
            return new ApiResponse(200, {
              orderId: updatedOrder.id,
              status: updatedOrder.status,
              productName: updatedOrder.product.productName,
              brandName: updatedOrder.product.brandName,
              faceValue: Number(updatedOrder.faceValue),
              currencyCode: updatedOrder.currencyCode,
              cardCode: updatedOrder.cardCode,
              cardPin: updatedOrder.cardPin,
              expiryDate: updatedOrder.expiryDate,
              redemptionInstructions: updatedOrder.product.redemptionInstructions,
              cardImageUrl: updatedOrder.product.reloadlyImageUrl || updatedOrder.product.imageUrl,
            }, 'Card details retrieved successfully').send(res);
          }
        }
      } catch (error) {
        // Card code not available yet
        console.log('Card code not available yet');
      }
    }

    // If order is completed, return stored card details
    if (order.status === 'completed' && order.cardCode) {
      return new ApiResponse(200, {
        orderId: order.id,
        status: order.status,
        productName: order.product.productName,
        brandName: order.product.brandName,
        faceValue: Number(order.faceValue),
        currencyCode: order.currencyCode,
        cardCode: order.cardCode,
        cardPin: order.cardPin,
        expiryDate: order.expiryDate,
        redemptionInstructions: order.product.redemptionInstructions,
        cardImageUrl: order.product.reloadlyImageUrl || order.product.imageUrl,
      }, 'Card details retrieved successfully').send(res);
    }

    // Order is still processing
    return new ApiResponse(200, {
      orderId: order.id,
      status: order.status,
      productName: order.product.productName,
      message: 'Card code is being processed. Please check back in a few moments.',
    }, 'Order is still processing').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to fetch card details'));
  }
};

