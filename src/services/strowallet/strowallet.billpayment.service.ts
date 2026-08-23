import axios from 'axios';
import { strowalletConfig } from './strowallet.config';
import {
  getStroWalletAirtimeBillers,
  getStroWalletDataBillers,
  getStroWalletElectricityBillers,
  getStroWalletCableBillers,
  getStroWalletEducationBillers,
  getEducationProduct,
  mapAirtimeBillerToServiceName,
  mapCableBillerToServiceId,
  mapDataBillerToServiceId,
  parseElectricityBillerId,
  getElectricityBillerLimits,
  wrapPalmPayList,
  type StroWalletBiller,
} from './strowallet.billpayment.catalog';

export type StroWalletDataPlan = {
  variation_code: string;
  name: string;
  variation_amount: string;
  fixedPrice?: string;
};

export type StroWalletBillItem = {
  billerId: string;
  itemId: string;
  itemName: string;
  amount: number;
  minAmount: number;
  maxAmount: number;
  isFixAmount: number;
  status: number;
};

type StroWalletApiResponse = {
  success?: boolean;
  message?: string;
  response?: Record<string, unknown>;
  [key: string]: unknown;
};

function assertSuccess(data: StroWalletApiResponse, fallback = 'StroWallet request failed') {
  if (data?.success === false) {
    throw new Error(String(data.message || fallback));
  }
}

function extractTransactionId(data: StroWalletApiResponse): string | null {
  const response = data.response as Record<string, unknown> | undefined;
  const content = response?.content as Record<string, unknown> | undefined;
  const transactions = content?.transactions as Record<string, unknown> | undefined;
  const candidates = [
    transactions?.transactionId,
    response?.requestId,
    data.transactionId,
    data.request_id,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c);
  }
  return null;
}

function mapOrderStatus(data: StroWalletApiResponse): 'completed' | 'pending' | 'failed' {
  const response = data.response as Record<string, unknown> | undefined;
  const content = response?.content as Record<string, unknown> | undefined;
  const transactions = content?.transactions as Record<string, unknown> | undefined;
  const status = String(transactions?.status || response?.response_description || data.message || '').toLowerCase();
  if (data.success === false) return 'failed';
  if (status.includes('deliver') || status.includes('success')) return 'completed';
  if (status.includes('fail') || status.includes('error')) return 'failed';
  return data.success === true ? 'completed' : 'pending';
}

class StroWalletBillPaymentService {
  private get publicKey() {
    return strowalletConfig.getPublicKey();
  }

  private get baseUrl() {
    return strowalletConfig.getBaseUrl();
  }

  ensureConfigured() {
    if (!strowalletConfig.isConfigured()) {
      throw new Error('StroWallet is not configured. Set STROWALLET_PUBLIC_KEY in server .env.');
    }
  }

  queryBillers(sceneCode: string): StroWalletBiller[] | ReturnType<typeof wrapPalmPayList<StroWalletBiller>> {
    this.ensureConfigured();
    if (sceneCode === 'airtime') return getStroWalletAirtimeBillers();
    if (sceneCode === 'data') return getStroWalletDataBillers();
    if (sceneCode === 'electricity') return getStroWalletElectricityBillers();
    if (sceneCode === 'cable') return getStroWalletCableBillers();
    if (sceneCode === 'education') return getStroWalletEducationBillers();
    throw new Error(`StroWallet does not support sceneCode: ${sceneCode}`);
  }

  wrapBillersForApi(sceneCode: string) {
    const billers = this.queryBillers(sceneCode) as StroWalletBiller[];
    return wrapPalmPayList(billers);
  }

