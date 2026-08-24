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
  private getHeaders(): Record<string, string> {
    const apiKey = premblyConfig.getApiKey();
    if (!apiKey) {
      throw ApiError.badRequest('Prembly is not configured. Set PREMBLY_API_KEY.');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': apiKey,
    };
    const appId = premblyConfig.getAppId();
    if (appId) {
      headers['app-id'] = appId;
    }
    return headers;
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

  /** NIN + face match — Prembly v2: POST /verification/nin_w_face */
  verifyNinWithFace(number: string, imageBase64OrUrl: string) {
    return this.post('/verification/nin_w_face', {
      number_nin: number,
      image: imageBase64OrUrl,
    });
  }

  /** BVN + face match — Prembly v2: POST /verification/bvn_w_face */
  verifyBvnWithFace(number: string, imageBase64OrUrl: string) {
    return this.post('/verification/bvn_w_face', {
      number,
      image: imageBase64OrUrl,
    });
  }

  /** BVN basic (no face) — fallback; Prembly v2: POST /verification/bvn_validation */
  verifyBvnBasic(number: string) {
    return this.post('/verification/bvn_validation', {
      number,
    });
  }

  /** International passport + face — POST /verification/national_passport_with_face */
  verifyPassportWithFace(lastName: string, number: string, imageBase64OrUrl: string) {
    return this.post('/verification/national_passport_with_face', {
      last_name: lastName,
      number,
      image: imageBase64OrUrl,
    });
  }

  /** Drivers license + face — POST /verification/drivers_license/face */
  verifyDriversLicenseWithFace(number: string, dob: string, imageBase64OrUrl: string) {
    return this.post('/verification/drivers_license/face', {
      number,
      dob,
      image: imageBase64OrUrl,
    });
  }
}

export const premblyClient = new PremblyClient();
