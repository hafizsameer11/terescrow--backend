import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { getOnChainBalance } from '../crypto/virtual.account.balance.helper';
import { fetchOnChainTokenBalance } from '../crypto/onchain.balance.service';
import {
  extractBaseSymbol,
  normalizeBlockchain,
  isValidEvmAddress,
  isValidTronAddress,
  isNativeAssetForChain,
} from './received.asset.disbursement.helpers';
import { getTronTrxBalance, getTronTrc20Balance, sendTronTrx, sendTronTrc20 } from '../tron/tron.tatum.service';
import { trc20GasConfigForAsset } from '../tron/tron.gas.config';
import { sendEvmTatumTransaction, type EvmTatumPath } from '../tatum/evm.tatum.transaction.service';
import { getEvmFungibleTokenBalance, getEvmNativeBalance } from '../tatum/evm.tatum.balance.service';

const SUPPORTED_BASE = new Set(['ETH', 'USDT', 'BNB', 'TRX', 'MATIC', 'BTC', 'LTC', 'DOGE', 'SOL']);
const MIN_SURPLUS = new Decimal('0.000001');

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

function normalizeDepositPrivateKey(raw: string): string {
  let pk = raw.trim();
  if (pk.startsWith('0x')) pk = pk.substring(2).trim();
  if (pk.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(pk)) {
    throw ApiError.internal('Invalid deposit private key format');
  }
  return pk;
}

export interface TransferOnChainSurplusParams {
  userId: number;
  currency: string;
  blockchain: string;
  toAddress: string;
  amount?: string;
}

export interface TransferOnChainSurplusResult {
  txHash: string;
  amount: string;
  toAddress: string;
  surplusAmount: string;
  liveBalance: string;
  recordedOnChain: string;
  gasFundingTxHash?: string;
}

function resolveBaseSymbol(currency: string, chainNorm: string, walletCurrency: { currency?: string | null; isToken?: boolean | null } | null): string {
  let baseSymbol = extractBaseSymbol(currency);
  if (chainNorm === 'tron' && walletCurrency?.currency) {
    const wcSym = extractBaseSymbol(walletCurrency.currency);
    const txSym = baseSymbol;
    if (!SUPPORTED_BASE.has(txSym) || txSym === 'TRON' || txSym === 'TRC20') {
      if (SUPPORTED_BASE.has(wcSym)) baseSymbol = wcSym;
    } else if (txSym === 'TRX' && walletCurrency.isToken === true && wcSym === 'USDT') {
      baseSymbol = 'USDT';
    }
  }
  if (chainNorm === 'tron' && baseSymbol === 'TRON') baseSymbol = 'TRX';
  return baseSymbol;
}

function validateDestination(chainNorm: string, toAddress: string) {
  const addr = toAddress.trim();
  if (chainNorm === 'tron') {
    if (!isValidTronAddress(addr)) throw ApiError.badRequest('Invalid Tron destination address');
    return;
  }
  if (['ethereum', 'bsc', 'polygon'].includes(chainNorm)) {
    if (!isValidEvmAddress(addr)) throw ApiError.badRequest('Invalid EVM destination address');
    return;
  }
  throw ApiError.badRequest(`Surplus transfer not supported for ${chainNorm} yet`);
}

async function fundTronGasIfNeeded(
  depositAddress: string,
  baseSymbol: string,
  decryptFn: (s: string) => string
): Promise<string | undefined> {
  const gasCfg = trc20GasConfigForAsset(baseSymbol);
  const targetTrx = gasCfg.targetTrxOnDeposit;
  let trxBal = new Decimal(await getTronTrxBalance(depositAddress));
  if (trxBal.gte(targetTrx)) return undefined;

  const shortfall = targetTrx.minus(trxBal);
  const trxToSend = shortfall.plus(gasCfg.topUpBufferTrx);
  const masterWallet = await prisma.masterWallet.findUnique({ where: { blockchain: 'tron' } });
  if (!masterWallet?.address || !masterWallet.privateKey) {
    throw ApiError.internal('Master wallet for Tron not configured; cannot fund TRX for gas');
  }
  const mpk = normalizeDepositPrivateKey(decryptFn(masterWallet.privateKey));
  const topHash = await sendTronTrx({
    to: depositAddress,
    amountTrx: trxToSend.toString(),
    fromPrivateKey: mpk,
  });

  let ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 3000));
    trxBal = new Decimal(await getTronTrxBalance(depositAddress));
    if (trxBal.gte(targetTrx)) ok = true;
  }
  if (!ok) {
    throw ApiError.internal(`TRX top-up (${topHash}) not confirmed in time; retry transfer`);
  }
  return topHash;
}

