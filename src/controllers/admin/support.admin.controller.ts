import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';

export async function getAdminSupportChatsController(req: Request, res: Response, next: NextFunction) {
  try {
    const rawFilter = (req.query.filter as string) || '';
    const filter = rawFilter.toLowerCase();
    const search = (req.query.search as string)?.trim();
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filter === 'closed' || filter === 'completed') where.status = 'completed';
    else if (filter === 'active' || filter === 'processing') where.status = { in: ['pending', 'processing'] };
    if (search) {
      where.OR = [
        { user: { firstname: { contains: search } } },
        { user: { lastname: { contains: search } } },
        { user: { email: { contains: search } } },
        { subject: { contains: search } },
      ];
    }

    const [chats, total] = await Promise.all([
      prisma.supportChat.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          user: { select: { id: true, firstname: true, lastname: true, email: true, profilePicture: true } },
          messages: {
            where: { senderType: 'user', isRead: false },
            select: { id: true },
          },
          _count: { select: { messages: true } },
        },
      }),
      prisma.supportChat.count({ where }),
    ]);

    if (filter === 'unread') {
      const withUnread = chats.filter((c) => c.messages.length > 0);
      const list = withUnread.map((chat) => {
        const lastMsg = (chat as any).lastMessage;
        return {
          id: chat.id,
          participantName: chat.user ? `${chat.user.firstname} ${chat.user.lastname}`.trim() : '',
          participantAvatar: chat.user?.profilePicture ?? null,
          lastMessage: lastMsg?.message ?? '',
          lastMessageSender: lastMsg?.senderType ?? 'user',
          lastMessageTime: chat.lastMessageAt?.toISOString() ?? chat.createdAt.toISOString(),
          unreadCount: chat.messages.length,
          status: chat.status,
        };
      });
      return new ApiResponse(200, {
        chats: list,
        pagination: { page, limit, total: list.length, totalPages: 1 },
      }, 'Chats retrieved').send(res);
    }

    const list = await Promise.all(
      chats.map(async (chat) => {
        const lastMsg = await prisma.supportChatMessage.findFirst({
          where: { supportChatId: chat.id },
          orderBy: { createdAt: 'desc' },
          select: { message: true, senderType: true, createdAt: true },
        });
        const unreadCount = await prisma.supportChatMessage.count({
          where: { supportChatId: chat.id, senderType: 'user', isRead: false },
        });
        return {
          id: chat.id,
          participantName: chat.user ? `${chat.user.firstname} ${chat.user.lastname}`.trim() : '',
          participantAvatar: chat.user?.profilePicture ?? null,
          lastMessage: lastMsg?.message ?? '',
          lastMessageSender: lastMsg?.senderType ?? 'user',
          lastMessageTime: lastMsg?.createdAt?.toISOString() ?? chat.createdAt.toISOString(),
          unreadCount,
          status: chat.status,
        };
      })
    );

    return new ApiResponse(200, {
      chats: list,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, 'Chats retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get support chats'));
  }
}

export async function getAdminSupportChatMessagesController(req: Request, res: Response, next: NextFunction) {
  try {
    const chatId = parseInt(req.params.chatId, 10);
    if (isNaN(chatId)) return next(ApiError.badRequest('Invalid chat id'));
    const limit = Math.min(100, parseInt(String(req.query.limit), 10) || 50);
    const before = req.query.before as string | undefined;

    const where: any = { supportChatId: chatId };
    if (before) where.createdAt = { lt: new Date(before) };

    const messages = await prisma.supportChatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const formatted = messages.reverse().map((m) => ({
      id: m.id,
      sender: m.senderType === 'support' ? 'agent' : 'user',
      text: m.message,
      imageUrl: m.imageUrl ?? undefined,
      time: m.createdAt.toISOString(),
    }));
    return new ApiResponse(200, { messages: formatted }, 'Messages retrieved').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to get messages'));
  }
}

export async function postAdminSupportChatMessageController(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(ApiError.badRequest('Validation failed', errors.array()));
    const user = (req as any).user || req.body._user;
    if (!user?.id) return next(ApiError.unauthorized('Not authenticated'));
    const chatId = parseInt(req.params.chatId, 10);
    if (isNaN(chatId)) return next(ApiError.badRequest('Invalid chat id'));
    const { text } = req.body;
    const imageUrl = (req as any).file?.path ? `/${(req as any).file.path}` : undefined;
    if (!text && !imageUrl) return next(ApiError.badRequest('Message or image required'));

    const chat = await prisma.supportChat.findUnique({ where: { id: chatId } });
    if (!chat) return next(ApiError.notFound('Chat not found'));
    if (chat.status === 'completed') return next(ApiError.badRequest('Cannot send message to closed chat'));

    const message = await prisma.supportChatMessage.create({
      data: {
        supportChatId: chatId,
        senderType: 'support',
        senderId: user.id,
        message: text || '',
        imageUrl: imageUrl || null,
        isRead: false,
      },
    });
    await prisma.supportChat.update({
      where: { id: chatId },
      data: { lastMessageAt: new Date(), status: 'processing' },
    });
    return new ApiResponse(201, {
      id: message.id,
      sender: 'agent',
      text: message.message,
      imageUrl: message.imageUrl ?? undefined,
      time: message.createdAt.toISOString(),
    }, 'Message sent').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to send message'));
  }
}

export async function patchAdminSupportChatController(req: Request, res: Response, next: NextFunction) {
  try {
    const chatId = parseInt(req.params.chatId, 10);
    if (isNaN(chatId)) return next(ApiError.badRequest('Invalid chat id'));
    const { status, markRead } = req.body;
    const data: any = {};
    if (status === 'closed' || status === 'completed') data.status = 'completed';
    if (markRead === true) {
      await prisma.supportChatMessage.updateMany({
        where: { supportChatId: chatId, senderType: 'user' },
        data: { isRead: true },
      });
    }
    if (Object.keys(data).length > 0) {
      await prisma.supportChat.update({ where: { id: chatId }, data });
    }
    const chat = await prisma.supportChat.findUnique({ where: { id: chatId } });
    return new ApiResponse(200, chat, 'Chat updated').send(res);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(ApiError.internal('Failed to update chat'));
  }
}
