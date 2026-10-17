import { createHmac } from 'crypto';
import { obiexConfig } from './obiex.config';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ObiexApiError extends Error {
  statusCode: number;
  data: unknown;

  constructor(message: string, statusCode: number, data?: unknown) {
    super(message);
    this.name = 'ObiexApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

function buildPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  // Signature path must include /v1
  if (p.startsWith('/v1/')) return p;
  return `/v1${p}`;
}

async function obiexRequest<T = any>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown> | null
): Promise<T> {
  if (!obiexConfig.isConfigured()) {
    throw new ObiexApiError('Obiex is not configured', 503);
  }

  const base = obiexConfig.getBaseUrl().replace(/\/v1\/?$/, '');
  const apiPath = buildPath(path.replace(/^\/v1/, ''));
  const url = `${base}${apiPath}`;
  const timestamp = Date.now();
  const content = `${method.toUpperCase()}${apiPath}${timestamp}`;
  const signature = createHmac('sha256', obiexConfig.getApiSecret())
    .update(content)
    .digest('hex');

  const headers: Record<string, string> = {
    'X-API-KEY': obiexConfig.getApiKey(),
    'X-API-TIMESTAMP': String(timestamp),
    'X-API-SIGNATURE': signature,
    Accept: 'application/json',
  };
  if (body != null) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      json?.data?.message ||
      `Obiex request failed (${res.status})`;
    throw new ObiexApiError(String(msg), res.status, json);
  }

  return json as T;
}

export const obiexClient = {
  getTradableCurrencies: () => obiexRequest('GET', '/currencies/tradeable'),
  getActiveNetworks: () => obiexRequest('GET', '/currencies/networks/active'),
  getFiatRates: () => obiexRequest('GET', '/currencies/fiat-rates'),
  getPairs: () => obiexRequest('GET', '/trades/pairs'),
  getWalletBalance: (currencyCode: string) =>
    obiexRequest('GET', `/wallets/${encodeURIComponent(currencyCode)}`),
  createDepositAddress: (payload: {
    uniqueUserIdentifier: string;
    currency: string;
    network: string;
  }) => obiexRequest('POST', '/addresses/broker', payload),
  listDepositAddresses: () => obiexRequest('GET', '/addresses/me/broker'),
  instantSwap: (payload: {
    sourceId: string;
    targetId: string;
    amount?: number;
    amountToReceive?: number;
    side?: 'BUY' | 'SELL';
  }) => obiexRequest('POST', '/trades/swap', payload),
  createQuote: (payload: {
    sourceId: string;
    targetId: string;
    amount: number;
    side?: 'BUY' | 'SELL';
  }) => obiexRequest('POST', '/trades/quote', payload),
  acceptQuote: (quoteId: string) =>
    obiexRequest('POST', `/trades/quote/${encodeURIComponent(quoteId)}`),
  withdrawCrypto: (payload: Record<string, unknown>) =>
    obiexRequest('POST', '/wallets/ext/debit/crypto', payload),
  withdrawFiat: (payload: Record<string, unknown>) =>
    obiexRequest('POST', '/wallets/ext/debit/fiat', payload),
  initiateCollection: (payload: Record<string, unknown>) =>
    obiexRequest('POST', '/collections', payload),
};
