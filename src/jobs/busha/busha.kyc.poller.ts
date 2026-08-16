import { pollPendingBushaKyc } from '../../services/busha/busha.kyc.service';

const INTERVAL_MS = Number(process.env.BUSHA_KYC_POLL_MS || 20000);
let timer: NodeJS.Timeout | null = null;
let running = false;

export function startBushaKycPoller() {
  if (timer) return;
  console.log(`[Busha] KYC poller started (every ${INTERVAL_MS}ms)`);
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await pollPendingBushaKyc(5);
    } catch (error: any) {
      console.error('[Busha] KYC poller error:', error?.message || error);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
}

export function stopBushaKycPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
