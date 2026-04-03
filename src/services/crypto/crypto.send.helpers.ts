import { prisma } from '../../utils/prisma';
import {
  isValidBitcoinAddress,
  isValidEvmAddress,
  isValidTronAddress,
  normalizeBlockchain,
} from '../admin/received.asset.disbursement.helpers';

/** Canonical chain id for routing customer sends (lowercase). */
export function normalizeCustomerSendBlockchain(blockchain: string): string {
  const b = (blockchain || '').trim().toLowerCase();
  if (b === 'doge' || b === 'dogecoin') return 'dogecoin';
  if (b === 'ltc' || b === 'litecoin') return 'litecoin';
  if (b === 'matic') return 'polygon';
  return normalizeBlockchain(blockchain);
}

const UNSUPPORTED_CUSTOMER_SEND = new Set([
  'solana',
  'sol',
  'xrp',
  'ripple',
  'celo',
  'algorand',
  'algo',
]);

export function assertCustomerSendChainSupported(chainNorm: string): void {
  if (UNSUPPORTED_CUSTOMER_SEND.has(chainNorm)) {
    throw new Error(`Crypto send for "${chainNorm}" is not configured in this backend yet.`);
  }
}

export function validateSendRecipientAddress(chainNorm: string, toAddress: string): void {
  const a = (toAddress || '').trim();
  if (!a) {
    throw new Error('Recipient address is required');
  }
  if (chainNorm === 'ethereum' || chainNorm === 'bsc' || chainNorm === 'polygon') {
    if (!isValidEvmAddress(a)) {
      throw new Error('Invalid recipient address for this EVM network (expected 0x + 40 hex).');
    }
    return;
  }
  if (chainNorm === 'tron') {
    if (!isValidTronAddress(a)) {
      throw new Error('Invalid Tron recipient address.');
    }
    return;
  }
  if (chainNorm === 'bitcoin') {
    if (!isValidBitcoinAddress(a)) {
      throw new Error('Invalid Bitcoin recipient address.');
    }
    return;
  }
  if (chainNorm === 'dogecoin') {
    if (a.length < 26 || a.length > 45 || !a.startsWith('D')) {
      throw new Error('Invalid Dogecoin recipient address.');
    }
    return;
  }
  if (chainNorm === 'litecoin') {
    if (a.length < 26 || a.length > 95) {
      throw new Error('Invalid Litecoin recipient address.');
    }
    if (/^ltc1[a-z0-9]{20,100}$/i.test(a)) return;
    if (/^[LM3][a-km-zA-HJ-NP-Z1-9]{25,40}$/.test(a)) return;
    throw new Error('Invalid Litecoin recipient address.');
  }
  throw new Error(`Crypto send is not enabled for chain "${chainNorm}".`);
}

export function decryptDepositPrivateKey(encryptedKey: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Same algorithm as deposit keys — used for master wallet encrypted private keys. */
export const decryptSignerPrivateKey = decryptDepositPrivateKey;

export async function findMasterWalletForChain(chainNorm: string) {
  return prisma.masterWallet.findFirst({
    // `chainNorm` is lowercase; MySQL `StringFilter` has no `mode: 'insensitive'`.
    where: { blockchain: chainNorm },
  });
}
