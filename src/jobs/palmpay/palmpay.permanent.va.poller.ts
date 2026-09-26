import { pollPendingPermanentVirtualAccounts } from '../../services/palmpay/palmpay.permanent.va.lifecycle';

const INTERVAL_MS = Number(process.env.PALMPAY_VA_POLL_MS || 30000);
let timer: NodeJS.Timeout | null = null;
let running = false;

export function startPalmPayPermanentVaPoller() {
  if (timer) return;
  console.log(`[PalmPay] Permanent VA poller started (every ${INTERVAL_MS}ms)`);
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await pollPendingPermanentVirtualAccounts(8);
    } catch (error: any) {
      console.error('[PalmPay] Permanent VA poller error:', error?.message || error);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
}

export function stopPalmPayPermanentVaPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
