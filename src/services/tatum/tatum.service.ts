/**
 * Tatum API Service
 * 
 * Handles all Tatum API interactions
 */

import axios, { AxiosInstance } from 'axios';

export interface TatumWalletResponse {
  mnemonic: string;
  xpub: string;
  address: string;
  privateKey: string;
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
      tron: 'tron-mainnet',
      bsc: 'bsc-mainnet',
      solana: 'solana-mainnet',
      litecoin: 'litecoin-core-mainnet',
      polygon: 'polygon-mainnet',
      arbitrum: 'arb-one-mainnet',
      optimism: 'optimism-mainnet',
      base: 'base-mainnet',
      avalanche: 'avax-mainnet',
      fantom: 'fantom-mainnet',
      celo: 'celo-mainnet',
      // Add testnet mappings if needed
      'bitcoin-testnet': 'bitcoin-testnet',
      'ethereum-sepolia': 'ethereum-sepolia',
      'tron-testnet': 'tron-testnet',
      'bsc-testnet': 'bsc-testnet',
    };

    const normalized = blockchain.toLowerCase();
    return chainMap[normalized] || normalized;
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
      const endpoint = `/${blockchain.toLowerCase()}/wallet`;
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
      templateId?: 'enriched' | 'enriched_with_raw_data' | 'legacy';
      finality?: 'confirmed' | 'final';
    }
  ): Promise<TatumV4WebhookSubscriptionResponse> {
    try {
      const chain = this.getTatumV4Chain(blockchain);
      const subscriptionType = options?.type || 'INCOMING_NATIVE_TX';
      const templateId = options?.templateId || 'enriched';

      const data: TatumV4AddressWebhookRequest = {
        type: subscriptionType,
        attr: {
          address,
          chain,
          url: webhookUrl,
        },
        templateId,
        ...(options?.finality && { finality: options.finality }),
      };

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
}

export default new TatumService();

