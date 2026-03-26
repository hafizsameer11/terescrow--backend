/**
 * Tatum API Service
 * 
 * Handles all Tatum API interactions
 */

import axios, { AxiosInstance } from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';

export interface TatumWalletResponse {
  mnemonic?: string;
  xpub?: string;
  address: string;
  privateKey?: string;
  secret?: string; // XRP uses 'secret' instead of 'mnemonic' and 'privateKey'
}

export interface TatumVirtualAccountRequest {
  currency: string;
  customer: {
    externalId: string;
  };
  accountCode?: string;
  accountingCurrency?: string;
  xpub?: string;
}

export interface TatumVirtualAccountResponse {
  id: string;
  customerId: string;
  currency: string;
  active: boolean;
  frozen: boolean;
  balance: {
    accountBalance: string;
    availableBalance: string;
  };
  accountingCurrency?: string;
}

export interface TatumAddressResponse {
  address: string;
}

export interface TatumPrivateKeyResponse {
  key: string;
}

export interface TatumWebhookPayload {
  accountId: string;
  subscriptionType: string;
  amount: string;
  currency: string;
  reference: string;
  txId: string;
  from: string;
  to: string;
  date: number;
  blockHeight: number;
  blockHash: string;
  index: number;
}

export interface TatumWebhookSubscriptionRequest {
  type: string;
  attr: {
    id: string;
    url: string;
  };
}

export interface TatumWebhookSubscriptionResponse {
  id: string;
  type: string;
  attr: {
    id: string;
    url: string;
  };
}

export interface TatumV4AddressWebhookRequest {
  type: 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX' | 'ADDRESS_EVENT';
  attr: {
    address: string;
    chain: string;
    url: string;
  };
  templateId?: 'enriched' | 'enriched_with_raw_data' | 'legacy';
  finality?: 'confirmed' | 'final';
}

export interface TatumV4WebhookSubscriptionResponse {
  id: string;
  type: string;
  attr: {
    address: string;
    chain: string;
    url: string;
  };
  templateId?: string;
}

class TatumService {
  private apiKey: string;
  private baseUrl: string;
  private baseUrlV4: string;
  private axiosInstance: AxiosInstance;
  private axiosInstanceV4: AxiosInstance;

  /**
   * Map blockchain names to Tatum V4 chain identifiers
   */
  private getTatumV4Chain(blockchain: string): string {
    const chainMap: { [key: string]: string } = {
      bitcoin: 'bitcoin-mainnet',
      ethereum: 'ethereum-mainnet',
      eth: 'ethereum-mainnet',
      tron: 'tron-mainnet',
      bsc: 'bsc-mainnet',
      solana: 'solana-mainnet',
      sol: 'solana-mainnet',
      litecoin: 'litecoin-core-mainnet',
      ltc: 'litecoin-core-mainnet',
      polygon: 'polygon-mainnet',
      matic: 'polygon-mainnet',
      dogecoin: 'doge-mainnet',
      doge: 'doge-mainnet',
      xrp: 'ripple-mainnet',
      ripple: 'ripple-mainnet',
      arbitrum: 'arb-one-mainnet',
      optimism: 'optimism-mainnet',
      base: 'base-mainnet',
      avalanche: 'avax-mainnet',
      fantom: 'fantom-mainnet',
      celo: 'celo-mainnet',
      // Testnet mappings
      'bitcoin-testnet': 'bitcoin-testnet',
      'ethereum-sepolia': 'ethereum-sepolia',
      'ethereum-holesky': 'ethereum-holesky',
      'tron-testnet': 'tron-testnet',
      'bsc-testnet': 'bsc-testnet',
      'solana-devnet': 'solana-devnet',
      'litecoin-testnet': 'litecoin-core-testnet',
      'polygon-amoy': 'polygon-amoy',
      'doge-testnet': 'doge-testnet',
      'ripple-testnet': 'ripple-testnet',
    };

    const normalized = blockchain.toLowerCase();
    const chain = chainMap[normalized];
    
    if (!chain) {
      console.warn(`Unknown blockchain ${blockchain} for Tatum V4 chain mapping, defaulting to ethereum-mainnet`);
      return 'ethereum-mainnet';
    }
    
    return chain;
  }

