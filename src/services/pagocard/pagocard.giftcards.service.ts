import axios from 'axios';
import { pagocardConfig } from './pagocard.config';
import {
  extractPagocardGiftcards,
  extractPagocardOrder,
  extractPagocardPurchase,
  normalizeGiftcard,
  type PagocardGiftcard,
  type PagocardGiftcardListResult,
  type PagocardPurchaseResult,
} from './pagocard.giftcards.mapper';

type PagocardApiPayload = Record<string, unknown>;

function assertSuccess(data: PagocardApiPayload, fallback = 'Pagocard request failed') {
  const status = String(data.status || data.success || '').toLowerCase();
  if (status === 'error' || status === 'failed' || data.success === false) {
    throw new Error(String(data.message || data.error || fallback));
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
    if (params.currency) query.set('currency', params.currency);

    const response = await axios.get(`${this.baseUrl}/api/getgiftcards?${query.toString()}`, {
      headers: this.authHeaders(),
      timeout: 45_000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(
        (response.data as PagocardApiPayload)?.message?.toString() ||
          `Failed to fetch Pagocard gift cards (${response.status})`
      );
    }

    assertSuccess(response.data as PagocardApiPayload, 'Failed to fetch Pagocard gift cards');
    return extractPagocardGiftcards(response.data);
  }

  async getGiftcardBySku(sku: string): Promise<PagocardGiftcard> {
    const response = await axios.get(`${this.baseUrl}/api/getgiftcard/${encodeURIComponent(sku)}`, {
      headers: this.authHeaders(),
      timeout: 30_000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(
        (response.data as PagocardApiPayload)?.message?.toString() ||
          `Gift card SKU ${sku} not found (${response.status})`
      );
    }

    const root = response.data as PagocardApiPayload;
    assertSuccess(root, `Gift card SKU ${sku} not found`);
    const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
    const card = normalizeGiftcard(data);
    if (!card) throw new Error(`Gift card SKU ${sku} not found`);
    return card;
  }

  async checkSkuAvailability(sku: string, itemCount: number, price: number) {
    const response = await axios.get(
      `${this.baseUrl}/api/checkskuavailability/${encodeURIComponent(sku)}?item_count=${itemCount}&price=${price}`,
      {
        headers: this.authHeaders(),
        timeout: 30_000,
        validateStatus: () => true,
      }
    );

    if (response.status >= 400) {
      return { available: false, message: (response.data as PagocardApiPayload)?.message?.toString() || 'Unavailable' };
    }

    const root = response.data as PagocardApiPayload;
    const available =
      root.available === true ||
      root.is_available === true ||
      String(root.status || '').toLowerCase() === 'success' ||
      root.success === true;

    return {
      available,
      message: root.message?.toString() || null,
      raw: root,
    };
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

    if (response.status >= 400) {
      throw new Error(
        (response.data as PagocardApiPayload)?.message?.toString() ||
          `Pagocard purchase failed (${response.status})`
      );
    }

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

    if (response.status >= 400) {
      throw new Error(
        (response.data as PagocardApiPayload)?.message?.toString() ||
          `Pagocard order ${referenceCode} not found (${response.status})`
      );
    }

    assertSuccess(response.data as PagocardApiPayload, `Pagocard order ${referenceCode} not found`);
    const order = extractPagocardOrder(response.data);
    if (!order) throw new Error(`Pagocard order ${referenceCode} not found`);
    return order;
  }

  async getExchangeRates() {
    const response = await axios.get(`${this.baseUrl}/api/getexchangerates`, {
      headers: this.authHeaders(),
      timeout: 30_000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(
        (response.data as PagocardApiPayload)?.message?.toString() ||
          `Failed to fetch Pagocard exchange rates (${response.status})`
      );
    }

    return response.data;
  }
}

export const pagocardGiftcardsService = new PagocardGiftcardsService();
