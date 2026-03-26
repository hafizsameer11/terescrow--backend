import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import cryptoLogger from '../../utils/crypto.logger';
import { sendEvmTatumTransaction, type EvmTatumPath } from '../tatum/evm.tatum.transaction.service';
import { getEvmFungibleTokenBalance, getEvmNativeBalance } from '../tatum/evm.tatum.balance.service';
import type { DecryptFn } from './received.asset.disbursement.helpers';

export async function executeEvmVendorDisbursement(params: {
  evmPath: EvmTatumPath;
  gasChain: 'ETH' | 'BSC' | 'MATIC';
  nativeCurrencySymbol: 'ETH' | 'BNB' | 'MATIC';
  tx: any;
  recv: any;
  receivedAsset: { id: number } | null;
  vendor: { id: number | null; walletAddress: string };
  virtualAccount: any;
  recvAmount: Decimal;
  baseSymbol: string;
  walletCurrency: any;
  adminUserId: number;
  receiveTransactionId: string;
  decryptPrivateKey: DecryptFn;
  isNativeAsset: boolean;
  /** Default `vendor`. Use `changenow` for ChangeNOW pay-in ledger rows. */
  disbursementType?: string;
  disbursementNotes?: string;
  /** Omit or set `sentToVendor` to update ReceivedAsset; `null` skips status update (e.g. partial ChangeNOW). */
  receivedAssetStatusOnSuccess?: string | null;
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
    evmPath,
    gasChain,
    nativeCurrencySymbol,
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
    decryptPrivateKey,
    isNativeAsset,
    disbursementType = 'vendor',
    disbursementNotes,
    receivedAssetStatusOnSuccess,
  } = params;

  const toAddress = vendor.walletAddress.trim();
  const depositAddressRecord = virtualAccount.depositAddresses[0];
  if (!depositAddressRecord?.privateKey) {
    throw ApiError.internal('Deposit address or private key not found');
  }
  const depositAddress = depositAddressRecord.address;

  if (!walletCurrency?.price) {
    throw ApiError.internal(`Currency ${baseSymbol} price not configured`);
  }
  const cryptoPrice = new Decimal(walletCurrency.price.toString());

  const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');

  let userPrivateKey = decryptPrivateKey(depositAddressRecord.privateKey);
  userPrivateKey = userPrivateKey.trim();
  if (userPrivateKey.startsWith('0x')) {
    userPrivateKey = userPrivateKey.substring(2).trim();
  }
  if (userPrivateKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(userPrivateKey)) {
    throw ApiError.internal('Invalid deposit address private key format');
  }

  let gasFundingTxHash: string | undefined;
  let txHash: string;
  let amountSentToVendor: Decimal;
  let gasFeeForLedger: Decimal;
  let onChainBalanceBefore: Decimal;
  let tokenBalanceAfter: Decimal | null = null;

  if (isNativeAsset) {
    const nativeBalStr = await getEvmNativeBalance(evmPath, depositAddress, false);
    onChainBalanceBefore = new Decimal(nativeBalStr);
    if (onChainBalanceBefore.lessThan(recvAmount)) {
      throw ApiError.badRequest(
        `Insufficient on-chain ${nativeCurrencySymbol} balance. ` +
          `Have ${onChainBalanceBefore.toString()}, need ${recvAmount.toString()}`
      );
    }

    const gasEstimate = await ethereumGasService.estimateGasFeeForChain(
      gasChain,
      depositAddress,
      toAddress,
      recvAmount.toString(),
      false
    );
    let gasLimit = Math.ceil(parseInt(gasEstimate.gasLimit, 10) * 1.1);
    gasLimit = Math.max(gasLimit, 21000);
    const gasPriceWei = gasEstimate.gasPrice;
    const gasFeeNative = new Decimal(ethereumGasService.calculateTotalFee(gasLimit.toString(), gasPriceWei));
    const minBuffer =
      evmPath === 'bsc' || evmPath === 'polygon'
        ? Decimal.max(gasFeeNative.mul(new Decimal('0.2')), new Decimal('0.00001'))
        : Decimal.max(gasFeeNative.mul(new Decimal('0.2')), new Decimal('0.0001'));
    const totalReserve = gasFeeNative.plus(minBuffer);
    const netToVendor = recvAmount.minus(totalReserve);
    if (!netToVendor.isFinite() || netToVendor.lte(0)) {
      throw ApiError.badRequest(
        `Receive amount is too small to cover network fees after deducting gas (${totalReserve.toString()} ${nativeCurrencySymbol})`
      );
    }

    amountSentToVendor = netToVendor;
    gasFeeForLedger = totalReserve;

    const amountUsd = amountSentToVendor.mul(cryptoPrice);

    const pending = await prisma.receivedAssetDisbursement.create({
      data: {
        cryptoTransactionId: tx.id,
        receivedAssetId: receivedAsset?.id ?? null,
        sourceDepositTxHash: recv.txHash,
        disbursementType,
        vendorId: vendor.id,
        toAddress,
        amount: amountSentToVendor,
        currency: baseSymbol,
        blockchain: tx.blockchain,
        amountUsd,
        status: 'pending',
        adminUserId,
        notes: disbursementNotes ?? null,
      },
    });

    try {
      txHash = await sendEvmTatumTransaction({
        evmPath,
        to: toAddress,
        amount: amountSentToVendor.toString(),
        currency: nativeCurrencySymbol,
        fromPrivateKey: userPrivateKey,
        gasPriceGwei: ethereumGasService.weiToGwei(gasPriceWei),
        gasLimit: gasLimit.toString(),
        testnet: false,
      });
    } catch (e: any) {
      await prisma.receivedAssetDisbursement.update({
        where: { id: pending.id },
        data: { status: 'failed', notes: e?.message?.slice(0, 2000) ?? 'chain error' },
      });
      throw ApiError.internal(e?.message || 'Blockchain transfer failed');
    }

    const balanceAfter = onChainBalanceBefore.minus(recvAmount);

    await finalizeDisbursementDb({
      pendingId: pending.id,
      txHash,
      networkFee: gasFeeForLedger,
      virtualAccountId: virtualAccount.id,
      balanceAfter,
      receivedAssetId: receivedAsset?.id ?? null,
      receivedAssetNextStatus:
        receivedAssetStatusOnSuccess === undefined ? 'sentToVendor' : receivedAssetStatusOnSuccess,
    });

    cryptoLogger.transaction('ADMIN_RECEIVED_ASSET_VENDOR', {
      receiveTransactionId,
      disbursementId: pending.id,
      adminUserId,
      vendorId: vendor.id,
      txHash,
      amount: amountSentToVendor.toString(),
      fromDeposit: depositAddress,
      toAddress,
      evmPath,
      native: true,
      disbursementType,
    });

    return {
      disbursementId: pending.id,
      txHash,
      amount: amountSentToVendor.toString(),
      amountUsd: amountUsd.toString(),
      toAddress,
      vendorId: vendor.id,
      networkFee: gasFeeForLedger.toString(),
    };
  }

  // --- Token (e.g. USDT) path: full token amount, fund native gas from master if needed ---
  if (!walletCurrency.contractAddress) {
    throw ApiError.internal(`${baseSymbol} contract address not configured on wallet currency`);
  }

  const tokenBalStr = await getEvmFungibleTokenBalance(
    evmPath,
    walletCurrency.contractAddress,
    depositAddress,
    false
  );
  onChainBalanceBefore = new Decimal(tokenBalStr);
  if (onChainBalanceBefore.lessThan(recvAmount)) {
    throw ApiError.badRequest(
      `Insufficient on-chain token balance. Available: ${onChainBalanceBefore.toString()}, required: ${recvAmount.toString()}`
    );
  }

  let nativeForGas = new Decimal(await getEvmNativeBalance(evmPath, depositAddress, false));

  let gasLimitTok = Math.ceil(65000 * 1.2);
  const gasEstimate = await ethereumGasService.estimateGasFeeForChain(
    gasChain,
    depositAddress,
    toAddress,
    recvAmount.toString(),
    false
  );
  gasLimitTok = Math.ceil(parseInt(gasEstimate.gasLimit, 10) * 1.2);
  gasLimitTok = Math.max(gasLimitTok, 65000);

  const gasPriceWei = gasEstimate.gasPrice;
  const gasFeeNative = new Decimal(ethereumGasService.calculateTotalFee(gasLimitTok.toString(), gasPriceWei));
  const bufferAmount = Decimal.max(gasFeeNative.mul(new Decimal('0.5')), new Decimal('0.0001'));
  const minimumNativeNeeded = gasFeeNative.plus(bufferAmount);

  if (nativeForGas.lessThan(minimumNativeNeeded)) {
    const shortfall = minimumNativeNeeded.minus(nativeForGas);
    const nativeToDeposit = shortfall.plus(evmPath === 'bsc' ? new Decimal('0.0001') : new Decimal('0.0001'));

    const masterBlockchain =
      evmPath === 'ethereum' ? 'ethereum' : evmPath === 'bsc' ? 'bsc' : 'polygon';
    const masterWallet = await prisma.masterWallet.findUnique({
      where: { blockchain: masterBlockchain },
    });
    if (!masterWallet?.address || !masterWallet.privateKey) {
      throw ApiError.internal(
        `Master wallet for ${masterBlockchain} not configured; cannot fund gas`
      );
    }

    let masterPk = decryptPrivateKey(masterWallet.privateKey);
    masterPk = masterPk.trim();
    if (masterPk.startsWith('0x')) masterPk = masterPk.substring(2).trim();
    if (masterPk.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(masterPk)) {
      throw ApiError.internal('Invalid master wallet private key format');
    }

    const topUpGasEst = await ethereumGasService.estimateGasFeeForChain(
      gasChain,
      masterWallet.address,
      depositAddress,
      nativeToDeposit.toString(),
      false
    );
    let topUpGasLimit = Math.ceil(parseInt(topUpGasEst.gasLimit, 10) * 1.1);
    topUpGasLimit = Math.max(topUpGasLimit, 21000);
    const topUpGasFee = new Decimal(
      ethereumGasService.calculateTotalFee(topUpGasLimit.toString(), topUpGasEst.gasPrice)
    );

    const masterNativeStr = await getEvmNativeBalance(evmPath, masterWallet.address, false);
    const masterNative = new Decimal(masterNativeStr);
    const masterNeeds = nativeToDeposit.plus(topUpGasFee);
    if (masterNative.lessThan(masterNeeds)) {
      throw ApiError.badRequest(
        `Master wallet ${nativeCurrencySymbol} insufficient to fund gas on deposit. ` +
          `Need at least ${masterNeeds.toString()}, have ${masterNative.toString()}`
      );
    }

    let topUpHash: string;
    try {
      topUpHash = await sendEvmTatumTransaction({
        evmPath,
        to: depositAddress,
        amount: nativeToDeposit.toString(),
        currency: nativeCurrencySymbol,
        fromPrivateKey: masterPk,
        gasPriceGwei: ethereumGasService.weiToGwei(topUpGasEst.gasPrice),
        gasLimit: topUpGasLimit.toString(),
        testnet: false,
      });
    } catch (e: any) {
      cryptoLogger.exception('Master wallet native top-up for token disbursement failed', e, {
        receiveTransactionId,
        evmPath,
      });
      throw ApiError.internal(e?.message || 'Failed to send ETH/BNB from master for gas');
    }

    gasFundingTxHash = topUpHash;

    await prisma.masterWalletTransaction.create({
      data: {
        walletId: 'tercescrow',
        type: 'gas_topup_vendor_disbursement',
        assetSymbol: nativeCurrencySymbol,
        amount: nativeToDeposit,
        toAddress: depositAddress,
        txHash: topUpHash,
        status: 'successful',
      },
    });

    let verified = false;
    for (let attempt = 0; attempt < 12 && !verified; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
      try {
        const cur = new Decimal(await getEvmNativeBalance(evmPath, depositAddress, false));
        if (cur.gte(minimumNativeNeeded)) {
          verified = true;
          nativeForGas = cur;
        }
      } catch {
        /* retry */
      }
    }
    if (!verified) {
      throw ApiError.internal(
        `Gas top-up broadcast (${topUpHash}) but deposit native balance not ready in time; retry or verify on-chain`
      );
    }
  }

  const amountUsdFull = recvAmount.mul(cryptoPrice);
  gasFeeForLedger = gasFeeNative;

  const pending = await prisma.receivedAssetDisbursement.create({
    data: {
      cryptoTransactionId: tx.id,
      receivedAssetId: receivedAsset?.id ?? null,
      sourceDepositTxHash: recv.txHash,
      disbursementType,
      vendorId: vendor.id,
      toAddress,
      amount: recvAmount,
      currency: baseSymbol,
      blockchain: tx.blockchain,
      amountUsd: amountUsdFull,
      status: 'pending',
      adminUserId,
      notes: disbursementNotes ?? null,
    },
  });

  try {
    txHash = await sendEvmTatumTransaction({
      evmPath,
      to: toAddress,
      amount: recvAmount.toString(),
      currency: baseSymbol,
      fromPrivateKey: userPrivateKey,
      gasPriceGwei: ethereumGasService.weiToGwei(gasPriceWei),
      gasLimit: gasLimitTok.toString(),
      testnet: false,
    });
  } catch (e: any) {
    await prisma.receivedAssetDisbursement.update({
      where: { id: pending.id },
      data: { status: 'failed', notes: e?.message?.slice(0, 2000) ?? 'chain error' },
    });
    throw ApiError.internal(e?.message || 'Blockchain transfer failed');
  }

  amountSentToVendor = recvAmount;
  tokenBalanceAfter = onChainBalanceBefore.minus(recvAmount);

  await finalizeDisbursementDb({
    pendingId: pending.id,
    txHash,
    networkFee: gasFeeForLedger,
    virtualAccountId: virtualAccount.id,
    balanceAfter: tokenBalanceAfter,
    receivedAssetId: receivedAsset?.id ?? null,
    receivedAssetNextStatus:
      receivedAssetStatusOnSuccess === undefined ? 'sentToVendor' : receivedAssetStatusOnSuccess,
  });

  cryptoLogger.transaction('ADMIN_RECEIVED_ASSET_VENDOR', {
    receiveTransactionId,
    disbursementId: pending.id,
    adminUserId,
    vendorId: vendor.id,
    txHash,
    amount: amountSentToVendor.toString(),
    fromDeposit: depositAddress,
    toAddress,
    evmPath,
    disbursementType,
  });

  return {
    disbursementId: pending.id,
    txHash,
    amount: amountSentToVendor.toString(),
    amountUsd: amountUsdFull.toString(),
    toAddress,
    vendorId: vendor.id,
    networkFee: gasFeeForLedger.toString(),
    ...(gasFundingTxHash ? { gasFundingTxHash } : {}),
  };
}

