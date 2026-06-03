import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';
import { formatCryptoAmount } from '../../utils/cryptoAmount';
import { fetchOnChainTokenBalance } from '../crypto/onchain.balance.service';
import {
  getSoldTotalsForReceive,
  getSoldTotalsMapForReceives,
} from './receive.sold.amount.service';

function formatStaffRole(role: string | null | undefined): string {
  const r = String(role ?? '').toLowerCase();
  if (r === 'admin') return 'Admin';
  if (r === 'agent') return 'Agent';
  if (r === 'customer') return 'Customer';
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Staff';
}

function mapStaffActor(user: { id: number; firstname: string; lastname: string; role: string } | null | undefined) {
  if (!user) return undefined;
  const name = `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim() || `User #${user.id}`;
  return { userId: user.id, name, role: formatStaffRole(user.role) };
}

export type LedgerRowType =
  | 'on_chain_deposit'
  | 'virtual_purchase'
  | 'sell_virtual'
  | 'sell_on_chain'
  | 'send'
  | 'unknown';

export interface TrackingListItem {
  id: number;
  transactionId: string;
  ledgerType: LedgerRowType;
  balanceBucket: string | null;
  sellBatchId: string | null;
  customerName: string;
  customerEmail: string;
  customerId: number;
  status: string;
  masterWalletStatus: string;
  txHash: string;
  amount: string;
  amountUsd: string;
  amountNaira: string;
  /** Same as VirtualAccount.currency at receive creation (not inferred from tx amount). */
  currency: string;
  blockchain: string;
  fromAddress: string;
  toAddress: string;
  confirmations: number;
  blockNumber: string | null;
  date: string;
  /** From linked wallet_currencies — helps distinguish USDT vs ETH on same chain. */
  walletCurrency: {
    symbol: string | null;
    name: string | null;
    isToken: boolean | null;
    tokenType: string | null;
  } | null;
  /** Successful SELL volume on same VA after this receive (excludes BUY). */
  soldAmount: string;
  soldAmountUsd: string;
  soldAmountNaira: string;
  userRetentionUsd: string;
  /** Live on-chain balance at customer deposit address (Tron USDT via TronScan). */
  onChainDepositBalance?: string | null;
}

export interface TrackingStep {
  title: string;
  status: string;
  date: string;
  details: Record<string, string | number | null>;
}

export interface TrackingDisbursementItem {
  id: number;
  disbursementType: string;
  status: string;
  amount: string;
  amountUsd: string | null;
  currency: string;
  blockchain: string;
  toAddress: string;
  txHash: string | null;
  vendor: { id: number; name: string; walletAddress: string } | null;
  adminUserId: number;
  performedBy?: {
    userId: number;
    name: string;
    role: string;
  };
  networkFee: string | null;
  createdAt: string;
}

