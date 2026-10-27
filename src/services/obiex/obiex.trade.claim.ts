/**
 * Atomic status claims for Obiex trades — claim-before-credit / claim-before-refund.
 */
import { prisma } from '../../utils/prisma';

const tradeModel = () => (prisma as any).obiexTradeLog;

export async function claimObiexTradeStatus(opts: {
  tradeId: string;
  fromStatuses: string[];
  toStatus: string;
  extraData?: Record<string, unknown>;
}): Promise<boolean> {
  const result = await tradeModel().updateMany({
    where: {
      id: opts.tradeId,
      status: { in: opts.fromStatuses },
    },
    data: {
      status: opts.toStatus,
      ...(opts.extraData || {}),
    },
  });
  return result.count === 1;
}

/** True if Prisma unique violation (P2002). */
export function isUniqueConflict(err: any): boolean {
  return err?.code === 'P2002';
}
