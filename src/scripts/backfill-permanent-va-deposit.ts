/**
 * One-off: credit a missed permanent-VA pay-in (idempotent on palmpayOrderNo).
 *
 * Usage (from terescrow--backend on server, after deploy):
 *   npx ts-node -r dotenv/config src/scripts/backfill-permanent-va-deposit.ts
 *
 * Or set env overrides:
 *   BACKFILL_ORDER_NO=MI2103863249710841856
 *   BACKFILL_VA_NO=0100739677
 *   BACKFILL_AMOUNT_KOBO=100000
 *   BACKFILL_USER_ID=43937
 */
import { prisma } from '../utils/prisma';
import { creditPermanentVaDeposit } from '../services/palmpay/palmpay.permanent.va.credit';

async function main() {
  const orderNo = process.env.BACKFILL_ORDER_NO || 'MI2103863249710841856';
  const virtualAccountNo = process.env.BACKFILL_VA_NO || '0100739677';
  const amountKobo = Number(process.env.BACKFILL_AMOUNT_KOBO || 100000); // ₦1,000
  const userId = Number(process.env.BACKFILL_USER_ID || 43937);

  const existing = await prisma.fiatTransaction.findUnique({
    where: { palmpayOrderNo: orderNo },
  });
  if (existing) {
    console.log('Already credited:', existing.id, existing.amount.toString(), existing.status);
    return;
  }

  const va = await (prisma as any).palmPayPermanentVirtualAccount.findFirst({
    where: { accountNumber: virtualAccountNo },
    orderBy: { createdAt: 'desc' },
  });
  if (!va) {
    throw new Error(`No permanent VA found for account ${virtualAccountNo}`);
  }
  if (va.userId !== userId) {
    console.warn(`VA userId=${va.userId} expected ${userId} — continuing with VA user`);
  }

  if (va.status !== 'approved') {
    await (prisma as any).palmPayPermanentVirtualAccount.update({
      where: { id: va.id },
      data: {
        status: 'approved',
        approvedAt: va.approvedAt || new Date(),
        errorMessage: null,
        bankName: 'Boost MFB',
      },
    });
    console.log(`Healed VA ${va.id} → approved / Boost MFB`);
  }

  const credited = await creditPermanentVaDeposit({
    orderNo,
    virtualAccountNo,
    orderAmount: amountKobo,
    orderStatus: 1,
    currency: 'NGN',
  });

  console.log(credited ? 'Credited successfully' : 'Credit returned false — check logs');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
