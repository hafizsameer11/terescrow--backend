import { ChatStatus, InAppNotificationType, UserRoles } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { sendPushNotification } from '../../utils/pushService';

export type GiftCardSellNotifyEvent =
  | 'credit'
  | 'successful'
  | 'declined'
  | 'unsuccessful';

function formatNgn(amount: number): string {
  return `₦${Number(amount).toLocaleString('en-NG', {
    maximumFractionDigits: 2,
  })}`;
}

export function isGiftCardSellDepartment(dept?: {
  niche?: string | null;
  Type?: string | null;
} | null): boolean {
  const niche = String(dept?.niche || '')
    .toLowerCase()
    .replace(/[_\s-]/g, '');
  if (niche !== 'giftcard') return false;
  const type = String(dept?.Type || '').toLowerCase();
  return !type || type === 'sell';
}

export function giftCardSellEventFromChatStatus(
  status: ChatStatus | string
): GiftCardSellNotifyEvent | null {
  if (status === ChatStatus.successful || status === 'successful') {
    return 'successful';
  }
  if (status === ChatStatus.declined || status === 'declined') {
    return 'declined';
  }
  if (
    status === ChatStatus.unsucessful ||
    status === 'unsucessful' ||
    status === 'unsuccessful'
  ) {
    return 'unsuccessful';
  }
  return null;
}

function copyForEvent(
  event: GiftCardSellNotifyEvent,
  amountNgn?: number,
  reason?: string
): { title: string; description: string } {
  if (event === 'credit') {
    const amountBit =
      amountNgn != null && Number.isFinite(amountNgn)
        ? `${formatNgn(amountNgn)} has been credited to your Naira wallet`
        : 'Your Naira wallet has been credited';
    return {
      title: 'Credit alert',
      description: `${amountBit} for your gift card sale.`,
    };
  }
  if (event === 'successful') {
    const amountBit =
      amountNgn != null && Number.isFinite(amountNgn)
        ? ` Amount: ${formatNgn(amountNgn)}.`
        : '';
    return {
      title: 'Gift card sale successful',
      description: `Your gift card sale was completed successfully.${amountBit}`,
    };
  }
  if (event === 'declined') {
    const trimmed = (reason || '').trim();
    return {
      title: 'Gift card sale declined',
      description: trimmed
        ? `Your gift card sale was declined. Reason: ${trimmed}`
        : 'Your gift card sale was declined.',
    };
  }
  return {
    title: 'Gift card sale unsuccessful',
    description:
      (reason || '').trim() ||
      'Your gift card sale could not be completed.',
  };
}

export async function notifyGiftCardSellCustomer(opts: {
  userId: number;
  event: GiftCardSellNotifyEvent;
  amountNgn?: number;
  reason?: string;
  chatId?: number;
}): Promise<void> {
  const { userId, event, amountNgn, reason, chatId } = opts;
  const { title, description } = copyForEvent(event, amountNgn, reason);

  await prisma.inAppNotification.create({
    data: {
      userId,
      title,
      description,
      type: InAppNotificationType.customeer,
    },
  });

  await sendPushNotification({
    userId,
    title,
    body: description,
    sound: 'default',
    priority: 'high',
    data: {
      type: 'gift_card_sell',
      event,
      ...(chatId != null ? { chatId: String(chatId) } : {}),
    },
  });
}

export function findCustomerIdFromParticipants(
  participants: { user?: { id: number; role?: UserRoles | string } | null }[]
): number | null {
  const customer = participants.find(
    (p) => p.user?.role === UserRoles.customer
  )?.user;
  return customer?.id ?? null;
}
