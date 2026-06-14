import { fetchEtherscanTransactionReceipt, isEtherscanConfigured } from '../../etherscan/etherscan.client';
import { getTronTransactionInfo } from '../../tron/tronscan.service';
import { canonicalEvmContract } from '../deposit.token.resolver';
import { getChainConfig, isDepositVerifyEnabled, normalizeChainSlug } from './chain.registry';
import { fetchTatumV4Transaction } from './tatum.v4.transaction.client';
import type { DepositVerifyInput, DepositVerifyResult, ParsedOnChainTransfer } from './types';
import {
  parseEvmNativeTransfer,
  parseEvmTokenTransferFromReceipt,
  parseEvmTokenTransferFromTatum,
  validateEvmTransfer,
} from './parsers/evm.parser';
import { parseTronScanTransactionInfo, validateTronTransfer } from './parsers/tronscan.parser';
import { parseUtxoOutputs, validateUtxoTransfer } from './parsers/utxo.parser';
import { parseSolanaNativeTransfer } from './parsers/solana.parser';
import { amountsMatch } from './amount.compare';

function evmTokenDecimals(chainSlug: string, walletCurrency?: { currency?: string; decimals?: number | null } | null): number {
  const chain = normalizeChainSlug(chainSlug);
  const cur = walletCurrency?.currency?.toUpperCase() ?? '';
  if ((cur === 'USDT' || cur === 'USDC') && (chain === 'ethereum' || chain === 'eth')) return 6;
  const d = walletCurrency?.decimals;
  if (d != null && d > 0 && d <= 36) return d;
  return 18;
}

function mismatch(
  reason: string,
  provider: string,
  parsed?: ParsedOnChainTransfer | null,
  raw?: unknown
): DepositVerifyResult {
  return {
    status: 'mismatch',
    reason,
    provider,
    onChainRecipient: parsed?.recipient,
    onChainContract: parsed?.contractAddress,
    onChainAmount: parsed?.amountRaw,
    rawSnippet: raw,
  };
}

function pending(reason: string, provider: string, raw?: unknown): DepositVerifyResult {
  return { status: 'pending', reason, provider, rawSnippet: raw };
}

function verified(provider: string, parsed: ParsedOnChainTransfer): DepositVerifyResult {
  return {
    status: 'verified',
    provider,
    onChainRecipient: parsed.recipient,
    onChainContract: parsed.contractAddress,
    onChainAmount: parsed.amountRaw,
  };
}

async function verifyEvm(input: DepositVerifyInput): Promise<DepositVerifyResult> {
  const chain = getChainConfig(input.chainSlug)!;
  const whitelisted =
    input.walletCurrency?.contractAddress ?? input.contractAddress ?? '';
  const decimals = input.isToken ? evmTokenDecimals(input.chainSlug, input.walletCurrency) : 18;

  if (input.isToken) {
    if (!whitelisted) {
      return mismatch('missing_whitelist_contract', 'local');
    }

    if (chain.primaryProvider === 'etherscan' && isEtherscanConfigured() && chain.etherscanChainId) {
      try {
        const receipt = await fetchEtherscanTransactionReceipt(chain.etherscanChainId, input.txHash);
        if (!receipt) {
          return pending('etherscan_receipt_not_found', 'etherscan');
        }
        const parsed = parseEvmTokenTransferFromReceipt(receipt, input.depositAddress, whitelisted);
        const check = validateEvmTransfer(parsed, input.expectedAmount, decimals);
        if (!check.ok) {
          if (parsed && !parsed.success) return mismatch(check.reason, 'etherscan', parsed, receipt);
          if (parsed?.contractAddress && canonicalEvmContract(parsed.contractAddress) !== canonicalEvmContract(whitelisted)) {
            return mismatch('contract_mismatch', 'etherscan', parsed, receipt);
          }
          return mismatch(check.reason, 'etherscan', parsed, receipt);
        }
        return verified('etherscan', parsed!);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Free API access is not supported')) {
          // fall through to Tatum
        } else {
          return pending(`etherscan_error:${msg}`, 'etherscan');
        }
      }
    }

    const tatum = await fetchTatumV4Transaction(input.chainSlug, input.txHash);
    if (!tatum.ok) {
      if (tatum.status === 404 || tatum.error.includes('not found')) {
        return pending('tx_not_found', 'tatum');
      }
      return pending(`tatum_error:${tatum.error}`, 'tatum');
    }

    const parsed = parseEvmTokenTransferFromTatum(tatum.body, input.depositAddress, whitelisted);
    if (parsed && parsed.contractAddress && canonicalEvmContract(parsed.contractAddress) !== canonicalEvmContract(whitelisted)) {
      return mismatch('contract_mismatch', 'tatum', parsed, tatum.body);
    }
    const check = validateEvmTransfer(parsed, input.expectedAmount, decimals);
    if (!check.ok) {
      return mismatch(check.reason, 'tatum', parsed, tatum.body);
    }
    return verified('tatum', parsed!);
  }

  // Native EVM
  if (chain.primaryProvider === 'etherscan' && isEtherscanConfigured() && chain.etherscanChainId) {
    try {
      const receipt = await fetchEtherscanTransactionReceipt(chain.etherscanChainId, input.txHash);
      if (!receipt) return pending('etherscan_receipt_not_found', 'etherscan');
      const body = { ...receipt, status: receipt.status, to: receipt.to, value: '0' };
      const tatumFallback = await fetchTatumV4Transaction(input.chainSlug, input.txHash);
      const nativeBody = tatumFallback.ok ? tatumFallback.body : body;
      const parsed = parseEvmNativeTransfer(nativeBody as Record<string, unknown>, input.depositAddress);
      const check = validateEvmTransfer(parsed, input.expectedAmount, 18);
      if (!check.ok) return mismatch(check.reason, 'etherscan', parsed, receipt);
      return verified('etherscan', parsed!);
    } catch {
      // fall through
    }
  }

  const tatum = await fetchTatumV4Transaction(input.chainSlug, input.txHash);
  if (!tatum.ok) return pending(`tatum_error:${tatum.error}`, 'tatum');
  const parsed = parseEvmNativeTransfer(tatum.body, input.depositAddress);
  const check = validateEvmTransfer(parsed, input.expectedAmount, 18);
  if (!check.ok) return mismatch(check.reason, 'tatum', parsed, tatum.body);
  return verified('tatum', parsed!);
}

