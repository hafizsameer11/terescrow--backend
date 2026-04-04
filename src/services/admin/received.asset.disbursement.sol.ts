import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import cryptoLogger from '../../utils/crypto.logger';
import {
  estimateSolanaTransferFeeSol,
  getSolanaAddressBalanceSol,
  sendSolFromAddress,
} from '../solana/solana.tatum.service';
import type { DecryptFn } from './received.asset.disbursement.helpers';

/**
 * Solana sender must keep rent-exempt lamports + tx fee on the deposit account after transfer.
 * ~0.00089 SOL is typical rent for a basic account; we leave more for fee variance.
 */
const SOLANA_MIN_LEFT_ON_DEPOSIT = new Decimal('0.002');

export async function executeSolVendorDisbursement(params: {
  tx: any;
  recv: any;
  receivedAsset: { id: number } | null;
  vendor: { id: number | null; walletAddress: string };
  virtualAccount: any;
  recvAmount: Decimal;
  baseSymbol: string;
  adminUserId: number;
  receiveTransactionId: string;
  decryptPrivateKey: DecryptFn;
  disbursementType?: string;
  receivedAssetNextStatus?: string;
}): Promise<{
  disbursementId: number;
  txHash: string;
  amount: string;
  amountUsd: string;
  toAddress: string;
  vendorId: number | null;
  networkFee: string;
  requestedAmountSol?: string;
  partialSolSweep?: boolean;
}> {
  const {
    tx,
    recv,
    receivedAsset,
    vendor,
    virtualAccount,
    recvAmount,
    baseSymbol,
    adminUserId,
    receiveTransactionId,
    decryptPrivateKey,
    disbursementType = 'vendor',
    receivedAssetNextStatus = 'sentToVendor',
  } = params;

  const toAddress = vendor.walletAddress.trim();
  const depositAddressRecord = virtualAccount.depositAddresses[0];
  if (!depositAddressRecord?.privateKey) {
    throw ApiError.internal('Deposit address or private key not found');
  }
  const depositAddress = depositAddressRecord.address;

  const wc = virtualAccount.walletCurrency;
  if (!wc?.price) {
    throw ApiError.internal(`Currency ${baseSymbol} price not configured`);
  }
  const cryptoPrice = new Decimal(wc.price.toString());

  let pk = decryptPrivateKey(depositAddressRecord.privateKey);
  pk = pk.trim();

  const onChain = new Decimal(await getSolanaAddressBalanceSol(depositAddress));
  if (onChain.lessThan(recvAmount)) {
    throw ApiError.badRequest(
      `Insufficient on-chain SOL. Available: ${onChain.toString()}, required: ${recvAmount.toString()}`
    );
  }

  const feeEst = await estimateSolanaTransferFeeSol();
  const txFeeHeadroom = Decimal.max(feeEst, new Decimal('0.00005'));
  const maxSendable = onChain.minus(SOLANA_MIN_LEFT_ON_DEPOSIT).minus(txFeeHeadroom);
  if (!maxSendable.isFinite() || maxSendable.lte(0)) {
    throw ApiError.badRequest(
      `Solana deposit balance too low to sweep after keeping ~${SOLANA_MIN_LEFT_ON_DEPOSIT.toString()} SOL ` +
        `(rent + fees) on the address. On-chain: ${onChain.toString()} SOL.`
    );
  }

  let netToVendor = Decimal.min(recvAmount, maxSendable);
  netToVendor = netToVendor.toDecimalPlaces(9, Decimal.ROUND_DOWN);

  const partialSweep = netToVendor.lessThan(recvAmount);
  if (partialSweep) {
    cryptoLogger.transaction('ADMIN_SOL_PARTIAL_SWEEP', {
      receiveTransactionId,
      depositAddress,
      bookedReceiveSol: recvAmount.toString(),
      sentSol: netToVendor.toString(),
      onChainSol: onChain.toString(),
      maxSendableSol: maxSendable.toString(),
      minLeftReserveSol: SOLANA_MIN_LEFT_ON_DEPOSIT.toString(),
      txFeeHeadroomSol: txFeeHeadroom.toString(),
    });
  }

  if (!netToVendor.isFinite() || netToVendor.lte(0)) {
    throw ApiError.badRequest('Computed Solana send amount is invalid after rent/fee reserve.');
  }

  /** Ledger hint for fees (actual priority fee may differ on-chain). */
  const networkFeeLedger = txFeeHeadroom;

  const amountUsd = netToVendor.mul(cryptoPrice);

  const sweepNotes = partialSweep
    ? `Partial SOL sweep: sent ${netToVendor.toString()} SOL; booked receive ${recvAmount.toString()} SOL; ` +
      `~${SOLANA_MIN_LEFT_ON_DEPOSIT.toString()} SOL + fees reserved on deposit.`
    : null;

  const pending = await prisma.receivedAssetDisbursement.create({
    data: {
      cryptoTransactionId: tx.id,
      receivedAssetId: receivedAsset?.id ?? null,
      sourceDepositTxHash: recv.txHash,
      disbursementType,
      vendorId: vendor.id ?? null,
      toAddress,
      amount: netToVendor,
      currency: baseSymbol,
      blockchain: tx.blockchain,
      amountUsd,
      status: 'pending',
      adminUserId,
      notes: sweepNotes,
    },
  });

  let txHash: string;
  try {
    txHash = await sendSolFromAddress({
      fromAddress: depositAddress,
      fromPrivateKey: pk,
      toAddress,
      amountSol: netToVendor.toString(),
    });
  } catch (e: any) {
    await prisma.receivedAssetDisbursement.update({
      where: { id: pending.id },
      data: { status: 'failed', notes: e?.message?.slice(0, 2000) ?? 'chain error' },
    });
    cryptoLogger.exception('SOL vendor disbursement failed', e, { receiveTransactionId });
    throw ApiError.internal(e?.message || 'Solana transfer failed');
  }

  try {
    await prisma.$transaction(async (db) => {
      await db.receivedAssetDisbursement.update({
        where: { id: pending.id },
        data: {
          status: 'successful',
          txHash,
          networkFee: networkFeeLedger,
        },
      });
      if (receivedAsset) {
        await db.receivedAsset.update({
          where: { id: receivedAsset.id },
          data: { status: receivedAssetNextStatus },
        });
      }
    });
  } catch (e: any) {
    cryptoLogger.exception('DB update after SOL disbursement', e, { txHash, pendingId: pending.id });
    throw ApiError.internal('Transfer submitted but ledger update failed; reconcile using tx hash');
  }

  cryptoLogger.transaction('ADMIN_RECEIVED_ASSET_VENDOR', {
    receiveTransactionId,
    disbursementId: pending.id,
    adminUserId,
    vendorId: vendor.id ?? null,
    txHash,
    amount: netToVendor.toString(),
    chain: 'solana',
  });

  return {
    disbursementId: pending.id,
    txHash,
    amount: netToVendor.toString(),
    amountUsd: amountUsd.toString(),
    toAddress,
    vendorId: vendor.id ?? null,
    networkFee: networkFeeLedger.toString(),
    ...(partialSweep
      ? { requestedAmountSol: recvAmount.toString(), partialSolSweep: true }
      : {}),
  };
}
