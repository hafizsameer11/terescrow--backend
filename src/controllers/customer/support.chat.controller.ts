/**
 * Support Chat Controller
 * 
 * Handles support chat functionality without sockets:
 * - Create new support chat
 * - Get user's support chats (with filters)
 * - Get chat messages
 * - Send message (user or support)
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

/**
 * Create a new support chat
 * POST /api/v2/support/chats
 */
export const createSupportChatController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', errors.array());
    }

    // Check req.user first (set by authenticateUser, not overwritten by multer)
    // Fall back to req.body._user for backward compatibility
    const authenticatedUser = (req as any).user || req.body._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;
    const { subject, category, initialMessage } = req.body;

    // Validate required fields
    if (!subject || !initialMessage) {
      throw ApiError.badRequest('Subject and initial message are required');
    }

    // Check if user already has a pending chat for the same category
    if (category) {
      const existingPendingChat = await prisma.supportChat.findFirst({
        where: {
          userId,
          category,
          status: 'pending',
        },
        include: {
          user: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              profilePicture: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });

      if (existingPendingChat) {
        // Return existing pending chat instead of creating new one
        return new ApiResponse(200, {
          chat: {
            id: existingPendingChat.id,
            subject: existingPendingChat.subject,
            category: existingPendingChat.category,
            status: existingPendingChat.status,
            createdAt: existingPendingChat.createdAt,
            updatedAt: existingPendingChat.updatedAt,
            user: existingPendingChat.user,
            lastMessage: existingPendingChat.messages[0] || null,
          },
          message: 'You already have a pending chat for this category',
        }, 'Existing pending chat retrieved').send(res);
      }
    }

    // Create support chat with initial message
    const supportChat = await prisma.supportChat.create({
      data: {
        userId,
        subject,
        category: category || null,
        status: 'pending',
        lastMessageAt: new Date(),
        messages: {
          create: {
            senderType: 'user',
            senderId: userId,
            message: initialMessage,
            isRead: false,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            profilePicture: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    return new ApiResponse(201, {
      chat: {
        id: supportChat.id,
        subject: supportChat.subject,
        category: supportChat.category,
        status: supportChat.status,
        createdAt: supportChat.createdAt,
        updatedAt: supportChat.updatedAt,
        user: supportChat.user,
        lastMessage: supportChat.messages[0] || null,
      },
    }, 'Support chat created successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to create support chat'));
  }
};

/**
 * Get user's support chats with filters
 * GET /api/v2/support/chats
 */
export const getSupportChatsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check req.user first (set by authenticateUser, not overwritten by multer)
    // Fall back to req.body._user for backward compatibility
    const authenticatedUser = (req as any).user || req.body._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = { userId };
    if (status && ['pending', 'processing', 'completed'].includes(status as string)) {
      where.status = status;
    }

    // Debug: Log the query
    console.log('[SupportChat] Query params:', { 
      userId, 
      userIdType: typeof userId,
      where, 
      skip, 
      take: limitNum 
    });

    // Get chats with last message
    // Order by createdAt desc (lastMessageAt can be null and cause issues)
    const [chats, total] = await Promise.all([
      prisma.supportChat.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              profilePicture: true,
            },
          },
          assignedAgent: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              profilePicture: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              message: true,
              imageUrl: true,
              senderType: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.supportChat.count({ where }),
    ]);

    // Debug: Log results
    console.log('[SupportChat] Found chats:', chats.length, 'Total:', total, 'UserId:', userId, 'Where:', JSON.stringify(where));

    const formattedChats = chats.map((chat: any) => ({
      id: chat.id,
      subject: chat.subject,
      category: chat.category,
      status: chat.status,
      user: chat.user,
      assignedAgent: chat.assignedAgent,
      lastMessage: chat.messages[0] || null,
      lastMessageAt: chat.lastMessageAt,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    }));

    return new ApiResponse(200, {
      chats: formattedChats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        returned: formattedChats.length,
      },
    }, 'Support chats retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to retrieve support chats'));
  }
};

/**
 * Get support chat by ID with messages
 * GET /api/v2/support/chats/:chatId
 */
