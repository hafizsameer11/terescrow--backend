/**
 * Sequential ChangeNOW API probes for ops / client reporting.
 * Does not expose the API key; only whether it is configured.
 */

import axios, { AxiosInstance } from 'axios';
import {
  changeNowAuthHeaders,
  getChangeNowApiKey,
  getChangeNowBaseUrl,
} from './changenow.client';

export type ProbeStatus = 'ok' | 'warning' | 'error' | 'skipped';

export interface ChangeNowProbeResult {
  /** Human-readable label */
  name: string;
  method: string;
  /** Path only (no base URL) */
  path: string;
  /** Query string without leading ? */
  query?: string;
  httpStatus: number | null;
  status: ProbeStatus;
  durationMs: number;
  /** Short explanation for client (error body snippet or success hint) */
  detail: string;
}

export interface ChangeNowDiagnosticsReport {
  generatedAt: string;
  changeNowBaseUrl: string;
  apiKeyConfigured: boolean;
  summary: {
    total: number;
    ok: number;
    warning: number;
    error: number;
    skipped: number;
  };
  checks: ChangeNowProbeResult[];
}

function buildRawClient(): AxiosInstance {
  return axios.create({
    baseURL: getChangeNowBaseUrl(),
    timeout: 60000,
    validateStatus: () => true,
  });
}

function summarizeBody(data: unknown, maxLen = 280): string {
  if (data == null) return '';
  if (typeof data === 'string') return data.length > maxLen ? data.slice(0, maxLen) + '…' : data;
  try {
    const s = JSON.stringify(data);
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  } catch {
    return '[unserializable]';
  }
}

function extractErrorDetail(status: number, data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const m = (data as any).message ?? (data as any).error;
    if (typeof m === 'string') return `HTTP ${status}: ${m}`;
  }
  return `HTTP ${status}: ${summarizeBody(data)}`;
}

/** Stable probe pair — matches ChangeNOW v2 examples (USDT on Ethereum). */
const DIAG_PAIR = {
  fromCurrency: 'btc',
  toCurrency: 'usdt',
  fromNetwork: 'btc',
  toNetwork: 'eth',
  flow: 'standard',
  sampleFromAmount: '0.01',
} as const;

/** Valid UUID v4 shape for by-id probe (non-existent exchange → expect 404, not 400 invalid format). */
const DIAG_BY_ID_PLACEHOLDER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function classifyHttpStatus(status: number): 'ok' | 'warning' | 'error' {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'error';
  if (status >= 500) return 'error';
  if (status >= 400 && status < 500) return 'warning';
  return 'error';
}

