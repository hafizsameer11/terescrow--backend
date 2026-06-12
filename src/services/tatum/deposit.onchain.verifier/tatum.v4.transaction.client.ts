import axios from 'axios';
import { getTatumV4Chain } from './chain.registry';

export async function fetchTatumV4Transaction(
  chainSlug: string,
  txHash: string
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const apiKey = process.env.TATUM_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 0, error: 'TATUM_API_KEY not configured' };
  }

  const chain = getTatumV4Chain(chainSlug);
  const hash = txHash.trim();

  try {
    const response = await axios.get('https://api.tatum.io/v4/data/blockchains/transaction', {
      headers: { 'x-api-key': apiKey },
      params: { chain, hash },
      timeout: 25000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      const msg =
        typeof response.data?.message === 'string'
          ? response.data.message
          : `Tatum V4 tx HTTP ${response.status}`;
      return { ok: false, status: response.status, error: msg };
    }

    return { ok: true, body: response.data as Record<string, unknown> };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: message };
  }
}