  async queryItems(sceneCode: string, billerId: string): Promise<ReturnType<typeof wrapPalmPayList<StroWalletBillItem>>> {
    this.ensureConfigured();

    if (sceneCode === 'education') {
      const product = getEducationProduct(billerId);
      const amountKobo = Math.round(product.amountNgn * 100);
      return wrapPalmPayList([
        {
          billerId: product.billerId,
          itemId: product.variationCode,
          itemName: product.billerName,
          amount: amountKobo,
          minAmount: amountKobo,
          maxAmount: amountKobo,
          isFixAmount: 1,
          status: 1,
        },
      ]);
    }

    if (sceneCode === 'cable') {
      const serviceId = mapCableBillerToServiceId(billerId);
      const response = await axios.get(`${this.baseUrl}/cable-subscription/plans`, {
        params: {
          public_key: this.publicKey,
          service_id: serviceId,
        },
        timeout: 30_000,
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        throw new Error(
          (response.data as StroWalletApiResponse)?.message ||
            `Failed to fetch StroWallet cable plans (${response.status})`
        );
      }

      const payload = response.data as {
        success?: boolean;
        message?: string;
        data?: {
          varations?: StroWalletDataPlan[];
          variations?: StroWalletDataPlan[];
        };
      };

      assertSuccess(payload, payload.message || 'Failed to fetch cable plans');
      const plans = payload.data?.varations || payload.data?.variations || [];

      const items: StroWalletBillItem[] = plans.map((plan) => {
        const amountNgn = parseFloat(plan.variation_amount || '0');
        return {
          billerId,
          itemId: plan.variation_code,
          itemName: plan.name,
          amount: Math.round(amountNgn * 100),
          minAmount: Math.round(amountNgn * 100),
          maxAmount: Math.round(amountNgn * 100),
          isFixAmount: plan.fixedPrice?.toLowerCase() === 'yes' ? 1 : 0,
          status: 1,
        };
      });

      return wrapPalmPayList(items);
    }

    if (sceneCode !== 'data') {
      return wrapPalmPayList([]);
    }

    const serviceId = mapDataBillerToServiceId(billerId);
    const response = await axios.get(`${this.baseUrl}/buydata/plans`, {
      params: {
        public_key: this.publicKey,
        service_name: serviceId,
      },
      timeout: 30_000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(
        (response.data as StroWalletApiResponse)?.message ||
          `Failed to fetch StroWallet data plans (${response.status})`
      );
    }

    const payload = response.data as {
      success?: boolean;
      message?: string;
      data?: {
        varations?: StroWalletDataPlan[];
        variations?: StroWalletDataPlan[];
      };
    };

    assertSuccess(payload, payload.message || 'Failed to fetch data plans');
    const plans = payload.data?.varations || payload.data?.variations || [];

    const items: StroWalletBillItem[] = plans.map((plan) => {
      const amountNgn = parseFloat(plan.variation_amount || '0');
      return {
        billerId,
        itemId: plan.variation_code,
        itemName: plan.name,
        amount: Math.round(amountNgn * 100),
        minAmount: Math.round(amountNgn * 100),
        maxAmount: Math.round(amountNgn * 100),
        isFixAmount: plan.fixedPrice?.toLowerCase() === 'yes' ? 1 : 0,
        status: 1,
      };
    });

    return wrapPalmPayList(items);
  }

  async verifyAirtimeOrDataPhone(rechargeAccount: string, billerId: string) {
    const valid = /^0\d{10}$/.test(rechargeAccount);
    return {
      biller: billerId,
      billerId,
      valid,
    };
  }

  async verifyMeter(params: {
    billerId: string;
    meterNumber: string;
  }) {
    this.ensureConfigured();
    const { serviceName, meterType } = parseElectricityBillerId(params.billerId);

    const response = await axios.post(
      `${this.baseUrl}/electricity/verify-merchant`,
      {
        public_key: this.publicKey,
        service_name: serviceName,
        meter_type: meterType,
        meter_number: params.meterNumber,
      },
      { timeout: 30_000, validateStatus: () => true }
    );

    const data = response.data as StroWalletApiResponse & {
      customer_name?: string;
      address?: string;
    };

    if (response.status >= 400 || data.success === false) {
      return {
        valid: false,
        biller: serviceName,
        billerId: params.billerId,
        error: data.message || 'Invalid meter number',
      };
    }

    return {
      valid: true,
      biller: data.customer_name || serviceName,
      billerId: params.billerId,
      customerName: data.customer_name,
      address: data.address,
    };
  }

  async buyAirtime(params: { billerId: string; phone: string; amount: number }) {
    this.ensureConfigured();
    const serviceName = mapAirtimeBillerToServiceName(params.billerId);

    const response = await axios.post(
      `${this.baseUrl}/buyairtime/request`,
      {
        public_key: this.publicKey,
        amount: String(params.amount),
        phone: params.phone,
        service_name: serviceName,
      },
      { timeout: 45_000, validateStatus: () => true }
    );

    const data = response.data as StroWalletApiResponse;
    if (response.status >= 400) {
      throw new Error(data.message || `StroWallet airtime failed (${response.status})`);
    }
    assertSuccess(data, data.message || 'StroWallet airtime purchase failed');

    return {
      status: mapOrderStatus(data),
      transactionId: extractTransactionId(data),
      raw: data,
    };
  }

  async buyData(params: {
    billerId: string;
    phone: string;
    amount: number;
    variationCode: string;
    planName?: string;
  }) {
    this.ensureConfigured();
    const serviceId = mapDataBillerToServiceId(params.billerId);

    const response = await axios.post(
      `${this.baseUrl}/buydata/request`,
      {
        public_key: this.publicKey,
        amount: String(params.amount),
        phone: params.phone,
        service_id: serviceId,
        variation_code: params.variationCode,
        service_name: params.planName || serviceId,
      },
      { timeout: 45_000, validateStatus: () => true }
    );

    const data = response.data as StroWalletApiResponse;
    if (response.status >= 400) {
      throw new Error(data.message || `StroWallet data purchase failed (${response.status})`);
    }
    assertSuccess(data, data.message || 'StroWallet data purchase failed');

    return {
      status: mapOrderStatus(data),
      transactionId: extractTransactionId(data),
      raw: data,
    };
  }

  async verifySmartcard(params: { billerId: string; smartcardNumber: string }) {
    this.ensureConfigured();
    const serviceId = mapCableBillerToServiceId(params.billerId);

    const response = await axios.post(
      `${this.baseUrl}/cable-subscription/verify-merchant`,
      null,
      {
        params: {
          public_key: this.publicKey,
          service_id: serviceId,
          customer_id: params.smartcardNumber,
        },
        timeout: 30_000,
        validateStatus: () => true,
      }
    );

    const data = response.data as StroWalletApiResponse & {
      customer_name?: string;
      Customer_Name?: string;
    };

    if (response.status >= 400 || data.success === false) {
      return {
        valid: false,
        biller: serviceId,
        billerId: params.billerId,
        error: data.message || 'Invalid smartcard number',
      };
    }

    return {
      valid: true,
      biller: data.customer_name || data.Customer_Name || serviceId,
      billerId: params.billerId,
      customerName: data.customer_name || data.Customer_Name,
    };
  }

  async buyCable(params: {
    billerId: string;
    smartcardNumber: string;
    amount: number;
    variationCode: string;
    planName: string;
    phone: string;
  }) {
    this.ensureConfigured();
    const serviceId = mapCableBillerToServiceId(params.billerId);

    const response = await axios.post(
      `${this.baseUrl}/cable-subscription/request`,
      {
        public_key: this.publicKey,
        amount: String(params.amount),
        phone: params.phone,
        service_id: serviceId,
        service_name: params.planName,
        variation_code: params.variationCode,
        customer_id: params.smartcardNumber,
      },
      { timeout: 45_000, validateStatus: () => true }
    );

    const data = response.data as StroWalletApiResponse;
    if (response.status >= 400) {
      throw new Error(data.message || `StroWallet cable purchase failed (${response.status})`);
    }
    assertSuccess(data, data.message || 'StroWallet cable purchase failed');

    return {
      status: mapOrderStatus(data),
      transactionId: extractTransactionId(data),
      raw: data,
    };
  }

  async buyEducation(params: {
    billerId: string;
    phone: string;
    amount: number;
    variationCode: string;
  }) {
    this.ensureConfigured();
    const product = getEducationProduct(params.billerId);

    const response = await axios.post(
      `${this.baseUrl}/educational/request`,
      {
        public_key: this.publicKey,
        amount: String(params.amount),
        phone: params.phone,
        service_name: product.serviceName,
        variation_code: params.variationCode || product.variationCode,
      },
      { timeout: 45_000, validateStatus: () => true }
    );

    const data = response.data as StroWalletApiResponse;
    if (response.status >= 400) {
      throw new Error(data.message || `StroWallet education purchase failed (${response.status})`);
    }
    assertSuccess(data, data.message || 'StroWallet education purchase failed');

    const responseObj = data.response as Record<string, unknown> | undefined;
    const pin = responseObj?.purchased_code || responseObj?.Pin || responseObj?.pin;

    return {
      status: mapOrderStatus(data),
      transactionId: extractTransactionId(data),
      pin: pin ? String(pin) : null,
      raw: data,
    };
  }

  async buyElectricity(params: {
    billerId: string;
    meterNumber: string;
    amount: number;
    phone: string;
  }) {
    this.ensureConfigured();
    const { serviceName, meterType } = parseElectricityBillerId(params.billerId);
    const { minAmount, maxAmount } = getElectricityBillerLimits(params.billerId);
    const amountKobo = Math.round(params.amount * 100);
    if (amountKobo < minAmount) {
      throw new Error(`Minimum amount is ₦${(minAmount / 100).toLocaleString('en-NG')}`);
    }
    if (amountKobo > maxAmount) {
      throw new Error(`Maximum amount is ₦${(maxAmount / 100).toLocaleString('en-NG')}`);
    }

    const response = await axios.post(
      `${this.baseUrl}/electricity/request`,
      {
        public_key: this.publicKey,
        amount: String(params.amount),
        phone: params.phone,
        service_name: serviceName,
        meter_number: params.meterNumber,
        meter_type: meterType,
      },
      { timeout: 45_000, validateStatus: () => true }
    );

    const data = response.data as StroWalletApiResponse;
    if (response.status >= 400) {
      throw new Error(data.message || `StroWallet electricity purchase failed (${response.status})`);
    }
    assertSuccess(data, data.message || 'StroWallet electricity purchase failed');

    const responseObj = data.response as Record<string, unknown> | undefined;
    const token = responseObj?.Token || responseObj?.purchased_code;

    return {
      status: mapOrderStatus(data),
      transactionId: extractTransactionId(data),
      token: token ? String(token) : null,
      raw: data,
    };
  }
}

export const strowalletBillPaymentService = new StroWalletBillPaymentService();
