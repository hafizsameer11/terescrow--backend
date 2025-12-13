/**
 * Ethereum Balance Service
 * 
 * Handles real-time balance checks for Ethereum and ERC-20 tokens (USDT) using Tatum API
 */

import axios from 'axios';
import cryptoLogger from '../../utils/crypto.logger';

interface EthereumBalanceResponse {
  balance: string; // Balance in wei (can be decimal string or hex string)
}

interface ERC20BalanceResponse {
  jsonrpc: string;
  id: number;
  result: string; // Balance in hex (wei format)
  error?: {
    code: number;
    message: string;
  };
}

interface TatumTokenBalanceResponse {
  contractAddress: string;
  amount: string; // Balance already in human-readable format
}

class EthereumBalanceService {
  private apiKey: string;
  private baseUrl: string;
  private rpcUrl: string;

  constructor() {
    this.apiKey = process.env.TATUM_API_KEY || '';
    this.baseUrl = 'https://api.tatum.io/v3';
    this.rpcUrl = 'https://ethereum-mainnet.gateway.tatum.io'; // Mainnet RPC

    if (!this.apiKey) {
      throw new Error('TATUM_API_KEY is required in environment variables');
    }
  }

  /**
   * Get ETH balance of an Ethereum account
   * Uses Tatum API: GET /v3/ethereum/account/balance/{address}
   * 
   * @param address Ethereum address (with or without 0x prefix)
   * @param testnet Whether to use testnet (default: false for mainnet)
   * @returns Balance in ETH (converted from wei)
   */
  async getETHBalance(address: string, testnet: boolean = false): Promise<string> {
    try {
      // Remove 0x prefix if present for consistency
      const cleanAddress = address.startsWith('0x') ? address : `0x${address}`;
      
      const endpoint = testnet 
        ? `${this.baseUrl}/ethereum/account/balance/${cleanAddress}?testnetType=ethereum-sepolia`
        : `${this.baseUrl}/ethereum/account/balance/${cleanAddress}`;

      const response = await axios.get<EthereumBalanceResponse>(endpoint, {
        headers: {
          'x-api-key': this.apiKey,
          'accept': 'application/json',
          ...(testnet && { 'x-testnet-type': 'ethereum-sepolia' }),
        },
      });

      // Balance is returned as string - could be in wei (large number) or already in ETH (decimal)
      // Check if it contains decimal point
      let balanceEth: number;
      if (response.data.balance.includes('.')) {
        // Already in ETH format (decimal)
        balanceEth = parseFloat(response.data.balance);
      } else {
        // In wei format (integer), convert to ETH
        const balanceWei = BigInt(response.data.balance);
        balanceEth = Number(balanceWei) / 1e18;
      }

      const balance = balanceEth.toString();
      cryptoLogger.balanceCheck(address, balance, 'ETH', { testnet });
      return balance;
    } catch (error: any) {
      cryptoLogger.exception('Fetch ETH balance', error, {
        address,
        testnet,
        apiResponse: error.response?.data,
      });
      throw new Error(`Failed to fetch ETH balance: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get ERC-20 token balance (e.g., USDT)
   * Uses Tatum API: GET /v3/blockchain/token/address/{chain}/{address}
   * This is simpler and returns balances already in human-readable format
   * 
   * @param contractAddress ERC-20 token contract address (e.g., USDT: 0xdAC17F958D2ee523a2206206994597C13D831ec7)
   * @param walletAddress Wallet address to check balance for
   * @param decimals Token decimals (USDT uses 6, most ERC-20 use 18) - not used with this method but kept for compatibility
   * @param testnet Whether to use testnet (default: false for mainnet)
   * @returns Balance in human-readable format
   */
  async getERC20Balance(
    contractAddress: string,
    walletAddress: string,
    decimals: number = 18,
    testnet: boolean = false
  ): Promise<string> {
    try {
      // Remove 0x prefix if present
      const cleanWalletAddress = walletAddress.startsWith('0x') ? walletAddress : `0x${walletAddress}`;
      const cleanContractAddress = contractAddress.toLowerCase();

      // Use Tatum token balance endpoint - returns all tokens for the address
      // Chain parameter: ETH (mainnet), ETH_SEPOLIA (testnet)
      const chain = testnet ? 'ETH_SEPOLIA' : 'ETH';
      const endpoint = `${this.baseUrl}/blockchain/token/address/${chain}/${cleanWalletAddress}`;
      
      // Note: This endpoint returns balances already in human-readable format
      // e.g., [{ contractAddress: "0x...", amount: "30" }]

      cryptoLogger.apiCall('Tatum', endpoint, {
        contractAddress: cleanContractAddress,
        walletAddress: cleanWalletAddress,
      });

      const response = await axios.get<TatumTokenBalanceResponse[]>(endpoint, {
        headers: {
          'x-api-key': this.apiKey,
          'accept': 'application/json',
        },
      });

      cryptoLogger.apiCall('Tatum', endpoint, undefined, response.data);

      // Find the specific token by contract address
      const tokenBalance = response.data.find(
        (token) => token.contractAddress.toLowerCase() === cleanContractAddress
      );

      if (!tokenBalance) {
        cryptoLogger.warn(`Token ${cleanContractAddress} not found in response`, {
          walletAddress: cleanWalletAddress,
          availableTokens: response.data.map(t => t.contractAddress),
        });
        return '0';
      }

      cryptoLogger.balanceCheck(walletAddress, tokenBalance.amount, 'ERC-20', {
        contractAddress: cleanContractAddress,
        decimals,
        testnet,
      });
      return tokenBalance.amount;
    } catch (error: any) {
      console.error('Error fetching ERC-20 balance:', error.response?.data || error.message);
      throw new Error(`Failed to fetch ERC-20 balance: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get USDT balance (ERC-20 token)
   * Convenience method for USDT with correct contract address and decimals
   * 
   * Mainnet USDT: 0xdAC17F958D2ee523a2206206994597C13D831ec7 (6 decimals)
   * 
   * @param walletAddress Wallet address to check balance for
   * @param testnet Whether to use testnet
   * @returns Balance in USDT
   */
  async getUSDTBalance(walletAddress: string, testnet: boolean = false): Promise<string> {
    // USDT mainnet contract address
    const usdtContractAddress = testnet
      ? '0x...' // Testnet USDT contract (if needed)
      : '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // Mainnet USDT
    
    // USDT uses 6 decimals
    return this.getERC20Balance(usdtContractAddress, walletAddress, 6, testnet);
  }
}

// Export singleton instance
export const ethereumBalanceService = new EthereumBalanceService();
export default ethereumBalanceService;

