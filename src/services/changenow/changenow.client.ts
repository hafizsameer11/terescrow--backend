/**
 * ChangeNOW Exchange API v2 client (https://api.changenow.io)
 * Auth: `x-changenow-api-key` header (official).
 */

import axios, { AxiosInstance } from 'axios';

const DEFAULT_BASE = 'https://api.changenow.io';

export function getChangeNowBaseUrl(): string {
  return (process.env.CHANGENOW_API_BASE || DEFAULT_BASE).replace(/\/$/, '');
}

export function getChangeNowApiKey(): string {
  const k = process.env.CHANGENOW_API_KEY || '';
  return k.trim();
}

/** Header used by ChangeNOW v2 (see API examples). */
export function changeNowAuthHeaders(): Record<string, string> {
  const k = getChangeNowApiKey();
  if (!k) return {};
  return { 'x-changenow-api-key': k };
}

export interface ChangeNowCurrency {
  ticker: string;
  name: string;
  image?: string;
  network?: string;
  tokenContract?: string | null;
  buy?: boolean;
  sell?: boolean;
  legacyTicker?: string;
}

export interface ChangeNowMinAmountResponse {
  fromCurrency: string;
  toCurrency: string;
  fromNetwork?: string;
  toNetwork?: string;
  flow?: string;
  minAmount: number;
}

export interface ChangeNowRangeResponse {
  fromCurrency: string;
  toCurrency: string;
  fromNetwork?: string;
  toNetwork?: string;
  flow?: string;
  minAmount?: number;
  maxAmount?: number | null;
}

export interface ChangeNowEstimatedAmountResponse {
  estimatedAmount?: number;
  transactionSpeedForecast?: string;
  warningMessage?: string;
  [key: string]: unknown;
}

/** Response from POST /v2/exchange — field names may vary; we normalize in createExchange */
export interface ChangeNowCreateExchangeResponse {
  id?: string;
  payinAddress?: string;
  payinExtraId?: string;
  payoutAddress?: string;
  payoutExtraId?: string;
  fromCurrency?: string;
  toCurrency?: string;
  fromAmount?: string;
  [key: string]: unknown;
}

export interface ChangeNowExchangeStatusResponse {
  id?: string;
  status?: string;
  payinHash?: string;
  payoutHash?: string;
  fromCurrency?: string;
  toCurrency?: string;
  fromAmount?: string;
  amountSend?: string;
  amountReceive?: string;
  payinAddress?: string;
  payoutAddress?: string;
  [key: string]: unknown;
}

export interface ChangeNowAvailablePair {
  fromCurrency: string;
  toCurrency: string;
  fromNetwork?: string;
  toNetwork?: string;
  flow?: { standard?: boolean; 'fixed-rate'?: boolean };
}

export interface ChangeNowNetworkFeeResponse {
  estimatedFee?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChangeNowExchangesListResponse {
  count?: number;
  exchanges?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function buildClient(): AxiosInstance {
  return axios.create({
    baseURL: getChangeNowBaseUrl(),
    timeout: 60000,
    validateStatus: (s) => s < 500,
  });
}

const client = buildClient();

/**
 * Best-effort networks for a pair from `/v2/exchange/currencies` (ambiguous if same ticker exists on multiple chains).
 */
export function resolveNetworksForTickers(
  fromTicker: string,
  toTicker: string,
  currencies: ChangeNowCurrency[]
): { fromNetwork?: string; toNetwork?: string } {
  const f = fromTicker.toLowerCase();
  const t = toTicker.toLowerCase();
  const fromRow = currencies.find((c) => c.ticker.toLowerCase() === f);
  const toRow = currencies.find((c) => c.ticker.toLowerCase() === t);
  return {
    fromNetwork: fromRow?.network ? String(fromRow.network) : undefined,
    toNetwork: toRow?.network ? String(toRow.network) : undefined,
  };
}

export async function listCurrencies(): Promise<ChangeNowCurrency[]> {
  const res = await client.get<ChangeNowCurrency[]>('/v2/exchange/currencies');
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`ChangeNOW currencies failed: HTTP ${res.status}`);
  }
  return res.data;
}