  constructor() {
    this.apiKey = process.env.TATUM_API_KEY || '';
    this.baseUrl = process.env.TATUM_BASE_URL || 'https://api.tatum.io/v3';
    this.baseUrlV4 = 'https://api.tatum.io/v4';

    if (!this.apiKey) {
      throw new Error('TATUM_API_KEY is required in environment variables');
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.axiosInstanceV4 = axios.create({
      baseURL: this.baseUrlV4,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Create a master wallet for a blockchain
   */
  async createWallet(blockchain: string): Promise<TatumWalletResponse> {
    try {
      const normalizedBlockchain = blockchain.toLowerCase();
      
      // XRP uses a different endpoint: /v3/xrp/account (not /v3/xrp/wallet)
      if (normalizedBlockchain === 'xrp' || normalizedBlockchain === 'ripple') {
        const endpoint = `/xrp/account`;
        const response = await this.axiosInstance.get<{ address: string; secret: string }>(endpoint);
        return {
          address: response.data.address,
          secret: response.data.secret,
          privateKey: response.data.secret, // Use secret as privateKey for consistency
        };
      }
      
      // Other blockchains use /wallet endpoint
      const endpoint = `/${normalizedBlockchain}/wallet`;
      const response = await this.axiosInstance.get<TatumWalletResponse>(endpoint);
      return response.data;
    } catch (error: any) {
      console.error(`Error creating wallet for ${blockchain}:`, error.response?.data || error.message);
      throw new Error(`Failed to create wallet: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a virtual account
   */
  async createVirtualAccount(
    data: TatumVirtualAccountRequest
  ): Promise<TatumVirtualAccountResponse> {
    try {
      const response = await this.axiosInstance.post<TatumVirtualAccountResponse>(
        '/ledger/account',
        data
      );
      return response.data;
    } catch (error: any) {
      console.error('Error creating virtual account:', error.response?.data || error.message);
      throw new Error(
        `Failed to create virtual account: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get user's virtual accounts by external ID
   */
  async getUserAccounts(externalId: string, pageSize: number = 50): Promise<any> {
    try {
      const response = await this.axiosInstance.get(
        `/ledger/account/customer/${externalId}?pageSize=${pageSize}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error getting user accounts:', error.response?.data || error.message);
      throw new Error(
        `Failed to get user accounts: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Generate address from master wallet xpub
   */
  async generateAddress(blockchain: string, xpub: string, index: number): Promise<string> {
    try {
      const endpoint = `/${blockchain.toLowerCase()}/address/${xpub}/${index}`;
      const response = await this.axiosInstance.get<TatumAddressResponse>(endpoint);
      return response.data.address;
    } catch (error: any) {
      console.error('Error generating address:', error.response?.data || error.message);
      throw new Error(
        `Failed to generate address: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Generate private key from mnemonic
   */
  async generatePrivateKey(blockchain: string, mnemonic: string, index: number): Promise<string> {
    try {
      const endpoint = `/${blockchain.toLowerCase()}/wallet/priv`;
      const response = await this.axiosInstance.post<TatumPrivateKeyResponse>(endpoint, {
        mnemonic,
        index,
      });
      return response.data.key;
    } catch (error: any) {
      console.error('Error generating private key:', error.response?.data || error.message);
      throw new Error(
        `Failed to generate private key: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Assign address to virtual account
   */
  async assignAddressToVirtualAccount(accountId: string, address: string): Promise<any> {
    try {
      const response = await this.axiosInstance.post(
        `/offchain/account/${accountId}/address/${address}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error assigning address:', error.response?.data || error.message);
      throw new Error(
        `Failed to assign address: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Register webhook subscription (V3 - Legacy, uses accountId)
   * @deprecated Use registerAddressWebhookV4 instead
   */
  async registerWebhook(
    accountId: string,
    webhookUrl: string
  ): Promise<TatumWebhookSubscriptionResponse> {
    try {
      const data: TatumWebhookSubscriptionRequest = {
        type: 'ACCOUNT_INCOMING_BLOCKCHAIN_TRANSACTION',
        attr: {
          id: accountId,
          url: webhookUrl,
        },
      };
      const response = await this.axiosInstance.post<TatumWebhookSubscriptionResponse>(
        '/subscription',
        data
      );
      return response.data;
    } catch (error: any) {
      console.error('Error registering webhook:', error.response?.data || error.message);
      throw new Error(
        `Failed to register webhook: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Register address-based webhook subscription (V4)
   * Uses address directly instead of Tatum account ID
   */
  async registerAddressWebhookV4(
    address: string,
    blockchain: string,
    webhookUrl: string,
    options?: {
      type?: 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX' | 'ADDRESS_EVENT';
      finality?: 'confirmed' | 'final';
    }
  ): Promise<TatumV4WebhookSubscriptionResponse> {
    try {
      const chain = this.getTatumV4Chain(blockchain);
      const subscriptionType = options?.type || 'INCOMING_NATIVE_TX';
      
      const data: any = {
        type: subscriptionType,
        attr: {
          address,
          chain,
          url: webhookUrl,
        },
      };

      // Only add finality if provided (only supported for certain chains like TRON)
      if (options?.finality) {
        data.finality = options.finality;
      }

      const response = await this.axiosInstanceV4.post<TatumV4WebhookSubscriptionResponse>(
        '/subscription',
        data
      );
      return response.data;
    } catch (error: any) {
      console.error('Error registering V4 address webhook:', error.response?.data || error.message);
      throw new Error(
        `Failed to register address webhook: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get virtual account details
   */
  async getVirtualAccount(accountId: string): Promise<TatumVirtualAccountResponse> {
    try {
      const response = await this.axiosInstance.get<TatumVirtualAccountResponse>(
        `/ledger/account/${accountId}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error getting virtual account:', error.response?.data || error.message);
      throw new Error(
        `Failed to get virtual account: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get fungible token balances for supported tokens only (from wallet_currencies table)
   * Fetches balances for tokens that have contract addresses in our wallet_currencies table
   * GET /v3/blockchain/token/address/{chain}/{address}
   * Supported chains: ETH, MATIC, CELO, SOL, ALGO, BSC
   */
  async getSupportedTokenBalances(blockchain: string, address: string): Promise<any[]> {
    try {
      const normalizedBlockchain = blockchain.toLowerCase();
      
      // Map blockchain names to Tatum chain codes
      const chainMap: { [key: string]: string } = {
        'ethereum': 'ETH',
        'eth': 'ETH',
        'polygon': 'MATIC',
        'matic': 'MATIC',
        'celo': 'CELO',
        'solana': 'SOL',
        'sol': 'SOL',
        'algorand': 'ALGO',
        'algo': 'ALGO',
        'bsc': 'BSC',
        'binance': 'BSC',
        'binancesmartchain': 'BSC',
      };

      const chainCode = chainMap[normalizedBlockchain];
      
      if (!chainCode) {
        // Chain not supported for token balances
        return [];
      }

      // Get all supported tokens for this blockchain from wallet_currencies
      const supportedTokens = await prisma.walletCurrency.findMany({
        where: {
          blockchain: normalizedBlockchain,
          isToken: true,
          contractAddress: {
            not: null,
          },
        },
        select: {
          id: true,
          currency: true,
          name: true,
          symbol: true,
          contractAddress: true,
          decimals: true,
          tokenType: true,
        },
      });

      if (supportedTokens.length === 0) {
        // No supported tokens for this blockchain
        return [];
      }

      const encodedAddress = encodeURIComponent(address);
      
      // BSC uses a different endpoint: GET /v3/bsc/token/balance/{contractAddress}/{address}
      // For other chains, use: GET /v3/blockchain/token/address/{chain}/{address}
      if (chainCode === 'BSC') {
        // For BSC, fetch balance for each supported token individually
        const tokenBalances = await Promise.all(
          supportedTokens.map(async (token) => {
            try {
              if (!token.contractAddress) return null;
              
              // BSC uses ERC-20 compatible endpoint: GET /v3/bsc/erc20/balance/{contractAddress}/{address}
              const endpoint = `/bsc/erc20/balance/${encodeURIComponent(token.contractAddress)}/${encodedAddress}`;
              console.log(`Fetching BSC token balance: ${this.baseUrl}${endpoint}`);
              
              const response = await this.axiosInstance.get(endpoint);
              
              // Response format: { balance: "1000.0" }
              const balance = response.data.balance || '0';
              
              // Only return if balance > 0
              if (parseFloat(balance) > 0) {
                return {
                  contractAddress: token.contractAddress,
                  amount: balance,
                  currency: token.currency,
                  name: token.name,
                  symbol: token.symbol,
                  decimals: token.decimals,
                  tokenType: token.tokenType,
                  walletCurrencyId: token.id,
                };
              }
              return null;
            } catch (error: any) {
              // Log but don't fail - some tokens might not exist or have errors
              console.error(`Error fetching balance for token ${token.contractAddress}:`, error.response?.data?.message || error.message);
              return null;
            }
          })
        );
        
        return tokenBalances.filter((balance: any) => balance !== null);
      } else {
        // For other chains (ETH, MATIC, CELO, SOL, ALGO), use the bulk endpoint
        const endpoint = `/blockchain/token/address/${chainCode}/${encodedAddress}`;

        console.log(`Fetching token balances from Tatum: ${this.baseUrl}${endpoint}`);
        const response = await this.axiosInstance.get(endpoint);
        
        // Response is an array of { contractAddress: string, amount: string }
        const allTokenBalances = Array.isArray(response.data) ? response.data : [];
        
        // Filter to only include tokens we support, and enrich with our token data
        const supportedBalances = allTokenBalances
          .map((tokenBalance: any) => {
            // Find matching token in our supported tokens (case-insensitive comparison)
            const tokenInfo = supportedTokens.find(
              (token) => token.contractAddress?.toLowerCase() === tokenBalance.contractAddress?.toLowerCase()
            );
            
            if (tokenInfo) {
              return {
                contractAddress: tokenBalance.contractAddress,
                amount: tokenBalance.amount,
                // Add our token metadata
                currency: tokenInfo.currency,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                decimals: tokenInfo.decimals,
                tokenType: tokenInfo.tokenType,
                walletCurrencyId: tokenInfo.id,
              };
            }
            return null;
          })
          .filter((balance: any) => balance !== null);

        return supportedBalances;
      }
    } catch (error: any) {
      // Log error but don't throw - token balances are optional
      console.error(`Error getting supported token balances for ${blockchain}:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get fungible token balances (ERC-20, etc.) for an address
   * GET /v3/blockchain/token/address/{chain}/{address}
   * Supported chains: ETH, MATIC, CELO, SOL, ALGO
   * @deprecated Use getSupportedTokenBalances instead to get only tokens from wallet_currencies
   */
  async getFungibleTokenBalances(blockchain: string, address: string): Promise<any[]> {
    try {
      const normalizedBlockchain = blockchain.toLowerCase();
      
      // Map blockchain names to Tatum chain codes
      const chainMap: { [key: string]: string } = {
        'ethereum': 'ETH',
        'eth': 'ETH',
        'polygon': 'MATIC',
        'matic': 'MATIC',
        'celo': 'CELO',
        'solana': 'SOL',
        'sol': 'SOL',
        'algorand': 'ALGO',
        'algo': 'ALGO',
        'bsc': 'BSC',
        'binance': 'BSC',
        'binancesmartchain': 'BSC',
      };

      const chainCode = chainMap[normalizedBlockchain];
      
      if (!chainCode) {
        // Chain not supported for token balances
        return [];
      }

      const encodedAddress = encodeURIComponent(address);
      const endpoint = `/blockchain/token/address/${chainCode}/${encodedAddress}`;

      console.log(`Fetching fungible token balances from Tatum: ${this.baseUrl}${endpoint}`);
      const response = await this.axiosInstance.get(endpoint);
      
      // Response is an array of { contractAddress: string, amount: string }
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      // Log error but don't throw - token balances are optional
      console.error(`Error getting fungible token balances for ${blockchain}:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get balance for an address on a blockchain
   * Uses blockchain-specific endpoints based on Tatum API documentation
   * Note: Tatum v3 balance endpoints vary by blockchain
   * For Ethereum and other supported chains, also fetches fungible token balances
   */
  async getAddressBalance(blockchain: string, address: string, includeTokens: boolean = true): Promise<any> {
    try {
      const normalizedBlockchain = blockchain.toLowerCase();
      let endpoint: string;

      // Different blockchains have different balance endpoint formats in Tatum v3
      // Based on Tatum API documentation:
      // - Bitcoin/Litecoin: GET /v3/{blockchain}/address/{address}/balance
      // - Ethereum: GET /v3/ethereum/account/balance/{address}
      // - EVM chains: GET /v3/{blockchain}/account/balance/{address}
      // - Tron: GET /v3/tron/account/{address}
      switch (normalizedBlockchain) {
        case 'bitcoin':
        case 'litecoin':
          // UTXO-based chains: GET /v3/{blockchain}/address/balance/{address}
          // Note: The /balance comes BEFORE the address in the path!
          endpoint = `/${normalizedBlockchain}/address/balance/${address}`;
          break;
        case 'ethereum':
        case 'eth':
          // Ethereum: GET /v3/ethereum/account/balance/{address}
          endpoint = `/ethereum/account/balance/${address}`;
          break;
        case 'bsc':
        case 'binance':
        case 'binancesmartchain':
          // BSC: GET /v3/bsc/account/balance/{address}
          endpoint = `/bsc/account/balance/${address}`;
          break;
        case 'polygon':
          endpoint = `/polygon/account/balance/${address}`;
          break;
        case 'arbitrum':
          endpoint = `/arbitrum/account/balance/${address}`;
          break;
        case 'optimism':
          endpoint = `/optimism/account/balance/${address}`;
          break;
        case 'base':
          endpoint = `/base/account/balance/${address}`;
          break;
        case 'avalanche':
        case 'avax':
          endpoint = `/avalanche/account/balance/${address}`;
          break;
        case 'fantom':
          endpoint = `/fantom/account/balance/${address}`;
          break;
        case 'celo':
          endpoint = `/celo/account/balance/${address}`;
          break;
        case 'tron':
        case 'trx':
          // Tron: GET /v3/tron/account/{address} (returns account object with balance field)
          endpoint = `/tron/account/${address}`;
          break;
        case 'solana':
        case 'sol':
          // Solana: GET /v3/solana/account/{address} (may not have direct balance endpoint)
          endpoint = `/solana/account/${address}`;
          break;
        default:
          // Try EVM format for unknown chains
          endpoint = `/${normalizedBlockchain}/account/balance/${address}`;
      }

      // Ensure address is properly URL-encoded
      const encodedAddress = encodeURIComponent(address);
      
      // Rebuild endpoint with encoded address for Bitcoin/Litecoin
      if (normalizedBlockchain === 'bitcoin' || normalizedBlockchain === 'litecoin') {
        endpoint = `/${normalizedBlockchain}/address/balance/${encodedAddress}`;
      } else if (normalizedBlockchain === 'ethereum' || normalizedBlockchain === 'eth') {
        endpoint = `/ethereum/account/balance/${encodedAddress}`;
      } else if (normalizedBlockchain === 'bsc' || normalizedBlockchain === 'binance' || normalizedBlockchain === 'binancesmartchain') {
        endpoint = `/bsc/account/balance/${encodedAddress}`;
      } else if (normalizedBlockchain === 'tron' || normalizedBlockchain === 'trx') {
        endpoint = `/tron/account/${encodedAddress}`;
      } else {
        // For other chains, encode the address in the endpoint
        endpoint = endpoint.replace(address, encodedAddress);
      }

      console.log(`Fetching balance from Tatum: ${this.baseUrl}${endpoint}`);
      const response = await this.axiosInstance.get(endpoint);
      
      // Normalize response format for different blockchains
      // Bitcoin/Litecoin returns: { incoming, outgoing, incomingPending, outgoingPending }
      // Ethereum/EVM returns: { balance: "0.5" }
      // Tron returns: { balance: "0.5", ... } or { account: { balance: "0.5", ... }, ... }
      if (normalizedBlockchain === 'bitcoin' || normalizedBlockchain === 'litecoin') {
        // Bitcoin/Litecoin returns incoming/outgoing, calculate net balance
        const incoming = new Decimal(response.data.incoming || '0');
        const outgoing = new Decimal(response.data.outgoing || '0');
        const balance = incoming.minus(outgoing);
        return {
          balance: balance.toString(),
          incoming: response.data.incoming,
          outgoing: response.data.outgoing,
          incomingPending: response.data.incomingPending,
          outgoingPending: response.data.outgoingPending,
          ...response.data,
        };
      } else if (normalizedBlockchain === 'tron' || normalizedBlockchain === 'trx') {
        // Tron account endpoint returns account object with balance
        // Check multiple possible response structures
        if (response.data.balance !== undefined) {
          return { balance: response.data.balance.toString(), ...response.data };
        } else if (response.data.account?.balance !== undefined) {
          return { 
            balance: response.data.account.balance.toString(),
            account: response.data.account,
            ...response.data 
          };
        } else if (response.data.data?.balance !== undefined) {
          return { balance: response.data.data.balance.toString(), ...response.data };
        } else if (response.data.trc20?.length > 0) {
          // Tron might return TRC20 tokens, calculate total balance
          const nativeBalance = response.data.balance || '0';
          return { balance: nativeBalance.toString(), ...response.data };
        }
        // Return full response if balance not found in expected format
        return response.data;
      } else if (response.data.balance !== undefined) {
        // Ethereum and other EVM chains
        const result: any = { balance: response.data.balance.toString(), ...response.data };
        
        // Fetch fungible token balances for supported chains if requested
        // Only returns tokens that are in our wallet_currencies table
        if (includeTokens) {
          const supportedChainsForTokens = ['ethereum', 'eth', 'polygon', 'matic', 'celo', 'solana', 'sol', 'algorand', 'algo', 'bsc', 'binance', 'binancesmartchain'];
          if (supportedChainsForTokens.includes(normalizedBlockchain)) {
            try {
              const tokenBalances = await this.getSupportedTokenBalances(blockchain, address);
              result.tokens = tokenBalances;
            } catch (tokenError: any) {
              // Log but don't fail - token balances are optional
              console.error(`Failed to fetch token balances:`, tokenError.message);
              result.tokens = [];
            }
          }
        }
        
        return result;
      } else if (response.data.account?.balance !== undefined) {
        return { balance: response.data.account.balance.toString(), ...response.data };
      } else if (response.data.data?.balance !== undefined) {
        return { balance: response.data.data.balance.toString(), ...response.data };
      }
      
      return response.data;
    } catch (error: any) {
      // Log the error with full details for debugging
      const errorDetails = error.response?.data || error.message;
      console.error(`Error getting address balance for ${blockchain}:`, errorDetails);
      throw new Error(
        `Failed to get address balance: ${error.response?.data?.message || error.message}`
      );
    }
  }
}

export default new TatumService();

