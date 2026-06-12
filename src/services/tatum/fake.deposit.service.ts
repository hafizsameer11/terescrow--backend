import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import {
  CRYPTO_TX_STATUS_FAKE,
  DEPOSIT_STATUS_FAKE_SCAM,
  isFakeScamDepositStatus,
} from '../../constants/deposit.fake';
import cryptoTransactionService from '../crypto/crypto.transaction.service';
import tatumLogger from '../../utils/tatum.logger';

export interface ProcessFakeScamDepositInput {
  userId: number;
  virtualAccountId: number;
  accountId: string;
  txId: string;
  fromAddress: string;
  toAddress: string;
  grossAmount: string;
  contractAddress: string;
  currencyLabel: string;
  blockchain: string;
  subscriptionType?: string;
  transactionDate: Date;
  index?: number | null;
  reference?: string;
}

/** Record a scam/unlisted token deposit — no balance credit, no customer notification. */
export async function processFakeScamDeposit(input: ProcessFakeScamDepositInput) {
  const grossAmount = new Decimal(input.grossAmount || '0');
  const reference = input.reference || `fake:${input.contractAddress}`;

  const receivedAsset = await prisma.receivedAsset.create({
    data: {
      accountId: input.accountId,
      subscriptionType: input.subscriptionType,
      amount: grossAmount.toNumber(),
      reference,
      currency: input.currencyLabel,
      txId: input.txId,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      transactionDate: input.transactionDate,
      status: DEPOSIT_STATUS_FAKE_SCAM,
      index: input.index ?? null,
      userId: input.userId,
    },
  });

  const transactionId = `FAKE-${Date.now()}-${input.userId}-${Math.random().toString(36).slice(2, 9)}`;

  const cryptoTx = await cryptoTransactionService.createReceiveTransaction({
    userId: input.userId,
    virtualAccountId: input.virtualAccountId,
    transactionId,
    status: CRYPTO_TX_STATUS_FAKE,
    balanceBucket: 'on_chain',
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    amount: grossAmount.toString(),
    amountUsd: '0',
    amountNaira: '0',
    rate: '0',
    grossAmount: grossAmount.toString(),
    creditedAmount: '0',
    grossAmountUsd: '0',
    creditedAmountUsd: '0',
    txHash: input.txId,
    confirmations: 0,
  });

  tatumLogger.warn('Fake/scam token deposit recorded without credit', {
    txId: input.txId,
    contractAddress: input.contractAddress,
    receivedAssetId: receivedAsset.id,
    cryptoTransactionId: cryptoTx.id,
    currencyLabel: input.currencyLabel,
  });

  return { receivedAsset, cryptoTx };
}

/**
 * Reverse a wrongly credited fake deposit and mark it fake_scam.
 * Subtracts credited on-chain amount from the user's virtual account.
 */
export async function remediateMisCreditedFakeDeposit(txHash: string) {
  const tx = await prisma.cryptoTransaction.findFirst({
    where: {
      transactionType: 'RECEIVE',
      cryptoReceive: { txHash },
    },
    include: {
      cryptoReceive: true,
      virtualAccount: true,
    },
  });

  if (!tx || !tx.cryptoReceive || !tx.virtualAccountId) {
    throw new Error(`Receive transaction not found for txHash ${txHash}`);
  }

  const recv = tx.cryptoReceive;
  const credited = new Decimal(recv.creditedAmount?.toString() ?? recv.amount.toString());
  const va = tx.virtualAccount!;

  const receivedAsset = await prisma.receivedAsset.findFirst({ where: { txId: txHash } });

  if (isFakeScamDepositStatus(receivedAsset?.status) && tx.status === CRYPTO_TX_STATUS_FAKE) {
    return { alreadyRemediated: true, txId: tx.transactionId };
  }

  const onChainBefore = new Decimal(va.onChainBalance || '0');
  const onChainAfter = Decimal.max(onChainBefore.minus(credited), new Decimal(0));
  const virtualBal = new Decimal(va.virtualBalance || '0');
  const newTotal = virtualBal.plus(onChainAfter);

  await prisma.$transaction([
    prisma.virtualAccount.update({
      where: { id: va.id },
      data: {
        onChainBalance: onChainAfter.toString(),
        accountBalance: newTotal.toString(),
        availableBalance: newTotal.toString(),
      },
    }),
    prisma.receivedAsset.updateMany({
      where: { txId: txHash },
      data: { status: DEPOSIT_STATUS_FAKE_SCAM },
    }),
    prisma.cryptoTransaction.update({
      where: { id: tx.id },
      data: { status: CRYPTO_TX_STATUS_FAKE },
    }),
    prisma.cryptoReceive.update({
      where: { id: recv.id },
      data: {
        creditedAmount: new Decimal(0),
        creditedAmountUsd: new Decimal(0),
      },
    }),
  ]);

  tatumLogger.warn('Remediated mis-credited fake deposit', {
    txHash,
    virtualAccountId: va.id,
    creditedReversed: credited.toString(),
    onChainBefore: onChainBefore.toString(),
    onChainAfter: onChainAfter.toString(),
  });

  return {
    alreadyRemediated: false,
    txId: tx.transactionId,
    creditedReversed: credited.toString(),
    onChainAfter: onChainAfter.toString(),
  };
}