export async function getAvailablePairs(opts?: {
  fromCurrency?: string;
  toCurrency?: string;
  fromNetwork?: string;
  toNetwork?: string;
  flow?: 'standard' | 'fixed-rate';
}): Promise<ChangeNowAvailablePair[]> {
  const apiKey = getChangeNowApiKey();
  if (!apiKey) throw new Error('CHANGENOW_API_KEY is not configured');
  const params: Record<string, string> = {};
  if (opts?.fromCurrency) params.fromCurrency = opts.fromCurrency;
  if (opts?.toCurrency) params.toCurrency = opts.toCurrency;
  if (opts?.fromNetwork) params.fromNetwork = opts.fromNetwork;
  if (opts?.toNetwork) params.toNetwork = opts.toNetwork;
  if (opts?.flow) params.flow = opts.flow;
  const res = await client.get<ChangeNowAvailablePair[]>('/v2/exchange/available-pairs', {
    params,
    headers: { ...changeNowAuthHeaders() },
  });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`ChangeNOW available-pairs failed: HTTP ${res.status}`);
  }
  return res.data;
}

/**
 * @see changenow.md — requires `x-changenow-api-key`; optional `fromNetwork` / `toNetwork` for multichain pairs.
 */
export async function getMinAmount(
  fromCurrency: string,
  toCurrency: string,
  flow: string = 'standard',
  opts?: { fromNetwork?: string; toNetwork?: string }
): Promise<ChangeNowMinAmountResponse> {
  const params: Record<string, string> = { fromCurrency, toCurrency, flow };
  if (opts?.fromNetwork) params.fromNetwork = opts.fromNetwork;
  if (opts?.toNetwork) params.toNetwork = opts.toNetwork;
  const headers = getChangeNowApiKey() ? changeNowAuthHeaders() : {};
  const res = await client.get<ChangeNowMinAmountResponse>('/v2/exchange/min-amount', {
    params,
    headers,
  });
  if (res.status !== 200 || res.data == null) {
    throw new Error(
      `ChangeNOW min-amount failed: HTTP ${res.status} ${JSON.stringify(res.data)}`
    );
  }
  return res.data;
}

export async function getRange(
  fromCurrency: string,
  toCurrency: string,
  flow: string = 'standard',
  opts?: { fromNetwork?: string; toNetwork?: string }
): Promise<ChangeNowRangeResponse> {
  const params: Record<string, string> = { fromCurrency, toCurrency, flow };
  if (opts?.fromNetwork) params.fromNetwork = opts.fromNetwork;
  if (opts?.toNetwork) params.toNetwork = opts.toNetwork;
  const headers = getChangeNowApiKey() ? changeNowAuthHeaders() : {};
  const res = await client.get<ChangeNowRangeResponse>('/v2/exchange/range', {
    params,
    headers,
  });
  if (res.status !== 200 || res.data == null) {
    throw new Error(`ChangeNOW range failed: HTTP ${res.status}`);
  }
  return res.data;
}

export async function getEstimatedAmount(params: {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  flow?: string;
  fromNetwork?: string;
  toNetwork?: string;
}): Promise<ChangeNowEstimatedAmountResponse> {
  const apiKey = getChangeNowApiKey();
  if (!apiKey) {
    throw new Error('CHANGENOW_API_KEY is not configured');
  }
  const query: Record<string, string> = {
    fromCurrency: params.fromCurrency,
    toCurrency: params.toCurrency,
    fromAmount: params.fromAmount,
    flow: params.flow ?? 'standard',
  };
  if (params.fromNetwork) query.fromNetwork = params.fromNetwork;
  if (params.toNetwork) query.toNetwork = params.toNetwork;

  const res = await client.get<ChangeNowEstimatedAmountResponse>('/v2/exchange/estimated-amount', {
    params: query,
    headers: { ...changeNowAuthHeaders() },
  });
  if (res.status !== 200) {
    throw new Error(
      `ChangeNOW estimated-amount failed: HTTP ${res.status} ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`
    );
  }
  return res.data;
}

/**
 * Create exchange — body aligned with ChangeNOW official example (networks, type direct, empty optionals).
 */
