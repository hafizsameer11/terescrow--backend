import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import {
  extractBaseSymbol,
  normalizeBlockchain,
  vendorNetworkMatchesBlockchain,
  isValidEvmAddress,
  isValidTronAddress,
  isValidBitcoinAddress,
  isNativeAssetForChain,
  type DecryptFn,
} from './received.asset.disbursement.helpers';
import { executeEvmVendorDisbursement } from './received.asset.disbursement.evm';
import { executeTronVendorDisbursement } from './received.asset.disbursement.tron';
import { executeBtcVendorDisbursement } from './received.asset.disbursement.btc';

function decryptPrivateKey(encryptedKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  // @ts-ignore
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface SendReceivedAssetToVendorResult {
  disbursementId: number;
  txHash: string;
  amount: string;
  amountUsd: string;
  toAddress: string;
  vendorId: number | null;
  networkFee: string;
  gasFundingTxHash?: string;
}

export interface BulkDisbursementItemResult {
  receiveTransactionId: string;
  success: boolean;
  data?: SendReceivedAssetToVendorResult;
  error?: string;
  statusCode?: number;
}

const SUPPORTED_BASE = new Set(['ETH', 'USDT', 'BNB', 'TRX', 'MATIC', 'BTC']);
const BULK_MAX_ITEMS = 100;

export type ReceiveOutboundContext = {
  tx: any;
  recv: any;
  recvAmount: Decimal;
  amountDecimal: Decimal;
  chainNorm: string;
  baseSymbol: string;
  receivedAsset: any;
  virtualAccount: any;
  walletCurrency: any;
  isNative: boolean;
};

/**
 * Shared load + validation for outbound moves from the user's deposit (vendor or master wallet).
 * At most one successful outbound disbursement per receive (any type).
 */
export async function loadReceiveDisbursementForOutbound(
  receiveTransactionId: string,
  amountInput?: string
): Promise<ReceiveOutboundContext> {
  const tx = await prisma.cryptoTransaction.findFirst({
    where: {
      transactionId: receiveTransactionId,
      transactionType: 'RECEIVE',
    },
    include: {
      cryptoReceive: true,
      virtualAccount: {
        include: {
          depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
          walletCurrency: true,
        },
      },
    },
  });

  if (!tx || !tx.cryptoReceive) {
    throw ApiError.notFound('Receive transaction not found');
  }

  const recv = tx.cryptoReceive;
  const recvAmount = new Decimal(recv.amount.toString());
  const amountDecimal =
    amountInput != null && String(amountInput).trim() !== ''
      ? new Decimal(String(amountInput).trim())
      : recvAmount;

  if (!amountDecimal.isFinite() || amountDecimal.lte(0)) {
    throw ApiError.badRequest('amount must be a positive number');
  }
  if (!amountDecimal.equals(recvAmount)) {
    throw ApiError.badRequest(
      `amount must match the full receive amount (${recvAmount.toString()} ${extractBaseSymbol(tx.currency)}) for this deposit`
    );
  }

  const chainNorm = normalizeBlockchain(tx.blockchain);
  const baseSymbol = extractBaseSymbol(tx.currency);

  if (!SUPPORTED_BASE.has(baseSymbol)) {
    throw ApiError.badRequest(
      `Unsupported asset for disbursement: ${baseSymbol}. Supported: BTC, ETH, USDT, BNB, TRX, MATIC.`
    );
  }

  const supportedChains = ['ethereum', 'bsc', 'tron', 'polygon', 'bitcoin'];
  if (!supportedChains.includes(chainNorm)) {
    throw ApiError.badRequest(`Unsupported blockchain for disbursement: ${tx.blockchain}`);
  }

  if (baseSymbol === 'BNB' && chainNorm !== 'bsc') {
    throw ApiError.badRequest('BNB disbursement is only valid on BSC');
  }
  if (baseSymbol === 'MATIC' && chainNorm !== 'polygon') {
    throw ApiError.badRequest('MATIC disbursement is only valid on Polygon');
  }
  if (baseSymbol === 'TRX' && chainNorm !== 'tron') {
    throw ApiError.badRequest('TRX disbursement is only valid on Tron');
  }
  if (baseSymbol === 'BTC' && chainNorm !== 'bitcoin') {
    throw ApiError.badRequest('BTC disbursement is only valid on Bitcoin');
  }
  if ((baseSymbol === 'ETH' || baseSymbol === 'USDT') && chainNorm === 'tron') {
    throw ApiError.badRequest('Use TRX or USDT (TRC20) on Tron, not ETH/USDT labels here');
  }

  const receivedAsset = await prisma.receivedAsset.findFirst({
    where: { txId: recv.txHash },
  });

  if (receivedAsset?.status === 'transferredToMaster') {
    throw ApiError.conflict('These funds were already marked as transferred to the master wallet');
  }
  if (receivedAsset?.status === 'sentToVendor') {
    throw ApiError.conflict('This deposit is already fully disbursed (vendor or outbound)');
  }

  const existingChangeNow = await prisma.receivedAssetDisbursement.findFirst({
    where: {
      cryptoTransactionId: tx.id,
      status: 'successful',
      disbursementType: 'changenow',
    },
  });
  if (existingChangeNow) {
    throw ApiError.conflict(
      'This deposit was already used for a ChangeNOW swap; cannot disburse on the same receive'
    );
  }

  const anySuccessfulOutbound = await prisma.receivedAssetDisbursement.findFirst({
    where: {
      cryptoTransactionId: tx.id,
      status: 'successful',
    },
  });
  if (anySuccessfulOutbound) {
    throw ApiError.conflict(
      `This deposit already has a successful outbound disbursement (${anySuccessfulOutbound.disbursementType}).`
    );
  }

  let virtualAccount = tx.virtualAccount;
  if (!virtualAccount && tx.virtualAccountId) {
    virtualAccount = await prisma.virtualAccount.findUnique({
      where: { id: tx.virtualAccountId },
      include: {
        depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
        walletCurrency: true,
      },
    });
  }
  if (!virtualAccount) {
    virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: tx.userId,
        blockchain: chainNorm,
        OR: [{ currency: tx.currency }, { currency: { contains: baseSymbol } }],
      },
      include: {
        depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
        walletCurrency: true,
      },
      orderBy: { id: 'desc' },
    });
  }

  if (!virtualAccount?.depositAddresses[0]?.privateKey) {
    throw ApiError.internal('Deposit address or private key not found for this receive');
  }

  const walletCurrency = virtualAccount.walletCurrency;
  const isNative = isNativeAssetForChain(baseSymbol, chainNorm, walletCurrency?.isToken);

  return {
    tx,
    recv,
    recvAmount,
    amountDecimal,
    chainNorm,
    baseSymbol,
    receivedAsset,
    virtualAccount,
    walletCurrency,
    isNative,
  };
}

