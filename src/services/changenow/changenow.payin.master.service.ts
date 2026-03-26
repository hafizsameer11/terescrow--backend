/**
 * Send from master wallet (EVM) to ChangeNOW pay-in address.
 */

import { Decimal } from '@prisma/client/runtime/library';
import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import { sendEvmTatumTransaction, type EvmTatumPath } from '../tatum/evm.tatum.transaction.service';
import { getEvmFungibleTokenBalance, getEvmNativeBalance } from '../tatum/evm.tatum.balance.service';
import { ethereumGasService } from '../ethereum/ethereum.gas.service';

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

function masterBlockchainToEvm(blockchain: string): { path: EvmTatumPath; gasChain: 'ETH' | 'BSC' | 'MATIC'; native: 'ETH' | 'BNB' | 'MATIC' } {
  const b = blockchain.trim().toLowerCase();
  if (b === 'ethereum' || b === 'eth') return { path: 'ethereum', gasChain: 'ETH', native: 'ETH' };
  if (b === 'bsc' || b === 'binance') return { path: 'bsc', gasChain: 'BSC', native: 'BNB' };
  if (b === 'polygon' || b === 'matic') return { path: 'polygon', gasChain: 'MATIC', native: 'MATIC' };
  throw ApiError.badRequest(`Unsupported master wallet blockchain: ${blockchain}`);
}

export async function payinMasterWalletEvmToChangeNow(input: {
  masterWalletBlockchain: string;
  walletCurrencyId: number;
  payinAddress: string;
  amountFrom: Decimal;
  changeNowSwapOrderDbId: number;
}): Promise<{ masterWalletTxId: number; txHash: string }> {
  const { masterWalletBlockchain, walletCurrencyId, payinAddress, amountFrom, changeNowSwapOrderDbId } =
    input;

  const wc = await prisma.walletCurrency.findUnique({ where: { id: walletCurrencyId } });
  if (!wc) {
    throw ApiError.notFound('Wallet currency not found');
  }

  const { path: evmPath, gasChain, native } = masterBlockchainToEvm(masterWalletBlockchain);

  const chainKey =
    evmPath === 'ethereum' ? 'ethereum' : evmPath === 'bsc' ? 'bsc' : 'polygon';
  if (normChain(wc.blockchain) !== chainKey) {
    throw ApiError.badRequest(
      `Wallet currency ${wc.currency} is on ${wc.blockchain}; does not match master chain ${chainKey}`
    );
  }

  const master = await prisma.masterWallet.findUnique({
    where: { blockchain: chainKey },
  });
  if (!master?.address || !master.privateKey) {
    throw ApiError.internal(`Master wallet not configured for ${chainKey}`);
  }

  const fromAddr = master.address;
  let pk = decryptPrivateKey(master.privateKey);
  pk = pk.trim();
  if (pk.startsWith('0x')) pk = pk.substring(2).trim();
  if (pk.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(pk)) {
    throw ApiError.internal('Invalid master wallet private key');
  }

  const curU = wc.currency.toUpperCase();
  const isToken = wc.isToken && !!wc.contractAddress;
  const currencyForTatum = !isToken
    ? native
    : curU.includes('USDC')
      ? 'USDC'
      : curU.includes('USDT')
        ? 'USDT'
        : wc.currency.slice(0, 20).toUpperCase();

  if (isToken) {
    const balStr = await getEvmFungibleTokenBalance(
      evmPath,
      wc.contractAddress!,
      fromAddr,
      false
    );
    const bal = new Decimal(balStr);
    if (bal.lt(amountFrom)) {
      throw ApiError.badRequest(
        `Insufficient master token balance: have ${bal.toString()}, need ${amountFrom.toString()}`
      );
    }
  } else {
    const balStr = await getEvmNativeBalance(evmPath, fromAddr, false);
    const bal = new Decimal(balStr);
    if (bal.lt(amountFrom)) {
      throw ApiError.badRequest(
        `Insufficient master ${native} balance: have ${bal.toString()}, need ${amountFrom.toString()}`
      );
    }
  }

  const gasEstimate = await ethereumGasService.estimateGasFeeForChain(
    gasChain,
    fromAddr,
    payinAddress,
    amountFrom.toString(),
    false
  );
  let gasLimit = Math.ceil(parseInt(gasEstimate.gasLimit, 10) * 1.2);
  if (isToken) gasLimit = Math.max(gasLimit, 65000);
  else gasLimit = Math.max(gasLimit, 21000);

  const gasPriceWei = gasEstimate.gasPrice;
  const gasPriceGwei = ethereumGasService.weiToGwei(gasPriceWei);

  const txHash = await sendEvmTatumTransaction({
    evmPath,
    to: payinAddress,
    amount: amountFrom.toString(),
    currency: currencyForTatum,
    fromPrivateKey: pk,
    gasPriceGwei,
    gasLimit: gasLimit.toString(),
    testnet: false,
  });

  const mwt = await prisma.masterWalletTransaction.create({
    data: {
      walletId: 'tercescrow',
      type: 'changenow_payin',
      assetSymbol: wc.currency.slice(0, 20),
      amount: amountFrom,
      toAddress: payinAddress,
      txHash,
      status: 'successful',
    },
  });

  return { masterWalletTxId: mwt.id, txHash };
}

function normChain(b: string): string {
  return b.trim().toLowerCase();
}