export async function createExchange(body: {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  /** Recipient (payout) address */
  address: string;
  fromNetwork?: string;
  toNetwork?: string;
  flow?: string;
  /** Exchange type; default `direct` per API examples */
  type?: string;
  toAmount?: string;
  /** Payout destination tag / memo (maps to `extraId` in API) */
  payoutExtraId?: string;
  refundAddress?: string;
  refundExtraId?: string;
  userId?: string;
  payload?: string;
  contactEmail?: string;
  source?: string;
  rateId?: string;
}): Promise<ChangeNowCreateExchangeResponse> {
  const apiKey = getChangeNowApiKey();
  if (!apiKey) {
    throw new Error('CHANGENOW_API_KEY is not configured');
  }

  const payload: Record<string, string> = {
    fromCurrency: body.fromCurrency,
    toCurrency: body.toCurrency,
    fromNetwork: body.fromNetwork ?? '',
    toNetwork: body.toNetwork ?? '',
    fromAmount: body.fromAmount,
    toAmount: body.toAmount ?? '',
    address: body.address,
    extraId: body.payoutExtraId ?? '',
    refundAddress: body.refundAddress ?? '',
    refundExtraId: body.refundExtraId ?? '',
    userId: body.userId ?? '',
    payload: body.payload ?? '',
    contactEmail: body.contactEmail ?? '',
    source: body.source ?? '',
    flow: body.flow ?? 'standard',
    type: body.type ?? 'direct',
    rateId: body.rateId ?? '',
  };

  const res = await client.post<ChangeNowCreateExchangeResponse>('/v2/exchange', payload, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...changeNowAuthHeaders(),
    },
  });
  if (res.status !== 200 && res.status !== 201) {
    const msg =
      typeof res.data === 'string'
        ? res.data
        : (res.data as any)?.message || JSON.stringify(res.data);
    throw new Error(`ChangeNOW create exchange failed: HTTP ${res.status} ${msg}`);
  }
  return res.data as ChangeNowCreateExchangeResponse;
}

export async function getExchangeById(id: string): Promise<ChangeNowExchangeStatusResponse> {
  const apiKey = getChangeNowApiKey();
  if (!apiKey) {
    throw new Error('CHANGENOW_API_KEY is not configured');
  }
  const res = await client.get<ChangeNowExchangeStatusResponse>('/v2/exchange/by-id', {
    params: { id },
    headers: { ...changeNowAuthHeaders() },
  });
  if (res.status !== 200) {
    const msg =
      typeof res.data === 'string'
        ? res.data
        : (res.data as any)?.message || JSON.stringify(res.data);
    throw new Error(`ChangeNOW by-id failed: HTTP ${res.status} ${msg}`);
  }
  return res.data as ChangeNowExchangeStatusResponse;
}

export async function getNetworkFeeEstimate(params: {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  fromNetwork?: string;
  toNetwork?: string;
  convertedCurrency?: string;
  convertedNetwork?: string;
}): Promise<ChangeNowNetworkFeeResponse> {
  const apiKey = getChangeNowApiKey();
  if (!apiKey) throw new Error('CHANGENOW_API_KEY is not configured');
  const query: Record<string, string> = {
    fromCurrency: params.fromCurrency,
    toCurrency: params.toCurrency,
    fromAmount: params.fromAmount,
  };
  if (params.fromNetwork) query.fromNetwork = params.fromNetwork;
  if (params.toNetwork) query.toNetwork = params.toNetwork;
  if (params.convertedCurrency) query.convertedCurrency = params.convertedCurrency;
  if (params.convertedNetwork) query.convertedNetwork = params.convertedNetwork;

  const res = await client.get<ChangeNowNetworkFeeResponse>('/v2/exchange/network-fee', {
    params: query,
    headers: { ...changeNowAuthHeaders() },
  });
  if (res.status !== 200) {
    throw new Error(`ChangeNOW network-fee failed: HTTP ${res.status}`);
  }
  return res.data;
}

export async function listPartnerExchanges(params?: {
  limit?: number;
  offset?: number;
  sortDirection?: 'ASC' | 'DESC';
  sortField?: 'createdAt' | 'updatedAt';
  dateField?: 'createdAt' | 'updatedAt';
  dateFrom?: string;
  dateTo?: string;
  requestId?: string;
  userId?: string;
  payoutAddress?: string;
  statuses?: string;
}): Promise<ChangeNowExchangesListResponse> {
  const apiKey = getChangeNowApiKey();
  if (!apiKey) throw new Error('CHANGENOW_API_KEY is not configured');
  const res = await client.get<ChangeNowExchangesListResponse>('/v2/exchanges', {
    params,
    headers: { ...changeNowAuthHeaders() },
  });
  if (res.status !== 200) {
    throw new Error(`ChangeNOW exchanges list failed: HTTP ${res.status}`);
  }
  return res.data;
}
