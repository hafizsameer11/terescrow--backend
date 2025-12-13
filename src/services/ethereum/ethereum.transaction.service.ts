/**
 * Ethereum Transaction Service
 * 
 * Handles sending ETH and ERC-20 tokens using Tatum API
 */

import axios from 'axios';
import cryptoLogger from '../../utils/crypto.logger';

interface EthereumTransactionRequest {
  to: string;
  amount: string;
  currency: string; // 'ETH' or token symbol like 'USDT'
  fromPrivateKey: string;
  fee?: {
    gasPrice: string; // In Gwei
    gasLimit: string;
  };
  data?: string;
  nonce?: number;
}

interface EthereumTransactionResponse {
  txId: string; // Transaction hash
}

class EthereumTransactionService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.TATUM_API_KEY || '';
    this.baseUrl = 'https://api.tatum.io/v3';

    if (!this.apiKey) {
      throw new Error('TATUM_API_KEY is required in environment variables');
    }
  }

  /**
   * Send ETH or ERC-20 token transaction
   * Uses Tatum API: POST /v3/ethereum/transaction
   * 
   * @param to Recipient address
   * @param amount Amount to send (in ETH or token units)
   * @param currency Currency symbol ('ETH' or token symbol like 'USDT')
   * @param fromPrivateKey Sender's private key
   * @param gasPrice Gas price in Gwei
   * @param gasLimit Gas limit
   * @param testnet Whether to use testnet (default: false)
   * @returns Transaction hash (txId)
   */
  async sendTransaction(
    to: string,
    amount: string,
    currency: string,
    fromPrivateKey: string,
    gasPrice?: string,
    gasLimit?: string,
    testnet: boolean = false
  ): Promise<string> {
    // Declare variables outside try block so they're accessible in catch
    const cleanTo = to.startsWith('0x') ? to : `0x${to}`;
    const endpoint = testnet 
      ? `${this.baseUrl}/ethereum/transaction?testnetType=ethereum-sepolia`
      : `${this.baseUrl}/ethereum/transaction`;

    try {
      const requestBody: EthereumTransactionRequest = {
        to: cleanTo,
        amount: amount.toString(),
        currency: currency.toUpperCase(),
        fromPrivateKey,
      };

      // Add fee if provided
      if (gasPrice && gasLimit) {
        requestBody.fee = {
          gasPrice: gasPrice.toString(), // In Gwei
          gasLimit: gasLimit.toString(),
        };
      }

      cryptoLogger.apiCall('Tatum', endpoint, {
        to: cleanTo,
        amount,
        currency: currency.toUpperCase(),
        gasPrice: gasPrice || 'auto',
        gasLimit: gasLimit || 'auto',
        testnet,
      });

      const response = await axios.post<EthereumTransactionResponse>(
        endpoint,
        requestBody,
        {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            ...(testnet && { 'x-testnet-type': 'ethereum-sepolia' }),
          },
        }
      );

      cryptoLogger.apiCall('Tatum', endpoint, undefined, response.data);

      if (!response.data.txId) {
        const error = new Error('Transaction failed: No transaction ID returned');
        cryptoLogger.exception('Send Ethereum transaction', error, { response: response.data });
        throw error;
      }

      return response.data.txId;
    } catch (error: any) {
      cryptoLogger.exception('Send Ethereum transaction', error, {
        endpoint,
        to: cleanTo,
        amount,
        currency,
        apiResponse: error.response?.data,
      });
      throw new Error(
        `Failed to send transaction: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Send ETH transaction
   */
  async sendETH(
    to: string,
    amount: string,
    fromPrivateKey: string,
    gasPrice?: string,
    gasLimit?: string,
    testnet: boolean = false
  ): Promise<string> {
    return this.sendTransaction(to, amount, 'ETH', fromPrivateKey, gasPrice, gasLimit, testnet);
  }

  /**
   * Send ERC-20 token transaction (e.g., USDT)
   */
  async sendToken(
    to: string,
    amount: string,
    tokenSymbol: string, // e.g., 'USDT'
    fromPrivateKey: string,
    gasPrice?: string,
    gasLimit?: string,
    testnet: boolean = false
  ): Promise<string> {
    return this.sendTransaction(to, amount, tokenSymbol, fromPrivateKey, gasPrice, gasLimit, testnet);
  }
}

// Export singleton instance
export const ethereumTransactionService = new EthereumTransactionService();
export default ethereumTransactionService;

