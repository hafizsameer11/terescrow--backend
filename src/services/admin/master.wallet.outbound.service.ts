import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import {
  extractBaseSymbol,
  normalizeBlockchain,
} from './received.asset.disbursement.helpers';
import {
  assertCustomerSendChainSupported,
  findMasterWalletForChain,
  normalizeCustomerSendBlockchain,
  validateSendRecipientAddress,
} from '../crypto/crypto.send.helpers';
import { executeCustodialSendNonEthereum } from '../crypto/crypto.send.chain.handlers';
import { estimateUtxoTxFee, getUtxoAddressBalance, type UtxoTatumChain } from '../utxo/utxo.tatum.service';

export type MasterWalletSendEstimate = {
  symbol: string;
  network: string;
  feeAsset: string;
  availableBalance: string;
  /** Amount entered by admin (wallet debit for UTXO fee-deduct mode). */
  requestedAmount: string;
  /** On-chain amount sent to recipient. */
  recipientAmount: string;
  networkFee: string;
  totalWalletDebit: string;
  feeDeductedFromAmount: boolean;
  sufficient: boolean;
  message?: string;
};

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

export async function estimateUtxoNetworkFee(chainNorm: string): Promise<Decimal> {
  const utxo = utxoChainFromNorm(chainNorm);
  if (!utxo) return new Decimal(0);
  const fee = await estimateUtxoTxFee(utxo);
  return Decimal.max(fee, utxo === 'bitcoin' ? new Decimal('0.000015') : new Decimal('0.00001'));
}

export async function resolveWalletCurrencyForMasterSend(symbol: string, chainNorm: string) {
  const base = extractBaseSymbol(symbol);
  const candidates = await prisma.walletCurrency.findMany({
    where: { blockchain: chainNorm },
  });
  if (!candidates.length) return null;

  const exact = candidates.find(
    (wc) => extractBaseSymbol(wc.currency) === base || extractBaseSymbol(wc.symbol ?? '') === base
  );
  if (exact) return exact;

  const native = candidates.find((wc) => wc.isToken === false);
  if (native && ['BTC', 'ETH', 'TRX', 'BNB', 'MATIC', 'LTC', 'DOGE', 'USDT', 'USDC'].includes(base)) {
    return native;
  }

  return candidates[0];
}

async function readMasterOnChainBalance(
  chainNorm: string,
  masterAddress: string,
  walletCurrency: {
    contractAddress: string | null;
    decimals: number | null;
    isToken: boolean | null;
    currency?: string | null;
  }
): Promise<Decimal> {
  const utxo = utxoChainFromNorm(chainNorm);
  if (utxo) {
    return new Decimal(await getUtxoAddressBalance(utxo, masterAddress));
  }

  const { getEvmNativeBalance, getEvmFungibleTokenBalance } = await import('../tatum/evm.tatum.balance.service');
  const { getTronTrxBalance, getTronTrc20Balance } = await import('../tron/tron.tatum.service');

  if (chainNorm === 'ethereum' || chainNorm === 'bsc' || chainNorm === 'polygon') {
    const evmPath = chainNorm === 'bsc' ? 'bsc' : chainNorm === 'polygon' ? 'polygon' : 'ethereum';
    if (!walletCurrency.contractAddress) {
      return new Decimal(await getEvmNativeBalance(evmPath, masterAddress, false));
    }
    return new Decimal(
      await getEvmFungibleTokenBalance(evmPath, walletCurrency.contractAddress, masterAddress, false)
    );
  }
  if (chainNorm === 'tron') {
    if (!walletCurrency.contractAddress) {
      return new Decimal(await getTronTrxBalance(masterAddress));
    }
    return new Decimal(
      await getTronTrc20Balance(
        masterAddress,
        walletCurrency.contractAddress,
        walletCurrency.decimals ?? 6
      )
    );
  }

  return new Decimal(0);
}

export type ResolvedMasterSendAmounts = {
  chainNorm: string;
  masterWallet: { address: string; privateKey: string };
  walletCurrency: NonNullable<Awaited<ReturnType<typeof resolveWalletCurrencyForMasterSend>>>;
  displayCurrency: string;
  /** User-entered wallet budget (UTXO) or recipient amount (other chains). */
  requestedAmount: Decimal;
  /** Broadcast to recipient. */
  recipientAmount: Decimal;
  networkFee: Decimal;
  feeAsset: string;
  feeDeductedFromAmount: boolean;
  availableBalance: Decimal;
};

