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
  config?: { params?: Record<string, string>; data?: Record<string, unknown> }
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
    const tier = classifyHttpStatus(res.status);

    if (tier === 'ok') {
      let detail = '2xx response';
      if (path === '/v2/exchange/currencies' && Array.isArray(res.data)) {
        detail = `${res.data.length} currencies returned`;
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
 * Does not create real exchanges; POST /v2/exchange is probed with an intentionally invalid body to verify reachability only.
 */
export async function runChangeNowDiagnostics(): Promise<ChangeNowDiagnosticsReport> {
  const client = buildRawClient();
  const apiKeyConfigured = Boolean(getChangeNowApiKey().length);
  const checks: ChangeNowProbeResult[] = [];

  // 1) Public-style currencies (no key required for many partners, but we send key if present)
  checks.push(await probe(client, 'List currencies', 'GET', '/v2/exchange/currencies'));

  // 2–3) Min amount & range (common pair)
  checks.push(
    await probe(client, 'Min amount (btc → usdt)', 'GET', '/v2/exchange/min-amount', {
      params: {
        fromCurrency: 'btc',
        toCurrency: 'usdt',
        flow: 'standard',
      },
    })
  );
  checks.push(
    await probe(client, 'Range (btc → usdt)', 'GET', '/v2/exchange/range', {
      params: {
        fromCurrency: 'btc',
        toCurrency: 'usdt',
        flow: 'standard',
      },
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
      name: 'Create exchange (invalid body — reachability)',
      method: 'POST',
      path: '/v2/exchange',
      status: 'skipped',
      httpStatus: null,
      durationMs: 0,
      detail: 'Skipped — CHANGENOW_API_KEY not set',
    });
  } else {
    checks.push(
      await probe(client, 'Available pairs (btc → usdt)', 'GET', '/v2/exchange/available-pairs', {
        params: {
          fromCurrency: 'btc',
          toCurrency: 'usdt',
        },
      })
    );

    checks.push(
      await probe(client, 'Estimated amount (btc → usdt)', 'GET', '/v2/exchange/estimated-amount', {
        params: {
          fromCurrency: 'btc',
          toCurrency: 'usdt',
          fromAmount: '0.01',
          flow: 'standard',
          fromNetwork: 'btc',
          toNetwork: 'eth',
        },
      })
    );

    checks.push(
      await probe(client, 'Network fee estimate', 'GET', '/v2/exchange/network-fee', {
        params: {
          fromCurrency: 'btc',
          toCurrency: 'usdt',
          fromAmount: '0.01',
          fromNetwork: 'btc',
          toNetwork: 'eth',
        },
      })
    );

    checks.push(
      await probe(client, 'Exchange by id (invalid id)', 'GET', '/v2/exchange/by-id', {
        params: { id: '00000000-0000-0000-0000-000000000000' },
      })
    );

    checks.push(await probe(client, 'Partner exchanges list', 'GET', '/v2/exchanges', { params: { limit: '5' } }));

    // Intentionally invalid create — expect 4xx; proves route + auth accepted
    const start = Date.now();
    try {
      const res = await client.post(
        '/v2/exchange',
        {
          fromCurrency: 'btc',
          toCurrency: 'usdt',
          fromNetwork: 'btc',
          toNetwork: 'eth',
          fromAmount: '0',
          toAmount: '',
          address: '',
          extraId: '',
          refundAddress: '',
          refundExtraId: '',
          userId: '',
          payload: '',
          contactEmail: '',
          source: '',
          flow: 'standard',
          type: 'direct',
          rateId: '',
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...changeNowAuthHeaders(),
          },
          validateStatus: () => true,
        }
      );
      const durationMs = Date.now() - start;
      const tier = classifyHttpStatus(res.status);
      const status: ProbeStatus = tier === 'ok' ? 'ok' : tier === 'warning' ? 'warning' : 'error';
      checks.push({
        name: 'Create exchange (invalid body — reachability)',
        method: 'POST',
        path: '/v2/exchange',
        httpStatus: res.status,
        status,
        durationMs,
        detail:
          tier === 'warning'
            ? `Reachable — ${extractErrorDetail(res.status, res.data)}`
            : tier === 'ok'
              ? summarizeBody(res.data, 300)
              : extractErrorDetail(res.status, res.data),
      });
    } catch (err: any) {
      checks.push({
        name: 'Create exchange (invalid body — reachability)',
        method: 'POST',
        path: '/v2/exchange',
        status: 'error',
        httpStatus: null,
        durationMs: Date.now() - start,
        detail: err?.message || String(err),
      });
    }
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