/**
 * Sends crypto from the customer's deposit address (received-asset / virtual account),
 * not from the master wallet. Recorded in ReceivedAssetDisbursement, not MasterWalletTransaction.
 *
 * `amount` may be omitted: the full receive amount from `CryptoReceive` is used (recommended for UI bulk actions).
 */
export async function sendReceivedAssetToVendor(input: {
  receiveTransactionId: string;
  adminUserId: number;
  vendorId: number;
  /** If omitted, uses the full on-book receive amount for this deposit. */
  amount?: string;
}): Promise<SendReceivedAssetToVendorResult> {
  const { receiveTransactionId, adminUserId, vendorId, amount: amountInput } = input;

  const ctx = await loadReceiveDisbursementForOutbound(receiveTransactionId, amountInput);
  const {
    tx,
    recv,
    receivedAsset,
    recvAmount,
    chainNorm,
    baseSymbol,
    virtualAccount,
    walletCurrency,
    isNative,
  } = ctx;

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) {
    throw ApiError.notFound('Vendor not found');
  }

  if (extractBaseSymbol(vendor.currency) !== baseSymbol) {
    throw ApiError.badRequest(
      `Vendor currency (${vendor.currency}) does not match receive asset (${tx.currency} → ${baseSymbol})`
    );
  }
  if (!vendorNetworkMatchesBlockchain(vendor.network, tx.blockchain)) {
    throw ApiError.badRequest(
      `Vendor network (${vendor.network}) does not match transaction blockchain (${tx.blockchain})`
    );
  }

  const toAddr = vendor.walletAddress.trim();
  if (chainNorm === 'ethereum' || chainNorm === 'bsc' || chainNorm === 'polygon') {
    if (!isValidEvmAddress(toAddr)) {
      throw ApiError.badRequest('Vendor wallet must be a valid EVM address (0x + 40 hex).');
    }
  } else if (chainNorm === 'tron') {
    if (!isValidTronAddress(toAddr)) {
      throw ApiError.badRequest('Vendor wallet must be a valid Tron address (base58, starting with T).');
    }
  } else if (chainNorm === 'bitcoin') {
    if (!isValidBitcoinAddress(toAddr)) {
      throw ApiError.badRequest('Vendor wallet must be a valid Bitcoin address.');
    }
  }

  const decrypt: DecryptFn = decryptPrivateKey;

  if (chainNorm === 'bitcoin') {
    if (!isNative || baseSymbol !== 'BTC') {
      throw ApiError.badRequest('Only native BTC disbursement is supported on Bitcoin.');
    }
    return executeBtcVendorDisbursement({
      tx,
      recv,
      receivedAsset,
      vendor,
      virtualAccount,
      recvAmount,
      baseSymbol,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
    });
  }

  if (chainNorm === 'ethereum') {
    return executeEvmVendorDisbursement({
      evmPath: 'ethereum',
      gasChain: 'ETH',
      nativeCurrencySymbol: 'ETH',
      tx,
      recv,
      receivedAsset,
      vendor,
      virtualAccount,
      recvAmount,
      baseSymbol,
      walletCurrency,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      isNativeAsset: isNative,
    });
  }

  if (chainNorm === 'bsc') {
    return executeEvmVendorDisbursement({
      evmPath: 'bsc',
      gasChain: 'BSC',
      nativeCurrencySymbol: 'BNB',
      tx,
      recv,
      receivedAsset,
      vendor,
      virtualAccount,
      recvAmount,
      baseSymbol,
      walletCurrency,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      isNativeAsset: isNative,
    });
  }

  if (chainNorm === 'polygon') {
    return executeEvmVendorDisbursement({
      evmPath: 'polygon',
      gasChain: 'MATIC',
      nativeCurrencySymbol: 'MATIC',
      tx,
      recv,
      receivedAsset,
      vendor,
      virtualAccount,
      recvAmount,
      baseSymbol,
      walletCurrency,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      isNativeAsset: isNative,
    });
  }

  if (chainNorm === 'tron') {
    return executeTronVendorDisbursement({
      tx,
      recv,
      receivedAsset,
      vendor,
      virtualAccount,
      recvAmount,
      baseSymbol,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      isNativeAsset: isNative,
    });
  }

  throw ApiError.badRequest(`Unsupported chain: ${chainNorm}`);
}

