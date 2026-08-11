import { pagocardConfig } from '../pagocard/pagocard.config';

export type GiftCardProvider = 'pagocard' | 'reloadly';

export function resolveGiftCardProvider(explicit?: string): GiftCardProvider {
  const normalized = (explicit || process.env.GIFT_CARD_PROVIDER || '').toLowerCase();
  if (normalized === 'reloadly') return 'reloadly';
  if (normalized === 'pagocard' && pagocardConfig.isConfigured()) return 'pagocard';
  if (pagocardConfig.isConfigured()) return 'pagocard';
  return 'reloadly';
}
