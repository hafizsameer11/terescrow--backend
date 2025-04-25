// utils/pushService.ts
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PushNotificationPayload {
    userId: number;
    title: string;
    body: string;
    sound?: 'default' | null;
    data?: any;

    priority?: 'default' | 'high';
}

export async function sendPushNotification({
    userId,
    title,
    body,
    sound = 'default',
    data = {},

    priority = 'high',
}: PushNotificationPayload): Promise<void> {
    try {
        // 1. Fetch user's expoPushToken from database
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { fcmToken: true },
        });

        if (!user?.fcmToken) {
            console.log(`❌ No Expo Push Token found for user ID ${userId}`);
            return;
        }
        const unreadMessagesCount = await prisma.message.count({
            where: {
                receiverId: userId, isRead: false,
            },
        });
        // 2. Build push message
        const pushMessage = {
            to: user.fcmToken,
            title,
            body,
            sound,
            data,
            badge: unreadMessagesCount, // 👈 Include badge if provided
            priority,
        };

        // 3. Send push to Expo servers
        const response = await axios.post('https://exp.host/--/api/v2/push/send', pushMessage, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        console.log('🚀 Push Sent to User:', userId, JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.error('❌ Push Notification Error:', error.response?.data || error.message);
    }
}
