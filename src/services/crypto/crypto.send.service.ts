/**
 * Crypto Send Service
 *
 * Customer withdraws: the **on-chain** transaction is signed with the **master wallet** (gas
 * and funds come from hot wallet liquidity). The user's **virtual account** is debited by the
 * send amount after a successful broadcast. The user's **ledger** (`virtualAccount` balances) is the
 * source of truth here — we do **not** call Tatum (or any RPC) for the **user deposit address** during
 * preview/send. Hot-wallet and fee checks in **preview** still read the **master** address via Tatum.
 */

import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import {
  buildUsdtNetworkBalances,
  fetchUsdtFamilyVirtualAccounts,
  resolveSendStorageCurrency,
  sumUsdtBalances,
} from './crypto.unified.usdt';
import cryptoLogger from '../../utils/crypto.logger';
import { sendPushNotification } from '../../utils/pushService';
import {
  assertCustomerSendChainSupported,
  findMasterWalletForChain,
  normalizeCustomerSendBlockchain,
  validateSendRecipientAddress,
} from './crypto.send.helpers';
import { executeCustodialSendNonEthereum } from './crypto.send.chain.handlers';
import { getEvmNativeBalance, getEvmFungibleTokenBalance } from '../tatum/evm.tatum.balance.service';
import { getTronTrxBalance, getTronTrc20Balance } from '../tron/tron.tatum.service';
import { estimateUtxoTxFee, getUtxoAddressBalance } from '../utxo/utxo.tatum.service';

/** Interactive `$transaction` callback client (inferred; avoids importing `Prisma` namespace). */
type PrismaTransactionClient = Parameters<
  Extract<Parameters<typeof prisma.$transaction>[0], (tx: never) => Promise<unknown>>
>[0];

export interface SendCryptoInput {
  userId: number;
  amount: number; // Amount in crypto currency (e.g., 6 USDT, 0.001 ETH)
  currency: string; // Crypto currency to send (e.g., ETH, USDT)
  blockchain: string; // Blockchain (e.g., ethereum)
  toAddress: string; // Recipient address
}

export interface SendCryptoResult {
  transactionId: string;
  amount: string;
  amountUsd: string;
  toAddress: string;
  txHash: string;
  networkFee: string;
  virtualAccountId: number;
  balanceBefore: string;
  balanceAfter: string;
}

/** Include for send/preview queries (no depositAddresses — avoid Tatum on user deposit in this flow). */
const VIRTUAL_ACCOUNT_FOR_SEND_INCLUDE = {
  walletCurrency: true,
};

/**
 * Virtual account with relations loaded for send/preview.
 * (Explicit shape so TS knows about `include` without `Prisma.*GetPayload`.)
 */
type VirtualAccountForSend = {
  id: number;
  userId: number;
  currency: string;
  blockchain: string;
  availableBalance: string;
  accountBalance: string;
  walletCurrency: {
    price: { toString(): string } | null;
    contractAddress: string | null;
    decimals: number | null;
    isToken: boolean | null;
    name: string | null;
    symbol: string | null;
  } | null;
};

