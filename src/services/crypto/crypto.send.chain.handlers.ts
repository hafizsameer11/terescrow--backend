/**
 * On-chain sends from the master wallet: EVM (Ethereum / BSC / Polygon via Tatum v3), Tron, UTXO.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { extractBaseSymbol } from '../admin/received.asset.disbursement.helpers';
import { sendEvmTatumTransaction, type EvmTatumPath } from '../tatum/evm.tatum.transaction.service';
import { getEvmNativeBalance, getEvmFungibleTokenBalance } from '../tatum/evm.tatum.balance.service';
import { ethereumGasService } from '../ethereum/ethereum.gas.service';
import {
  getTronTrxBalance,
  getTronTrc20Balance,
  sendTronTrx,
  sendTronTrc20,
} from '../tron/tron.tatum.service';
import {
  estimateUtxoTxFee,
  getUtxoAddressBalance,
  sendUtxoFromAddress,
  type UtxoTatumChain,
} from '../utxo/utxo.tatum.service';
import cryptoLogger from '../../utils/crypto.logger';
import { decryptSignerPrivateKey } from './crypto.send.helpers';

export type CustodialSendExecResult = {
  txHash: string;
  networkFee: Decimal;
  networkFeeAsset: string;
  onChainBalanceBefore: Decimal;
};

const MIN_TRX_FOR_TRC20_SEND = new Decimal('25');
const TRX_NATIVE_FEE_BUFFER = new Decimal('3');

function evmPk(encrypted: string): string {
  let pk = decryptSignerPrivateKey(encrypted);
  pk = pk.trim();
  if (pk.startsWith('0x')) pk = pk.substring(2).trim();
  if (pk.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('Invalid signer private key format for this network');
  }
  return pk;
}

async function sendEvmFromSigner(params: {
  evmPath: EvmTatumPath;
  gasChain: 'ETH' | 'BSC' | 'MATIC';
  nativeTatumSymbol: 'ETH' | 'BNB' | 'MATIC';
  fromAddress: string;
  signerPrivateKeyEnc: string;
  walletCurrency: {
    contractAddress: string | null;
    decimals: number | null;
    isToken: boolean | null;
  };
  amountCryptoDecimal: Decimal;
  toAddress: string;
  displayCurrency: string;
}): Promise<CustodialSendExecResult> {
  const {
    evmPath,
    gasChain,
    nativeTatumSymbol,
    fromAddress,
    signerPrivateKeyEnc,
    walletCurrency,
    amountCryptoDecimal,
    toAddress,
    displayCurrency,
  } = params;

  const pk = evmPk(signerPrivateKeyEnc);
  const isTokenSend = !!walletCurrency.contractAddress;

  if (!isTokenSend) {
    const balStr = await getEvmNativeBalance(evmPath, fromAddress, false);
    const onChainBalanceBefore = new Decimal(balStr);
    if (onChainBalanceBefore.lessThan(amountCryptoDecimal)) {
      throw new Error(
        `Insufficient ${displayCurrency} in hot wallet. Available: ${onChainBalanceBefore.toString()}, required: ${amountCryptoDecimal.toString()}`
      );
    }

    const gasEstimate = await ethereumGasService.estimateGasFeeForChain(
      gasChain,
      fromAddress,
      toAddress,
      amountCryptoDecimal.toString(),
      false
    );
    let gasLimit = Math.ceil(parseInt(gasEstimate.gasLimit, 10) * 1.1);
    gasLimit = Math.max(gasLimit, 21000);
    const gasPriceWei = gasEstimate.gasPrice;
    const gasFeeNative = new Decimal(ethereumGasService.calculateTotalFee(gasLimit.toString(), gasPriceWei));
    const minBuffer =
      evmPath === 'bsc' || evmPath === 'polygon'
        ? Decimal.max(gasFeeNative.mul(new Decimal('0.2')), new Decimal('0.00001'))
        : Decimal.max(gasFeeNative.mul(new Decimal('0.5')), new Decimal('0.0001'));
    const totalNeeded = amountCryptoDecimal.plus(gasFeeNative).plus(minBuffer);
    if (onChainBalanceBefore.lessThan(totalNeeded)) {
      throw new Error(
        `Insufficient ${nativeTatumSymbol} for amount + network fee. Need about ${totalNeeded.toString()} ${nativeTatumSymbol}, have ${onChainBalanceBefore.toString()}.`
      );
    }

    const txHash = await sendEvmTatumTransaction({
      evmPath,
      to: toAddress,
      amount: amountCryptoDecimal.toString(),
      currency: nativeTatumSymbol,
      fromPrivateKey: pk,
      gasPriceGwei: ethereumGasService.weiToGwei(gasPriceWei),
      gasLimit: gasLimit.toString(),
      testnet: false,
    });

    cryptoLogger.transaction('CRYPTO_SEND_MASTER_EVM_NATIVE', {
      evmPath,
      txHash,
      amount: amountCryptoDecimal.toString(),
      fromAddress,
    });

    return {
      txHash,
      networkFee: gasFeeNative.plus(minBuffer),
      networkFeeAsset: nativeTatumSymbol,
      onChainBalanceBefore,
    };
  }

  if (!walletCurrency.contractAddress) {
    throw new Error('Token contract address is not configured for this asset');
  }

  const tokenBalStr = await getEvmFungibleTokenBalance(
    evmPath,
    walletCurrency.contractAddress,
    fromAddress,
    false
  );
  const onChainBalanceBefore = new Decimal(tokenBalStr);
  if (onChainBalanceBefore.lessThan(amountCryptoDecimal)) {
    throw new Error(
      `Insufficient token in hot wallet. Available: ${onChainBalanceBefore.toString()}, required: ${amountCryptoDecimal.toString()}`
    );
  }

  let nativeForGas = new Decimal(await getEvmNativeBalance(evmPath, fromAddress, false));
  let gasLimitTok = Math.ceil(65000 * 1.2);
  const gasEstimate = await ethereumGasService.estimateGasFeeForChain(
    gasChain,
    fromAddress,
    toAddress,
    amountCryptoDecimal.toString(),
    false
  );
  gasLimitTok = Math.ceil(parseInt(gasEstimate.gasLimit, 10) * 1.2);
  gasLimitTok = Math.max(gasLimitTok, 65000);
  const gasPriceWei = gasEstimate.gasPrice;
  const gasFeeNative = new Decimal(ethereumGasService.calculateTotalFee(gasLimitTok.toString(), gasPriceWei));
  const bufferAmount = Decimal.max(gasFeeNative.mul(new Decimal('0.5')), new Decimal('0.0001'));
  const minimumNativeNeeded = gasFeeNative.plus(bufferAmount);

  if (nativeForGas.lessThan(minimumNativeNeeded)) {
    throw new Error(
      `Insufficient ${nativeTatumSymbol} on master wallet for network fees. Need at least ${minimumNativeNeeded.toString()} ${nativeTatumSymbol} (separate from token balance).`
    );
  }

  const tatumTokenSymbol = extractBaseSymbol(displayCurrency);
  const txHash = await sendEvmTatumTransaction({
    evmPath,
    to: toAddress,
    amount: amountCryptoDecimal.toString(),
    currency: tatumTokenSymbol,
    fromPrivateKey: pk,
    gasPriceGwei: ethereumGasService.weiToGwei(gasPriceWei),
    gasLimit: gasLimitTok.toString(),
    testnet: false,
  });

  cryptoLogger.transaction('CRYPTO_SEND_MASTER_EVM_TOKEN', {
    evmPath,
    txHash,
    currency: tatumTokenSymbol,
    amount: amountCryptoDecimal.toString(),
    fromAddress,
  });

  return {
    txHash,
    networkFee: gasFeeNative,
    networkFeeAsset: nativeTatumSymbol,
    onChainBalanceBefore,
  };
}

async function sendTronFromSigner(params: {
  fromAddress: string;
  signerPrivateKeyEnc: string;
  walletCurrency: {
    contractAddress: string | null;
    decimals: number | null;
    isToken: boolean | null;
  };
  amountCryptoDecimal: Decimal;
  toAddress: string;
}): Promise<CustodialSendExecResult> {
  const { fromAddress, signerPrivateKeyEnc, walletCurrency, amountCryptoDecimal, toAddress } = params;
  const pk = evmPk(signerPrivateKeyEnc);
  const isTrc20 = !!walletCurrency.contractAddress;

  if (!isTrc20) {
    const trxBal = new Decimal(await getTronTrxBalance(fromAddress));
    const totalNeed = amountCryptoDecimal.plus(TRX_NATIVE_FEE_BUFFER);
    if (trxBal.lessThan(totalNeed)) {
      throw new Error(
        `Insufficient TRX in hot wallet. Available: ${trxBal.toString()}, need about ${totalNeed.toString()} TRX (amount + fee buffer).`
      );
    }
    const txHash = await sendTronTrx({
      to: toAddress,
      amountTrx: amountCryptoDecimal.toString(),
      fromPrivateKey: pk,
    });
    cryptoLogger.transaction('CRYPTO_SEND_MASTER_TRON_NATIVE', { txHash, fromAddress });
    return {
      txHash,
      networkFee: TRX_NATIVE_FEE_BUFFER,
      networkFeeAsset: 'TRX',
      onChainBalanceBefore: trxBal,
    };
  }

  if (!walletCurrency.contractAddress) {
    throw new Error('TRC20 contract address is not configured for this asset');
  }
  const decimals = walletCurrency.decimals ?? 6;
  const tokenBalStr = await getTronTrc20Balance(fromAddress, walletCurrency.contractAddress, decimals);
  const onChainBalanceBefore = new Decimal(tokenBalStr);
  if (onChainBalanceBefore.lessThan(amountCryptoDecimal)) {
    throw new Error(
      `Insufficient token in hot wallet. Available: ${onChainBalanceBefore.toString()}, required: ${amountCryptoDecimal.toString()}`
    );
  }

  const trxForEnergy = new Decimal(await getTronTrxBalance(fromAddress));
  if (trxForEnergy.lessThan(MIN_TRX_FOR_TRC20_SEND)) {
    throw new Error(
      `Master Tron wallet needs about ${MIN_TRX_FOR_TRC20_SEND.toString()} TRX for TRC20 fees. Available: ${trxForEnergy.toString()}.`
    );
  }

  const txHash = await sendTronTrc20({
    to: toAddress,
    amount: amountCryptoDecimal.toString(),
    contractAddress: walletCurrency.contractAddress,
    fromPrivateKey: pk,
    feeLimitTrx: 80,
  });

  cryptoLogger.transaction('CRYPTO_SEND_MASTER_TRON_TRC20', { txHash, fromAddress });
  return {
    txHash,
    networkFee: new Decimal('0'),
    networkFeeAsset: 'TRX',
    onChainBalanceBefore,
  };
}

function utxoChainFromNorm(chainNorm: string): UtxoTatumChain | null {
  if (chainNorm === 'bitcoin') return 'bitcoin';
  if (chainNorm === 'dogecoin') return 'dogecoin';
  if (chainNorm === 'litecoin') return 'litecoin';
  return null;
}

function utxoFeeAsset(chainNorm: string): string {
  if (chainNorm === 'bitcoin') return 'BTC';
  if (chainNorm === 'dogecoin') return 'DOGE';
  if (chainNorm === 'litecoin') return 'LTC';
  return chainNorm.toUpperCase();
}

async function sendUtxoFromSigner(params: {
  chainNorm: string;
  fromAddress: string;
  signerPrivateKeyEnc: string;
  amountCryptoDecimal: Decimal;
  toAddress: string;
}): Promise<CustodialSendExecResult> {
  const utxo = utxoChainFromNorm(params.chainNorm);
  if (!utxo) throw new Error('Unsupported UTXO chain');

  const pk = decryptSignerPrivateKey(params.signerPrivateKeyEnc).trim();
  const onChainStr = await getUtxoAddressBalance(utxo, params.fromAddress);
  const onChainBalanceBefore = new Decimal(onChainStr);

  const fee = await estimateUtxoTxFee(utxo);
  const totalFee = Decimal.max(fee, utxo === 'bitcoin' ? new Decimal('0.000015') : new Decimal('0.00001'));
  const totalSpend = params.amountCryptoDecimal.plus(totalFee);

  if (onChainBalanceBefore.lessThan(totalSpend)) {
    throw new Error(
      `Insufficient balance in hot wallet. Available: ${onChainBalanceBefore.toString()}, need at least ${totalSpend.toString()} (amount + estimated network fee ${totalFee.toString()} ${utxoFeeAsset(params.chainNorm)}).`
    );
  }

  const txHash = await sendUtxoFromAddress({
    chain: utxo,
    fromAddress: params.fromAddress,
    fromPrivateKey: pk,
    toAddress: params.toAddress,
    value: params.amountCryptoDecimal.toString(),
    fee: totalFee.toString(),
    changeAddress: params.fromAddress,
  });

  cryptoLogger.transaction('CRYPTO_SEND_MASTER_UTXO', {
    chain: utxo,
    txHash,
    fromAddress: params.fromAddress,
  });

  return {
    txHash,
    networkFee: totalFee,
    networkFeeAsset: utxoFeeAsset(params.chainNorm),
    onChainBalanceBefore,
  };
}

export async function executeCustodialSendNonEthereum(params: {
  chainNorm: string;
  fromAddress: string;
  signerPrivateKeyEnc: string;
  walletCurrency: {
    contractAddress: string | null;
    decimals: number | null;
    isToken: boolean | null;
    currency?: string | null;
  };
  amountCryptoDecimal: Decimal;
  toAddress: string;
  displayCurrency: string;
}): Promise<CustodialSendExecResult> {
  const { chainNorm, fromAddress, signerPrivateKeyEnc, walletCurrency, amountCryptoDecimal, toAddress, displayCurrency } =
    params;

  if (chainNorm === 'ethereum') {
    return sendEvmFromSigner({
      evmPath: 'ethereum',
      gasChain: 'ETH',
      nativeTatumSymbol: 'ETH',
      fromAddress,
      signerPrivateKeyEnc,
      walletCurrency,
      amountCryptoDecimal,
      toAddress,
      displayCurrency,
    });
  }
  if (chainNorm === 'bsc') {
    return sendEvmFromSigner({
      evmPath: 'bsc',
      gasChain: 'BSC',
      nativeTatumSymbol: 'BNB',
      fromAddress,
      signerPrivateKeyEnc,
      walletCurrency,
      amountCryptoDecimal,
      toAddress,
      displayCurrency,
    });
  }
  if (chainNorm === 'polygon') {
    return sendEvmFromSigner({
      evmPath: 'polygon',
      gasChain: 'MATIC',
      nativeTatumSymbol: 'MATIC',
      fromAddress,
      signerPrivateKeyEnc,
      walletCurrency,
      amountCryptoDecimal,
      toAddress,
      displayCurrency,
    });
  }
  if (chainNorm === 'tron') {
    return sendTronFromSigner({
      fromAddress,
      signerPrivateKeyEnc,
      walletCurrency,
      amountCryptoDecimal,
      toAddress,
    });
  }
  if (utxoChainFromNorm(chainNorm)) {
    return sendUtxoFromSigner({
      chainNorm,
      fromAddress,
      signerPrivateKeyEnc,
      amountCryptoDecimal,
      toAddress,
    });
  }

  throw new Error(`Send execution not implemented for chain "${chainNorm}"`);
}
