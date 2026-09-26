import { runStroWalletAutoTopupCheck } from '../services/admin/merchants.admin.service';

const INTERVAL_MS = 5 * 60 * 1000;

export async function runStroWalletAutoTopupPoll() {
  try {
    const result = await runStroWalletAutoTopupCheck();
    if (!result.skipped) {
      console.log(`[STROWALLET AUTO TOPUP] Transfer started log=${result.logId}`);
    }
  } catch (e: any) {
    console.error('[STROWALLET AUTO TOPUP]', e?.message || e);
  }
}

export function startStroWalletAutoTopupScheduler() {
  runStroWalletAutoTopupPoll();
  const interval = setInterval(runStroWalletAutoTopupPoll, INTERVAL_MS);
  console.log('[STROWALLET AUTO TOPUP] Scheduler started (every 5 minutes)');
  return () => clearInterval(interval);
}
