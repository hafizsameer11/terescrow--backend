// import { prisma } from '@/lib/prisma';
// import { sendPushNotification } from './sendPushNotification '; // adjust path as needed
import { PrismaClient } from '@prisma/client';
import { sendPushNotification } from './firebaseNotificationService';
const prisma = new PrismaClient();

export async function notifyUserById(userId: number, title: string, body: string) {
  // Fetch user's FCM token
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });
  console.log('User FCM Token:', user?.fcmToken); // Debugging line

  if (!user?.fcmToken) {
    throw new Error('User or FCM token not found  for the given user ID' + userId);
  }

  // Count unread messages
  const unreadMessagesCount = await prisma.message.count({
    where: {
      receiverId: userId,
      isRead: false,
    },
  });

  // Send push
  const result = await sendPushNotification(
    user.fcmToken,
    title,
    body,
    String(userId),
    unreadMessagesCount
  );

  return result;
}