async function probe(
  client: AxiosInstance,
  name: string,
  method: 'GET' | 'POST',
  path: string,
  config?: { params?: Record<string, string>; data?: Record<string, unknown> },
  opts?: { treat404AsOk?: boolean }
): Promise<ChangeNowProbeResult> {
  const query = config?.params
    ? new URLSearchParams(config.params).toString()
    : undefined;
  const start = Date.now();
  try {
    const res =
      method === 'GET'
        ? await client.get(path, {
            params: config?.params,
            headers: { Accept: 'application/json', ...changeNowAuthHeaders() },
          })
        : await client.post(path, config?.data ?? {}, {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              ...changeNowAuthHeaders(),
            },
          });

    const durationMs = Date.now() - start;

    if (opts?.treat404AsOk && res.status === 404) {
      return {
        name,
        method,
        path,
        query,
        httpStatus: res.status,
        status: 'ok',
        durationMs,
        detail: `OK — no exchange for this id (404 expected): ${extractErrorDetail(res.status, res.data)}`,
      };
    }

    const tier = classifyHttpStatus(res.status);

    if (tier === 'ok') {
      let detail = '2xx response';
      if (path === '/v2/exchange/currencies' && Array.isArray(res.data)) {
        detail = `${res.data.length} currencies returned`;
      } else if (path === '/v2/exchange/min-amount' && res.data && typeof res.data === 'object') {
        const m = (res.data as any).minAmount;
        detail = m != null ? `minAmount=${m}` : summarizeBody(res.data, 200);
      } else if (path === '/v2/exchange/range' && res.data && typeof res.data === 'object') {
        const d = res.data as any;
        detail = [d.minAmount, d.maxAmount].some((x: unknown) => x != null)
          ? `min=${d.minAmount ?? '—'} max=${d.maxAmount ?? '—'}`
          : summarizeBody(res.data, 200);
      } else if (path === '/v2/exchange/available-pairs' && Array.isArray(res.data)) {
        detail = `${res.data.length} pair(s) returned`;
      } else if (path === '/v2/exchanges' && res.data && typeof res.data === 'object') {
        const c = (res.data as any).count ?? (Array.isArray((res.data as any).exchanges) ? (res.data as any).exchanges.length : undefined);
        detail = c != null ? `count/exchanges: ${c}` : summarizeBody(res.data, 200);
      } else if (typeof res.data === 'object' && res.data !== null) {
        detail = summarizeBody(res.data, 200);
      }

      return {
        name,
        method,
        path,
        query,
        httpStatus: res.status,
        status: 'ok',
        durationMs,
        detail,
      };
    }

    if (tier === 'warning') {
      return {
        name,
        method,
        path,
        query,
        httpStatus: res.status,
        status: 'warning',
        durationMs,
        detail: `Reachable — ${extractErrorDetail(res.status, res.data)}`,
      };
    }

    return {
      name,
      method,
      path,
      query,
      httpStatus: res.status,
      status: 'error',
      durationMs,
      detail: extractErrorDetail(res.status, res.data),
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    return {
      name,
      method,
      path,
      query,
      httpStatus: null,
      status: 'error',
      durationMs,
      detail: err?.message || String(err),
    };
  }
}

/**
 * Runs ChangeNOW API checks one after another (same order every time).
 * Does not POST /v2/exchange (a valid body can create a live order). Pair uses btc→usdt on eth per ChangeNOW v2 docs.
 */
