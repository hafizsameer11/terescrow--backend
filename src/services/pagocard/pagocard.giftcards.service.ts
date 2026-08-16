import axios, { type AxiosResponse } from 'axios';
import { pagocardConfig } from './pagocard.config';
import {
  extractPagocardAvailability,
  extractPagocardCategories,
  extractPagocardCountries,
  extractPagocardGiftcardBySku,
  extractPagocardGiftcards,
  extractPagocardOrder,
  extractPagocardPurchase,
  isPagocardHtmlResponse,
  type PagocardAvailabilityResult,
  type PagocardCategory,
  type PagocardCountry,
  type PagocardGiftcard,
  type PagocardGiftcardListResult,
  type PagocardPurchaseResult,
} from './pagocard.giftcards.mapper';

type PagocardApiPayload = Record<string, unknown>;

function assertSuccess(data: PagocardApiPayload, fallback = 'Pagocard request failed') {
  if (data.success === false) {
    throw new Error(String(data.message || data.error || fallback));
  }
  const status = String(data.status || '').toLowerCase();
  if (status === 'error' || status === 'failed') {
    throw new Error(String(data.message || data.error || fallback));
  }
}

function responseContentType(response: AxiosResponse): string | null {
  const header = response.headers?.['content-type'] || response.headers?.['Content-Type'];
  return header != null ? String(header) : null;
}

function throwIfHtmlOrHttpError(
  response: AxiosResponse,
  notFoundMessage: string,
  fallbackMessage: string
): void {
  if (isPagocardHtmlResponse(response.data, responseContentType(response))) {
    throw new Error(notFoundMessage);
  }
  if (response.status === 404) {
    throw new Error(notFoundMessage);
  }
  if (response.status >= 400) {
    const payload = response.data as PagocardApiPayload | string;
    const message =
      typeof payload === 'object' && payload
        ? payload.message?.toString()
        : undefined;
    throw new Error(message || `${fallbackMessage} (${response.status})`);
  }
}

class PagocardGiftcardsService {
  private get baseUrl() {
    return pagocardConfig.getBaseUrl();
  }

  ensureConfigured() {
    if (!pagocardConfig.isConfigured()) {
      throw new Error('Pagocard is not configured. Set PAGOCARD_PUBLIC_KEY and PAGOCARD_SECRET_KEY in server .env.');
    }
  }

  private authHeaders() {
    this.ensureConfigured();
    return pagocardConfig.getAuthHeaders();
  }

