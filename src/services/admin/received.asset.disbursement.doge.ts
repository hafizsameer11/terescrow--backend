import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import cryptoLogger from '../../utils/crypto.logger';
import {
  getUtxoAddressBalance,
  estimateUtxoTxFee,
  sendUtxoFromAddress,
} from '../utxo/utxo.tatum.service';
import type { DecryptFn } from './received.asset.disbursement.helpers';

/** Floor aligned with `estimateUtxoTxFee` fallback for dogecoin. */
const DOGE_MIN_FEE = new Decimal('1');

export async function executeDogeVendorDisbursement(params: {
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

  const onChain = new Decimal(await getUtxoAddressBalance('dogecoin', depositAddress));
  if (onChain.lessThan(recvAmount)) {
    throw ApiError.badRequest(
      `Insufficient on-chain DOGE. Available: ${onChain.toString()}, required: ${recvAmount.toString()}`
    );
  }

  const feeDoge = await estimateUtxoTxFee('dogecoin');
  const totalFee = Decimal.max(feeDoge, DOGE_MIN_FEE);
  const netToVendor = recvAmount.minus(totalFee);

  if (!netToVendor.isFinite() || netToVendor.lte(0)) {
    throw ApiError.badRequest(
      `Receive amount too small to cover Dogecoin network fee (${totalFee.toString()} DOGE).`
    );
  }

  const amountUsd = netToVendor.mul(cryptoPrice);

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
    },
  });

  let txHash: string;
  try {
    txHash = await sendUtxoFromAddress({
      chain: 'dogecoin',
      fromAddress: depositAddress,
      fromPrivateKey: pk,
      toAddress,
      value: netToVendor.toString(),
      fee: totalFee.toString(),
      changeAddress: depositAddress,
    });
  } catch (e: any) {
    await prisma.receivedAssetDisbursement.update({
      where: { id: pending.id },
      data: { status: 'failed', notes: e?.message?.slice(0, 2000) ?? 'chain error' },
    });
    cryptoLogger.exception('DOGE vendor disbursement failed', e, { receiveTransactionId });
    throw ApiError.internal(e?.message || 'Dogecoin transfer failed');
  }

  const balanceAfter = onChain.minus(recvAmount);

  try {
    await prisma.$transaction(async (db) => {
      await db.receivedAssetDisbursement.update({
        where: { id: pending.id },
        data: {
          status: 'successful',
          txHash,
          networkFee: totalFee,
        },
      });
      await db.virtualAccount.update({
        where: { id: virtualAccount.id },
        data: {
          availableBalance: balanceAfter.toString(),
          accountBalance: balanceAfter.toString(),
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
    cryptoLogger.exception('DB update after DOGE disbursement', e, { txHash, pendingId: pending.id });
    throw ApiError.internal('Transfer submitted but ledger update failed; reconcile using tx hash');
  }

  cryptoLogger.transaction('ADMIN_RECEIVED_ASSET_VENDOR', {
    receiveTransactionId,
    disbursementId: pending.id,
    adminUserId,
    vendorId: vendor.id ?? null,
    txHash,
    amount: netToVendor.toString(),
    chain: 'dogecoin',
  });

  return {
    disbursementId: pending.id,
    txHash,
    amount: netToVendor.toString(),
    amountUsd: amountUsd.toString(),
    toAddress,
    vendorId: vendor.id ?? null,
    networkFee: totalFee.toString(),
  };
}