export async function runChangeNowDiagnostics(): Promise<ChangeNowDiagnosticsReport> {
  const client = buildRawClient();
  const apiKeyConfigured = Boolean(getChangeNowApiKey().length);
  const checks: ChangeNowProbeResult[] = [];

  // 1) Public-style currencies (no key required for many partners, but we send key if present)
  checks.push(await probe(client, 'List currencies', 'GET', '/v2/exchange/currencies'));

  // 2–3) Min amount & range — multichain assets need fromNetwork / toNetwork (see changenow.md)
  const pairParams = {
    fromCurrency: DIAG_PAIR.fromCurrency,
    toCurrency: DIAG_PAIR.toCurrency,
    fromNetwork: DIAG_PAIR.fromNetwork,
    toNetwork: DIAG_PAIR.toNetwork,
    flow: DIAG_PAIR.flow,
  };
  checks.push(
    await probe(client, 'Min amount (btc → usdt erc20)', 'GET', '/v2/exchange/min-amount', {
      params: pairParams,
    })
  );
  checks.push(
    await probe(client, 'Range (btc → usdt erc20)', 'GET', '/v2/exchange/range', {
      params: pairParams,
    })
  );

  if (!apiKeyConfigured) {
    checks.push({
      name: 'Available pairs',
      method: 'GET',
      path: '/v2/exchange/available-pairs',
      status: 'skipped',
      httpStatus: null,
      durationMs: 0,
      detail: 'Skipped — CHANGENOW_API_KEY not set',
    });
    checks.push({
      name: 'Estimated amount',
      method: 'GET',
      path: '/v2/exchange/estimated-amount',
      status: 'skipped',
      httpStatus: null,
      durationMs: 0,
      detail: 'Skipped — CHANGENOW_API_KEY not set',
    });
    checks.push({
      name: 'Network fee estimate',
      method: 'GET',
      path: '/v2/exchange/network-fee',
      status: 'skipped',
      httpStatus: null,
      durationMs: 0,
      detail: 'Skipped — CHANGENOW_API_KEY not set',
    });
    checks.push({
      name: 'Exchange by id (invalid id)',
      method: 'GET',
      path: '/v2/exchange/by-id',
      status: 'skipped',
      httpStatus: null,
      durationMs: 0,
      detail: 'Skipped — CHANGENOW_API_KEY not set',
    });
    checks.push({
      name: 'Partner exchanges list',
      method: 'GET',
      path: '/v2/exchanges',
      status: 'skipped',
      httpStatus: null,
      durationMs: 0,
      detail: 'Skipped — CHANGENOW_API_KEY not set',
    });
    checks.push({
      name: 'Create exchange (POST)',
      method: 'POST',
      path: '/v2/exchange',
      status: 'skipped',
      httpStatus: null,
      durationMs: 0,
      detail: 'Skipped — CHANGENOW_API_KEY not set',
    });
  } else {
    checks.push(
      await probe(client, 'Available pairs (btc → usdt erc20)', 'GET', '/v2/exchange/available-pairs', {
        params: {
          fromCurrency: DIAG_PAIR.fromCurrency,
          toCurrency: DIAG_PAIR.toCurrency,
          fromNetwork: DIAG_PAIR.fromNetwork,
          toNetwork: DIAG_PAIR.toNetwork,
          flow: DIAG_PAIR.flow,
        },
      })
    );

    checks.push(
      await probe(client, 'Estimated amount (btc → usdt erc20)', 'GET', '/v2/exchange/estimated-amount', {
        params: {
          fromCurrency: DIAG_PAIR.fromCurrency,
          toCurrency: DIAG_PAIR.toCurrency,
          fromAmount: DIAG_PAIR.sampleFromAmount,
          flow: DIAG_PAIR.flow,
          fromNetwork: DIAG_PAIR.fromNetwork,
          toNetwork: DIAG_PAIR.toNetwork,
        },
      })
    );

    checks.push(
      await probe(client, 'Network fee estimate', 'GET', '/v2/exchange/network-fee', {
        params: {
          fromCurrency: DIAG_PAIR.fromCurrency,
          toCurrency: DIAG_PAIR.toCurrency,
          fromAmount: DIAG_PAIR.sampleFromAmount,
          fromNetwork: DIAG_PAIR.fromNetwork,
          toNetwork: DIAG_PAIR.toNetwork,
        },
      })
    );

    checks.push(
      await probe(
        client,
        'Exchange by id (unknown id)',
        'GET',
        '/v2/exchange/by-id',
        {
          params: { id: DIAG_BY_ID_PLACEHOLDER },
        },
        { treat404AsOk: true }
      )
    );

    checks.push(await probe(client, 'Partner exchanges list', 'GET', '/v2/exchanges', { params: { limit: '5' } }));

    // Intentionally no POST /v2/exchange probe: a well-formed body can create a real exchange (pay-in address).
    // Use admin "create swap" or ChangeNOW dashboard to verify POST; GET probes cover read + validation paths.
    checks.push({
      name: 'Create exchange (POST)',
      method: 'POST',
      path: '/v2/exchange',
      status: 'skipped',
      httpStatus: null,
      durationMs: 0,
      detail:
        'Skipped — POST can create a live order; test manually or via /api/admin/changenow/swaps after other checks pass',
    });
  }

  const ok = checks.filter((c) => c.status === 'ok').length;
  const warning = checks.filter((c) => c.status === 'warning').length;
  const error = checks.filter((c) => c.status === 'error').length;
  const skipped = checks.filter((c) => c.status === 'skipped').length;

  return {
    generatedAt: new Date().toISOString(),
    changeNowBaseUrl: getChangeNowBaseUrl(),
    apiKeyConfigured,
    summary: {
      total: checks.length,
      ok,
      warning,
      error,
      skipped,
    },
    checks,
  };
}
