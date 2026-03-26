import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import cryptoLogger from '../../utils/crypto.logger';
import {
  getBitcoinAddressBalanceBtc,
  estimateBitcoinTxFeeBtc,
  sendBitcoinFromAddress,
} from '../bitcoin/bitcoin.tatum.service';
import type { DecryptFn } from './received.asset.disbursement.helpers';

export async function executeBtcVendorDisbursement(params: {
  tx: any;
  recv: any;
  receivedAsset: { id: number } | null;
  vendor: { id: number; walletAddress: string };
  virtualAccount: any;
  recvAmount: Decimal;
  baseSymbol: string;
  adminUserId: number;
  receiveTransactionId: string;
  decryptPrivateKey: DecryptFn;
}): Promise<{
  disbursementId: number;
  txHash: string;
  amount: string;
  amountUsd: string;
  toAddress: string;
  vendorId: number;
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

  const onChain = new Decimal(await getBitcoinAddressBalanceBtc(depositAddress));
  if (onChain.lessThan(recvAmount)) {
    throw ApiError.badRequest(
      `Insufficient on-chain BTC. Available: ${onChain.toString()}, required: ${recvAmount.toString()}`
    );
  }

  const feeBtc = await estimateBitcoinTxFeeBtc();
  const totalFee = Decimal.max(feeBtc, new Decimal('0.000015'));
  const netToVendor = recvAmount.minus(totalFee);

  if (!netToVendor.isFinite() || netToVendor.lte(0)) {
    throw ApiError.badRequest(
      `Receive amount too small to cover Bitcoin network fee (${totalFee.toString()} BTC).`
    );
  }

  const amountUsd = netToVendor.mul(cryptoPrice);

  const pending = await prisma.receivedAssetDisbursement.create({
    data: {
      cryptoTransactionId: tx.id,
      receivedAssetId: receivedAsset?.id ?? null,
      sourceDepositTxHash: recv.txHash,
      disbursementType: 'vendor',
      vendorId: vendor.id,
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
    txHash = await sendBitcoinFromAddress({
      fromAddress: depositAddress,
      fromPrivateKey: pk,
      toAddress,
      valueBtc: netToVendor.toString(),
      feeBtc: totalFee.toString(),
      changeAddress: depositAddress,
    });
  } catch (e: any) {
    await prisma.receivedAssetDisbursement.update({
      where: { id: pending.id },
      data: { status: 'failed', notes: e?.message?.slice(0, 2000) ?? 'chain error' },
    });
    cryptoLogger.exception('BTC vendor disbursement failed', e, { receiveTransactionId });
    throw ApiError.internal(e?.message || 'Bitcoin transfer failed');
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
          data: { status: 'sentToVendor' },
        });
      }
    });
  } catch (e: any) {
    cryptoLogger.exception('DB update after BTC disbursement', e, { txHash, pendingId: pending.id });
    throw ApiError.internal('Transfer submitted but ledger update failed; reconcile using tx hash');
  }

  cryptoLogger.transaction('ADMIN_RECEIVED_ASSET_VENDOR', {
    receiveTransactionId,
    disbursementId: pending.id,
    adminUserId,
    vendorId: vendor.id,
    txHash,
    amount: netToVendor.toString(),
    chain: 'bitcoin',
  });

  return {
    disbursementId: pending.id,
    txHash,
    amount: netToVendor.toString(),
    amountUsd: amountUsd.toString(),
    toAddress,
    vendorId: vendor.id,
    networkFee: totalFee.toString(),
  };
}