async function finalizeDisbursementDb(params: {
  pendingId: number;
  txHash: string;
  networkFee: Decimal;
  virtualAccountId: number;
  balanceAfter: Decimal;
  receivedAssetId: number | null;
  /** `null` = do not update ReceivedAsset row */
  receivedAssetNextStatus?: string | null;
}) {
  const {
    pendingId,
    txHash,
    networkFee,
    virtualAccountId,
    balanceAfter,
    receivedAssetId,
    receivedAssetNextStatus,
  } = params;
  const nextRaStatus =
    receivedAssetNextStatus === undefined ? 'sentToVendor' : receivedAssetNextStatus;
  try {
    await prisma.$transaction(async (db) => {
      await db.receivedAssetDisbursement.update({
        where: { id: pendingId },
        data: {
          status: 'successful',
          txHash,
          networkFee,
        },
      });

      await db.virtualAccount.update({
        where: { id: virtualAccountId },
        data: {
          availableBalance: balanceAfter.toString(),
          accountBalance: balanceAfter.toString(),
        },
      });

      if (receivedAssetId && nextRaStatus !== null) {
        await db.receivedAsset.update({
          where: { id: receivedAssetId },
          data: { status: nextRaStatus },
        });
      }
    });
  } catch (e: any) {
    cryptoLogger.exception('DB update failed after successful vendor disbursement', e, {
      txHash,
      pendingId,
      note: 'Reconcile manually: chain transfer succeeded',
    });
    throw ApiError.internal('Transfer submitted but ledger update failed; reconcile using tx hash');
  }
}