export async function resolveMasterWalletSendAmounts(params: {
  address: string;
  amountCrypto: string;
  network: string;
  symbol: string;
}): Promise<ResolvedMasterSendAmounts> {
  const toAddress = params.address.trim();
  const amountRaw = params.amountCrypto?.trim();
  if (!toAddress) throw new Error('Recipient address is required');
  if (!amountRaw) throw new Error('Amount in crypto is required');

  const requestedAmount = new Decimal(amountRaw.replace(/,/g, ''));
  if (!requestedAmount.isFinite() || requestedAmount.lte(0)) {
    throw new Error('Amount must be greater than zero');
  }

  const chainNorm = normalizeCustomerSendBlockchain(
    normalizeBlockchain(params.network || params.symbol)
  );
  assertCustomerSendChainSupported(chainNorm);
  validateSendRecipientAddress(chainNorm, toAddress);

  const masterWallet = await findMasterWalletForChain(chainNorm);
  if (!masterWallet?.address?.trim() || !masterWallet.privateKey) {
    throw new Error(
      `Master wallet is not configured for "${chainNorm}". Add address and private key before disbursing.`
    );
  }

  const walletCurrency = await resolveWalletCurrencyForMasterSend(params.symbol, chainNorm);
  if (!walletCurrency) {
    throw new Error(`No wallet currency configured for ${params.symbol} on ${chainNorm}`);
  }

  const displayCurrency = extractBaseSymbol(params.symbol);
  const feeAsset = utxoChainFromNorm(chainNorm) ? utxoFeeAsset(chainNorm) : displayCurrency;
  const availableBalance = await readMasterOnChainBalance(
    chainNorm,
    masterWallet.address.trim(),
    walletCurrency
  );

  const utxo = utxoChainFromNorm(chainNorm);
  if (utxo) {
    const networkFee = await estimateUtxoNetworkFee(chainNorm);
    const recipientAmount = requestedAmount.minus(networkFee);

    if (!recipientAmount.gt(0)) {
      throw new Error(
        `Amount too small after network fee (${networkFee.toString()} ${feeAsset}). Increase the amount or use a lower-fee window.`
      );
    }
    if (availableBalance.lessThan(requestedAmount)) {
      throw new Error(
        `Insufficient balance in hot wallet. Available: ${availableBalance.toString()}, need ${requestedAmount.toString()} (${recipientAmount.toString()} to recipient + ${networkFee.toString()} network fee).`
      );
    }

    return {
      chainNorm,
      masterWallet: { address: masterWallet.address.trim(), privateKey: masterWallet.privateKey },
      walletCurrency,
      displayCurrency,
      requestedAmount,
      recipientAmount,
      networkFee,
      feeAsset,
      feeDeductedFromAmount: true,
      availableBalance,
    };
  }

  if (availableBalance.lessThan(requestedAmount)) {
    throw new Error(
      `Insufficient ${displayCurrency} in hot wallet. Available: ${availableBalance.toString()}, required: ${requestedAmount.toString()}`
    );
  }

  return {
    chainNorm,
    masterWallet: { address: masterWallet.address.trim(), privateKey: masterWallet.privateKey },
    walletCurrency,
    displayCurrency,
    requestedAmount,
    recipientAmount: requestedAmount,
    networkFee: new Decimal(0),
    feeAsset,
    feeDeductedFromAmount: false,
    availableBalance,
  };
}

