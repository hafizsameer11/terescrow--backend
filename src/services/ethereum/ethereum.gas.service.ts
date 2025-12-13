/**
 * Ethereum Gas Fee Estimation Service
 * 
 * Handles gas fee estimation for Ethereum transactions using Tatum API
 */

import axios from 'axios';
import cryptoLogger from '../../utils/crypto.logger';

interface GasFeeEstimateResponse {
  gasLimit: string;
  gasPrice: string; // In wei
  safe?: string; // In wei (optional)
  standard?: string; // In wei (optional)
  fast?: string; // In wei (optional)
  baseFee?: string; // In wei (optional)
}

interface GasPriceResponse {
  jsonrpc: string;
  id: number;
  result: string; // Gas price in hex (wei format)
  error?: {
    code: number;
    message: string;
  };
}

class EthereumGasService {
  private apiKey: string;
  private baseUrl: string;
  private rpcUrl: string;

  constructor() {
    this.apiKey = process.env.TATUM_API_KEY || '';
    this.baseUrl = 'https://api.tatum.io/v4';
    this.rpcUrl = 'https://ethereum-mainnet.gateway.tatum.io'; // Mainnet RPC

    if (!this.apiKey) {
      throw new Error('TATUM_API_KEY is required in environment variables');
    }
  }

  /**
   * Get gas price using RPC method
   * Uses eth_gasPrice JSON-RPC method
   * 
   * @param testnet Whether to use testnet (default: false for mainnet)
   * @returns Gas price in wei and Gwei
   */
  async getGasPrice(testnet: boolean = false): Promise<{ wei: string; gwei: string }> {
    try {
      const rpcUrl = testnet 
        ? 'https://ethereum-sepolia.gateway.tatum.io'
        : this.rpcUrl;

      const response = await axios.post<GasPriceResponse>(
        rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
          },
        }
      );

      if (response.data.error) {
        throw new Error(`RPC error: ${response.data.error.message}`);
      }

      // Convert hex to decimal
      const gasPriceWei = BigInt(response.data.result);
      const gasPriceGwei = Number(gasPriceWei) / 1e9; // Convert wei to Gwei

      const result = {
        wei: gasPriceWei.toString(),
        gwei: gasPriceGwei.toFixed(2),
      };
      cryptoLogger.gasEstimate({ type: 'gasPrice', ...result, testnet });
      return result;
    } catch (error: any) {
      cryptoLogger.exception('Fetch gas price', error, {
        testnet,
        apiResponse: error.response?.data,
      });
      throw new Error(`Failed to fetch gas price: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Estimate gas fee for a transaction
   * Uses Tatum V4 API: POST /v4/blockchainOperations/gas
   * 
   * @param from From address
   * @param to To address
   * @param amount Amount to send (in ETH)
   * @param testnet Whether to use testnet (default: false for mainnet)
   * @returns Gas fee estimate with gasLimit and gasPrice
   */
  async estimateGasFee(
    from: string,
    to: string,
    amount: string,
    testnet: boolean = false
  ): Promise<GasFeeEstimateResponse> {
    try {
      // Remove 0x prefix if present for consistency
      const cleanFrom = from.startsWith('0x') ? from : `0x${from}`;
      const cleanTo = to.startsWith('0x') ? to : `0x${to}`;

      const chain = testnet ? 'ETH_SEPOLIA' : 'ETH';

      const response = await axios.post<GasFeeEstimateResponse>(
        `${this.baseUrl}/blockchainOperations/gas`,
        {
          chain,
          from: cleanFrom,
          to: cleanTo,
          amount: amount.toString(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
          },
        }
      );

      const result = response.data;
      cryptoLogger.gasEstimate({
        type: 'gasEstimate',
        from,
        to,
        amount: amount.toString(),
        testnet,
        gasLimit: result.gasLimit,
        gasPrice: result.gasPrice,
      });
      return result;
    } catch (error: any) {
      cryptoLogger.exception('Estimate gas fee', error, {
        from,
        to,
        amount: amount.toString(),
        testnet,
        apiResponse: error.response?.data,
      });
      throw new Error(`Failed to estimate gas fee: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Convert wei to Gwei
   */
  weiToGwei(wei: string): string {
    const weiBigInt = BigInt(wei);
    const gwei = Number(weiBigInt) / 1e9;
    return gwei.toFixed(2);
  }

  /**
   * Convert Gwei to wei
   */
  gweiToWei(gwei: string): string {
    const gweiNum = parseFloat(gwei);
    const wei = BigInt(Math.floor(gweiNum * 1e9));
    return wei.toString();
  }

  /**
   * Calculate total transaction fee
   * Formula: Total Fee = GasLimit × GasPrice
   * 
   * @param gasLimit Gas limit in units
   * @param gasPrice Gas price in wei
   * @returns Total fee in ETH
   */
  calculateTotalFee(gasLimit: string, gasPrice: string): string {
    const limitBigInt = BigInt(gasLimit);
    const priceBigInt = BigInt(gasPrice);
    const totalWei = limitBigInt * priceBigInt;
    const totalEth = Number(totalWei) / 1e18;
    return totalEth.toFixed(8);
  }

  /**
   * Format gas fee estimate with all units
   */
  formatGasEstimate(estimate: GasFeeEstimateResponse): {
    gasLimit: string;
    gasPrice: {
      wei: string;
      gwei: string;
    };
    totalFeeEth?: string;
    safe?: { wei: string; gwei: string };
    standard?: { wei: string; gwei: string };
    fast?: { wei: string; gwei: string };
  } {
    const result: any = {
      gasLimit: estimate.gasLimit,
      gasPrice: {
        wei: estimate.gasPrice,
        gwei: this.weiToGwei(estimate.gasPrice),
      },
      totalFeeEth: this.calculateTotalFee(estimate.gasLimit, estimate.gasPrice),
    };

    if (estimate.safe) {
      result.safe = {
        wei: estimate.safe,
        gwei: this.weiToGwei(estimate.safe),
      };
    }

    if (estimate.standard) {
      result.standard = {
        wei: estimate.standard,
        gwei: this.weiToGwei(estimate.standard),
      };
    }

    if (estimate.fast) {
      result.fast = {
        wei: estimate.fast,
        gwei: this.weiToGwei(estimate.fast),
      };
    }

    return result;
  }
}

// Export singleton instance
export const ethereumGasService = new EthereumGasService();
export default ethereumGasService;