/**
 * Admin-triggered: send the full received amount from the user's deposit address to the
 * configured MasterWallet address for this chain (same on-chain mechanics as vendor disbursement).
 * `ReceivedAsset` status becomes `transferredToMaster`; ledger row uses `disbursementType` = `master_wallet`.
 */
export async function sendReceivedAssetToMasterWallet(input: {
  receiveTransactionId: string;
  adminUserId: number;
  amount?: string;
}): Promise<SendReceivedAssetToVendorResult> {
  const { receiveTransactionId, adminUserId, amount: amountInput } = input;

  const ctx = await loadReceiveDisbursementForOutbound(receiveTransactionId, amountInput);
  const {
    tx,
    recv,
    receivedAsset,
    recvAmount,
    chainNorm,
    baseSymbol,
    virtualAccount,
    walletCurrency,
    isNative,
  } = ctx;

  const masterWallet = await prisma.masterWallet.findUnique({
    where: { blockchain: chainNorm },
  });
  const toAddr = masterWallet?.address?.trim();
  if (!toAddr) {
    throw ApiError.badRequest(
      `Master wallet address is not configured for blockchain "${chainNorm}". Create/update the row in MasterWallet.`
    );
  }

  if (chainNorm === 'ethereum' || chainNorm === 'bsc' || chainNorm === 'polygon') {
    if (!isValidEvmAddress(toAddr)) {
      throw ApiError.badRequest('Master wallet address must be a valid EVM address (0x + 40 hex).');
    }
  } else if (chainNorm === 'tron') {
    if (!isValidTronAddress(toAddr)) {
      throw ApiError.badRequest('Master wallet address must be a valid Tron address.');
    }
  } else if (chainNorm === 'bitcoin') {
    if (!isValidBitcoinAddress(toAddr)) {
      throw ApiError.badRequest('Master wallet address must be a valid Bitcoin address.');
    }
  }

  const masterAsRecipient = { id: null as number | null, walletAddress: toAddr };
  const decrypt: DecryptFn = decryptPrivateKey;

  if (chainNorm === 'bitcoin') {
    if (!isNative || baseSymbol !== 'BTC') {
      throw ApiError.badRequest('Only native BTC disbursement is supported on Bitcoin.');
    }
    return executeBtcVendorDisbursement({
      tx,
      recv,
      receivedAsset,
      vendor: masterAsRecipient,
      virtualAccount,
      recvAmount,
      baseSymbol,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      disbursementType: 'master_wallet',
      receivedAssetNextStatus: 'transferredToMaster',
    });
  }

  if (chainNorm === 'ethereum') {
    return executeEvmVendorDisbursement({
      evmPath: 'ethereum',
      gasChain: 'ETH',
      nativeCurrencySymbol: 'ETH',
      tx,
      recv,
      receivedAsset,
      vendor: masterAsRecipient,
      virtualAccount,
      recvAmount,
      baseSymbol,
      walletCurrency,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      isNativeAsset: isNative,
      disbursementType: 'master_wallet',
      disbursementNotes: 'Outbound to MasterWallet',
      receivedAssetStatusOnSuccess: 'transferredToMaster',
    });
  }

  if (chainNorm === 'bsc') {
    return executeEvmVendorDisbursement({
      evmPath: 'bsc',
      gasChain: 'BSC',
      nativeCurrencySymbol: 'BNB',
      tx,
      recv,
      receivedAsset,
      vendor: masterAsRecipient,
      virtualAccount,
      recvAmount,
      baseSymbol,
      walletCurrency,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      isNativeAsset: isNative,
      disbursementType: 'master_wallet',
      disbursementNotes: 'Outbound to MasterWallet',
      receivedAssetStatusOnSuccess: 'transferredToMaster',
    });
  }

  if (chainNorm === 'polygon') {
    return executeEvmVendorDisbursement({
      evmPath: 'polygon',
      gasChain: 'MATIC',
      nativeCurrencySymbol: 'MATIC',
      tx,
      recv,
      receivedAsset,
      vendor: masterAsRecipient,
      virtualAccount,
      recvAmount,
      baseSymbol,
      walletCurrency,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      isNativeAsset: isNative,
      disbursementType: 'master_wallet',
      disbursementNotes: 'Outbound to MasterWallet',
      receivedAssetStatusOnSuccess: 'transferredToMaster',
    });
  }

  if (chainNorm === 'tron') {
    return executeTronVendorDisbursement({
      tx,
      recv,
      receivedAsset,
      vendor: masterAsRecipient,
      virtualAccount,
      recvAmount,
      baseSymbol,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey: decrypt,
      isNativeAsset: isNative,
      disbursementType: 'master_wallet',
      receivedAssetNextStatus: 'transferredToMaster',
    });
  }

  throw ApiError.badRequest(`Unsupported chain: ${chainNorm}`);
}

