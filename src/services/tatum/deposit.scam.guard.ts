/**
 * Tight deposit security — whitelist-only token credits (industry standard for custodial wallets).
 * Blocks: unlisted contracts, token spoofing, ADDRESS_EVENT token transfers, INCOMING_FUNGIBLE_TX scams.
 */

import { isUserBanned } from '../../utils/customer.restrictions';
import { resolveWalletCurrencyFromContract, tokenContractMatches } from './deposit.token.resolver';
import { isContractBlocklisted } from './scam.contract.blocklist.service';
import type { WalletCurrency } from '@prisma/client';

const NATIVE_ASSET_IDS = new Set([
  'ETH', 'BNB', 'BSC', 'TRX', 'TRON', 'MATIC', 'BTC', 'LTC', 'DOGE', 'SOL',
]);

/** EVM contract address shape (40 hex). */
export function looksLikeEvmContract(addr: string): boolean {
  const t = addr.trim();
  const hex = t.startsWith('0x') ? t.slice(2) : t;
  return /^[0-9a-fA-F]{40}$/.test(hex);
}

/** Tron TRC-20 base58 contract (starts with T, 34 chars). */
export function looksLikeTronContract(addr: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr.trim());
}

/** Any on-chain token identifier (not a native coin ticker). */
export function isTokenContractIdentifier(contractOrAsset: string | undefined | null): boolean {
  if (!contractOrAsset) return false;
  const s = String(contractOrAsset).trim();
  if (!s) return false;
  if (NATIVE_ASSET_IDS.has(s.toUpperCase())) return false;
  if (looksLikeEvmContract(s)) return true;
  if (looksLikeTronContract(s)) return true;
  // Tatum Tron symbol e.g. USDT_TRON
  if (s.includes('_') && s.length > 3) return true;
  return false;
}

export function isFungibleTokenWebhook(subscriptionType?: string, contractAddress?: unknown): boolean {
  if (subscriptionType === 'INCOMING_FUNGIBLE_TX') return true;
  if (!contractAddress) return false;
  if (subscriptionType === 'ADDRESS_EVENT') {
    return isTokenContractIdentifier(String(contractAddress));
  }
  return false;
}

export type DepositGuardVerdict =
  | { action: 'allow'; walletCurrency: WalletCurrency | null; isToken: boolean }
  | { action: 'reject_fake'; reason: string; contractAddress: string }
  | { action: 'reject_banned'; reason: string };

function resolveTokenIdentifier(input: {
  contractAddress?: string | null;
  assetField?: string | null;
}): string | null {
  const contractField = input.contractAddress?.trim() || null;
  const assetField = input.assetField?.trim() || null;
  if (contractField && isTokenContractIdentifier(contractField)) return contractField;
  if (contractField && looksLikeEvmContract(contractField)) return contractField;
  if (contractField && looksLikeTronContract(contractField)) return contractField;
  if (assetField && isTokenContractIdentifier(assetField)) return assetField;
  if (contractField) return contractField;
  if (assetField) return assetField;
  return null;
}

export async function evaluateIncomingDeposit(input: {
  userStatus?: string | null;
  chainSlug: string;
  subscriptionType?: string;
  contractAddress?: string | null;
  assetField?: string | null;
  webhookType?: string;
}): Promise<DepositGuardVerdict> {
  const isFungibleSub = input.subscriptionType === 'INCOMING_FUNGIBLE_TX';
  const tokenId = resolveTokenIdentifier(input);

  const isTokenEvent =
    isFungibleSub
    || isFungibleTokenWebhook(input.subscriptionType, tokenId ?? undefined)
    || (tokenId && isTokenContractIdentifier(tokenId))
    || input.webhookType === 'token';

  if (isTokenEvent) {
    const contractAddress = tokenId || 'unknown';

    const blocklist = await isContractBlocklisted(input.chainSlug, contractAddress);
    if (blocklist.blocked) {
      return {
        action: 'reject_fake',
        reason: 'blocklisted_token_contract',
        contractAddress,
      };
    }

    const hasContractShape = isTokenContractIdentifier(contractAddress);
    const allowTickerFallback = !isFungibleSub && !hasContractShape;

    const walletCurrency = await resolveWalletCurrencyFromContract(
      input.chainSlug,
      contractAddress,
      { allowTickerFallback }
    );

    if (!walletCurrency) {
      return {
        action: 'reject_fake',
        reason: 'unlisted_token_contract',
        contractAddress,
      };
    }

    if (isFungibleSub && hasContractShape) {
      const wcContract = walletCurrency.contractAddress;
      if (!wcContract || !tokenContractMatches(wcContract, contractAddress)) {
        return {
          action: 'reject_fake',
          reason: 'unlisted_token_contract',
          contractAddress,
        };
      }
    }

    if (isUserBanned(input.userStatus)) {
      return { action: 'reject_banned', reason: 'user_banned' };
    }

    return { action: 'allow', walletCurrency, isToken: true };
  }

  if (isUserBanned(input.userStatus)) {
    return { action: 'reject_banned', reason: 'user_banned' };
  }

  return { action: 'allow', walletCurrency: null, isToken: false };
}
