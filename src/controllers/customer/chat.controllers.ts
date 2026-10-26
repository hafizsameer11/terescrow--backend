import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import {
  Chat,
  PrismaClient,
  UserRoles,
  User,
  ChatType,
  ChatStatus,
} from '@prisma/client';
import { getAgentSocketId, getCustomerSocketId, io } from '../../socketConfig';
import { sendPushNotification } from '../../utils/pushService';
import { isGiftCardSellDepartment } from '../../services/giftcard/giftcard.sell.notification.service';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function isSellGiftOpenerText(text: string): boolean {
  return /^i\s+want\s+to\s+sell\b/i.test(text.trim());
}

function fileContentHash(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buf).digest('hex');
  } catch {
    return null;
  }
}

function uploadedImageHash(filename: string): string | null {
  if (!filename) return null;
  return fileContentHash(path.join(UPLOADS_DIR, filename));
}

const sendMessageController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      message = '', // Default to empty string
      chatId,
      _user: sender,
    } = req.body as { message?: string; chatId: string; _user: User };

    console.log(req.file);
    console.log(req.body);

    // Check authorization
    if (sender.role !== UserRoles.customer) {
      return next(ApiError.unauthorized('You are not authorized'));
    }

    // Validate input
    if (!chatId || (!message.trim() && !req.file)) {
      return next(ApiError.badRequest('Invalid request credentials'));
    }

    // Extract image filename if present
    const image = req.file?.filename || '';

    // Find chat
    const chat = await prisma.chat.findFirst({
      where: {
        AND: [
          {
            participants: {
              some: {
                userId: +sender.id,
              },
            },
          },
          { id: +chatId },
          {
            chatType: ChatType.customer_to_agent,
          },
        ],
      },
      select: {
        id: true,
        participants: {
          where: {
            userId: {
              not: sender.id,
            },
          },
          select: {
            userId: true,
            user: { select: { role: true } },
          },
        },
        chatDetails: {
          select: {
            status: true,
            department: { select: { niche: true, Type: true } },
          },
        },
      },
    });

    if (!chat) {
      return next(ApiError.notFound('This chat does not exist'));
    }

    const trimmedMessage = (message || '').trim();
    const isImageOnly = Boolean(image) && !trimmedMessage;
    const isSellOpenerText = Boolean(trimmedMessage) && isSellGiftOpenerText(trimmedMessage);
    const isOpener = isImageOnly || isSellOpenerText;

    /**
     * Active gift-card sell (pending or processing): app re-sends start image
     * + "I want to sell…" on re-open / retry. Block duplicate openers for the
     * whole active lifetime. Exact sell text match; image-only matched by
     * file content hash (filenames always change on re-upload). Different
     * card photo is allowed. Lifted once chat is successful / declined /
     * unsuccessful.
     */
    const isActiveSellGift =
      (chat.chatDetails?.status === ChatStatus.pending ||
        chat.chatDetails?.status === ChatStatus.processing) &&
      isGiftCardSellDepartment(chat.chatDetails?.department);

    const incomingImageHash =
      isImageOnly && req.file?.path
        ? fileContentHash(req.file.path)
        : null;

    if (isActiveSellGift && isOpener) {
      let existingOpener = null as Awaited<
        ReturnType<typeof prisma.message.findFirst>
      >;

      if (isImageOnly && incomingImageHash) {
        const priorImageOpeners = await prisma.message.findMany({
          where: {
            chatId: chat.id,
            senderId: sender.id,
            NOT: { image: null },
            OR: [{ message: null }, { message: '' }],
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        });
        existingOpener =
          priorImageOpeners.find(
            (m) =>
              Boolean(m.image) &&
              uploadedImageHash(m.image as string) === incomingImageHash
          ) ?? null;
      } else if (isSellOpenerText) {
        existingOpener = await prisma.message.findFirst({
          where: {
            chatId: chat.id,
            senderId: sender.id,
            message: trimmedMessage,
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (existingOpener) {
        console.log(
          `[send-message] blocked active-sell opener chat=${chat.id} user=${sender.id} status=${chat.chatDetails?.status} matchedMsg=${existingOpener.id}`
        );
        return new ApiResponse(
          200,
          existingOpener,
          'Opening message already sent for this chat'
        ).send(res);
      }
    }

    /**
     * Short-window dedupe for double-tap / retry bursts (any chat).
     */
    const dedupeWindowMs = isImageOnly ? 8_000 : 20_000;
    const since = new Date(Date.now() - dedupeWindowMs);
    const recent = await prisma.message.findMany({
      where: {
        chatId: chat.id,
        senderId: sender.id,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const duplicate = recent.find((m) => {
      const prevText = (m.message || '').trim();
      if (trimmedMessage && prevText === trimmedMessage) return true;
      if (
        isImageOnly &&
        !prevText &&
        Boolean(m.image) &&
        incomingImageHash &&
        uploadedImageHash(m.image as string) === incomingImageHash
      ) {
        return true;
      }
      return false;
    });

    if (duplicate) {
      console.log(
        `[send-message] deduped chat=${chat.id} user=${sender.id} matchedMsg=${duplicate.id}`
      );
      return new ApiResponse(200, duplicate, 'Message already sent').send(res);
    }

    // Create new message
    const newMessage = await prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: sender.id,
        receiverId: chat.participants[0].userId,
        image: image || undefined, // Include only if exists
        message: trimmedMessage, // Include only if exists
      },
    });
    const receveNotication = await sendPushNotification({
      userId: chat.participants[0].userId, // receiver only — never notify sender
      title: 'New Message',
      body: req.file
        ? `You have received an image from ${sender.firstname} ${sender.lastname}`
        : `You have a new message from ${sender.firstname} ${sender.lastname}: "${message}"`, sound: 'default',
    });
    console.log(receveNotication);
    await prisma.chat.update({
      where: {
        id: chat.id,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    // Create in-app notification
    await prisma.inAppNotification.create({
      data: {
        userId: chat.participants[0].userId,
        title: 'New Message',
        description: `You have a new message from ${sender.firstname} ${sender.lastname} message : "${message}"`,
      },
    });

    if (!newMessage) {
      return next(ApiError.internal('Message sending failed'));
    }

    // Emit socket event
    const receiverSocketId = getAgentSocketId(chat.participants[0].userId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message', {
        from: sender.id,
        message: newMessage,
      });
    }

    return new ApiResponse(201, newMessage, 'Message sent successfully').send(
      res
    );
  } catch (error) {
    console.error(error);
    return next(
      error instanceof ApiError
        ? error
        : ApiError.internal('Server Error Occurred!')
    );
  }
};


const getChatDetailsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { chatId } = req.params;
    const user: User = req.body._user;

    console.log(user.role);
    console.log(chatId);
    if (user.role !== UserRoles.customer) {
      return next(ApiError.unauthorized('You are not authorized'));
    }
    if (!chatId) {
      return next(ApiError.badRequest('Chat not found'));
    }

    const chat = await prisma.chat.findUnique({
      where: {
        id: parseInt(chatId),
      },
      select: {
        id: true,
        chatType: true,
        participants: {
          where: {
            userId: {
              not: user.id,
            },
          },
          select: {
            user: {
              select: {
                id: true,
                username: true,
                firstname: true,
                lastname: true,
                profilePicture: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        chatDetails: {
          select: {
            status: true,
          },
        },
      },
    });
    if (chat) {
      const updatedMessages = await prisma.message.updateMany({
        where: {
          AND: [
            {
              chatId: chat.id,
            },
            {
              receiverId: user.id,
            }
          ]
        },
        data: {
          isRead: true,
        },
      });

      if (updatedMessages) {
        console.log("messages updated");
      }
    }
    if (!chat) {
      return next(ApiError.badRequest('Chat not found'));
    }
    return new ApiResponse(
      200,
      {
        id: chat.id,
        chatType: chat.chatType,
        receiverDetails: chat.participants[0].user,
        status: chat.chatDetails?.status,
        messages: chat.messages || null,
      },
      'Chat found successfully'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};

const getAllChatsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user: User = req.body._user;

    const chats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: user.id,
          },
        },
      },
      select: {
        id: true,

        chatDetails: {

          select: {
            status: true,
            category: true,
            department: true,
          },
        },
        participants: {
          where: {
            userId: {
              not: user.id,
            },
          },
          select: {
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
        transactions: true,
        _count: {

          select: {
            messages: {
              where: {
                isRead: false,
                receiverId: user.id
              },

            },

          },
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
        },


      },
      orderBy: {
        updatedAt: 'desc',
      },

    });

    if (!chats) {
      return next(ApiError.notFound('No chats were found'));
    }

    const responseData = chats.map((chat) => {
      const recentMessage = chat.messages?.[0]?.message || null;
      const recentMessageTimestamp = chat.messages?.[0]?.createdAt || null;
      const agent = chat.participants?.[0]?.user || null;
      const chatStatus = chat.chatDetails?.status || null;
      const messagesCount = chat._count?.messages || 0;
      const department = chat.chatDetails?.department || null;
      const transaction = chat.transactions?.[0] || null;
      const category = chat.chatDetails?.category || null;
      return {
        id: chat.id,
        agent, // Ensure customer is not undefined
        recentMessage, // Handle missing messages gracefully
        recentMessageTimestamp,
        chatStatus,
        messagesCount,
        department,
        transaction,
        category
      };
    });

    return new ApiResponse(
      200,
      responseData,
      'Chats fetched successfully'
    ).send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal('Server Error Occured!'));
  }
};


export {
  getChatDetailsController,
  getAllChatsController,
  sendMessageController,
};