export const getSupportChatByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check req.user first (set by authenticateUser, not overwritten by multer)
    // Fall back to req.body._user for backward compatibility
    const authenticatedUser = (req as any).user || req.body._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;
    const { chatId } = req.params;
    const { page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get chat
    const chat = await prisma.supportChat.findFirst({
      where: {
        id: parseInt(chatId, 10),
        userId, // Ensure user can only access their own chats
      },
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            profilePicture: true,
          },
        },
        assignedAgent: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            profilePicture: true,
          },
        },
      },
    });

    if (!chat) {
      throw ApiError.notFound('Support chat not found');
    }

    // Get messages
    const [messages, totalMessages] = await Promise.all([
      prisma.supportChatMessage.findMany({
        where: { supportChatId: chat.id },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.supportChatMessage.count({
        where: { supportChatId: chat.id },
      }),
    ]);

    // Reverse to show oldest first
    messages.reverse();

    return new ApiResponse(200, {
      chat: {
        id: chat.id,
        subject: chat.subject,
        category: chat.category,
        status: chat.status,
        user: chat.user,
        assignedAgent: chat.assignedAgent,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
      messages: messages.map((msg: any) => ({
        id: msg.id,
        senderType: msg.senderType,
        senderId: msg.senderId,
        message: msg.message,
        imageUrl: msg.imageUrl,
        isRead: msg.isRead,
        createdAt: msg.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalMessages,
        totalPages: Math.ceil(totalMessages / limitNum),
        returned: messages.length,
      },
    }, 'Support chat retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to retrieve support chat'));
  }
};

/**
 * Send a message in support chat
 * POST /api/v2/support/chats/:chatId/messages
 */
export const sendSupportChatMessageController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check req.user first (set by authenticateUser, not overwritten by multer)
    // Fall back to req.body._user for backward compatibility
    const authenticatedUser = (req as any).user || req.body._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;
    const { chatId } = req.params;
    const { message, senderType = 'user' } = req.body;

    // Get image file if uploaded
    const imageFile = (req as any).file;

    // Validate message or image (at least one required)
    if ((!message || message.trim().length === 0) && !imageFile) {
      throw ApiError.badRequest('Message or image is required');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', errors.array());
    }

    // Validate sender type
    if (!['user', 'support'].includes(senderType)) {
      throw ApiError.badRequest('Invalid sender type. Must be "user" or "support"');
    }

    // Get chat
    const chat = await prisma.supportChat.findFirst({
      where: {
        id: parseInt(chatId, 10),
        userId, // Ensure user can only send messages to their own chats
      },
    });

    if (!chat) {
      throw ApiError.notFound('Support chat not found');
    }

    // Check if chat is completed
    if (chat.status === 'completed') {
      throw ApiError.badRequest('Cannot send messages to completed chat');
    }

    // Prepare image URL if file uploaded
    let imageUrl: string | null = null;
    if (imageFile) {
      // Construct the URL based on your server configuration
      const baseUrl = process.env.BASE_URL || 'http://localhost:8000';
      imageUrl = `${baseUrl}/uploads/${imageFile.filename}`;
    }

    // Create message
    const chatMessage = await prisma.supportChatMessage.create({
      data: {
        supportChatId: chat.id,
        senderType: senderType as 'user' | 'support',
        senderId: userId,
        message: message ? message.trim() : '',
        imageUrl,
        isRead: false,
      },
    });

    // Update chat's lastMessageAt and status
    const updateData: any = {
      lastMessageAt: new Date(),
    };

    // If this is the first support message, change status to processing
    if (senderType === 'support' && chat.status === 'pending') {
      updateData.status = 'processing';
    }

    await prisma.supportChat.update({
      where: { id: chat.id },
      data: updateData,
    });

    return new ApiResponse(201, {
      message: {
        id: chatMessage.id,
        senderType: chatMessage.senderType,
        senderId: chatMessage.senderId,
        message: chatMessage.message,
        imageUrl: chatMessage.imageUrl,
        isRead: chatMessage.isRead,
        createdAt: chatMessage.createdAt,
      },
    }, 'Message sent successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to send message'));
  }
};

/**
 * Mark messages as read
 * PUT /api/v2/support/chats/:chatId/messages/read
 */
export const markMessagesAsReadController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check req.user first (set by authenticateUser, not overwritten by multer)
    // Fall back to req.body._user for backward compatibility
    const authenticatedUser = (req as any).user || req.body._user;
    if (!authenticatedUser || !authenticatedUser.id) {
      throw ApiError.unauthorized('User not authenticated');
    }

    const userId = authenticatedUser.id;
    const { chatId } = req.params;

    // Get chat
    const chat = await prisma.supportChat.findFirst({
      where: {
        id: parseInt(chatId, 10),
        userId,
      },
    });

    if (!chat) {
      throw ApiError.notFound('Support chat not found');
    }

    // Mark all unread messages as read
    await prisma.supportChatMessage.updateMany({
      where: {
        supportChatId: chat.id,
        isRead: false,
        senderType: 'support', // Only mark support messages as read
      },
      data: {
        isRead: true,
      },
    });

    return new ApiResponse(200, {
      message: 'Messages marked as read',
    }, 'Messages marked as read successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to mark messages as read'));
  }
};