/**
 * Process many receive → vendor disbursements in one admin request.
 * Each item is an **independent** on-chain transaction from that deposit address (required for different users/UTXOs).
 * Failures on one item do not roll back successful siblings.
 */
export async function bulkSendReceivedAssetsToVendors(input: {
  adminUserId: number;
  items: Array<{ receiveTransactionId: string; vendorId: number }>;
}): Promise<{
  results: BulkDisbursementItemResult[];
  summary: { total: number; succeeded: number; failed: number };
}> {
  if (!input.items?.length) {
    throw ApiError.badRequest('items must be a non-empty array');
  }
  if (input.items.length > BULK_MAX_ITEMS) {
    throw ApiError.badRequest(`At most ${BULK_MAX_ITEMS} items per bulk request`);
  }

  const results: BulkDisbursementItemResult[] = [];

  for (const it of input.items) {
    const receiveTransactionId = String(it.receiveTransactionId || '').trim();
    const vendorId = parseInt(String(it.vendorId), 10);
    if (!receiveTransactionId) {
      results.push({
        receiveTransactionId: '',
        success: false,
        error: 'receiveTransactionId is required',
        statusCode: 400,
      });
      continue;
    }
    if (!Number.isFinite(vendorId) || vendorId < 1) {
      results.push({
        receiveTransactionId,
        success: false,
        error: 'vendorId is invalid',
        statusCode: 400,
      });
      continue;
    }

    try {
      const data = await sendReceivedAssetToVendor({
        receiveTransactionId,
        adminUserId: input.adminUserId,
        vendorId,
        amount: undefined,
      });
      results.push({ receiveTransactionId, success: true, data });
    } catch (e: any) {
      const isApi = e instanceof ApiError;
      results.push({
        receiveTransactionId,
        success: false,
        error: e?.message || String(e),
        statusCode: isApi ? e.status : 500,
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  return {
    results,
    summary: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
    },
  };
}
