import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../utils/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { obiexClient } from './obiex.client';
import { getObiexAvailable, getOrCreateObiexAsset } from './obiex.ledger.service';

const reconModel = () => (prisma as any).obiexTradeReconciliation;
const assetModel = () => (prisma as any).obiexUserAsset;

const EPS = 1e-6;

function unwrapData(res: any) {
  return res?.data ?? res;
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function dec(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return null;
  return new Decimal(n);
}

function delta(after: number | null, before: number | null): number | null {
  if (after == null || before == null) return null;
  return after - before;
}

function mismatchPair(
  expected: number | null | undefined,
  actual: number | null | undefined,
  label: string
): string | null {
  if (expected == null || actual == null) return null;
  if (Math.abs(expected - actual) <= EPS) return null;
  return `${label}: expected ${expected}, actual ${actual}`;
}

export async function fetchMasterBalance(currency: string): Promise<{
  available: number | null;
  raw: unknown;
}> {
  const code = String(currency || '').toUpperCase();
  try {
    const res = await obiexClient.getWalletBalance(code);
    const data = unwrapData(res);
    const available = toNum(
      data?.availableBalance ?? data?.totalSwappableBalance ?? data?.balance ?? data?.available
    );
    return { available, raw: data };
  } catch (e: any) {
    console.warn(`[Obiex recon] master balance ${code} failed`, e?.message || e);
    return { available: null, raw: { error: e?.message || String(e) } };
  }
}

export type TradeReconBeginInput = {
  tradeLogId: string;
  userId: number;
  side: string;
  coinCurrency: string;
  expectedMasterNgnxDelta?: number | null;
  expectedMasterCoinDelta?: number | null;
  expectedUserLedgerDelta?: number | null;
  /** Skip NGNX fetch (e.g. crypto-only convert). */
  includeNgnx?: boolean;
};

export type TradeReconBeginResult = {
  id: string;
  masterNgnxBefore: number | null;
  masterCoinBefore: number | null;
  userLedgerBefore: number | null;
  providerBefore: Record<string, unknown>;
};

/**
 * Capture master + user ledger BEFORE the Obiex mutating call.
 * Call after trade log row exists (or create trade first with pending status).
 */
export async function beginTradeRecon(
  input: TradeReconBeginInput
): Promise<TradeReconBeginResult> {
  const coin = String(input.coinCurrency).toUpperCase();
  const includeNgnx = input.includeNgnx !== false;

  const [ngnx, coinBal, userLedger] = await Promise.all([
    includeNgnx ? fetchMasterBalance('NGNX') : Promise.resolve({ available: null, raw: null }),
    fetchMasterBalance(coin),
    getObiexAvailable(input.userId, coin),
  ]);

  const id = uuidv4();
  await reconModel().create({
    data: {
      id,
      tradeLogId: input.tradeLogId,
      userId: input.userId,
      side: input.side,
      coinCurrency: coin,
      masterNgnxBefore: dec(ngnx.available),
      masterCoinBefore: dec(coinBal.available),
      userLedgerBefore: dec(userLedger),
      expectedMasterNgnxDelta: dec(input.expectedMasterNgnxDelta ?? null),
      expectedMasterCoinDelta: dec(input.expectedMasterCoinDelta ?? null),
      expectedUserLedgerDelta: dec(input.expectedUserLedgerDelta ?? null),
      providerBalances: {
        before: { NGNX: ngnx.raw, [coin]: coinBal.raw },
      },
    },
  });

  return {
    id,
    masterNgnxBefore: ngnx.available,
    masterCoinBefore: coinBal.available,
    userLedgerBefore: userLedger,
    providerBefore: { NGNX: ngnx.raw, [coin]: coinBal.raw },
  };
}

export type TradeReconFinalizeInput = {
  tradeLogId: string;
  /** Override expected deltas if only known after the API response. */
  expectedMasterNgnxDelta?: number | null;
  expectedMasterCoinDelta?: number | null;
  expectedUserLedgerDelta?: number | null;
  includeNgnx?: boolean;
};

/**
 * Capture AFTER balances, compute actual deltas, flag mismatch, update user asset reconcile fields.
 */
export async function finalizeTradeRecon(input: TradeReconFinalizeInput) {
  const existing = await reconModel().findUnique({ where: { tradeLogId: input.tradeLogId } });
  if (!existing) return null;

  const coin = String(existing.coinCurrency).toUpperCase();
  const includeNgnx = input.includeNgnx !== false;

  const [ngnx, coinBal, userLedger] = await Promise.all([
    includeNgnx ? fetchMasterBalance('NGNX') : Promise.resolve({ available: null, raw: null }),
    fetchMasterBalance(coin),
    getObiexAvailable(existing.userId, coin),
  ]);

  const beforeNgnx = toNum(existing.masterNgnxBefore);
  const beforeCoin = toNum(existing.masterCoinBefore);
  const beforeUser = toNum(existing.userLedgerBefore);

  const actualNgnx = delta(ngnx.available, beforeNgnx);
  const actualCoin = delta(coinBal.available, beforeCoin);
  const actualUser = delta(userLedger, beforeUser);

  const expectedNgnx =
    input.expectedMasterNgnxDelta != null
      ? input.expectedMasterNgnxDelta
      : toNum(existing.expectedMasterNgnxDelta);
  const expectedCoin =
    input.expectedMasterCoinDelta != null
      ? input.expectedMasterCoinDelta
      : toNum(existing.expectedMasterCoinDelta);
  const expectedUser =
    input.expectedUserLedgerDelta != null
      ? input.expectedUserLedgerDelta
      : toNum(existing.expectedUserLedgerDelta);

  const details = [
    mismatchPair(expectedNgnx, actualNgnx, 'masterNgnx'),
    mismatchPair(expectedCoin, actualCoin, 'masterCoin'),
    mismatchPair(expectedUser, actualUser, 'userLedger'),
  ].filter(Boolean) as string[];

  const mismatch = details.length > 0;
  const prevProvider =
    existing.providerBalances && typeof existing.providerBalances === 'object'
      ? (existing.providerBalances as Record<string, unknown>)
      : {};

  const updated = await reconModel().update({
    where: { tradeLogId: input.tradeLogId },
    data: {
      masterNgnxAfter: dec(ngnx.available),
      masterCoinAfter: dec(coinBal.available),
      userLedgerAfter: dec(userLedger),
      expectedMasterNgnxDelta: dec(expectedNgnx),
      expectedMasterCoinDelta: dec(expectedCoin),
      expectedUserLedgerDelta: dec(expectedUser),
      actualMasterNgnxDelta: dec(actualNgnx),
      actualMasterCoinDelta: dec(actualCoin),
      actualUserLedgerDelta: dec(actualUser),
      mismatch,
      mismatchDetail: mismatch ? details.join('; ') : null,
      providerBalances: {
        ...prevProvider,
        after: { NGNX: ngnx.raw, [coin]: coinBal.raw },
      },
    },
  });

  try {
    await getOrCreateObiexAsset(existing.userId, coin);
    await assetModel().update({
      where: {
        userId_currency: { userId: existing.userId, currency: coin },
      },
      data: {
        lastObiexMasterBalance: dec(coinBal.available),
        lastReconciledAt: new Date(),
        reconcileMismatch: mismatch,
      },
    });
  } catch (e: any) {
    console.warn('[Obiex recon] user asset reconcile fields update failed', e?.message || e);
  }

  return updated;
}

/** Lightweight ledger-only recon for webhook credits (deposit/collection). */
export async function recordLedgerOnlyRecon(params: {
  tradeLogId: string;
  userId: number;
  side: string;
  coinCurrency: string;
  userLedgerBefore: number;
  userLedgerAfter: number;
  expectedUserLedgerDelta: number;
  masterCoinAfter?: number | null;
}) {
  const coin = String(params.coinCurrency).toUpperCase();
  const actualUser = params.userLedgerAfter - params.userLedgerBefore;
  const mismatch = Math.abs(actualUser - params.expectedUserLedgerDelta) > EPS;
  let masterCoin: number | null = params.masterCoinAfter ?? null;
  let rawCoin: unknown = null;
  if (masterCoin == null) {
    const fetched = await fetchMasterBalance(coin);
    masterCoin = fetched.available;
    rawCoin = fetched.raw;
  }

  return reconModel().create({
    data: {
      id: uuidv4(),
      tradeLogId: params.tradeLogId,
      userId: params.userId,
      side: params.side,
      coinCurrency: coin,
      userLedgerBefore: dec(params.userLedgerBefore),
      userLedgerAfter: dec(params.userLedgerAfter),
      masterCoinAfter: dec(masterCoin),
      expectedUserLedgerDelta: dec(params.expectedUserLedgerDelta),
      actualUserLedgerDelta: dec(actualUser),
      mismatch,
      mismatchDetail: mismatch
        ? `userLedger: expected ${params.expectedUserLedgerDelta}, actual ${actualUser}`
        : null,
      providerBalances: { after: { [coin]: rawCoin } },
    },
  });
}

export async function getTradeReconByTradeId(tradeLogId: string) {
  return reconModel().findUnique({
    where: { tradeLogId },
    include: {
      tradeLog: {
        select: {
          id: true,
          side: true,
          status: true,
          sourceCurrency: true,
          targetCurrency: true,
          sourceAmount: true,
          targetAmount: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function listMismatchedRecons(limit = 50) {
  return reconModel().findMany({
    where: { mismatch: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, limit)),
  });
}
