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

/**
 * Broadcast an admin disbursement from the platform master wallet (hot wallet on chain).
 */
export async function executeMasterWalletOnChainSend(params: {
  address: string;
  amountCrypto: string;
  network: string;
  symbol: string;
}): Promise<{ txHash: string }> {
  const toAddress = params.address.trim();
  const amountRaw = params.amountCrypto?.trim();
  if (!toAddress) throw new Error('Recipient address is required');
  if (!amountRaw) throw new Error('Amount in crypto is required');

  const amountCryptoDecimal = new Decimal(amountRaw.replace(/,/g, ''));
  if (!amountCryptoDecimal.isFinite() || amountCryptoDecimal.lte(0)) {
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
  const ex = await executeCustodialSendNonEthereum({
    chainNorm,
    fromAddress: masterWallet.address.trim(),
    signerPrivateKeyEnc: masterWallet.privateKey,
    walletCurrency: {
      contractAddress: walletCurrency.contractAddress,
      decimals: walletCurrency.decimals,
      isToken: walletCurrency.isToken,
      currency: walletCurrency.currency,
    },
    amountCryptoDecimal,
    toAddress,
    displayCurrency,
  });

  if (!ex.txHash) {
    throw new Error('On-chain send completed without a transaction hash');
  }

  return { txHash: ex.txHash };
}
