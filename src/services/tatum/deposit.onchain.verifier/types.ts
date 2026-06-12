import type { WalletCurrency } from '@prisma/client';

export type DepositVerifyStatus = 'verified' | 'pending' | 'mismatch' | 'error';

export interface DepositVerifyInput {
  chainSlug: string;
  txHash: string;
  depositAddress: string;
  expectedAmount: string;
  contractAddress?: string | null;
  isToken: boolean;
  walletCurrency?: WalletCurrency | null;
  subscriptionType?: string;
  blockNumber?: number | null;
}

export interface ParsedOnChainTransfer {
  success: boolean;
  recipient: string;
  amountRaw: string;
  contractAddress?: string;
  decimals?: number;
  blockNumber?: number;
}

export interface DepositVerifyResult {
  status: DepositVerifyStatus;
  reason?: string;
  provider?: string;
  onChainAmount?: string;
  onChainRecipient?: string;
  onChainContract?: string;
  rawSnippet?: unknown;
}
