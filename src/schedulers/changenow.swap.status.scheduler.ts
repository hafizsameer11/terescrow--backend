import { pollOpenSwapOrders } from '../services/changenow/changenow.admin.service';

export async function runChangeNowSwapPoll() {
  try {
    const r = await pollOpenSwapOrders(80);
    if (r.skipped) return;
    if (r.processed > 0) {
      console.log(`[CHANGENOW POLL] Refreshed ${r.processed} open swap order(s)`);
    }
  } catch (e: any) {
    console.error('[CHANGENOW POLL]', e?.message || e);
  }
}

export function startChangeNowSwapStatusScheduler() {
  runChangeNowSwapPoll();
  const interval = setInterval(runChangeNowSwapPoll, 2 * 60 * 1000);
  console.log('[CHANGENOW POLL] Scheduler started (every 2 minutes)');
  return () => clearInterval(interval);
}
