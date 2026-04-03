import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import cryptoLogger from '../../utils/crypto.logger';
import {
  getTronTrxBalance,
  getTronTrc20Balance,
  sendTronTrx,
  sendTronTrc20,
} from '../tron/tron.tatum.service';
import type { DecryptFn } from './received.asset.disbursement.helpers';

const MIN_TRX_FOR_TRC20 = new Decimal('25');
const NATIVE_TRX_FEE_RESERVE = new Decimal('3');

export async function executeTronVendorDisbursement(params: {
  tx: { id: number; userId: number; blockchain: string; currency: string };
  recv: { txHash: string };
  receivedAsset: { id: number } | null;
  vendor: { id: number | null; walletAddress: string };
  disbursementType?: string;
  /** Default `sentToVendor`; use `transferredToMaster` for master-wallet destination. */
  receivedAssetNextStatus?: string;
  virtualAccount: {
    id: number;
    depositAddresses: Array<{ address: string; privateKey: string | null }>;
    walletCurrency: {
      contractAddress: string | null;
      decimals: number | null;
      price: unknown;
    } | null;
  };
  recvAmount: Decimal;
  baseSymbol: string;
  adminUserId: number;
  receiveTransactionId: string;
  decryptPrivateKey: DecryptFn;
  isNativeAsset: boolean;
}): Promise<{
  disbursementId: number;
  txHash: string;
  amount: string;
  amountUsd: string;
  toAddress: string;
  vendorId: number | null;
  networkFee: string;
  gasFundingTxHash?: string;
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
    isNativeAsset,
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
  if (pk.startsWith('0x')) pk = pk.substring(2).trim();
  if (pk.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(pk)) {
    throw ApiError.internal('Invalid Tron deposit private key format');
  }

  let gasFundingTxHash: string | undefined;

  if (isNativeAsset) {
    const trxBal = new Decimal(await getTronTrxBalance(depositAddress));
    if (trxBal.lessThan(recvAmount)) {
      throw ApiError.badRequest(
        `Insufficient TRX on chain. Have ${trxBal.toString()}, need ${recvAmount.toString()}`
      );
    }

    const gasReserve = NATIVE_TRX_FEE_RESERVE;
    const netToVendor = recvAmount.minus(gasReserve);
    if (netToVendor.lte(0)) {
      throw ApiError.badRequest('Receive amount too small to cover network fee (TRX reserve)');
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
      txHash = await sendTronTrx({
        to: toAddress,
        amountTrx: netToVendor.toString(),
        fromPrivateKey: pk,
      });
    } catch (e: any) {
      await prisma.receivedAssetDisbursement.update({
        where: { id: pending.id },
        data: { status: 'failed', notes: e?.message?.slice(0, 2000) ?? 'chain error' },
      });
      throw ApiError.internal(e?.message || 'Tron transfer failed');
    }

    const balanceAfter = trxBal.minus(recvAmount);

    await finalizeTronDb(
      pending.id,
      txHash,
      gasReserve,
      virtualAccount.id,
      balanceAfter,
      receivedAsset?.id,
      receivedAssetNextStatus
    );

    return {
      disbursementId: pending.id,
      txHash,
      amount: netToVendor.toString(),
      amountUsd: amountUsd.toString(),
      toAddress,
      vendorId: vendor.id ?? null,
      networkFee: gasReserve.toString(),
    };
  }

  // TRC20 USDT
  if (!wc.contractAddress) {
    throw ApiError.internal('TRC20 contract address not configured');
  }
  const decimals = wc.decimals ?? 6;

  const tokenBalStr = await getTronTrc20Balance(depositAddress, wc.contractAddress, decimals);
  const tokenBal = new Decimal(tokenBalStr);
  if (tokenBal.lessThan(recvAmount)) {
    throw ApiError.badRequest(
      `Insufficient USDT on chain. Have ${tokenBal.toString()}, need ${recvAmount.toString()}`
    );
  }

  let trxBal = new Decimal(await getTronTrxBalance(depositAddress));
  if (trxBal.lessThan(MIN_TRX_FOR_TRC20)) {
    const shortfall = MIN_TRX_FOR_TRC20.minus(trxBal);
    const trxToSend = shortfall.plus(new Decimal('2'));

    const masterWallet = await prisma.masterWallet.findUnique({
      where: { blockchain: 'tron' },
    });
    if (!masterWallet?.address || !masterWallet.privateKey) {
      throw ApiError.internal('Master wallet for Tron not configured; cannot fund TRX for gas');
    }

    let mpk = decryptPrivateKey(masterWallet.privateKey);
    mpk = mpk.trim();
    if (mpk.startsWith('0x')) mpk = mpk.substring(2).trim();

    let topHash: string;
    try {
      topHash = await sendTronTrx({
        to: depositAddress,
        amountTrx: trxToSend.toString(),
        fromPrivateKey: mpk,
      });
    } catch (e: any) {
      throw ApiError.internal(e?.message || 'Master TRX top-up failed');
    }
    gasFundingTxHash = topHash;

    await prisma.masterWalletTransaction.create({
      data: {
        walletId: 'tercescrow',
        type: 'gas_topup_vendor_disbursement',
        assetSymbol: 'TRX',
        amount: trxToSend,
        toAddress: depositAddress,
        txHash: topHash,
        status: 'successful',
      },
    });

    let ok = false;
    for (let i = 0; i < 12 && !ok; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 3000));
      trxBal = new Decimal(await getTronTrxBalance(depositAddress));
      if (trxBal.gte(MIN_TRX_FOR_TRC20)) ok = true;
    }
    if (!ok) {
      throw ApiError.internal(`TRX top-up (${topHash}) not confirmed in time; retry disbursement`);
    }
  }

  const amountUsdFull = recvAmount.mul(cryptoPrice);
  const feeReserve = new Decimal('0');

  const pending = await prisma.receivedAssetDisbursement.create({
    data: {
      cryptoTransactionId: tx.id,
      receivedAssetId: receivedAsset?.id ?? null,
      sourceDepositTxHash: recv.txHash,
      disbursementType,
      vendorId: vendor.id ?? null,
      toAddress,
      amount: recvAmount,
      currency: baseSymbol,
      blockchain: tx.blockchain,
      amountUsd: amountUsdFull,
      status: 'pending',
      adminUserId,
    },
  });

  let txHash: string;
  try {
    txHash = await sendTronTrc20({
      to: toAddress,
      amount: recvAmount.toString(),
      contractAddress: wc.contractAddress,
      fromPrivateKey: pk,
      feeLimitTrx: 80,
    });
  } catch (e: any) {
    await prisma.receivedAssetDisbursement.update({
      where: { id: pending.id },
      data: { status: 'failed', notes: e?.message?.slice(0, 2000) ?? 'chain error' },
    });
    throw ApiError.internal(e?.message || 'Tron TRC20 transfer failed');
  }

  const balanceAfter = tokenBal.minus(recvAmount);

  await finalizeTronDb(
    pending.id,
    txHash,
    feeReserve,
    virtualAccount.id,
    balanceAfter,
    receivedAsset?.id,
    receivedAssetNextStatus
  );

  cryptoLogger.transaction('ADMIN_RECEIVED_ASSET_VENDOR', {
    receiveTransactionId,
    disbursementId: pending.id,
    vendorId: vendor.id ?? null,
    txHash,
    chain: 'tron',
  });

  return {
    disbursementId: pending.id,
    txHash,
    amount: recvAmount.toString(),
    amountUsd: amountUsdFull.toString(),
    toAddress,
    vendorId: vendor.id ?? null,
    networkFee: feeReserve.toString(),
    ...(gasFundingTxHash ? { gasFundingTxHash } : {}),
  };
}

async function finalizeTronDb(
  pendingId: number,
  txHash: string,
  networkFee: Decimal,
  virtualAccountId: number,
  balanceAfter: Decimal,
  receivedAssetId: number | null | undefined,
  receivedAssetNextStatus: string = 'sentToVendor'
) {
  await prisma.$transaction(async (db) => {
    await db.receivedAssetDisbursement.update({
      where: { id: pendingId },
      data: {
        status: 'successful',
        txHash,
        networkFee: networkFee.gt(0) ? networkFee : null,
      },
    });
    await db.virtualAccount.update({
      where: { id: virtualAccountId },
      data: {
        availableBalance: balanceAfter.toString(),
        accountBalance: balanceAfter.toString(),
      },
    });
    if (receivedAssetId) {
      await db.receivedAsset.update({
        where: { id: receivedAssetId },
        data: { status: receivedAssetNextStatus },
      });
    }
  });
}