async function verifyTron(input: DepositVerifyInput): Promise<DepositVerifyResult> {
  const whitelisted =
    input.walletCurrency?.contractAddress ?? input.contractAddress ?? '';

  try {
    const info = await getTronTransactionInfo(input.txHash);
    const parsed = parseTronScanTransactionInfo(
      info,
      input.depositAddress,
      whitelisted,
      input.isToken
    );
    const check = validateTronTransfer(parsed, input.expectedAmount, whitelisted, input.isToken);
    if (!check.ok) return mismatch(check.reason, 'tronscan', parsed, info);
    return verified('tronscan', parsed!);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const tatum = await fetchTatumV4Transaction(input.chainSlug, input.txHash);
    if (!tatum.ok) return pending(`tronscan_and_tatum_failed:${msg}`, 'tronscan');
    return pending('tronscan_failed_using_tatum_pending', 'tatum', tatum.body);
  }
}

async function verifyUtxo(input: DepositVerifyInput): Promise<DepositVerifyResult> {
  const tatum = await fetchTatumV4Transaction(input.chainSlug, input.txHash);
  if (!tatum.ok) {
    if (tatum.status === 404) return pending('tx_not_found', 'tatum');
    return pending(`tatum_error:${tatum.error}`, 'tatum');
  }
  const parsed = parseUtxoOutputs(tatum.body, input.depositAddress);
  const check = validateUtxoTransfer(parsed, input.expectedAmount, tatum.body);
  if (!check.ok) return mismatch(check.reason, 'tatum', parsed, tatum.body);
  return verified('tatum', parsed!);
}

async function verifySolana(input: DepositVerifyInput): Promise<DepositVerifyResult> {
  const tatum = await fetchTatumV4Transaction(input.chainSlug, input.txHash);
  if (!tatum.ok) return pending(`tatum_error:${tatum.error}`, 'tatum');
  const parsed = parseSolanaNativeTransfer(tatum.body, input.depositAddress, input.expectedAmount);
  if (!parsed) return pending('solana_parse_incomplete', 'tatum', tatum.body);
  if (parsed.amountRaw === '0' || !amountsMatch(input.expectedAmount, parsed.amountRaw, 9)) {
    return pending('solana_amount_pending', 'tatum', tatum.body);
  }
  return verified('tatum', parsed);
}

export async function verifyDepositOnChain(input: DepositVerifyInput): Promise<DepositVerifyResult> {
  if (!isDepositVerifyEnabled()) {
    return { status: 'verified', provider: 'disabled', reason: 'verify_disabled' };
  }

  if (!input.txHash?.trim()) {
    return { status: 'pending', reason: 'missing_tx_hash', provider: 'local' };
  }

  const chain = getChainConfig(input.chainSlug);
  if (!chain) {
    return { status: 'pending', reason: `unsupported_chain:${normalizeChainSlug(input.chainSlug)}`, provider: 'local' };
  }

  switch (chain.family) {
    case 'evm':
      return verifyEvm(input);
    case 'tron':
      return verifyTron(input);
    case 'utxo':
      return verifyUtxo(input);
    case 'solana':
      return verifySolana(input);
    default:
      return { status: 'pending', reason: 'unknown_family', provider: 'local' };
  }
}

export { isDepositVerifyEnabled, getChainConfig, getTatumV4Chain } from './chain.registry';
