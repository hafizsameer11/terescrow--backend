import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';

function cleanId(value: unknown): string {
  return String(value || '').replace(/\s+/g, '');
}

/**
 * NIN / BVN must be unique across the whole platform.
 * Includes banned accounts — a banned user cannot reopen with the same ID
 * on a new email/phone. The current user may resubmit their own ID.
 */
export async function assertNinAvailable(ninRaw: string, currentUserId: number): Promise<void> {
  const nin = cleanId(ninRaw);
  if (!nin) throw ApiError.badRequest('NIN is required');

  const other = await prisma.kycStateTwo.findFirst({
    where: {
      nin,
      userId: { not: currentUserId },
    },
    select: {
      userId: true,
      user: { select: { status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!other) return;

  if (other.user?.status === 'banned') {
    throw ApiError.badRequest(
      'This NIN cannot be used. It is linked to a banned account. Contact support if you need help.'
    );
  }

  throw ApiError.badRequest(
    'This NIN is already registered on another Tercescrow account. Each NIN can only be used once.'
  );
}

export async function assertBvnAvailable(bvnRaw: string, currentUserId: number): Promise<void> {
  const bvn = cleanId(bvnRaw);
  if (!bvn) throw ApiError.badRequest('BVN is required');
  if (!/^\d{11}$/.test(bvn)) {
    throw ApiError.badRequest('BVN must be exactly 11 digits');
  }

  const otherKyc = await prisma.kycStateTwo.findFirst({
    where: {
      bvn,
      userId: { not: currentUserId },
    },
    select: {
      userId: true,
      user: { select: { status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (otherKyc) {
    if (otherKyc.user?.status === 'banned') {
      throw ApiError.badRequest(
        'This BVN cannot be used. It is linked to a banned account. Contact support if you need help.'
      );
    }
    throw ApiError.badRequest(
      'This BVN is already registered on another Tercescrow account. Each BVN can only be used once.'
    );
  }

  // Also block if another user already created a PalmPay permanent VA with this BVN
  const otherVa = await (prisma as any).palmPayPermanentVirtualAccount.findFirst({
    where: {
      bvn,
      userId: { not: currentUserId },
    },
    select: {
      userId: true,
      user: { select: { status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!otherVa) return;

  if (otherVa.user?.status === 'banned') {
    throw ApiError.badRequest(
      'This BVN cannot be used. It is linked to a banned account. Contact support if you need help.'
    );
  }

  throw ApiError.badRequest(
    'This BVN is already registered on another Tercescrow account. Each BVN can only be used once.'
  );
}
