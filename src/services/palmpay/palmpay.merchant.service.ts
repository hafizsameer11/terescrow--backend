import axios from 'axios';
import {
  PalmPayBaseResponse,
  PalmPayQueryMerchantBalanceRequest,
  PalmPayQueryMerchantBalanceResponse,
} from '../../types/palmpay.types';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';

export type PalmPayMerchantBalance = {
  availableBalanceNgn: number;
  frozenBalanceNgn: number;
  currentBalanceNgn: number;
  unSettleBalanceNgn: number;
  merchantId: string;
};

/** PalmPay money fields are in kobo (1 NGN = 100 kobo). */
export function palmpayKoboToNgn(kobo: number): number {
  if (!Number.isFinite(kobo)) return 0;
  return Math.round(kobo) / 100;
}

class PalmPayMerchantService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = palmpayConfig.getBaseUrl();
  }

  async queryMerchantBalance(): Promise<PalmPayMerchantBalance | null> {
    const merchantId = palmpayConfig.getMerchantId();
    if (!merchantId) {
      console.warn('[PalmPay] PALMPAY_MERCHANT_ID not set — skipping merchant balance query');
      return null;
    }

    const requestTime = palmpayAuth.getRequestTime();
    const version = palmpayConfig.getVersion();
    const nonceStr = palmpayAuth.generateNonce();

    const body: PalmPayQueryMerchantBalanceRequest = {
      requestTime,
      version,
      nonceStr,
      merchantId,
    };

    const signature = palmpayAuth.generateSignature(body);
    const headers = palmpayAuth.getRequestHeaders(signature);

    const response = await axios.post<PalmPayBaseResponse<PalmPayQueryMerchantBalanceResponse>>(
      `${this.baseUrl}/api/v2/merchant/manage/account/queryBalance`,
      body,
      { headers, timeout: 25_000 }
    );

    if (response.data.respCode !== '00000000') {
      throw new Error(`PalmPay balance error: ${response.data.respMsg} (${response.data.respCode})`);
    }

    const data = response.data.data;
    if (!data) {
      throw new Error('PalmPay balance API returned no data');
    }

    const currentKobo = data.currentBalance ?? data.currentBlance ?? 0;

    return {
      merchantId,
      availableBalanceNgn: palmpayKoboToNgn(data.availableBalance),
      frozenBalanceNgn: palmpayKoboToNgn(data.frozenBalance),
      currentBalanceNgn: palmpayKoboToNgn(currentKobo),
      unSettleBalanceNgn: palmpayKoboToNgn(data.unSettleBalance),
    };
  }
}

export const palmpayMerchantService = new PalmPayMerchantService();