export interface TrackingDetails {
  transactionId: string;
  ledgerType?: LedgerRowType;
  balanceBucket?: string | null;
  sellBatchId?: string | null;
  status: string;
  masterWalletStatus: string;
  currency: string;
  blockchain: string;
  amount: string;
  amountUsd: string;
  amountNaira: string;
  fromAddress: string;
  toAddress: string;
  txHash: string;
  blockNumber: string | null;
  confirmations: number;
  customer: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    username: string;
    profilePicture: string | null;
  } | null;
  receivedAsset: {
    id: number;
    accountId: string | null;
    status: string;
    reference: string | null;
    index: number | null;
    transactionDate: string | null;
  } | null;
  /** Ledger moves from the customer deposit (not MasterWalletTransaction). */
  disbursements: TrackingDisbursementItem[];
  /** Virtual account + catalog row for what asset this receive was credited to. */
  virtualAccount: {
    id: number;
    accountId: string;
    currency: string;
    blockchain: string;
    virtualBalance?: string;
    onChainBalance?: string;
    totalBalance?: string;
    walletCurrency: {
      symbol: string | null;
      name: string | null;
      isToken: boolean | null;
      tokenType: string | null;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  soldAmount: string;
  soldAmountUsd: string;
  soldAmountNaira: string;
  userRetentionUsd: string;
  /** Live on-chain balance at customer deposit address (Tron USDT via TronScan). */
  onChainDepositBalance?: string | null;
}

function buildDateFilter(startDate?: string, endDate?: string): Prisma.CryptoTransactionWhereInput {
  if (!startDate && !endDate) return {};
  const filter: any = {};
  if (startDate) filter.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return { createdAt: filter };
}

function isTronUsdtReceive(currency: string, blockchain: string, walletCurrency?: { currency?: string | null; isToken?: boolean | null } | null): boolean {
  const chain = String(blockchain ?? '').toLowerCase();
  if (chain !== 'tron' && chain !== 'trx') return false;
  const cur = String(currency ?? '').toUpperCase();
  const wcCur = String(walletCurrency?.currency ?? '').toUpperCase();
  return cur.includes('USDT') || wcCur.includes('USDT') || walletCurrency?.isToken === true;
}

async function fetchReceiveDepositOnChainBalance(input: {
  blockchain: string;
  currency: string;
  toAddress?: string | null;
  depositAddress?: string | null;
  walletCurrency?: {
    contractAddress?: string | null;
    decimals?: number | null;
    isToken?: boolean | null;
    currency?: string | null;
  } | null;
}): Promise<string | null> {
  if (!isTronUsdtReceive(input.currency, input.blockchain, input.walletCurrency)) return null;

  const address = String(input.depositAddress ?? input.toAddress ?? '').trim();
  if (!address) return null;

  const balance = await fetchOnChainTokenBalance({
    blockchain: input.blockchain,
    address,
    contractAddress: input.walletCurrency?.contractAddress ?? 'USDT_TRON',
    decimals: input.walletCurrency?.decimals ?? 6,
    isToken: true,
  });
  return formatCryptoAmount(balance);
}

function resolveLedgerType(
  transactionType: string,
  balanceBucket: string | null | undefined
): LedgerRowType {
  const type = transactionType.toUpperCase();
  const bucket = String(balanceBucket ?? '').toLowerCase();
  if (type === 'RECEIVE') return 'on_chain_deposit';
  if (type === 'BUY') return 'virtual_purchase';
  if (type === 'SELL') return bucket === 'on_chain' ? 'sell_on_chain' : 'sell_virtual';
  if (type === 'SEND') return 'send';
  return 'unknown';
}

function ledgerTypeFilter(ledgerType?: string): Prisma.CryptoTransactionWhereInput | null {
  if (!ledgerType?.trim()) return null;
  const t = ledgerType.trim().toLowerCase();
  if (t === 'on_chain_deposit') return { transactionType: 'RECEIVE' };
  if (t === 'virtual_purchase') return { transactionType: 'BUY' };
  if (t === 'sell_virtual') return { transactionType: 'SELL', balanceBucket: 'virtual' };
  if (t === 'sell_on_chain') return { transactionType: 'SELL', balanceBucket: 'on_chain' };
  if (t === 'send') return { transactionType: 'SEND' };
  return null;
}

export async function getTransactionTrackingList(filters: {
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
  ledgerType?: string;
  balanceBucket?: string;
}): Promise<{ items: TrackingListItem[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const typeFilter = ledgerTypeFilter(filters.ledgerType);
  const where: Prisma.CryptoTransactionWhereInput = {
    transactionType: 'RECEIVE',
    cryptoReceive: { isNot: null },
    ...buildDateFilter(filters.startDate, filters.endDate),
    ...(typeFilter ?? {}),
  };

  if (filters.balanceBucket?.trim()) {
    where.balanceBucket = filters.balanceBucket.trim() as 'virtual' | 'on_chain';
  }

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { transactionId: { contains: q } },
      { sellBatchId: { contains: q } },
      { cryptoReceive: { txHash: { contains: q } } },
      { cryptoReceive: { fromAddress: { contains: q } } },
      { cryptoReceive: { toAddress: { contains: q } } },
      { cryptoBuy: { txHash: { contains: q } } },
      { cryptoSell: { txHash: { contains: q } } },
      { cryptoSend: { txHash: { contains: q } } },
      { user: { firstname: { contains: q } } },
      { user: { lastname: { contains: q } } },
      { user: { email: { contains: q } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.cryptoTransaction.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstname: true, lastname: true, email: true },
        },
        cryptoReceive: true,
        cryptoBuy: true,
        cryptoSell: true,
        cryptoSend: true,
        virtualAccount: {
          include: {
            depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
            walletCurrency: {
              select: {
                symbol: true,
                name: true,
                isToken: true,
                tokenType: true,
                currency: true,
                contractAddress: true,
                decimals: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.cryptoTransaction.count({ where }),
  ]);

  const receiveRows = rows.filter((r) => r.transactionType === 'RECEIVE' && r.cryptoReceive);
  const txHashes = receiveRows.map((r) => r.cryptoReceive!.txHash).filter(Boolean);
  const receivedAssets = txHashes.length
    ? await prisma.receivedAsset.findMany({
        where: { txId: { in: txHashes } },
        select: { txId: true, status: true },
      })
    : [];
  const assetStatusMap = new Map(receivedAssets.map((a) => [a.txId, a.status]));

  const soldMap = await getSoldTotalsMapForReceives(
    receiveRows.map((tx) => ({
      id: tx.id,
      userId: tx.userId,
      virtualAccountId: tx.virtualAccountId,
      createdAt: tx.createdAt,
      amountUsd: tx.cryptoReceive!.amountUsd,
    }))
  );

  const items: TrackingListItem[] = await Promise.all(
    rows.map(async (tx) => {
      const ledgerType = resolveLedgerType(tx.transactionType, tx.balanceBucket);
      const customerName = tx.user ? `${tx.user.firstname} ${tx.user.lastname}`.trim() : '';

      if (tx.transactionType === 'RECEIVE' && tx.cryptoReceive) {
        const recv = tx.cryptoReceive;
        const masterStatus = assetStatusMap.get(recv.txHash) ?? 'unknown';
        const sold = soldMap.get(tx.id) ?? {
          soldAmount: '0',
          soldAmountUsd: '0',
          soldAmountNaira: '0',
          userRetentionUsd: recv.amountUsd.toString(),
        };
        const depositAddress = tx.virtualAccount?.depositAddresses?.[0]?.address ?? recv.toAddress;
        const onChainDepositBalance = await fetchReceiveDepositOnChainBalance({
          blockchain: tx.blockchain,
          currency: tx.currency,
          toAddress: recv.toAddress,
          depositAddress,
          walletCurrency: tx.virtualAccount?.walletCurrency,
        });
        return {
          id: tx.id,
          transactionId: tx.transactionId,
          ledgerType,
          balanceBucket: tx.balanceBucket ?? 'on_chain',
          sellBatchId: tx.sellBatchId,
          customerName,
          customerEmail: tx.user?.email ?? '',
          customerId: tx.userId,
          status: tx.status,
          masterWalletStatus: masterStatus,
          txHash: recv.txHash,
          amount: formatCryptoAmount(recv.creditedAmount ?? recv.amount),
          amountUsd: (recv.creditedAmountUsd ?? recv.amountUsd).toString(),
          amountNaira: recv.amountNaira?.toString() ?? '0',
          currency: tx.currency,
          blockchain: tx.blockchain,
          fromAddress: recv.fromAddress,
          toAddress: recv.toAddress,
          confirmations: recv.confirmations ?? 0,
          blockNumber: recv.blockNumber?.toString() ?? null,
          date: tx.createdAt.toISOString(),
          walletCurrency: tx.virtualAccount?.walletCurrency
            ? {
                symbol: tx.virtualAccount.walletCurrency.symbol,
                name: tx.virtualAccount.walletCurrency.name,
                isToken: tx.virtualAccount.walletCurrency.isToken,
                tokenType: tx.virtualAccount.walletCurrency.tokenType,
              }
            : null,
          soldAmount: sold.soldAmount,
          soldAmountUsd: sold.soldAmountUsd,
          soldAmountNaira: sold.soldAmountNaira,
          userRetentionUsd: sold.userRetentionUsd,
          onChainDepositBalance,
        };
      }

      const buy = tx.cryptoBuy;
      const sell = tx.cryptoSell;
      const send = tx.cryptoSend;
      const leg = buy ?? sell ?? send;
      const amountCrypto = leg?.amount;
      const amountUsd = leg?.amountUsd;
      const amountNaira =
        buy?.amountNaira?.toString() ?? sell?.amountNaira?.toString() ?? send?.amountNaira?.toString() ?? '0';
      const txHash = buy?.txHash ?? sell?.txHash ?? send?.txHash ?? '';

      return {
        id: tx.id,
        transactionId: tx.transactionId,
        ledgerType,
        balanceBucket: tx.balanceBucket,
        sellBatchId: tx.sellBatchId,
        customerName,
        customerEmail: tx.user?.email ?? '',
        customerId: tx.userId,
        status: tx.status,
        masterWalletStatus: '—',
        txHash: txHash ?? '',
        amount: amountCrypto ? formatCryptoAmount(amountCrypto) : '0',
        amountUsd: amountUsd?.toString() ?? '0',
        amountNaira,
        currency: tx.currency,
        blockchain: tx.blockchain,
        fromAddress: buy?.fromAddress ?? sell?.fromAddress ?? send?.fromAddress ?? '',
        toAddress: buy?.toAddress ?? sell?.toAddress ?? send?.toAddress ?? '',
        confirmations: 0,
        blockNumber: null,
        date: tx.createdAt.toISOString(),
        walletCurrency: tx.virtualAccount?.walletCurrency
          ? {
              symbol: tx.virtualAccount.walletCurrency.symbol,
              name: tx.virtualAccount.walletCurrency.name,
              isToken: tx.virtualAccount.walletCurrency.isToken,
              tokenType: tx.virtualAccount.walletCurrency.tokenType,
            }
          : null,
        soldAmount: '0',
        soldAmountUsd: '0',
        soldAmountNaira: '0',
        userRetentionUsd: '0',
        onChainDepositBalance: null,
      };
    })
  );

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getTrackingSteps(txId: string): Promise<TrackingStep[]> {
  const tx = await prisma.cryptoTransaction.findUnique({
    where: { transactionId: txId },
    include: { cryptoReceive: true, cryptoBuy: true, cryptoSell: true, cryptoSend: true },
  });
  if (!tx) return [];

  if (tx.cryptoReceive) {
    return buildReceiveTrackingSteps(tx, tx.cryptoReceive);
  }

  const ledgerType = resolveLedgerType(tx.transactionType, tx.balanceBucket);
  const steps: TrackingStep[] = [
    {
      title: `${tx.transactionType} recorded`,
      status: tx.status === 'successful' ? 'completed' : tx.status,
      date: tx.createdAt.toISOString(),
      details: {
        transactionId: tx.transactionId,
        ledgerType,
        balanceBucket: tx.balanceBucket ?? null,
        sellBatchId: tx.sellBatchId ?? null,
        currency: tx.currency,
        blockchain: tx.blockchain,
      },
    },
  ];

  const leg = tx.cryptoBuy ?? tx.cryptoSell ?? tx.cryptoSend;
  if (leg) {
    steps.push({
      title: 'Amount',
      status: 'completed',
      date: tx.updatedAt.toISOString(),
      details: {
        amount: formatCryptoAmount(leg.amount),
        amountUsd: leg.amountUsd.toString(),
        txHash: 'txHash' in leg ? (leg.txHash ?? null) : null,
      },
    });
  }

  return steps;
}

async function buildReceiveTrackingSteps(
  tx: { id: number; createdAt: Date; updatedAt: Date; status: string; currency: string; blockchain: string },
  recv: {
    txHash: string;
    fromAddress: string;
    toAddress: string;
    amount: Prisma.Decimal;
    amountUsd: Prisma.Decimal;
    amountNaira: Prisma.Decimal | null;
    confirmations: number | null;
    blockNumber: bigint | null;
  }
): Promise<TrackingStep[]> {
  const receivedAsset = await prisma.receivedAsset.findFirst({
    where: { txId: recv.txHash },
  });

  const steps: TrackingStep[] = [];

  steps.push({
    title: 'On-chain deposit detected',
    status: 'completed',
    date: tx.createdAt.toISOString(),
    details: {
      txHash: recv.txHash,
      fromAddress: recv.fromAddress,
      toAddress: recv.toAddress,
      amount: formatCryptoAmount(recv.amount),
      currency: tx.currency,
      blockchain: tx.blockchain,
      blockNumber: recv.blockNumber?.toString() ?? null,
    },
  });

  steps.push({
    title: 'Confirmations',
    status: (recv.confirmations ?? 0) > 0 ? 'completed' : 'pending',
    date: tx.updatedAt.toISOString(),
    details: {
      confirmations: recv.confirmations ?? 0,
    },
  });

  steps.push({
    title: 'Credited to user wallet',
    status: tx.status === 'successful' ? 'completed' : tx.status,
    date: tx.updatedAt.toISOString(),
    details: {
      amountUsd: recv.amountUsd.toString(),
      amountNaira: recv.amountNaira?.toString() ?? null,
      accountId: receivedAsset?.accountId ?? null,
    },
  });

  const masterStatus = receivedAsset?.status ?? 'unknown';
  const masterStepState =
    masterStatus === 'transferredToMaster'
      ? 'completed'
      : masterStatus === 'sentToVendor'
        ? 'skipped'
        : 'pending';

  steps.push({
    title: 'Transfer to master wallet',
    status: masterStepState,
    date: receivedAsset?.updatedAt?.toISOString() ?? tx.updatedAt.toISOString(),
    details: {
      masterWalletStatus: masterStatus,
      note:
        masterStatus === 'sentToVendor'
          ? 'Not used — funds were sent to a vendor from the customer deposit address (see vendor disbursement step).'
          : null,
    },
  });

  const disbursements = await prisma.receivedAssetDisbursement.findMany({
    where: { cryptoTransactionId: tx.id },
    orderBy: { createdAt: 'asc' },
    include: {
      admin: { select: { id: true, firstname: true, lastname: true, role: true } },
    },
  });

  for (const d of disbursements) {
    const done = d.status === 'successful';
    const failed = d.status === 'failed';
    steps.push({
      title:
        d.disbursementType === 'vendor'
          ? 'Vendor disbursement (from customer deposit, not master wallet)'
          : d.disbursementType === 'master_wallet'
            ? 'Master wallet disbursement (from customer deposit to configured MasterWallet address)'
            : `Received-asset disbursement (${d.disbursementType})`,
      status: done ? 'completed' : failed ? 'failed' : 'pending',
      date: d.updatedAt.toISOString(),
      details: {
        disbursementId: d.id,
        disbursementType: d.disbursementType,
        toAddress: d.toAddress,
        amount: formatCryptoAmount(d.amount),
        currency: d.currency,
        txHash: d.txHash,
        ledger: 'received_asset_disbursement',
        performedBy: d.admin
          ? `${d.admin.firstname} ${d.admin.lastname}`.trim() + ` (${formatStaffRole(d.admin.role)})`
          : d.adminUserId
            ? `User #${d.adminUserId}`
            : null,
      },
    });
  }

  return steps;
}

export async function getTrackingDetails(txId: string): Promise<TrackingDetails | null> {
  const tx = await prisma.cryptoTransaction.findUnique({
    where: { transactionId: txId },
    include: {
      cryptoReceive: true,
      cryptoBuy: true,
      cryptoSell: true,
      cryptoSend: true,
      user: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
          username: true,
          profilePicture: true,
        },
      },
      virtualAccount: {
        select: {
          id: true,
          accountId: true,
          currency: true,
          blockchain: true,
          virtualBalance: true,
          onChainBalance: true,
          availableBalance: true,
          depositAddresses: { take: 1, orderBy: { createdAt: 'desc' } },
          walletCurrency: {
            select: {
              symbol: true,
              name: true,
              isToken: true,
              tokenType: true,
              currency: true,
              contractAddress: true,
              decimals: true,
            },
          },
        },
      },
    },
  });
  if (!tx) return null;

  const ledgerType = resolveLedgerType(tx.transactionType, tx.balanceBucket);
  const customer = tx.user
    ? {
        id: tx.user.id,
        firstname: tx.user.firstname,
        lastname: tx.user.lastname,
        email: tx.user.email,
        username: tx.user.username,
        profilePicture: tx.user.profilePicture,
      }
    : null;

  const virtualAccountPayload = tx.virtualAccount
    ? {
        id: tx.virtualAccount.id,
        accountId: tx.virtualAccount.accountId,
        currency: tx.virtualAccount.currency,
        blockchain: tx.virtualAccount.blockchain,
        virtualBalance: tx.virtualAccount.virtualBalance.toString(),
        onChainBalance: tx.virtualAccount.onChainBalance.toString(),
        totalBalance: tx.virtualAccount.availableBalance.toString(),
        walletCurrency: tx.virtualAccount.walletCurrency
          ? {
              symbol: tx.virtualAccount.walletCurrency.symbol,
              name: tx.virtualAccount.walletCurrency.name,
              isToken: tx.virtualAccount.walletCurrency.isToken,
              tokenType: tx.virtualAccount.walletCurrency.tokenType,
            }
          : null,
      }
    : null;

  if (!tx.cryptoReceive) {
    const leg = tx.cryptoBuy ?? tx.cryptoSell ?? tx.cryptoSend;
    if (!leg) return null;
    return {
      transactionId: tx.transactionId,
      ledgerType,
      balanceBucket: tx.balanceBucket,
      sellBatchId: tx.sellBatchId,
      status: tx.status,
      masterWalletStatus: 'n/a',
      currency: tx.currency,
      blockchain: tx.blockchain,
      amount: formatCryptoAmount(leg.amount),
      amountUsd: leg.amountUsd.toString(),
      amountNaira:
        tx.cryptoBuy?.amountNaira?.toString() ??
        tx.cryptoSell?.amountNaira?.toString() ??
        tx.cryptoSend?.amountNaira?.toString() ??
        '0',
      fromAddress:
        tx.cryptoBuy?.fromAddress ??
        tx.cryptoSell?.fromAddress ??
        tx.cryptoSend?.fromAddress ??
        '',
      toAddress:
        tx.cryptoBuy?.toAddress ??
        tx.cryptoSell?.toAddress ??
        tx.cryptoSend?.toAddress ??
        '',
      txHash: ('txHash' in leg && leg.txHash) ? String(leg.txHash) : '',
      blockNumber: null,
      confirmations: 0,
      customer,
      receivedAsset: null,
      disbursements: [],
      virtualAccount: virtualAccountPayload,
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
      soldAmount: '0',
      soldAmountUsd: '0',
      soldAmountNaira: '0',
      userRetentionUsd: '0',
      onChainDepositBalance: null,
    };
  }

  const recv = tx.cryptoReceive;

  const receivedAsset = await prisma.receivedAsset.findFirst({
    where: { txId: recv.txHash },
  });

  const disbursements = await prisma.receivedAssetDisbursement.findMany({
    where: { cryptoTransactionId: tx.id },
    orderBy: { createdAt: 'desc' },
    include: {
      vendor: { select: { id: true, name: true, walletAddress: true } },
      admin: { select: { id: true, firstname: true, lastname: true, role: true } },
    },
  });

  const sold = await getSoldTotalsForReceive({
    receiveCryptoTxId: tx.id,
    userId: tx.userId,
    virtualAccountId: tx.virtualAccountId,
    receiveCreatedAt: tx.createdAt,
    receiveAmountUsd: recv.amountUsd,
  });

  const depositAddress = tx.virtualAccount?.depositAddresses?.[0]?.address ?? recv.toAddress;
  const onChainDepositBalance = await fetchReceiveDepositOnChainBalance({
    blockchain: tx.blockchain,
    currency: tx.currency,
    toAddress: recv.toAddress,
    depositAddress,
    walletCurrency: tx.virtualAccount?.walletCurrency,
  });

  return {
    transactionId: tx.transactionId,
    ledgerType,
    balanceBucket: tx.balanceBucket ?? 'on_chain',
    sellBatchId: tx.sellBatchId,
    status: tx.status,
    masterWalletStatus: receivedAsset?.status ?? 'unknown',
    currency: tx.currency,
    blockchain: tx.blockchain,
    amount: formatCryptoAmount(recv.creditedAmount ?? recv.amount),
    amountUsd: (recv.creditedAmountUsd ?? recv.amountUsd).toString(),
    amountNaira: recv.amountNaira?.toString() ?? '0',
    fromAddress: recv.fromAddress,
    toAddress: recv.toAddress,
    txHash: recv.txHash,
    blockNumber: recv.blockNumber?.toString() ?? null,
    confirmations: recv.confirmations ?? 0,
    customer,
    receivedAsset: receivedAsset
      ? {
          id: receivedAsset.id,
          accountId: receivedAsset.accountId,
          status: receivedAsset.status,
          reference: receivedAsset.reference,
          index: receivedAsset.index,
          transactionDate: receivedAsset.transactionDate?.toISOString() ?? null,
        }
      : null,
    disbursements: disbursements.map((d) => ({
      id: d.id,
      disbursementType: d.disbursementType,
      status: d.status,
      amount: formatCryptoAmount(d.amount),
      amountUsd: d.amountUsd?.toString() ?? null,
      currency: d.currency,
      blockchain: d.blockchain,
      toAddress: d.toAddress,
      txHash: d.txHash,
      vendor: d.vendor
        ? {
            id: d.vendor.id,
            name: d.vendor.name,
            walletAddress: d.vendor.walletAddress,
          }
        : null,
      adminUserId: d.adminUserId,
      performedBy: mapStaffActor(d.admin),
      networkFee: d.networkFee?.toString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    virtualAccount: virtualAccountPayload,
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    soldAmount: sold.soldAmount,
    soldAmountUsd: sold.soldAmountUsd,
    soldAmountNaira: sold.soldAmountNaira,
    userRetentionUsd: sold.userRetentionUsd,
    onChainDepositBalance,
  };
}
