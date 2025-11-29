import crypto from 'crypto';
import { palmpayConfig } from './palmpay.config';

/**
 * PalmPay Authentication & Signature Service
 * Handles request signature generation using MD5 + SHA1WithRSA
 * 
 * Signature Process:
 * 1. Sort parameters by ASCII order, concatenate as key1=value1&key2=value2
 * 2. MD5 the string and convert to uppercase
 * 3. Sign md5Str with SHA1WithRSA using merchant's private key (Base64)
 */
class PalmPayAuthService {
  /**
   * Generate nonce string (32 characters)
   */
  generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get current timestamp in milliseconds
   */
  getRequestTime(): number {
    return Date.now();
  }

  /**
   * Generate MD5 hash of string (uppercase)
   */
  private md5Hash(str: string): string {
    return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
  }

  /**
   * Generate signature for PalmPay API requests
   * 
   * Process:
   * 1. Sort parameters by ASCII order (key=value format)
   * 2. MD5 the concatenated string and convert to uppercase
   * 3. Sign md5Str with SHA1WithRSA using merchant's private key
   */
  generateSignature(params: Record<string, any>): string {
    // Step 1: Filter non-empty params, sort by ASCII order, build key=value string
    const sortedKeys = Object.keys(params)
      .filter(key => {
        const value = params[key];
        return value !== null && value !== undefined && value !== '';
      })
      .sort(); // ASCII alphabetical order

    const signString = sortedKeys
      .map(key => {
        // Remove leading/trailing spaces from values
        const value = String(params[key]).trim();
        return `${key}=${value}`;
      })
      .join('&');

    // Step 2: MD5 hash and convert to uppercase
    const md5Str = this.md5Hash(signString);

    // Step 3: Sign with SHA1WithRSA using merchant's private key
    const privateKey = palmpayConfig.getPrivateKey();
    
    // Convert to PEM format if needed (Node.js crypto expects PEM format)
    let pemKey = privateKey;
    if (!privateKey.includes('-----BEGIN')) {
      // If it's raw Base64, try to construct PEM format
      // PalmPay provides Base64 encoded key, convert to PEM
      // Try PKCS#1 format first (RSA PRIVATE KEY)
      const cleanKey = privateKey.replace(/\s/g, '');
      // Split into 64-character lines for PEM format
      const keyLines = cleanKey.match(/.{1,64}/g) || [];
      pemKey = `-----BEGIN RSA PRIVATE KEY-----\n${keyLines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
    }

    try {
      const signature = crypto
        .createSign('RSA-SHA1')
        .update(md5Str, 'utf8')
        .sign(pemKey, 'base64');

      return signature;
    } catch (error) {
      // If PKCS#1 format fails, try PKCS#8 format
      if (!privateKey.includes('-----BEGIN')) {
        const cleanKey = privateKey.replace(/\s/g, '');
        const keyLines = cleanKey.match(/.{1,64}/g) || [];
        const pkcs8Key = `-----BEGIN PRIVATE KEY-----\n${keyLines.join('\n')}\n-----END PRIVATE KEY-----`;
        
        const signature = crypto
          .createSign('RSA-SHA1')
          .update(md5Str, 'utf8')
          .sign(pkcs8Key, 'base64');

        return signature;
      }
      throw error;
    }
  }

  /**
   * Verify webhook signature from PalmPay
   * 
   * Process:
   * 1. Sort parameters (excluding 'sign') by ASCII order
   * 2. MD5 the concatenated string and convert to uppercase
   * 3. Verify signature using PalmPay's public key with SHA1WithRSA
   * 
   * @param payload - Webhook payload (JSON object, sign field will be excluded)
   * @param signature - URL decoded signature from webhook
   */
  verifyWebhookSignature(payload: Record<string, any>, signature: string): boolean {
    try {
      // Decode URL encoded signature
      const decodedSign = decodeURIComponent(signature);

      // Step 1: Build signature string (exclude 'sign' field, sort by ASCII order)
      const sortedKeys = Object.keys(payload)
        .filter(key => {
          // Exclude 'sign' field and empty values
          if (key === 'sign') return false;
          const value = payload[key];
          return value !== null && value !== undefined && value !== '';
        })
        .sort(); // ASCII alphabetical order

      const signString = sortedKeys
        .map(key => {
          // Remove leading/trailing spaces from values
          const value = String(payload[key]).trim();
          return `${key}=${value}`;
        })
        .join('&');

      // Step 2: MD5 hash and convert to uppercase
      const md5Str = this.md5Hash(signString);

      // Step 3: Verify signature using PalmPay's public key
      const config = palmpayConfig.getConfig();
      const publicKey = config.publicKey;

      if (!publicKey) {
        console.warn('PALMPAY_PUBLIC_KEY not set - skipping signature verification');
        return true; // Allow if public key not configured (for development)
      }

      // Convert public key to PEM format if needed
      let pemPublicKey = publicKey;
      if (!publicKey.includes('-----BEGIN')) {
        // If it's raw Base64, construct PEM format
        // Try PKCS#1 format first (RSA PUBLIC KEY)
        const cleanKey = publicKey.replace(/\s/g, '');
        const keyLines = cleanKey.match(/.{1,64}/g) || [];
        pemPublicKey = `-----BEGIN RSA PUBLIC KEY-----\n${keyLines.join('\n')}\n-----END RSA PUBLIC KEY-----`;
      }

      // Verify signature using SHA1WithRSA
      const verify = crypto.createVerify('RSA-SHA1');
      verify.update(md5Str, 'utf8');
      
      // Convert signature from base64 string
      let isValid = false;
      try {
        // Try PKCS#1 format first
        isValid = verify.verify(pemPublicKey, decodedSign, 'base64');
      } catch (error) {
        // If PKCS#1 fails, try PKCS#8 format
        if (!publicKey.includes('-----BEGIN')) {
          const cleanKey = publicKey.replace(/\s/g, '');
          const keyLines = cleanKey.match(/.{1,64}/g) || [];
          const pkcs8Key = `-----BEGIN PUBLIC KEY-----\n${keyLines.join('\n')}\n-----END PUBLIC KEY-----`;
          isValid = verify.verify(pkcs8Key, decodedSign, 'base64');
        } else {
          throw error;
        }
      }

      if (!isValid) {
        console.error('PalmPay webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      console.error('Error verifying PalmPay webhook signature:', error);
      return false;
    }
  }

  /**
   * Get request headers for PalmPay API
   */
  getRequestHeaders(signature: string): Record<string, string> {
    const config = palmpayConfig.getConfig();

    return {
      'Accept': 'application/json, text/plain, */*',
      'CountryCode': config.countryCode,
      'Authorization': `Bearer ${config.apiKey}`,
      'Signature': signature,
      'Content-Type': 'application/json',
      // 'Bare'
    };
  }
}

// Export singleton instance
export const palmpayAuth = new PalmPayAuthService();