async function executeTronSurplus(params: {
  depositAddress: string;
  depositPrivateKey: string;
  toAddress: string;
  amount: Decimal;
  baseSymbol: string;
  isNative: boolean;
  walletCurrency: { contractAddress: string | null; decimals: number | null } | null;
}): Promise<{ txHash: string; gasFundingTxHash?: string }> {
  const pk = normalizeDepositPrivateKey(params.depositPrivateKey);
  const toAddress = params.toAddress.trim();

  if (params.isNative) {
    const trxBal = new Decimal(await getTronTrxBalance(params.depositAddress));
    if (trxBal.lessThan(params.amount)) {
      throw ApiError.badRequest(
        `Insufficient TRX on deposit address. Have ${trxBal.toString()}, need ${params.amount.toString()}`
      );
    }
    const gasReserve = new Decimal('3');
    const net = params.amount.minus(gasReserve);
    if (net.lte(0)) throw ApiError.badRequest('Amount too small to cover TRX network fee reserve');
    const txHash = await sendTronTrx({ to: toAddress, amountTrx: net.toString(), fromPrivateKey: pk });
    return { txHash };
  }

  if (!params.walletCurrency?.contractAddress) {
    throw ApiError.internal('TRC20 contract address not configured');
  }
  const tokenBal = new Decimal(
    await getTronTrc20Balance(
      params.depositAddress,
      params.walletCurrency.contractAddress,
      params.walletCurrency.decimals ?? 6
    )
  );
  if (tokenBal.lessThan(params.amount)) {
    throw ApiError.badRequest(
      `Insufficient token on deposit address. Have ${tokenBal.toString()}, need ${params.amount.toString()}`
    );
  }
  const gasCfg = trc20GasConfigForAsset(params.baseSymbol);
  const gasFundingTxHash = await fundTronGasIfNeeded(params.depositAddress, params.baseSymbol, decryptPrivateKey);
  const txHash = await sendTronTrc20({
    to: toAddress,
    amount: params.amount.toString(),
    contractAddress: params.walletCurrency.contractAddress,
    fromPrivateKey: pk,
    feeLimitTrx: gasCfg.feeLimitTrx,
  });
  return { txHash, gasFundingTxHash };
}

