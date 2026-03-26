/**
 * Send from customer deposit (received asset path) to ChangeNOW pay-in address (EVM only for v1).
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import {
  extractBaseSymbol,
  normalizeBlockchain,
  isNativeAssetForChain,
} from '../admin/received.asset.disbursement.helpers';
import { executeEvmVendorDisbursement } from '../admin/received.asset.disbursement.evm';
import crypto from 'crypto';

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

const SUPPORTED_BASE = new Set(['ETH', 'USDT', 'BNB', 'MATIC']);

export async function payinReceivedAssetEvmToChangeNow(input: {
  receiveTransactionId: string;
  adminUserId: number;
  changeNowSwapOrderDbId: number;
  payinAddress: string;
  amountFrom: Decimal;
}): Promise<{ disbursementId: number; txHash: string }> {
  const { receiveTransactionId, adminUserId, changeNowSwapOrderDbId, payinAddress, amountFrom } =
    input;

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

  if (!tx?.cryptoReceive) {
    throw ApiError.notFound('Receive transaction not found');
  }

  const recv = tx.cryptoReceive;
  const recvAmount = new Decimal(recv.amount.toString());
  if (amountFrom.lte(0) || !amountFrom.isFinite()) {
    throw ApiError.badRequest('Invalid amount');
  }
  if (amountFrom.gt(recvAmount)) {
    throw ApiError.badRequest(
      `amountFrom exceeds receive amount (max ${recvAmount.toString()} ${extractBaseSymbol(tx.currency)})`
    );
  }

  const chainNorm = normalizeBlockchain(tx.blockchain);
  if (!['ethereum', 'bsc', 'polygon'].includes(chainNorm)) {
    throw ApiError.badRequest(
      `ChangeNOW pay-in from received asset is only implemented for EVM chains (ethereum, bsc, polygon); got ${tx.blockchain}`
    );
  }

  const baseSymbol = extractBaseSymbol(tx.currency);
  if (!SUPPORTED_BASE.has(baseSymbol)) {
    throw ApiError.badRequest(`Unsupported asset for ChangeNOW pay-in: ${baseSymbol}`);
  }

  if (baseSymbol === 'BNB' && chainNorm !== 'bsc') {
    throw ApiError.badRequest('BNB ChangeNOW pay-in is only valid on BSC');
  }
  if (baseSymbol === 'MATIC' && chainNorm !== 'polygon') {
    throw ApiError.badRequest('MATIC ChangeNOW pay-in is only valid on Polygon');
  }

  const receivedAsset = await prisma.receivedAsset.findFirst({
    where: { txId: recv.txHash },
  });
  if (receivedAsset?.status === 'transferredToMaster') {
    throw ApiError.conflict('Funds already marked transferred to master');
  }
  if (receivedAsset?.status === 'sentToVendor') {
    throw ApiError.conflict('Deposit already fully disbursed');
  }

  const existingOut = await prisma.receivedAssetDisbursement.findFirst({
    where: {
      cryptoTransactionId: tx.id,
      status: 'successful',
    },
  });
  if (existingOut) {
    throw ApiError.conflict(
      'This receive already has a successful outbound transfer (vendor or ChangeNOW); cannot swap again on the same ledger row'
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
  if (!virtualAccount?.depositAddresses[0]?.privateKey) {
    throw ApiError.internal('Deposit address or private key not found');
  }

  const walletCurrency = virtualAccount.walletCurrency;
  const isNative = isNativeAssetForChain(baseSymbol, chainNorm, walletCurrency?.isToken);

  const notes = `changeNowSwapOrderId:${changeNowSwapOrderDbId}`;

  if (chainNorm === 'ethereum') {
    const result = await executeEvmVendorDisbursement({
      evmPath: 'ethereum',
      gasChain: 'ETH',
      nativeCurrencySymbol: 'ETH',
      tx,
      recv,
      receivedAsset,
      vendor: { id: null, walletAddress: payinAddress },
      virtualAccount,
      recvAmount: amountFrom,
      baseSymbol,
      walletCurrency,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey,
      isNativeAsset: isNative,
      disbursementType: 'changenow',
      disbursementNotes: notes,
      receivedAssetStatusOnSuccess: null,
    });
    return { disbursementId: result.disbursementId, txHash: result.txHash };
  }
  if (chainNorm === 'bsc') {
    const result = await executeEvmVendorDisbursement({
      evmPath: 'bsc',
      gasChain: 'BSC',
      nativeCurrencySymbol: 'BNB',
      tx,
      recv,
      receivedAsset,
      vendor: { id: null, walletAddress: payinAddress },
      virtualAccount,
      recvAmount: amountFrom,
      baseSymbol,
      walletCurrency,
      adminUserId,
      receiveTransactionId,
      decryptPrivateKey,
      isNativeAsset: isNative,
      disbursementType: 'changenow',
      disbursementNotes: notes,
      receivedAssetStatusOnSuccess: null,
    });
    return { disbursementId: result.disbursementId, txHash: result.txHash };
  }
  const result = await executeEvmVendorDisbursement({
    evmPath: 'polygon',
    gasChain: 'MATIC',
    nativeCurrencySymbol: 'MATIC',
    tx,
    recv,
    receivedAsset,
    vendor: { id: null, walletAddress: payinAddress },
    virtualAccount,
    recvAmount: amountFrom,
    baseSymbol,
    walletCurrency,
    adminUserId,
    receiveTransactionId,
    decryptPrivateKey,
    isNativeAsset: isNative,
    disbursementType: 'changenow',
    disbursementNotes: notes,
    receivedAssetStatusOnSuccess: null,
  });
  return { disbursementId: result.disbursementId, txHash: result.txHash };
}
