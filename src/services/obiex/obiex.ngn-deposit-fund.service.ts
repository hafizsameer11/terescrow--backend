import { v4 as uuidv4 } from 'uuid';
import { obiexClient, ObiexApiError } from './obiex.client';
import { palmpayPayout } from '../palmpay/palmpay.payout.service';
import { palmpayConfig } from '../palmpay/palmpay.config';
import { roundNgn } from './obiex.markup';
import ApiError from '../../utils/ApiError';

/** Flat Obiex NGN deposit fee (₦) when issue response omits fee. Live tests: always 100. */
const DEFAULT_OBIEX_NGN_DEPOSIT_FEE_NGN = 100;

export type ObiexNgnDepositIssue = {
  amount: number;
  reference: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  expiresAt?: string | null;
  nameMatchEnabled?: boolean;
  fee: number;
  minimumDeposit?: number;
  maximumDeposit?: number;
  maximumDailyDeposit?: number;
};

function unwrapData(res: any) {
  return res?.data ?? res;
}

/**
 * Map Obiex VA bankName → PalmPay payeeBankCode.
 * Env OBIEX_NGN_DEPOSIT_BANK_CODE overrides when set.
 */
export function resolvePalmpayBankCodeForObiexVa(bankName?: string | null): string {
  const envCode = String(process.env.OBIEX_NGN_DEPOSIT_BANK_CODE || '').trim();
  if (envCode) return envCode;

  const n = String(bankName || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const map: Record<string, string> = {
    'sterling bank': '000001',
    sterling: '000001',
    'sterling bank plc': '000001',
  };
  if (map[n]) return map[n];
  for (const [key, code] of Object.entries(map)) {
    if (n.includes(key) || key.includes(n)) return code;
  }
  throw ApiError.badRequest(
    `Unsupported Obiex deposit bank "${bankName || ''}". Set OBIEX_NGN_DEPOSIT_BANK_CODE.`
  );
}

async function readNgnxAvailable(): Promise<number> {
  const balRes = await obiexClient.getWalletBalance('NGNX');
  const data = unwrapData(balRes);
  return Number(data?.availableBalance ?? data?.totalSwappableBalance ?? 0) || 0;
}

async function waitForNgnxCredit(params: {
  beforeAvailable: number;
  minCreditNgn: number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ available: number; credited: number }> {
  const timeoutMs = params.timeoutMs ?? Number(process.env.OBIEX_NGN_DEPOSIT_WAIT_MS || 90_000);
  const intervalMs = params.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  let last = params.beforeAvailable;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      last = await readNgnxAvailable();
      const credited = roundNgn(last - params.beforeAvailable);
      if (credited + 1e-6 >= params.minCreditNgn) {
        return { available: last, credited };
      }
    } catch (e: any) {
      console.warn('[Obiex NGN fund] balance poll failed:', e?.message || e);
    }
  }

  throw ApiError.badRequest(
    `Obiex NGNX credit not confirmed in time (need ≥ ₦${params.minCreditNgn}, started at ₦${params.beforeAvailable}, last ₦${last})`
  );
}

/**
 * Fund Obiex NGNX for a buy:
 * 1) Issue amount-locked deposit VA for gross = creditNeeded + fee
 * 2) PalmPay payout exact gross (not gross+fee)
 * 3) Wait until NGNX available rises by ~creditNeeded
 *
 * Admin-only details returned in `adminNote` (never show provider brands to end users).
 */
