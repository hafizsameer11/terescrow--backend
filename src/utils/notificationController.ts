import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendPushNotification } from '../utils/firebaseNotificationService';

const prisma = new PrismaClient();

export async function sendToUserById(req: Request, res: Response) {
  const { userId, title, body } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { fcmToken: true },
    });

    if (!user || !user.fcmToken) {
      return res.status(404).json({ status: 'error', message: 'User or FCM token not found' });
    }

    const result = await sendPushNotification(user.fcmToken, title, body, String(userId));
    return res.status(200).json({ status: 'success', result });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
