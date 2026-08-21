import axios, { AxiosError } from 'axios';
import { bushaConfig } from './busha.config';
import ApiError from '../../utils/ApiError';

export type BushaApiEnvelope<T> = {
  status: string;
  message: string;
  data: T;
};

export type BushaCustomer = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  country_id?: string;
  status?: string;
  type?: string;
  deposit?: boolean;
  payout?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type BushaQuote = {
  id: string;
  profile_id?: string;
  source_currency: string;
  target_currency: string;
  source_amount: string;
  target_amount: string;
  rate?: Record<string, unknown>;
  fees?: Array<{ amount: { amount: string; currency: string }; name: string; type: string }>;
  pay_in?: Record<string, unknown>;
  pay_out?: Record<string, unknown>;
  expires_at?: string;
  status?: string;
};

export type BushaTransfer = {
  id: string;
  profile_id?: string;
  quote_id?: string;
  source_currency: string;
  target_currency: string;
  source_amount: string;
  target_amount: string;
  trade?: string;
  status: string;
  pay_in?: {
    type?: string;
    expires_at?: string;
    address?: string;
    network?: string;
    recipient_details?: {
      account_name?: string;
      account_number?: string;
      bank_name?: string;
      bank_code?: string;
      email?: string;
    };
  };
  pay_out?: Record<string, unknown>;
  timeline?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type BushaRecipient = {
  id: string;
  type?: string;
  account_number?: string;
  bank_name?: string;
  account_name?: string;
  country?: string;
};

export type BushaAmount = {
  amount: string;
  currency: string;
};

export type BushaPairAmount = {
  amount: string;
  currency: string;
  counter?: {
    amount: string;
    currency: string;
  };
};

export type BushaPair = {
  id: string;
  base: string;
  counter: string;
  type?: string;
  is_buy_supported?: boolean;
  is_sell_supported?: boolean;
  min_buy_amount?: BushaPairAmount;
  min_sell_amount?: BushaPairAmount;
  max_buy_amount?: BushaPairAmount;
  max_sell_amount?: BushaPairAmount;
  buy_price?: BushaAmount;
  sell_price?: BushaAmount;
};

export type BushaBalance = {
  id: string;
  profile_id?: string;
  user_id?: string;
  currency: string;
  name?: string;
  type?: string;
  available?: BushaAmount;
  pending?: BushaAmount;
  total?: BushaAmount;
  savings?: BushaAmount;
  investments?: BushaAmount;
};

export type BushaIdentifyingDocument = {
  type: 'national-id' | 'passport' | 'drivers-license' | 'selfie';
  number?: string;
  country?: string;
  image_front?: string;
};

export type CreateBushaCustomerInput = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  country_id?: string;
  birth_date?: string;
  has_accepted_terms?: boolean;
  address?: {
    city: string;
    state: string;
    country_id: string;
    address_line_1: string;
    postal_code: string;
  };
  identifying_information?: BushaIdentifyingDocument[];
};

export type UpdateBushaCustomerInput = CreateBushaCustomerInput & {
  type?: 'individual';
};

export type CreateBushaQuoteInput = {
  source_currency: string;
  target_currency: string;
  source_amount?: string;
  target_amount?: string;
  pay_in?: Record<string, unknown>;
  pay_out?: Record<string, unknown>;
};

export type CreateBushaRecipientInput = {
  currency: string;
  country_code: string;
  type: 'ngn_bank';
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
};

