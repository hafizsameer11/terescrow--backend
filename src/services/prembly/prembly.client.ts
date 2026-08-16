import axios, { AxiosError } from 'axios';
import { premblyConfig } from './prembly.config';
import ApiError from '../../utils/ApiError';

export type PremblyFaceData = {
  status?: boolean;
  message?: string;
  confidence?: number;
  response_code?: string;
};

export type PremblyEnvelope<T = any> = {
  status?: boolean;
  detail?: string;
  message?: string;
  response_code?: string;
  data?: T;
  nin_data?: T;
  face_data?: PremblyFaceData;
  verification?: {
    status?: string;
    reference?: string;
    verification_id?: string | number;
  };
};

/**
 * Prembly IdentityPass HTTP client.
 * Docs: https://docs.prembly.com
 */
class PremblyClient {
  private getHeaders() {
    const appId = premblyConfig.getAppId();
    const apiKey = premblyConfig.getApiKey();
    if (!appId || !apiKey) {
      throw ApiError.badRequest('Prembly is not configured. Set PREMBLY_APP_ID and PREMBLY_API_KEY.');
    }
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'app-id': appId,
      'x-api-key': apiKey,
    };
  }

  private async post<T = any>(path: string, body: Record<string, unknown>): Promise<PremblyEnvelope<T>> {
    const url = `${premblyConfig.getBaseUrl()}${path}`;
    try {
      const response = await axios.post<PremblyEnvelope<T>>(url, body, {
        headers: this.getHeaders(),
        timeout: 90_000,
      });
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data) {
        const data = error.response.data as PremblyEnvelope;
        const message =
          data.detail ||
          data.message ||
          (typeof (data as any).error === 'string' ? (data as any).error : null) ||
          error.message ||
          'Prembly verification failed';
        const status = error.response.status || 400;
        if (status >= 400 && status < 500) throw ApiError.badRequest(message, data);
        throw ApiError.internal(message, data);
      }
      if (error instanceof ApiError) throw error;
      throw ApiError.badRequest(error instanceof Error ? error.message : 'Prembly request failed');
    }
  }

  /** NIN + face match */
  verifyNinWithFace(number: string, imageBase64OrUrl: string) {
    return this.post('/api/v2/biometrics/merchant/data/verification/nin_face', {
      number,
      image: imageBase64OrUrl,
    });
  }

  /** BVN + face match */
  verifyBvnWithFace(number: string, imageBase64OrUrl: string) {
    return this.post('/api/v1/biometrics/merchant/data/verification/bvn_w_face', {
      number,
      image: imageBase64OrUrl,
    });
  }

  /** BVN basic (no face) — fallback */
  verifyBvnBasic(number: string) {
    return this.post('/api/v1/biometrics/merchant/data/verification/bvn', {
      number,
    });
  }
}

export const premblyClient = new PremblyClient();
