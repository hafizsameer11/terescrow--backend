import axios from 'axios';
import { strowalletConfig } from './strowallet.config';

export type StroWalletBalance = {
  currency: 'NGN' | 'USD';
  raw: unknown;
  balance: number | null;
};

function parseBalancePayload(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const candidates = [
    obj.balance,
    obj.available_balance,
    obj.availableBalance,
    obj.wallet_balance,
    obj.walletBalance,
    obj.amount,
    (obj.data as Record<string, unknown> | undefined)?.balance,
    (obj.response as Record<string, unknown> | undefined)?.balance,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const n = typeof c === 'number' ? c : parseFloat(String(c));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

class StroWalletBalanceService {
  async queryBalance(publicKey?: string, currency: 'NGN' | 'USD' = 'NGN'): Promise<StroWalletBalance> {
    const key = publicKey?.trim() || strowalletConfig.getPublicKey();
    const base = strowalletConfig.getBaseUrl();
    const url = `${base}/wallet/balance/${currency}`;

    const response = await axios.get(url, {
      params: { public_key: key },
      timeout: 25_000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      const msg =
        (response.data as { message?: string })?.message ||
        `StroWallet balance request failed (${response.status})`;
      throw new Error(msg);
    }

    return {
      currency,
      raw: response.data,
      balance: parseBalancePayload(response.data),
    };
  }
}

export const strowalletBalanceService = new StroWalletBalanceService();