export async function fundObiexNgnxViaPalmpayForBuy(params: {
  /** Net NGNX needed on Obiex after deposit fee (swap source). */
  creditNeededNgn: number;
  tradeId: string;
  userId: number;
}): Promise<{
  issueAmountNgn: number;
  feeNgn: number;
  expectedCreditNgn: number;
  deposit: ObiexNgnDepositIssue;
  payout: {
    orderId: string;
    orderNo?: string;
    orderStatus?: number;
    sessionId?: string | null;
  };
  adminNote: Record<string, unknown>;
}> {
  const creditNeeded = roundNgn(params.creditNeededNgn);
  if (!Number.isFinite(creditNeeded) || creditNeeded <= 0) {
    throw ApiError.badRequest('Invalid Obiex buy funding amount');
  }

  let feeGuess = Number(process.env.OBIEX_NGN_DEPOSIT_FEE_NGN);
  if (!Number.isFinite(feeGuess) || feeGuess < 0) {
    feeGuess = DEFAULT_OBIEX_NGN_DEPOSIT_FEE_NGN;
  }

  let issueAmount = roundNgn(creditNeeded + feeGuess);
  if (issueAmount < 1) throw ApiError.badRequest('Buy funding amount too small');

  let issuedRaw: any;
  try {
    issuedRaw = await obiexClient.issueNgnDepositAccount({ amount: issueAmount });
  } catch (e: any) {
    if (e instanceof ObiexApiError) throw ApiError.badRequest(e.message);
    throw e;
  }

  let data = unwrapData(issuedRaw) as ObiexNgnDepositIssue;
  let feeNgn = Number(data?.fee);
  if (!Number.isFinite(feeNgn) || feeNgn < 0) feeNgn = feeGuess;

  // If fee from response leaves net short, re-issue once with corrected gross.
  if (roundNgn(issueAmount - feeNgn) + 1e-9 < creditNeeded) {
    issueAmount = roundNgn(creditNeeded + feeNgn);
    issuedRaw = await obiexClient.issueNgnDepositAccount({ amount: issueAmount });
    data = unwrapData(issuedRaw) as ObiexNgnDepositIssue;
    feeNgn = Number(data?.fee);
    if (!Number.isFinite(feeNgn) || feeNgn < 0) feeNgn = feeGuess;
  }

  const accountNumber = String(data?.accountNumber || '').replace(/\D/g, '');
  const bankName = String(data?.bankName || '');
  const accountName = String(data?.accountName || 'Unknown');
  const reference = String(data?.reference || '');
  if (!accountNumber || !reference) {
    throw ApiError.badRequest('Obiex deposit account issue returned incomplete details');
  }

  const bankCode = resolvePalmpayBankCodeForObiexVa(bankName);
  const beforeAvailable = await readNgnxAvailable();

  const orderId = `obxbuy${uuidv4().replace(/-/g, '')}`.substring(0, 32);
  const amountKobo = Math.round(issueAmount * 100);

  let payoutRes: any;
  try {
    payoutRes = await palmpayPayout.initiatePayout({
      orderId,
      title: 'Crypto buy funding',
      description: `Fund Obiex NGN for trade ${params.tradeId}`,
      payeeName: accountName.slice(0, 50),
      payeeBankCode: bankCode,
      payeeBankAccNo: accountNumber,
      currency: 'NGN',
      amount: amountKobo,
      notifyUrl: palmpayConfig.getWebhookUrl(),
      remark: `buy:${params.tradeId}:${reference}`.slice(0, 200),
    });
  } catch (e: any) {
    throw ApiError.badRequest(e?.message || 'Failed to fund Obiex deposit account');
  }

  const expectedCreditNgn = roundNgn(issueAmount - feeNgn);
  const wait = await waitForNgnxCredit({
    beforeAvailable,
    minCreditNgn: Math.min(creditNeeded, expectedCreditNgn),
  });

  const adminNote = {
    kind: 'obiex_ngn_deposit_via_payout',
    tradeId: params.tradeId,
    userId: params.userId,
    creditNeededNgn: creditNeeded,
    issueAmountNgn: issueAmount,
    feeNgn,
    expectedCreditNgn,
    creditedNgn: wait.credited,
    ngnxAvailableAfter: wait.available,
    deposit: {
      reference,
      amount: Number(data.amount) || issueAmount,
      bankName,
      accountName,
      accountNumber,
      expiresAt: data.expiresAt || null,
      nameMatchEnabled: data.nameMatchEnabled === true,
      fee: feeNgn,
      minimumDeposit: data.minimumDeposit ?? null,
      maximumDeposit: data.maximumDeposit ?? null,
    },
    payout: {
      orderId,
      orderNo: payoutRes?.orderNo || null,
      orderStatus: payoutRes?.orderStatus ?? null,
      sessionId: payoutRes?.sessionId || null,
      bankCode,
      amountNgn: issueAmount,
      /** Exact transfer — do not add fee on top. */
      amountSentEqualsIssueAmount: true,
    },
    createdAt: new Date().toISOString(),
  };

  return {
    issueAmountNgn: issueAmount,
    feeNgn,
    expectedCreditNgn,
    deposit: {
      amount: Number(data.amount) || issueAmount,
      reference,
      bankName,
      accountName,
      accountNumber,
      expiresAt: data.expiresAt || null,
      nameMatchEnabled: data.nameMatchEnabled === true,
      fee: feeNgn,
      minimumDeposit: data.minimumDeposit,
      maximumDeposit: data.maximumDeposit,
      maximumDailyDeposit: data.maximumDailyDeposit,
    },
    payout: {
      orderId,
      orderNo: payoutRes?.orderNo,
      orderStatus: payoutRes?.orderStatus,
      sessionId: payoutRes?.sessionId || null,
    },
    adminNote,
  };
}