async function executeEvmSurplus(params: {
  evmPath: EvmTatumPath;
  gasChain: 'ETH' | 'BSC' | 'MATIC';
  nativeCurrencySymbol: 'ETH' | 'BNB' | 'MATIC';
  depositAddress: string;
  depositPrivateKey: string;
  toAddress: string;
  amount: Decimal;
  baseSymbol: string;
  isNative: boolean;
  walletCurrency: { contractAddress: string | null; decimals: number | null } | null;
}): Promise<{ txHash: string; gasFundingTxHash?: string }> {
  const pk = normalizeDepositPrivateKey(params.depositPrivateKey);
  const toAddress = params.toAddress.trim();
  const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');

  if (params.isNative) {
    const nativeBal = new Decimal(await getEvmNativeBalance(params.evmPath, params.depositAddress, false));
    if (nativeBal.lessThan(params.amount)) {
      throw ApiError.badRequest(`Insufficient ${params.nativeCurrencySymbol} on deposit address`);
    }
    const gasEstimate = await ethereumGasService.estimateGasFeeForChain(
      params.gasChain,
      params.depositAddress,
      toAddress,
      params.amount.toString(),
      false
    );
    let gasLimit = Math.ceil(parseInt(gasEstimate.gasLimit, 10) * 1.1);
    gasLimit = Math.max(gasLimit, 21000);
    const gasFeeNative = new Decimal(
      ethereumGasService.calculateTotalFee(gasLimit.toString(), gasEstimate.gasPrice)
    );
    const buffer =
      params.evmPath === 'bsc' || params.evmPath === 'polygon'
        ? Decimal.max(gasFeeNative.mul(new Decimal('0.2')), new Decimal('0.00001'))
        : Decimal.max(gasFeeNative.mul(new Decimal('0.2')), new Decimal('0.0001'));
    const net = params.amount.minus(gasFeeNative.plus(buffer));
    if (net.lte(0)) throw ApiError.badRequest('Amount too small after network fee reserve');
    const txHash = await sendEvmTatumTransaction({
      evmPath: params.evmPath,
      to: toAddress,
      amount: net.toString(),
      fromPrivateKey: pk,
      currency: params.nativeCurrencySymbol,
    });
    return { txHash };
  }

  if (!params.walletCurrency?.contractAddress) {
    throw ApiError.internal(`${params.baseSymbol} contract address not configured`);
  }
  const tokenBal = new Decimal(
    await getEvmFungibleTokenBalance(
      params.evmPath,
      params.walletCurrency.contractAddress,
      params.depositAddress,
      false
    )
  );
  if (tokenBal.lessThan(params.amount)) {
    throw ApiError.badRequest(`Insufficient token on deposit address. Have ${tokenBal.toString()}`);
  }

  let nativeForGas = new Decimal(await getEvmNativeBalance(params.evmPath, params.depositAddress, false));
  const gasEstimate = await ethereumGasService.estimateGasFeeForChain(
    params.gasChain,
    params.depositAddress,
    toAddress,
    params.amount.toString(),
    false
  );
  let gasLimit = Math.ceil(parseInt(gasEstimate.gasLimit, 10) * 1.2);
  gasLimit = Math.max(gasLimit, 65000);
  const gasFeeNative = new Decimal(
    ethereumGasService.calculateTotalFee(gasLimit.toString(), gasEstimate.gasPrice)
  );
  const minimumNative = gasFeeNative.plus(Decimal.max(gasFeeNative.mul(new Decimal('0.5')), new Decimal('0.0001')));

  let gasFundingTxHash: string | undefined;
  if (nativeForGas.lessThan(minimumNative)) {
    const nativeToDeposit = minimumNative.minus(nativeForGas).plus(new Decimal('0.0001'));
    const masterBlockchain =
      params.evmPath === 'ethereum' ? 'ethereum' : params.evmPath === 'bsc' ? 'bsc' : 'polygon';
    const masterWallet = await prisma.masterWallet.findUnique({ where: { blockchain: masterBlockchain } });
    if (!masterWallet?.address || !masterWallet.privateKey) {
      throw ApiError.internal(`Master wallet for ${masterBlockchain} not configured`);
    }
    const masterPk = normalizeDepositPrivateKey(decryptPrivateKey(masterWallet.privateKey));
    gasFundingTxHash = await sendEvmTatumTransaction({
      evmPath: params.evmPath,
      to: params.depositAddress,
      amount: nativeToDeposit.toString(),
      fromPrivateKey: masterPk,
      currency: params.nativeCurrencySymbol,
    });
    for (let i = 0; i < 12; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 3000));
      nativeForGas = new Decimal(await getEvmNativeBalance(params.evmPath, params.depositAddress, false));
      if (nativeForGas.gte(minimumNative)) break;
      if (i === 11) {
        throw ApiError.internal(`Gas top-up (${gasFundingTxHash}) not confirmed in time; retry transfer`);
      }
    }
  }

  const txHash = await sendEvmTatumTransaction({
    evmPath: params.evmPath,
    to: toAddress,
    amount: params.amount.toString(),
    fromPrivateKey: pk,
    currency: params.baseSymbol,
    gasPriceGwei: ethereumGasService.weiToGwei(gasEstimate.gasPrice),
    gasLimit: gasLimit.toString(),
  });
  return { txHash, gasFundingTxHash };
}