class CryptoSendService {
  /**
   * Send to an external address: broadcast from **master wallet**, debit user's virtual account.
   */
  private async findVirtualAccountForSend(
    userId: number,
    storageCurrency: string,
    chainNorm: string
  ): Promise<VirtualAccountForSend | null> {
    return prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: storageCurrency,
        // `chainNorm` is already lowercase; MySQL StringFilter has no `mode: 'insensitive'`.
        blockchain: chainNorm,
      },
      include: VIRTUAL_ACCOUNT_FOR_SEND_INCLUDE,
    }) as Promise<VirtualAccountForSend | null>;
  }

  /** On-chain asset balance at an address (used for **master** wallet in preview only). */
  private async readAssetBalanceAt(
    chainNorm: string,
    address: string,
    walletCurrency: { isToken: boolean | null; contractAddress: string | null; decimals: number | null },
    currencyCode: string
  ): Promise<Decimal> {
    if (chainNorm === 'ethereum' || chainNorm === 'bsc' || chainNorm === 'polygon') {
      const evmPath = chainNorm === 'bsc' ? 'bsc' : chainNorm === 'polygon' ? 'polygon' : 'ethereum';
      if (!walletCurrency.contractAddress) {
        return new Decimal(await getEvmNativeBalance(evmPath, address, false));
      }
      return new Decimal(
        await getEvmFungibleTokenBalance(evmPath, walletCurrency.contractAddress, address, false)
      );
    }
    if (chainNorm === 'tron') {
      if (!walletCurrency.contractAddress) {
        return new Decimal(await getTronTrxBalance(address));
      }
      return new Decimal(
        await getTronTrc20Balance(address, walletCurrency.contractAddress, walletCurrency.decimals ?? 6)
      );
    }
    if (chainNorm === 'bitcoin') {
      return new Decimal(await getUtxoAddressBalance('bitcoin', address));
    }
    if (chainNorm === 'dogecoin') {
      return new Decimal(await getUtxoAddressBalance('dogecoin', address));
    }
    if (chainNorm === 'litecoin') {
      return new Decimal(await getUtxoAddressBalance('litecoin', address));
    }
    throw new Error(`Cannot read on-chain balance for chain ${chainNorm}`);
  }

  async sendCrypto(input: SendCryptoInput): Promise<SendCryptoResult> {
    const { userId, amount, currency, blockchain, toAddress } = input;

    const chainNorm = normalizeCustomerSendBlockchain(blockchain);
    assertCustomerSendChainSupported(chainNorm);

    const normalizedCurrency = currency.toUpperCase().split(/[\s_]+/)[0];
    const currencyCode = normalizedCurrency;
    validateSendRecipientAddress(chainNorm, toAddress);

    console.log('\n========================================');
    console.log('[CRYPTO SEND] Starting send transaction');
    console.log('========================================');
    console.log('User ID:', userId);
    console.log('Amount:', amount);
    console.log('Currency:', currency);
    console.log('Blockchain:', blockchain, '→', chainNorm);
    console.log('To Address:', toAddress);
    console.log('========================================\n');

    const storageCurrency = resolveSendStorageCurrency(currencyCode, chainNorm);
    const virtualAccount = await this.findVirtualAccountForSend(userId, storageCurrency, chainNorm);

    if (!virtualAccount) {
      throw new Error(`Virtual account not found for ${currency} on ${blockchain} (ledger currency ${storageCurrency})`);
    }

    const walletCurrency = virtualAccount.walletCurrency;
    if (!walletCurrency || !walletCurrency.price) {
      throw new Error(`Currency ${currency} price not set`);
    }

    const cryptoPrice = new Decimal(walletCurrency.price.toString());
    const amountCryptoDecimal = new Decimal(amount);
    const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

    const userBookBalance = new Decimal(virtualAccount.availableBalance || '0');
    if (userBookBalance.lessThan(amountCryptoDecimal)) {
      throw new Error(
        `Insufficient wallet balance. Available: ${userBookBalance.toString()}, required: ${amountCryptoDecimal.toString()}`
      );
    }

    const masterWallet = await findMasterWalletForChain(chainNorm);
    if (!masterWallet?.address?.trim() || !masterWallet.privateKey) {
      throw new Error(
        `Master wallet is not configured for "${chainNorm}". Add address and private key in MasterWallet before customer sends.`
      );
    }
    const masterAddress = masterWallet.address.trim();
    const masterKeyEnc = masterWallet.privateKey;

    let gasFeeEth = new Decimal('0');
    let txHash: string | null = null;

    console.log('[CRYPTO SEND] Executing send from master wallet', { chainNorm });
    try {
      const ex = await executeCustodialSendNonEthereum({
        chainNorm,
        fromAddress: masterAddress,
        signerPrivateKeyEnc: masterKeyEnc,
        walletCurrency,
        amountCryptoDecimal,
        toAddress,
        displayCurrency: currencyCode,
      });
      txHash = ex.txHash;
      gasFeeEth = ex.networkFee;
      cryptoLogger.transaction('SEND_COMPLETE', {
        transactionId: `SEND-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        currency: currencyCode,
        blockchain: chainNorm,
        amountCrypto: amountCryptoDecimal.toString(),
        amountUsd: amountUsd.toString(),
        toAddress,
        txHash,
        gasFee: gasFeeEth.toString(),
        fromMaster: masterAddress,
      });
    } catch (error: any) {
      console.error('[CRYPTO SEND] Blockchain transfer failed:', error);
      cryptoLogger.exception('Blockchain transfer failed', error, {
        userId,
        currency: currencyCode,
        blockchain: chainNorm,
        amount: amountCryptoDecimal.toString(),
        toAddress,
        note: 'Master wallet send failed - virtual account not debited.',
      });
      throw new Error(`Failed to send transaction: ${error.message || 'Unknown error'}`);
    }

    if (!txHash) {
      throw new Error('Send did not produce a transaction hash');
    }

    const balanceBefore = userBookBalance;
    const balanceAfter = userBookBalance.minus(amountCryptoDecimal);

    // Generate transaction ID
    const transactionId = `SEND-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;

    // Update database records (do this quickly without verification to avoid timeout)
    // Blockchain transfer already succeeded, so we just need to update balances
    try {
      await prisma.$transaction(async (tx: PrismaTransactionClient) => {
        // Update virtual account to match expected on-chain balance after send
        await tx.virtualAccount.update({
          where: { id: virtualAccount.id },
          data: {
            availableBalance: balanceAfter.toString(),
            accountBalance: balanceAfter.toString(),
          },
        });

        // Create crypto transaction directly (without service method to avoid extra queries)
        await tx.cryptoTransaction.create({
          data: {
            userId,
            virtualAccountId: virtualAccount.id,
            transactionType: 'SEND',
            transactionId,
            status: txHash ? 'successful' : 'failed',
            currency: virtualAccount.currency,
            blockchain: virtualAccount.blockchain,
            cryptoSend: {
              create: {
                fromAddress: masterAddress,
                toAddress,
                amount: amountCryptoDecimal,
                amountUsd: amountUsd,
                txHash: txHash || '',
                networkFee: gasFeeEth,
              },
            },
          },
        });
      }, {
        maxWait: 10000, // Maximum time to wait for a transaction slot (10 seconds)
        timeout: 15000, // 15 seconds should be plenty for simple DB updates
      });
    } catch (error: any) {
      // If database update fails, log it but don't fail the entire operation
      // The blockchain transfer already succeeded
      console.error('[CRYPTO SEND] Error updating database after blockchain transfer:', error);
      cryptoLogger.exception('Database update failed after successful blockchain transfer', error, {
        userId,
        currency: currencyCode,
        txHash,
        transactionId,
        note: 'Blockchain transfer succeeded but database update failed. Manual reconciliation may be needed.',
      });
      // Continue to return success since blockchain transfer worked
    }

    console.log('[CRYPTO SEND] Transaction completed successfully:', {
      transactionId,
      txHash,
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
    });

    try {
      await prisma.masterWalletTransaction.create({
        data: {
          walletId: 'tercescrow',
          type: 'customer_send',
          assetSymbol: virtualAccount.currency.slice(0, 20),
          amount: amountCryptoDecimal,
          toAddress,
          txHash,
          status: 'successful',
        },
      });
    } catch (mwErr: any) {
      cryptoLogger.exception('masterWalletTransaction log failed', mwErr, { txHash, userId });
    }

    // Send notifications
    try {
      await sendPushNotification({
        userId,
        title: 'Crypto Transfer Successful',
        body: `You successfully sent ${amountCryptoDecimal.toString()} ${currencyCode} to ${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`,
        sound: 'default',
        priority: 'high',
      });

      await prisma.inAppNotification.create({
        data: {
          userId,
          title: 'Crypto Transfer Successful',
          description: `You successfully sent ${amountCryptoDecimal.toString()} ${currencyCode} to ${toAddress}. Transaction ID: ${transactionId}`,
          type: 'customeer',
        },
      });

      cryptoLogger.info('Send transaction notification sent', { userId, transactionId });
    } catch (notifError: any) {
      cryptoLogger.exception('Send transfer notification', notifError, { userId, transactionId });
      // Don't fail the transaction if notification fails
    }

    return {
      transactionId,
      amount: amountCryptoDecimal.toString(),
      amountUsd: amountUsd.toString(),
      toAddress,
      txHash: txHash || '',
      networkFee: gasFeeEth.toString(),
      virtualAccountId: virtualAccount.id,
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
    };
  }

  /**
   * Preview send transaction with complete details
   * Includes current balances, gas fees, and all transaction details
   */
  async previewSendTransaction(userId: number, amount: number, currency: string, blockchain: string, toAddress: string) {
    console.log('\n========================================');
    console.log('[CRYPTO SEND PREVIEW] Starting preview');
    console.log('========================================');
    console.log('User ID:', userId);
    console.log('Amount:', amount);
    console.log('Currency:', currency);
    console.log('Blockchain:', blockchain);
    console.log('To Address:', toAddress);
    console.log('========================================\n');

    const chainNorm = normalizeCustomerSendBlockchain(blockchain);
    assertCustomerSendChainSupported(chainNorm);
    validateSendRecipientAddress(chainNorm, toAddress);

    const normalizedCurrency = currency.toUpperCase().split(/[\s_]+/)[0];
    const currencyCode = normalizedCurrency;

    const storageCurrency = resolveSendStorageCurrency(currencyCode, chainNorm);
    const virtualAccount = await this.findVirtualAccountForSend(userId, storageCurrency, chainNorm);

    if (!virtualAccount) {
      throw new Error(`Virtual account not found for ${currencyCode} on ${blockchain} (ledger currency ${storageCurrency})`);
    }

    const masterWalletPreview = await findMasterWalletForChain(chainNorm);
    if (!masterWalletPreview?.address?.trim()) {
      throw new Error(`Master wallet not configured for "${chainNorm}".`);
    }
    const masterPreviewAddress = masterWalletPreview.address.trim();

    const usdtFamily = currencyCode === 'USDT' ? await fetchUsdtFamilyVirtualAccounts(userId) : [];
    const unifiedUsdtTotalBalance =
      currencyCode === 'USDT' ? sumUsdtBalances(usdtFamily).toString() : undefined;
    const unifiedUsdtNetworkBalances =
      currencyCode === 'USDT' ? buildUsdtNetworkBalances(usdtFamily) : undefined;

    // Get wallet currency for price and contract address
    const walletCurrency = virtualAccount.walletCurrency;
    if (!walletCurrency || !walletCurrency.price) {
      throw new Error(`Currency ${currencyCode} price not set`);
    }

    const cryptoPrice = new Decimal(walletCurrency.price.toString());
    const amountCryptoDecimal = new Decimal(amount);
    const amountUsd = amountCryptoDecimal.mul(cryptoPrice);

    const userBookBalance = new Decimal(virtualAccount.availableBalance || '0');

    let masterAssetBalance = new Decimal('0');
    try {
      masterAssetBalance = await this.readAssetBalanceAt(
        chainNorm,
        masterPreviewAddress,
        walletCurrency,
        currencyCode
      );
    } catch {
      masterAssetBalance = new Decimal('0');
    }

    let gasFeeEth = new Decimal('0');
    let gasFeeUsd = new Decimal('0');
    let nativeOnMaster = new Decimal('0');
    let hasSufficientNativeOnMaster = true;
    let gasEstimate: any = null;

    const { ethereumGasService } = await import('../ethereum/ethereum.gas.service');

    if (chainNorm === 'ethereum' || chainNorm === 'bsc' || chainNorm === 'polygon') {
      const evmPath = chainNorm === 'bsc' ? 'bsc' : chainNorm === 'polygon' ? 'polygon' : 'ethereum';
      const gasChain = chainNorm === 'bsc' ? 'BSC' : chainNorm === 'polygon' ? 'MATIC' : 'ETH';
      const nativeSymbol = chainNorm === 'bsc' ? 'BNB' : chainNorm === 'polygon' ? 'MATIC' : 'ETH';

      nativeOnMaster = new Decimal(await getEvmNativeBalance(evmPath, masterPreviewAddress, false));

      if (!walletCurrency.contractAddress) {
        const ge = await ethereumGasService.estimateGasFeeForChain(
          gasChain,
          masterPreviewAddress,
          toAddress,
          amountCryptoDecimal.toString(),
          false
        );
        let gl = Math.ceil(parseInt(ge.gasLimit, 10) * 1.1);
        gl = Math.max(gl, 21000);
        gasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(gl.toString(), ge.gasPrice));
        const minBuf =
          evmPath === 'bsc' || evmPath === 'polygon'
            ? Decimal.max(gasFeeEth.mul(new Decimal('0.2')), new Decimal('0.00001'))
            : Decimal.max(gasFeeEth.mul(new Decimal('0.5')), new Decimal('0.0001'));
        const totalNeed = amountCryptoDecimal.plus(gasFeeEth).plus(minBuf);
        hasSufficientNativeOnMaster = nativeOnMaster.greaterThanOrEqualTo(totalNeed);
        gasEstimate = {
          gasLimit: String(gl),
          gasPrice: { wei: ge.gasPrice, gwei: ethereumGasService.weiToGwei(ge.gasPrice) },
          gasFeeNative: gasFeeEth.toString(),
          nativeSymbol,
          note: 'Broadcast from master wallet; native on master pays gas',
        };
      } else {
        const ge = await ethereumGasService.estimateGasFeeForChain(
          gasChain,
          masterPreviewAddress,
          toAddress,
          amountCryptoDecimal.toString(),
          false
        );
        const gl = Math.max(Math.ceil(parseInt(ge.gasLimit, 10) * 1.2), 65000);
        gasFeeEth = new Decimal(ethereumGasService.calculateTotalFee(gl.toString(), ge.gasPrice));
        const minBuf = Decimal.max(gasFeeEth.mul(new Decimal('0.5')), new Decimal('0.0001'));
        const minimumNativeNeeded = gasFeeEth.plus(minBuf);
        hasSufficientNativeOnMaster = nativeOnMaster.greaterThanOrEqualTo(minimumNativeNeeded);
        gasEstimate = {
          gasLimit: String(gl),
          gasPrice: { wei: ge.gasPrice, gwei: ethereumGasService.weiToGwei(ge.gasPrice) },
          gasFeeNative: gasFeeEth.toString(),
          nativeSymbol,
          note: `${nativeSymbol} on master pays gas`,
        };
      }

      const nativeWc = await prisma.walletCurrency.findFirst({
        where: { blockchain: chainNorm, isToken: false },
      });
      if (nativeWc?.price) {
        gasFeeUsd = gasFeeEth.mul(new Decimal(nativeWc.price.toString()));
      }
    } else if (chainNorm === 'tron') {
      nativeOnMaster = new Decimal(await getTronTrxBalance(masterPreviewAddress));
      if (walletCurrency.contractAddress) {
        hasSufficientNativeOnMaster = nativeOnMaster.greaterThanOrEqualTo(new Decimal('25'));
        gasEstimate = {
          note: 'TRC-20 fees paid from master TRX',
          trxOnMaster: nativeOnMaster.toString(),
        };
      } else {
        const need = amountCryptoDecimal.plus(new Decimal('3'));
        hasSufficientNativeOnMaster = nativeOnMaster.greaterThanOrEqualTo(need);
        gasFeeEth = new Decimal('3');
        gasEstimate = { trxOnMaster: nativeOnMaster.toString(), feeBufferTrx: '3' };
      }
    } else if (chainNorm === 'bitcoin' || chainNorm === 'dogecoin' || chainNorm === 'litecoin') {
      const utxoChain =
        chainNorm === 'bitcoin' ? 'bitcoin' : chainNorm === 'dogecoin' ? 'dogecoin' : 'litecoin';
      const feeEst = await estimateUtxoTxFee(utxoChain);
      const minFee =
        utxoChain === 'bitcoin'
          ? Decimal.max(feeEst, new Decimal('0.000015'))
          : Decimal.max(feeEst, new Decimal('0.00001'));
      gasFeeEth = minFee;
      nativeOnMaster = masterAssetBalance;
      hasSufficientNativeOnMaster = masterAssetBalance.greaterThanOrEqualTo(
        amountCryptoDecimal.plus(minFee)
      );
      gasEstimate = {
        estimatedNetworkFee: minFee.toString(),
        nativeAsset: utxoChain === 'bitcoin' ? 'BTC' : utxoChain === 'dogecoin' ? 'DOGE' : 'LTC',
      };
      const wcPrice = walletCurrency.price ? new Decimal(walletCurrency.price.toString()) : new Decimal(0);
      gasFeeUsd = minFee.mul(wcPrice);
    }

    const hasSufficientUserBook = userBookBalance.greaterThanOrEqualTo(amountCryptoDecimal);
    const hasSufficientHotWallet = masterAssetBalance.greaterThanOrEqualTo(amountCryptoDecimal);
    const balanceBefore = userBookBalance;
    const balanceAfter = balanceBefore.minus(amountCryptoDecimal);
    const maxSend = Decimal.min(userBookBalance, masterAssetBalance);
    const canProceed = hasSufficientUserBook && hasSufficientHotWallet && hasSufficientNativeOnMaster;

    return {
      currency: currencyCode,
      blockchain: chainNorm,
      currencyName: walletCurrency.name || currency,
      currencySymbol: walletCurrency.symbol || null,
      amount: amountCryptoDecimal.toString(),
      amountUsd: amountUsd.toString(),
      toAddress,
      fromAddress: masterPreviewAddress,
      gasFee: {
        eth: gasFeeEth.toString(),
        usd: gasFeeUsd.toString(),
        ...gasEstimate,
      },
      userEthBalance: nativeOnMaster.toString(),
      hasSufficientEth: hasSufficientNativeOnMaster,
      cryptoBalanceBefore: balanceBefore.toString(),
      cryptoBalanceAfter: balanceAfter.toString(),
      hasSufficientBalance: hasSufficientUserBook,
      hotWalletBalance: masterAssetBalance.toString(),
      hasSufficientHotWallet,
      selectedNetworkMaxSend: maxSend.toString(),
      unifiedUsdtTotalBalance,
      unifiedUsdtNetworkBalances,
      canProceed,
      virtualAccountId: virtualAccount.id,
    };
  }
}

export default new CryptoSendService();