  async getGiftcards(params: {
    page?: number;
    limit?: number;
    search?: string;
    country?: string;
    currency?: string;
  } = {}): Promise<PagocardGiftcardListResult> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);
    if (params.country) query.set('country', params.country);
    // Catalog is USD-only live; skip NGN (and empty) so we don't blank the list.
    if (params.currency && params.currency.toUpperCase() !== 'NGN') {
      query.set('currency', params.currency);
    }

    const response = await axios.get(`${this.baseUrl}/api/getgiftcards?${query.toString()}`, {
      headers: this.authHeaders(),
      timeout: 45_000,
      validateStatus: () => true,
    });

    throwIfHtmlOrHttpError(response, 'Gift cards not found', 'Failed to fetch Pagocard gift cards');
    assertSuccess(response.data as PagocardApiPayload, 'Failed to fetch Pagocard gift cards');
    return extractPagocardGiftcards(response.data);
  }

  async getGiftcardBySku(sku: string): Promise<PagocardGiftcard> {
    const response = await axios.get(`${this.baseUrl}/api/getgiftcard/${encodeURIComponent(sku)}`, {
      headers: this.authHeaders(),
      timeout: 30_000,
      validateStatus: () => true,
    });

    throwIfHtmlOrHttpError(response, `Gift card SKU ${sku} not found`, `Gift card SKU ${sku} not found`);
    const root = response.data as PagocardApiPayload;
    assertSuccess(root, `Gift card SKU ${sku} not found`);
    const card = extractPagocardGiftcardBySku(root);
    if (!card) throw new Error(`Gift card SKU ${sku} not found`);
    return card;
  }

  async checkSkuAvailability(sku: string, itemCount: number, price: number): Promise<PagocardAvailabilityResult> {
    const response = await axios.get(
      `${this.baseUrl}/api/checkskuavailability/${encodeURIComponent(sku)}?item_count=${itemCount}&price=${price}`,
      {
        headers: this.authHeaders(),
        timeout: 30_000,
        validateStatus: () => true,
      }
    );

    if (isPagocardHtmlResponse(response.data, responseContentType(response)) || response.status === 404) {
      return { available: false, message: `Gift card SKU ${sku} not found`, raw: {} };
    }

    if (response.status >= 400) {
      const payload = response.data as PagocardApiPayload;
      return {
        available: false,
        message: payload?.message?.toString() || 'Unavailable',
        raw: typeof payload === 'object' && payload ? payload : {},
      };
    }

    const root = response.data as PagocardApiPayload;
    if (root.success === false) {
      return {
        available: false,
        message: root.message?.toString() || 'Failed to check SKU availability.',
        raw: root,
      };
    }

    return extractPagocardAvailability(root);
  }

  async getGiftcardCategories(): Promise<PagocardCategory[]> {
    const response = await axios.get(`${this.baseUrl}/api/getgiftcardcategories`, {
      headers: this.authHeaders(),
      timeout: 45_000,
      validateStatus: () => true,
    });

    throwIfHtmlOrHttpError(response, 'Gift card categories not found', 'Failed to fetch Pagocard categories');
    assertSuccess(response.data as PagocardApiPayload, 'Failed to fetch Pagocard categories');
    return extractPagocardCategories(response.data);
  }

  async getGiftcardCountries(): Promise<PagocardCountry[]> {
    const response = await axios.get(`${this.baseUrl}/api/getgiftcardcountries`, {
      headers: this.authHeaders(),
      timeout: 45_000,
      validateStatus: () => true,
    });

    throwIfHtmlOrHttpError(response, 'Gift card countries not found', 'Failed to fetch Pagocard countries');
    assertSuccess(response.data as PagocardApiPayload, 'Failed to fetch Pagocard countries');
    return extractPagocardCountries(response.data);
  }

  async purchaseGiftcard(params: { sku: string; quantity: number; amount: number }): Promise<PagocardPurchaseResult> {
    const response = await axios.post(
      `${this.baseUrl}/api/purchasegiftcard`,
      {
        sku: params.sku,
        quantity: params.quantity,
        amount: params.amount,
        publickey: pagocardConfig.getPublicKey(),
        secretkey: pagocardConfig.getSecretKey(),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        timeout: 60_000,
        validateStatus: () => true,
      }
    );

    throwIfHtmlOrHttpError(response, 'Pagocard purchase failed', 'Pagocard purchase failed');
    assertSuccess(response.data as PagocardApiPayload, 'Pagocard purchase failed');
    const result = extractPagocardPurchase(response.data, params);
    if (!result.referenceCode) {
      throw new Error('Pagocard purchase did not return a reference code');
    }
    return result;
  }

  async getGiftcardOrder(referenceCode: string): Promise<PagocardPurchaseResult> {
    const response = await axios.get(
      `${this.baseUrl}/api/getgiftcardorder/${encodeURIComponent(referenceCode)}`,
      {
        headers: this.authHeaders(),
        timeout: 30_000,
        validateStatus: () => true,
      }
    );

    throwIfHtmlOrHttpError(
      response,
      `Pagocard order ${referenceCode} not found`,
      `Pagocard order ${referenceCode} not found`
    );
    assertSuccess(response.data as PagocardApiPayload, `Pagocard order ${referenceCode} not found`);
    const order = extractPagocardOrder(response.data);
    if (!order) throw new Error(`Pagocard order ${referenceCode} not found`);
    return order;
  }

  /**
   * Live exchange-rates endpoint is flaky (HTTP 500). Never block catalog/purchase on this.
   */
  async getExchangeRates(): Promise<{ success: boolean; data?: unknown; message?: string }> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/getexchangerates`, {
        headers: this.authHeaders(),
        timeout: 30_000,
        validateStatus: () => true,
      });

      if (isPagocardHtmlResponse(response.data, responseContentType(response)) || response.status >= 400) {
        return {
          success: false,
          message:
            (response.data as PagocardApiPayload)?.message?.toString() ||
            `Failed to fetch Pagocard exchange rates (${response.status})`,
        };
      }

      const root = response.data as PagocardApiPayload;
      if (root.success === false) {
        return { success: false, message: root.message?.toString() || 'Failed to fetch exchange rates.' };
      }

      return { success: true, data: root };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Failed to fetch Pagocard exchange rates',
      };
    }
  }
}

export const pagocardGiftcardsService = new PagocardGiftcardsService();