export async function transferOnChainSurplus(
  params: TransferOnChainSurplusParams
): Promise<TransferOnChainSurplusResult> {
  const { userId, currency, blockchain, toAddress } = params;
  if (!toAddress?.trim()) throw ApiError.badRequest('Destination address is required');

  const chainNorm = normalizeBlockchain(blockchain);
  validateDestination(chainNorm, toAddress);

  const va = await prisma.virtualAccount.findFirst({
    where: { userId, currency, blockchain },
    include: {
      depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
      walletCurrency: true,
    },
  });
  if (!va) throw ApiError.notFound('Wallet asset not found for this user');
  const deposit = va.depositAddresses[0];
  if (!deposit?.address || !deposit.privateKey) {
    throw ApiError.badRequest('No deposit address available for this asset');
  }

  const wc = va.walletCurrency;
  const isTronUsdt =
    (chainNorm === 'tron') &&
    (currency.toUpperCase().includes('USDT') || wc?.isToken === true);
  const liveStr = await fetchOnChainTokenBalance({
    blockchain,
    address: deposit.address,
    contractAddress: wc?.contractAddress ?? (isTronUsdt ? 'USDT_TRON' : undefined),
    decimals: wc?.decimals ?? (isTronUsdt ? 6 : undefined),
    isToken: wc?.isToken ?? isTronUsdt,
  });
  const live = new Decimal(liveStr || '0');
  const recorded = getOnChainBalance(va);
  const surplus = live.minus(recorded);

  if (!surplus.gt(MIN_SURPLUS)) {
    throw ApiError.badRequest(
      `No transferable surplus. Live: ${live.toString()}, recorded on-chain: ${recorded.toString()}`
    );
  }

  let transferAmount =
    params.amount != null && String(params.amount).trim() !== ''
      ? new Decimal(String(params.amount).trim())
      : surplus;

  if (!transferAmount.isFinite() || transferAmount.lte(0)) {
    throw ApiError.badRequest('amount must be a positive number');
  }
  if (transferAmount.gt(surplus.plus(MIN_SURPLUS))) {
    throw ApiError.badRequest(
      `Amount exceeds surplus (${surplus.toString()}). This transfer does not update the system ledger.`
    );
  }
  if (transferAmount.gt(live)) {
    throw ApiError.badRequest(`Amount exceeds live balance at deposit address (${live.toString()})`);
  }

  const baseSymbol = resolveBaseSymbol(currency, chainNorm, wc);
  if (!SUPPORTED_BASE.has(baseSymbol)) {
    throw ApiError.badRequest(`Unsupported asset: ${baseSymbol}`);
  }
  const isNative = isNativeAssetForChain(baseSymbol, chainNorm, wc?.isToken);
  const depositPrivateKey = decryptPrivateKey(deposit.privateKey);

  let txHash: string;
  let gasFundingTxHash: string | undefined;

  if (chainNorm === 'tron') {
    ({ txHash, gasFundingTxHash } = await executeTronSurplus({
      depositAddress: deposit.address,
      depositPrivateKey,
      toAddress,
      amount: transferAmount,
      baseSymbol,
      isNative,
      walletCurrency: wc,
    }));
  } else if (chainNorm === 'ethereum' || chainNorm === 'bsc' || chainNorm === 'polygon') {
    const evmPath: EvmTatumPath =
      chainNorm === 'bsc' ? 'bsc' : chainNorm === 'polygon' ? 'polygon' : 'ethereum';
    const gasChain: 'ETH' | 'BSC' | 'MATIC' =
      chainNorm === 'bsc' ? 'BSC' : chainNorm === 'polygon' ? 'MATIC' : 'ETH';
    const nativeCurrencySymbol: 'ETH' | 'BNB' | 'MATIC' =
      chainNorm === 'bsc' ? 'BNB' : chainNorm === 'polygon' ? 'MATIC' : 'ETH';
    ({ txHash, gasFundingTxHash } = await executeEvmSurplus({
      evmPath,
      gasChain,
      nativeCurrencySymbol,
      depositAddress: deposit.address,
      depositPrivateKey,
      toAddress,
      amount: transferAmount,
      baseSymbol,
      isNative,
      walletCurrency: wc,
    }));
  } else {
    throw ApiError.badRequest(`Surplus transfer not supported for ${blockchain} yet`);
  }

  return {
    txHash,
    amount: transferAmount.toString(),
    toAddress: toAddress.trim(),
    surplusAmount: surplus.toString(),
    liveBalance: live.toString(),
    recordedOnChain: recorded.toString(),
    ...(gasFundingTxHash ? { gasFundingTxHash } : {}),
  };
}