class BushaClient {
  private getHeaders(profileId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${bushaConfig.getApiKey()}`,
      'Content-Type': 'application/json',
    };
    if (profileId) {
      headers['X-BU-PROFILE-ID'] = profileId;
    }
    return headers;
  }

  private buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const base = `${bushaConfig.getBaseUrl()}${path}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    profileId?: string,
    query?: Record<string, string | undefined>,
    options?: { allowEmptyData?: boolean }
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    try {
      const response = await axios.request<BushaApiEnvelope<T>>({
        method,
        url,
        headers: this.getHeaders(profileId),
        data: body,
        timeout: 60_000,
      });
      const status = String(response.data?.status || '').toLowerCase();
      if (status !== 'success') {
        throw ApiError.badRequest(response.data?.message || 'Busha API returned an unexpected response');
      }
      // Some endpoints (e.g. POST /v1/addresses/regenerate) return success with no `data`.
      if (response.data.data === undefined || response.data.data === null) {
        if (options?.allowEmptyData) {
          return undefined as T;
        }
        throw ApiError.badRequest(response.data?.message || 'Busha API returned an unexpected response');
      }
      return response.data.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error instanceof AxiosError && error.response) {
        const status = error.response.status || 400;
        const data = error.response.data as {
          message?: string;
          error?: string | { name?: string; message?: string };
        };
        const nested =
          typeof data?.error === 'object' && data.error?.message ? data.error.message : null;
        const message =
          nested ||
          data?.message ||
          (typeof data?.error === 'string' ? data.error : null) ||
          error.message ||
          'Busha API request failed';

        if (status === 401 || status === 403) throw ApiError.unauthorized(message, data);
        if (status === 404) throw ApiError.notFound(message, data);
        if (status === 409) throw ApiError.conflict(message, data);
        if (status >= 400 && status < 500) throw ApiError.badRequest(message, data);
        throw ApiError.internal(message, data);
      }

      if (error instanceof Error) {
        throw ApiError.badRequest(error.message);
      }
      throw ApiError.internal('Busha API request failed');
    }
  }

  createCustomer(input: CreateBushaCustomerInput): Promise<BushaCustomer> {
    return this.request<BushaCustomer>('POST', '/v1/customers', {
      ...input,
      type: 'individual',
      has_accepted_terms: input.has_accepted_terms ?? true,
      country_id: input.country_id || 'NG',
      address: input.address || {
        city: 'Lagos',
        state: 'Lagos',
        country_id: 'NG',
        address_line_1: '10 Allen Avenue',
        postal_code: '100001',
      },
    });
  }

  listCustomers(): Promise<BushaCustomer[]> {
    return this.request<BushaCustomer[]>('GET', '/v1/customers');
  }

  getCustomer(customerId: string): Promise<BushaCustomer> {
    return this.request<BushaCustomer>('GET', `/v1/customers/${customerId}`);
  }

  updateCustomer(bushaProfileId: string, input: UpdateBushaCustomerInput): Promise<BushaCustomer> {
    return this.request<BushaCustomer>('PUT', `/v1/customers/${bushaProfileId}`, {
      ...input,
      type: input.type || 'individual',
      has_accepted_terms: input.has_accepted_terms ?? true,
    });
  }

  verifyCustomer(customerId: string): Promise<{ message?: string }> {
    return this.request('POST', `/v1/customers/${customerId}/verify`);
  }

  /**
   * Trading pair limits and prices.
   * Public on Busha; works with or without profile.
   * GET /v1/pairs?currency=NGN&type=fiat
   */
  listPairs(query?: {
    currency?: string;
    type?: string;
  }): Promise<BushaPair[]> {
    return this.request<BushaPair[]>('GET', '/v1/pairs', undefined, undefined, query);
  }

  createQuote(input: CreateBushaQuoteInput, profileId?: string): Promise<BushaQuote> {
    return this.request<BushaQuote>('POST', '/v1/quotes', input, profileId);
  }

  getQuote(quoteId: string, profileId?: string): Promise<BushaQuote> {
    return this.request<BushaQuote>('GET', `/v1/quotes/${quoteId}`, undefined, profileId);
  }

  createTransfer(quoteId: string, profileId?: string): Promise<BushaTransfer> {
    return this.request<BushaTransfer>('POST', '/v1/transfers', { quote_id: quoteId }, profileId);
  }

  getTransfer(transferId: string, profileId?: string): Promise<BushaTransfer> {
    return this.request<BushaTransfer>('GET', `/v1/transfers/${transferId}`, undefined, profileId);
  }

  listTransfers(
    profileId?: string,
    query?: {
      limit?: string;
      quote_id?: string;
      source_currency?: string;
      target_currency?: string;
      status?: string;
    }
  ): Promise<BushaTransfer[]> {
    return this.request<BushaTransfer[]>('GET', '/v1/transfers', undefined, profileId, query);
  }

  listBalances(profileId?: string, currency?: string): Promise<BushaBalance[]> {
    return this.request<BushaBalance[]>(
      'GET',
      '/v1/balances',
      undefined,
      profileId,
      currency ? { currency } : undefined
    );
  }

  getBalance(idOrCode: string, profileId?: string): Promise<BushaBalance> {
    return this.request<BushaBalance>('GET', `/v1/balances/${encodeURIComponent(idOrCode)}`, undefined, profileId);
  }

  createRecipient(input: CreateBushaRecipientInput, profileId?: string): Promise<BushaRecipient> {
    return this.request<BushaRecipient>('POST', '/v1/recipients', input, profileId);
  }

  listRecipients(profileId?: string): Promise<BushaRecipient[]> {
    return this.request<BushaRecipient[]>('GET', '/v1/recipients', undefined, profileId);
  }

  /**
   * Reusable deposit address for a currency (no amount required).
   * GET /v1/addresses/{currency}?network=…
   */
  getDepositAddress(
    currency: string,
    profileId?: string,
    network?: string
  ): Promise<BushaDepositAddress | BushaDepositAddress[]> {
    const code = currency.trim().toUpperCase();
    return this.request<BushaDepositAddress | BushaDepositAddress[]>(
      'GET',
      `/v1/addresses/${encodeURIComponent(code)}`,
      undefined,
      profileId,
      network ? { network: network.toUpperCase() } : undefined
    );
  }

  /** Regenerate a deposit address for currency+network. */
  regenerateDepositAddress(
    input: { currency: string; network: string },
    profileId?: string
  ): Promise<BushaDepositAddress | undefined> {
    return this.request<BushaDepositAddress | undefined>(
      'POST',
      '/v1/addresses/regenerate',
      {
        currency: input.currency.trim().toUpperCase(),
        network: input.network.trim().toUpperCase(),
      },
      profileId,
      undefined,
      { allowEmptyData: true }
    );
  }
}

export type BushaDepositAddress = {
  id?: string;
  address?: string;
  currency?: string;
  currency_id?: string;
  network?: string;
  chain?: string;
  memo?: string | null;
  label?: string | null;
  created_at?: string;
  /** Busha minimum deposit for this currency+network (string amount). */
  minimum_deposit?: string | number | null;
  warnings?: {
    risk_message?: string;
    processing_time?: string;
    [key: string]: unknown;
  } | null;
};

export const bushaClient = new BushaClient();
