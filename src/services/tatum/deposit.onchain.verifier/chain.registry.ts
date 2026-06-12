export type ChainFamily = 'evm' | 'tron' | 'utxo' | 'solana';

export interface ChainConfig {
  family: ChainFamily;
  tatumV4Chain: string;
  etherscanChainId?: number;
  evmRpcPath?: 'ethereum' | 'bsc' | 'polygon';
  minConfirmations: number;
  primaryProvider: 'etherscan' | 'tatum' | 'tronscan';
}

const CHAIN_REGISTRY: Record<string, ChainConfig> = {
  bitcoin: {
    family: 'utxo',
    tatumV4Chain: 'bitcoin-mainnet',
    minConfirmations: 1,
    primaryProvider: 'tatum',
  },
  litecoin: {
    family: 'utxo',
    tatumV4Chain: 'litecoin-mainnet',
    minConfirmations: 1,
    primaryProvider: 'tatum',
  },
  ltc: {
    family: 'utxo',
    tatumV4Chain: 'litecoin-mainnet',
    minConfirmations: 1,
    primaryProvider: 'tatum',
  },
  ethereum: {
    family: 'evm',
    tatumV4Chain: 'ethereum-mainnet',
    etherscanChainId: 1,
    evmRpcPath: 'ethereum',
    minConfirmations: parseInt(process.env.DEPOSIT_VERIFY_MIN_CONFIRMATIONS_ETH || '1', 10),
    primaryProvider: 'etherscan',
  },
  eth: {
    family: 'evm',
    tatumV4Chain: 'ethereum-mainnet',
    etherscanChainId: 1,
    evmRpcPath: 'ethereum',
    minConfirmations: parseInt(process.env.DEPOSIT_VERIFY_MIN_CONFIRMATIONS_ETH || '1', 10),
    primaryProvider: 'etherscan',
  },
  bsc: {
    family: 'evm',
    tatumV4Chain: 'bsc-mainnet',
    etherscanChainId: 56,
    evmRpcPath: 'bsc',
    minConfirmations: parseInt(process.env.DEPOSIT_VERIFY_MIN_CONFIRMATIONS_BSC || '1', 10),
    primaryProvider: 'tatum',
  },
  tron: {
    family: 'tron',
    tatumV4Chain: 'tron-mainnet',
    minConfirmations: 1,
    primaryProvider: 'tronscan',
  },
  solana: {
    family: 'solana',
    tatumV4Chain: 'solana-mainnet',
    minConfirmations: 1,
    primaryProvider: 'tatum',
  },
  sol: {
    family: 'solana',
    tatumV4Chain: 'solana-mainnet',
    minConfirmations: 1,
    primaryProvider: 'tatum',
  },
};

export function normalizeChainSlug(blockchain: string): string {
  const s = blockchain.trim().toLowerCase();
  if (s === 'binance' || s === 'binancesmartchain') return 'bsc';
  if (s === 'trx') return 'tron';
  return s;
}

export function getChainConfig(chainSlug: string): ChainConfig | null {
  return CHAIN_REGISTRY[normalizeChainSlug(chainSlug)] ?? null;
}

/** Tatum V4 chain slug for transaction API (fixes litecoin-core-mainnet → litecoin-mainnet). */
export function getTatumV4Chain(blockchain: string): string {
  const cfg = getChainConfig(blockchain);
  if (cfg) return cfg.tatumV4Chain;

  const chainMap: Record<string, string> = {
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
  };
  const normalized = normalizeChainSlug(blockchain);
  return chainMap[normalized] ?? 'ethereum-mainnet';
}

export function isDepositVerifyEnabled(): boolean {
  return process.env.DEPOSIT_VERIFY_ENABLED === 'true';
}

export function getMaxVerifyAttempts(): number {
  return parseInt(process.env.DEPOSIT_VERIFY_MAX_ATTEMPTS || '20', 10);
}

export function getVerifyRetryDelayMs(): number {
  return parseInt(process.env.DEPOSIT_VERIFY_RETRY_DELAY_MS || '30000', 10);
}
