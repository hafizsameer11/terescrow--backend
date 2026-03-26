export type DecryptFn = (encrypted: string) => string;

/** Base ticker for vendor/currency matching (handles USDT_BSC, "USDT ETH", etc.) */
export function extractBaseSymbol(currency: string): string {
  const u = currency.toUpperCase().trim();
  if (u.includes('MATIC')) return 'MATIC';
  if (u.includes('USDT')) return 'USDT';
  if (u.includes('USDC')) return 'USDC';
  if (u.startsWith('ETH') || u === 'ETH') return 'ETH';
  if (u.startsWith('BNB') || u === 'BNB') return 'BNB';
  if (u.startsWith('TRX') || u === 'TRX') return 'TRX';
  if (u.startsWith('BTC') || u === 'BTC') return 'BTC';
  return u.split(/[\s_]+/)[0] || u;
}

export function normalizeBlockchain(blockchain: string): string {
  const b = blockchain.toLowerCase();
  if (b === 'eth') return 'ethereum';
  if (b === 'btc') return 'bitcoin';
  if (b === 'binance' || b === 'binancesmartchain') return 'bsc';
  if (b === 'trx') return 'tron';
  return b;
}

export function vendorNetworkMatchesBlockchain(vendorNetwork: string, blockchain: string): boolean {
  const n = vendorNetwork.toLowerCase();
  const b = blockchain.toLowerCase();
  if (b === 'ethereum' || b === 'eth') {
    return n.includes('eth') || n.includes('ethereum');
  }
  if (b === 'bsc') {
    return n.includes('bsc') || n.includes('bnb') || n.includes('binance') || n.includes('smart chain');
  }
  if (b === 'tron') {
    return n.includes('tron') || n.includes('trx') || n.includes('trc');
  }
  if (b === 'bitcoin' || b === 'btc') {
    return n.includes('btc') || n.includes('bitcoin');
  }
  return n.includes(b) || b.includes(n);
}

/** EVM 0x address */
export function isValidEvmAddress(addr: string): boolean {
  const a = addr.trim();
  return a.startsWith('0x') && a.length === 42 && /^0x[0-9a-fA-F]{40}$/.test(a);
}

/** Tron base58 address (T + 33 chars typical) */
export function isValidTronAddress(addr: string): boolean {
  const a = addr.trim();
  return a.startsWith('T') && a.length >= 34 && a.length <= 36;
}

/** Legacy P2PKH/P2SH or bech32 — loose validation for vendor payout. */
export function isValidBitcoinAddress(addr: string): boolean {
  const a = addr.trim();
  if (a.length < 26 || a.length > 90) return false;
  if (/^bc1[a-z0-9]{25,87}$/i.test(a)) return true;
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return true;
  return false;
}

export function isNativeAssetForChain(
  baseSymbol: string,
  chainNorm: string,
  walletCurrencyIsToken: boolean | null | undefined
): boolean {
  if (walletCurrencyIsToken === true) return false;
  if (walletCurrencyIsToken === false) return true;
  if (chainNorm === 'ethereum' && baseSymbol === 'ETH') return true;
  if (chainNorm === 'bsc' && baseSymbol === 'BNB') return true;
  if (chainNorm === 'tron' && baseSymbol === 'TRX') return true;
  if (chainNorm === 'bitcoin' && baseSymbol === 'BTC') return true;
  return false;
}
