import { obiexClient, ObiexApiError } from './obiex.client';
import { roundNgn } from './obiex.markup';
import ApiError from '../../utils/ApiError';

/**
 * Company PalmPay merchant account — Obiex NGNX sell proceeds land here.
 * Override with OBIEX_SELL_SETTLEMENT_* env vars.
 */
function getSellSettlementDestination() {
  return {
    accountNumber: String(
      process.env.OBIEX_SELL_SETTLEMENT_ACCOUNT_NUMBER || '8886740979'
    ).replace(/\D/g, ''),
    accountName: String(
      process.env.OBIEX_SELL_SETTLEMENT_ACCOUNT_NAME || 'TERCES SOLUTION LIMITED'
    ).trim(),
    bankName: String(process.env.OBIEX_SELL_SETTLEMENT_BANK_NAME || 'PalmPay').trim(),
    /** Obiex NGN bank list: PALMPAY uuid/sortCode = 100033 */
    bankCode: String(process.env.OBIEX_SELL_SETTLEMENT_BANK_CODE || '100033').trim(),
  };
}

function unwrapData(res: any) {
  return res?.data ?? res;
}

/**
 * After crypto→NGNX sell swap, withdraw NGNX to PalmPay business account via Obiex fiat debit.
 * Admin-only settlement note — user sell UX stays "credit Naira wallet".
 */
export async function settleObiexSellNgnxToBusinessAccount(params: {
  amountNgn: number;
  tradeId: string;
  userId: number;
  sourceCurrency: string;
}): Promise<{
  status: 'success' | 'skipped' | 'failed';
  adminNote: Record<string, unknown>;
}> {
  const skip =
    String(process.env.OBIEX_SELL_SKIP_FIAT_WITHDRAW || '').toLowerCase() === 'true' ||
    String(process.env.OBIEX_SELL_SKIP_FIAT_WITHDRAW || '') === '1';

  const amount = roundNgn(params.amountNgn);
  const destination = getSellSettlementDestination();

  if (skip) {
    return {
      status: 'skipped',
      adminNote: {
        kind: 'obiex_sell_ngnx_to_business',
        status: 'skipped',
        reason: 'OBIEX_SELL_SKIP_FIAT_WITHDRAW',
        amountNgn: amount,
        destination,
        tradeId: params.tradeId,
        userId: params.userId,
        createdAt: new Date().toISOString(),
      },
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      status: 'failed',
      adminNote: {
        kind: 'obiex_sell_ngnx_to_business',
        status: 'failed',
        reason: 'invalid_amount',
        amountNgn: amount,
        tradeId: params.tradeId,
        createdAt: new Date().toISOString(),
      },
    };
  }

  if (!destination.accountNumber || !destination.bankCode) {
    throw ApiError.badRequest(
      'Sell settlement account not configured (OBIEX_SELL_SETTLEMENT_ACCOUNT_NUMBER / BANK_CODE)'
    );
  }

  // Optional: leave a small buffer for Obiex fiat withdraw fee (docs example fee ₦50).
  let withdrawAmount = amount;
  const feeBuffer = Number(process.env.OBIEX_SELL_WITHDRAW_FEE_BUFFER_NGN);
  if (Number.isFinite(feeBuffer) && feeBuffer > 0 && amount > feeBuffer) {
    withdrawAmount = roundNgn(amount - feeBuffer);
  }

  try {
    const res = await obiexClient.withdrawFiat({
      destination: {
        accountNumber: destination.accountNumber,
        accountName: destination.accountName,
        bankName: destination.bankName,
        bankCode: destination.bankCode,
      },
      amount: withdrawAmount,
      currency: 'NGNX',
      narration: `Sell settle ${params.sourceCurrency} ${params.tradeId}`.slice(0, 100),
    });
    const data = unwrapData(res);

    return {
      status: 'success',
      adminNote: {
        kind: 'obiex_sell_ngnx_to_business',
        status: 'success',
        tradeId: params.tradeId,
        userId: params.userId,
        sourceCurrency: params.sourceCurrency,
        swapNgnxAmount: amount,
        withdrawAmountNgn: withdrawAmount,
        feeBufferNgn: Number.isFinite(feeBuffer) && feeBuffer > 0 ? feeBuffer : 0,
        destination,
        withdraw: {
          id: data?.id || null,
          reference: data?.reference || null,
          amount: data?.amount ?? withdrawAmount,
          payoutStatus: data?.payout?.status || null,
          payoutFee: data?.payout?.fee ?? null,
          payoutAmount: data?.payout?.payoutAmount ?? null,
          transferReference: data?.payout?.transferReference || null,
        },
        createdAt: new Date().toISOString(),
      },
    };
  } catch (e: any) {
    const message =
      e instanceof ObiexApiError ? e.message : e?.message || 'Obiex fiat withdraw failed';
    console.error('[Obiex sell settlement] withdraw failed', {
      tradeId: params.tradeId,
      amount: withdrawAmount,
      message,
    });
    return {
      status: 'failed',
      adminNote: {
        kind: 'obiex_sell_ngnx_to_business',
        status: 'failed',
        tradeId: params.tradeId,
        userId: params.userId,
        sourceCurrency: params.sourceCurrency,
        swapNgnxAmount: amount,
        withdrawAmountNgn: withdrawAmount,
        destination,
        error: message,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