export async function estimateMasterWalletSend(params: {
  address: string;
  amountCrypto: string;
  network: string;
  symbol: string;
}): Promise<MasterWalletSendEstimate> {
  try {
    const resolved = await resolveMasterWalletSendAmounts(params);
    const totalWalletDebit = resolved.feeDeductedFromAmount
      ? resolved.requestedAmount
      : resolved.recipientAmount.plus(resolved.networkFee);

    return {
      symbol: params.symbol,
      network: params.network,
      feeAsset: resolved.feeAsset,
      availableBalance: resolved.availableBalance.toString(),
      requestedAmount: resolved.requestedAmount.toString(),
      recipientAmount: resolved.recipientAmount.toString(),
      networkFee: resolved.networkFee.toString(),
      totalWalletDebit: totalWalletDebit.toString(),
      feeDeductedFromAmount: resolved.feeDeductedFromAmount,
      sufficient: true,
    };
  } catch (err: any) {
    const message = err?.message ?? 'Unable to estimate disbursement';
    let availableBalance = '0';
    let networkFee = '0';
    let feeDeductedFromAmount = false;
    let feeAsset = extractBaseSymbol(params.symbol);

    try {
      const chainNorm = normalizeCustomerSendBlockchain(
        normalizeBlockchain(params.network || params.symbol)
      );
      const utxo = utxoChainFromNorm(chainNorm);
      if (utxo) {
        feeDeductedFromAmount = true;
        feeAsset = utxoFeeAsset(chainNorm);
        networkFee = (await estimateUtxoNetworkFee(chainNorm)).toString();
        const masterWallet = await findMasterWalletForChain(chainNorm);
        if (masterWallet?.address) {
          availableBalance = await getUtxoAddressBalance(utxo, masterWallet.address.trim());
        }
      }
    } catch {
      /* keep defaults */
    }

    const requested = params.amountCrypto?.trim() ?? '0';
    const reqDec = new Decimal(requested.replace(/,/g, '') || '0');
    const feeDec = new Decimal(networkFee || '0');
    const recipientAmount = feeDeductedFromAmount
      ? Decimal.max(reqDec.minus(feeDec), new Decimal(0))
      : reqDec;

    return {
      symbol: params.symbol,
      network: params.network,
      feeAsset,
      availableBalance,
      requestedAmount: requested,
      recipientAmount: recipientAmount.toString(),
      networkFee,
      totalWalletDebit: feeDeductedFromAmount ? requested : recipientAmount.plus(feeDec).toString(),
      feeDeductedFromAmount,
      sufficient: false,
      message,
    };
  }
}

/** Max wallet debit for UTXO (full balance); recipient receives balance − fee. */
export async function estimateMasterWalletMaxDebit(params: {
  network: string;
  symbol: string;
}): Promise<{ maxWalletDebit: string; recipientAmount: string; networkFee: string; feeAsset: string } | null> {
  const chainNorm = normalizeCustomerSendBlockchain(
    normalizeBlockchain(params.network || params.symbol)
  );
  const utxo = utxoChainFromNorm(chainNorm);
  if (!utxo) return null;

  const masterWallet = await findMasterWalletForChain(chainNorm);
  if (!masterWallet?.address?.trim()) return null;

  const available = new Decimal(await getUtxoAddressBalance(utxo, masterWallet.address.trim()));
  const networkFee = await estimateUtxoNetworkFee(chainNorm);
  const recipientAmount = available.minus(networkFee);
  if (!recipientAmount.gt(0)) return null;

  return {
    maxWalletDebit: available.toString(),
    recipientAmount: recipientAmount.toString(),
    networkFee: networkFee.toString(),
    feeAsset: utxoFeeAsset(chainNorm),
  };
}

/**
 * Broadcast an admin disbursement from the platform master wallet (hot wallet on chain).
 * For UTXO chains, `amountCrypto` is total wallet debit; network fee is deducted before send.
 */
export async function executeMasterWalletOnChainSend(params: {
  address: string;
  amountCrypto: string;
  network: string;
  symbol: string;
}): Promise<{ txHash: string; recipientAmount: string; networkFee: string }> {
  const resolved = await resolveMasterWalletSendAmounts(params);

  const ex = await executeCustodialSendNonEthereum({
    chainNorm: resolved.chainNorm,
    fromAddress: resolved.masterWallet.address,
    signerPrivateKeyEnc: resolved.masterWallet.privateKey,
    walletCurrency: {
      contractAddress: resolved.walletCurrency.contractAddress,
      decimals: resolved.walletCurrency.decimals,
      isToken: resolved.walletCurrency.isToken,
      currency: resolved.walletCurrency.currency,
    },
    amountCryptoDecimal: resolved.recipientAmount,
    toAddress: params.address.trim(),
    displayCurrency: resolved.displayCurrency,
  });

  if (!ex.txHash) {
    throw new Error('On-chain send completed without a transaction hash');
  }

  const networkFee =
    resolved.feeDeductedFromAmount && ex.networkFee.gt(0)
      ? ex.networkFee
      : resolved.networkFee.gt(0)
        ? resolved.networkFee
        : ex.networkFee;

  return {
    txHash: ex.txHash,
    recipientAmount: resolved.recipientAmount.toString(),
    networkFee: networkFee.toString(),
  };
}
