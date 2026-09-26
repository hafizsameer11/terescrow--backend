import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { palmpayConfig } from './palmpay.config';
import { palmpayAuth } from './palmpay.auth.service';
import palmpayLogger from '../../utils/palmpay.logger';

/** PalmPay VAS permanent VA — always personal (BVN). Paths from official docs; overridable via env. */
const CREATE_PATH =
  process.env.PALMPAY_VA_CREATE_PATH || '/api/v2/virtual/account/label/create';
const QUERY_PATH =
  process.env.PALMPAY_VA_QUERY_PATH || '/api/v2/virtual/account/label/queryOne';
const UPDATE_PATH =
  process.env.PALMPAY_VA_UPDATE_PATH || '/api/v2/virtual/account/label/update';
const ORDER_QUERY_PATH =
  process.env.PALMPAY_VA_ORDER_QUERY_PATH || '/api/v2/virtual/order/detail';

/** Personal identity only — never business/corporate. */
export const PALMPAY_VA_PERSONAL_IDENTITY_TYPE =
  process.env.PALMPAY_VA_PERSONAL_IDENTITY_TYPE || 'personal';

export type PalmPayPermanentVaCreateInput = {
  accountReference: string;
  virtualAccountName: string;
  customerName: string;
  licenseNumber: string; // BVN (11 digits)
  email?: string | null;
  phone?: string | null;
  notifyUrl: string;
};

export type PalmPayPermanentVaResult = {
  raw: Record<string, unknown>;
  virtualAccountId?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  bankName?: string | null;
  bankCode?: string | null;
  status?: string | null;
  message?: string | null;
};

function url(path: string): string {
  return `${palmpayConfig.getBaseUrl().replace(/\/$/, '')}${path}`;
}

function pickString(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function normalizeVaPayload(data: any): PalmPayPermanentVaResult {
  const nested = data?.data && typeof data.data === 'object' ? data.data : data;
  return {
    raw: (data || {}) as Record<string, unknown>,
    virtualAccountId: pickString(nested, [
      'virtualAccountId',
      'virtualAccountNo',
      'accountId',
      'payerAccountId',
      'id',
    ]),
    accountNumber: pickString(nested, [
      'virtualAccountNo',
      'accountNo',
      'accountNumber',
      'payerVirtualAccNo',
      'virtualAccNo',
    ]),
    accountName: pickString(nested, [
      'virtualAccountName',
      'accountName',
      'payerAccountName',
      'customerName',
    ]),
    bankName: pickString(nested, ['bankName', 'payerBankName', 'bank']),
    bankCode: pickString(nested, ['bankCode', 'payerBankCode']),
    status: pickString(nested, ['status', 'accountStatus', 'vaStatus', 'orderStatus']),
    message: pickString(nested, ['respMsg', 'message', 'msg', 'errorMessage']),
  };
}

async function postSigned<T = any>(
  path: string,
  body: Record<string, any>
): Promise<T> {
  const requestTime = palmpayAuth.getRequestTime();
  const version = palmpayConfig.getVersion();
  const nonceStr = palmpayAuth.generateNonce();
  const fullRequest = {
    ...body,
    requestTime,
    version,
    nonceStr,
  };
  const signature = palmpayAuth.generateSignature(fullRequest);
  const headers = palmpayAuth.getRequestHeaders(signature);
  const endpoint = url(path);

  palmpayLogger.apiCall(endpoint, {
    path,
    accountReference: body.accountReference || body.virtualAccountNo || body.orderNo,
  });

  try {
    const response = await axios.post(endpoint, fullRequest, { headers, timeout: 60000 });
    const respCode = response.data?.respCode;
    if (respCode && respCode !== '00000000') {
      const msg = response.data?.respMsg || response.data?.message || 'PalmPay VA request failed';
      palmpayLogger.error('PalmPay permanent VA API error', undefined, {
        path,
        respCode,
        respMsg: msg,
        data: response.data,
      });
      const err: any = new Error(msg);
      err.respCode = respCode;
      err.raw = response.data;
      throw err;
    }
    return response.data;
  } catch (error: any) {
    if (error?.respCode || error?.raw) throw error;
    const data = error?.response?.data;
    const msg =
      data?.respMsg ||
      data?.message ||
      error?.message ||
      'PalmPay VA request failed';
    palmpayLogger.error('PalmPay permanent VA HTTP error', error, {
      path,
      status: error?.response?.status,
      data,
    });
    const err: any = new Error(msg);
    err.respCode = data?.respCode;
    err.raw = data;
    throw err;
  }
}

class PalmPayPermanentVaClient {
  async create(input: PalmPayPermanentVaCreateInput): Promise<PalmPayPermanentVaResult> {
    const payload: Record<string, any> = {
      accountReference: input.accountReference,
      virtualAccountName: input.virtualAccountName,
      customerName: input.customerName,
      // Always personal — BVN identity
      identityType: PALMPAY_VA_PERSONAL_IDENTITY_TYPE,
      licenseNumber: input.licenseNumber,
    };
    if (input.email) payload.email = input.email;
    // notifyUrl is configured in PalmPay portal (VA webhook); not part of create body in docs.

    const data = await postSigned(CREATE_PATH, payload);
    return normalizeVaPayload(data);
  }

  async query(params: {
    accountReference?: string;
    virtualAccountNo?: string;
    virtualAccountId?: string;
  }): Promise<PalmPayPermanentVaResult> {
    // Official queryOne requires virtualAccountNo
    if (!params.virtualAccountNo) {
      const err: any = new Error('virtualAccountNo is required to query PalmPay funding account');
      err.respCode = 'MISSING_VA_NO';
      throw err;
    }
    const payload: Record<string, any> = {
      virtualAccountNo: params.virtualAccountNo,
    };

    const data = await postSigned(QUERY_PATH, payload);
    return normalizeVaPayload(data);
  }

  async update(params: {
    virtualAccountNo: string;
    status?: string;
    virtualAccountName?: string;
  }): Promise<PalmPayPermanentVaResult> {
    const data = await postSigned(UPDATE_PATH, {
      virtualAccountNo: params.virtualAccountNo,
      ...(params.status ? { status: params.status } : {}),
      ...(params.virtualAccountName
        ? { virtualAccountName: params.virtualAccountName }
        : {}),
    });
    return normalizeVaPayload(data);
  }

  async queryOrder(params: {
    orderNo?: string;
    orderId?: string;
    virtualAccountNo?: string;
  }): Promise<Record<string, unknown>> {
    const payload: Record<string, any> = {};
    if (params.orderNo) payload.orderNo = params.orderNo;
    if (params.orderId) payload.orderId = params.orderId;
    if (params.virtualAccountNo) payload.virtualAccountNo = params.virtualAccountNo;
    const data = await postSigned(ORDER_QUERY_PATH, payload);
    return (data?.data || data) as Record<string, unknown>;
  }

  generateAccountReference(userId: number): string {
    return `pva_${userId}_${uuidv4().replace(/-/g, '')}`.substring(0, 64);
  }
}

export const palmpayPermanentVaClient = new PalmPayPermanentVaClient();
