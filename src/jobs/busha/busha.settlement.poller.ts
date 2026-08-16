import { pollOpenBushaSettlements } from '../../services/busha/busha.settlement.service';

const INTERVAL_MS = Number(process.env.BUSHA_SETTLEMENT_POLL_MS || 30000);
let timer: NodeJS.Timeout | null = null;
let running = false;

export function startBushaSettlementPoller() {
  if (timer) return;
  console.log(`[Busha] settlement poller started (every ${INTERVAL_MS}ms)`);
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await pollOpenBushaSettlements(25);
    } catch (error: any) {
      console.error('[Busha] settlement poller error:', error?.message || error);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
}

export function stopBushaSettlementPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
