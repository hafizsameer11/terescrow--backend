import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { palmpayBanks } from '../../services/palmpay/palmpay.banks.service';
import { palmpayPayout } from '../../services/palmpay/palmpay.payout.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { palmpayConfig } from '../../services/palmpay/palmpay.config';
import { getCustomerRestrictions, isFeatureFrozen, FEATURE_WITHDRAWAL } from '../../utils/customer.restrictions';
import { assertPalmpayWithdrawEnabled } from '../../services/admin/platform.operation.settings.service';
import { toCustomerSafeError } from '../../utils/customerSafeError';
import { transferReferralToFiatWallet, assertReferralWithdrawAvailable } from '../../services/referral/referral.withdraw.service';
import { palmpayKoboToNgn } from '../../services/palmpay/palmpay.merchant.service';

/**
 * Network payout fee preview (provider returns exact fee+vat in kobo on payout).
 * Set PALMPAY_WITHDRAW_FEE_NGN for UI/balance preview when known commercially.
 */
function getConfiguredNetworkFeeNgn(): number {
  const fromEnv = Number(process.env.PALMPAY_WITHDRAW_FEE_NGN);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  return 0;
}

/** ₦50 service + ₦50 stamp on withdrawals above ₦10,000 (stacks on network fee). */
const WITHDRAW_SERVICE_FEE_NGN = 50;
const WITHDRAW_STAMP_DUTY_NGN = 50;
const WITHDRAW_STAMP_THRESHOLD_NGN = 10_000;

function getAppWithdrawFeeNgn(amountNgn: number): number {
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) return 0;
  if (amountNgn > WITHDRAW_STAMP_THRESHOLD_NGN) {
    return WITHDRAW_SERVICE_FEE_NGN + WITHDRAW_STAMP_DUTY_NGN;
  }
  return 0;
}

function buildWithdrawFeePreview(amountNgn: number) {
  const networkFeeNgn = getConfiguredNetworkFeeNgn();
  const appFeeNgn = getAppWithdrawFeeNgn(amountNgn);
  return {
    networkFeeNgn,
    appFeeNgn,
    feeNgn: networkFeeNgn + appFeeNgn,
  };
}

/** Convert provider payout `fee` object (kobo) → NGN. */
function feeNgnFromPalmpayResponse(data: {
  fee?: { fee?: number; vat?: number } | null;
} | null | undefined): number | null {
  const raw = data?.fee;
  if (!raw || typeof raw !== 'object') return null;
  const kobo = (Number(raw.fee) || 0) + (Number(raw.vat) || 0);
  if (!Number.isFinite(kobo) || kobo < 0) return null;
  return palmpayKoboToNgn(kobo);
}

/**
 * Get withdrawal fee config
 * GET /api/v2/payments/palmpay/payout/fee?amount=15000
 */
export const getWithdrawFeeController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const amountNgn = Number(req.query.amount);
    const preview = buildWithdrawFeePreview(
      Number.isFinite(amountNgn) && amountNgn > 0 ? amountNgn : 0
    );
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          feeNgn: preview.feeNgn,
          currency: 'NGN',
          /** Single total for the app — network fee + ₦50+₦50 when amount > ₦10k. */
          feeSource: 'combined',
        },
        'Withdrawal fee retrieved successfully'
      )
    );
  } catch (error: unknown) {
    return next(toCustomerSafeError(error, 'Get withdraw fee error:'));
  }
};

/**
 * Get bank list
 * GET /api/v2/payments/palmpay/banks
 */
export const getBankListController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { businessType = 0 } = req.query;

    const banks = await palmpayBanks.queryBankList(Number(businessType));

    return res.status(200).json(
      new ApiResponse(200, banks, 'Bank list retrieved successfully')
    );
  } catch (error: unknown) {
    return next(toCustomerSafeError(error, 'Get bank list error:'));
  }
};

/**
 * Verify bank account
 * POST /api/v2/payments/palmpay/verify-account
 */
export const verifyBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { bankCode, accountNumber } = req.body;

    if (!bankCode || !accountNumber) {
      return next(ApiError.badRequest('Bank code and account number are required'));
    }

    // Check if it's PalmPay account (bankCode "100033")
    if (bankCode === '100033') {
      const result = await palmpayBanks.queryAccount(accountNumber);
      return res.status(200).json(
        new ApiResponse(200, {
          accountName: result.accountName,
          accountStatus: result.accountStatus,
          isValid: result.accountStatus === 0,
        }, 'Account verified successfully')
      );
    }

    // Regular bank account
    const result = await palmpayBanks.queryBankAccount(bankCode, accountNumber);

    return res.status(200).json(
      new ApiResponse(200, {
        accountName: result.accountName,
        status: result.status,
        isValid: result.status === 'Success',
        errorMessage: result.errorMessage,
      }, 'Account verified successfully')
    );
  } catch (error: unknown) {
    return next(toCustomerSafeError(error, 'Verify account error:'));
  }
};

/**
 * Initiate payout (withdrawal)
 * POST /api/v2/payments/palmpay/payout/initiate
 */
export const initiatePayoutController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user || req.body._user;
    await assertPalmpayWithdrawEnabled();
    const restrictions = await getCustomerRestrictions(user.id);
    if (restrictions.banned) {
      return next(ApiError.forbidden('Your account has been banned. Contact support.'));
    }
    if (isFeatureFrozen(restrictions, FEATURE_WITHDRAWAL)) {
      return next(ApiError.forbidden('Withdrawal is temporarily disabled for your account.'));
    }
    const {
      amount,
      currency = 'NGN',
      bankCode,
      accountNumber,
      accountName,
      phoneNumber,
      walletSource,
      withdrawalSource,
    } = req.body;

    const isReferralSource =
      String(walletSource || withdrawalSource || '').toLowerCase() === 'referral';

    // Validate inputs
    if (!amount || amount <= 0) {
      return next(ApiError.badRequest('Amount must be greater than 0'));
    }

    if (!bankCode || !accountNumber) {
      return next(ApiError.badRequest('Bank code and account number are required'));
    }

    // Convert amount to cents
    const amountInCents = Math.round(parseFloat(amount) * 100);
    if (amountInCents < 100) {
      return next(ApiError.badRequest('Minimum amount is 1.00 NGN'));
    }

    const amountDecimal = parseFloat(amount);
    // Preview fee for balance check / referral hold (ignore any client-sent fee).
    // Final debit = exact network fee from payout response + app fee (₦50+₦50 if > ₦10k).
    const appFeeNgn = getAppWithdrawFeeNgn(amountDecimal);
    const networkFeePreview = getConfiguredNetworkFeeNgn();
    const previewFee = networkFeePreview + appFeeNgn;
    const previewTotalDebit = amountDecimal + previewFee;

    // Get or create wallet
    const wallet = await fiatWalletService.getOrCreateWallet(user.id, currency);

    if (isReferralSource) {
      if (String(currency).toUpperCase() !== 'NGN') {
        return next(ApiError.badRequest('Referral withdrawals must be in NGN'));
      }
      try {
        await assertReferralWithdrawAvailable(user.id, previewTotalDebit);
      } catch (err: any) {
        if (err instanceof ApiError) {
          return next(err);
        }
        throw err;
      }
    } else {
      // Check fiat balance for normal withdrawals (amount + preview fee)
      const balance = await fiatWalletService.getBalance(wallet.id);
      if (!balance || parseFloat(balance.balance) < previewTotalDebit) {
        const feeNote =
          previewFee > 0 ? ` (incl. ₦${previewFee} fee)` : '';
        return next(ApiError.badRequest(
          `Insufficient balance. Required: ${previewTotalDebit.toFixed(2)} ${currency.toUpperCase()}${feeNote}, Available: ${balance?.balance || '0'} ${currency.toUpperCase()}`
        ));
      }
    }

    // Check withdrawal limits (daily and monthly) based on KYC tier
    try {
      // Withdrawal caps from KycLimits by highest verified tier (Tier 1 default).
      const userWithKyc = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          kycTier1Verified: true,
          kycTier2Verified: true,
          kycTier3Verified: true,
          kycTier4Verified: true,
        },
      });

      const limitsTier = userWithKyc?.kycTier4Verified
        ? 'tier4'
        : userWithKyc?.kycTier3Verified
          ? 'tier3'
          : userWithKyc?.kycTier2Verified
            ? 'tier2'
            : 'tier1';
      const tierLimits = await prisma.kycLimits.findUnique({ where: { tier: limitsTier } });
      const dailyFromDb = Number(tierLimits?.withdrawalDailyLimit);
      const monthlyFromDb = Number(tierLimits?.withdrawalMonthlyLimit);
      // Fallbacks match client sheet Tier 1 if row missing.
      let DAILY_WITHDRAWAL_LIMIT =
        Number.isFinite(dailyFromDb) && dailyFromDb > 0 ? dailyFromDb : 2_000_000;
      let MONTHLY_WITHDRAWAL_LIMIT =
        Number.isFinite(monthlyFromDb) && monthlyFromDb > 0 ? monthlyFromDb : 30_000_000;
      
      const now = new Date();
      
      // Calculate today's total withdrawals
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const dailyWithdrawals = await prisma.fiatTransaction.aggregate({
        where: {
          userId: user.id,
          type: 'WITHDRAW',
          status: { in: ['completed', 'successful', 'pending'] }, // Include pending as they're already debited
          currency: currency.toUpperCase(),
          createdAt: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const dailyTotal = dailyWithdrawals._sum.amount?.toNumber() || 0;
      const newDailyTotal = dailyTotal + amountDecimal;

      // Calculate current month's total withdrawals
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const monthlyWithdrawals = await prisma.fiatTransaction.aggregate({
        where: {
          userId: user.id,
          type: 'WITHDRAW',
          status: { in: ['completed', 'successful', 'pending'] }, // Include pending as they're already debited
          currency: currency.toUpperCase(),
          createdAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const monthlyTotal = monthlyWithdrawals._sum.amount?.toNumber() || 0;
      const newMonthlyTotal = monthlyTotal + amountDecimal;

      // Check daily limit first
      if (newDailyTotal > DAILY_WITHDRAWAL_LIMIT) {
        const remainingDaily = Math.max(0, DAILY_WITHDRAWAL_LIMIT - dailyTotal);
        return next(ApiError.badRequest(
          `Daily withdrawal limit exceeded. You are trying to withdraw ${amountDecimal.toLocaleString()} ${currency.toUpperCase()}, but your remaining daily limit is ${remainingDaily.toLocaleString()} ${currency.toUpperCase()}. Your daily limit is ${DAILY_WITHDRAWAL_LIMIT.toLocaleString()} ${currency.toUpperCase()} and you have already withdrawn ${dailyTotal.toLocaleString()} ${currency.toUpperCase()} today. Please reduce the withdrawal amount or try again tomorrow.`
        ));
      }

      // Check monthly limit
      if (newMonthlyTotal > MONTHLY_WITHDRAWAL_LIMIT) {
        const remainingMonthly = Math.max(0, MONTHLY_WITHDRAWAL_LIMIT - monthlyTotal);
        return next(ApiError.badRequest(
          `Monthly withdrawal limit exceeded. You are trying to withdraw ${amountDecimal.toLocaleString()} ${currency.toUpperCase()}, but your remaining monthly limit is ${remainingMonthly.toLocaleString()} ${currency.toUpperCase()}. Your monthly limit is ${MONTHLY_WITHDRAWAL_LIMIT.toLocaleString()} ${currency.toUpperCase()} and you have already withdrawn ${monthlyTotal.toLocaleString()} ${currency.toUpperCase()} this month. Please reduce the withdrawal amount or try again next month.`
        ));
      }
    } catch (limitError: any) {
      console.error('Withdrawal limit check error:', limitError);
      return next(ApiError.internal('Unable to verify withdrawal limits. Please try again or contact support.'));
    }

    // Move referral funds into fiat only after validation so limit failures don't debit referral.
    // Transfer amount + preview fee; if PalmPay fee is higher we debit the difference after.
    if (isReferralSource) {
      try {
        await transferReferralToFiatWallet(user.id, previewTotalDebit);
      } catch (err: any) {
        if (err instanceof ApiError) {
          return next(err);
        }
        throw err;
      }
    }

    // Generate unique order ID
    const orderId = `payout_${uuidv4().replace(/-/g, '')}`.substring(0, 32);

    // Create transaction record (fees finalized after PalmPay response)
    const transaction = await prisma.fiatTransaction.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        walletId: wallet.id,
        type: 'WITHDRAW',
        status: 'pending',
        currency: currency.toUpperCase(),
        amount: amountDecimal,
        fees: previewFee,
        totalAmount: previewTotalDebit,
        description: isReferralSource
          ? `Referral withdrawal to ${accountNumber}`
          : `Withdrawal to ${accountNumber}`,
        metadata: JSON.stringify({
          walletSource: isReferralSource ? 'referral' : 'fiat',
          withdrawalSource: isReferralSource ? 'referral' : 'fiat',
          previewFeeNgn: previewFee,
          appFeeNgn,
          networkFeePreviewNgn: networkFeePreview,
        }),
        palmpayOrderId: orderId,
        payeeName: accountName,
        payeeBankCode: bankCode,
        payeeBankAccNo: accountNumber,
        payeePhoneNo: phoneNumber,
      },
    });

    // Call PalmPay API to initiate payout
    const palmpayResponse = await palmpayPayout.initiatePayout({
      orderId,
      title: 'Withdrawal',
      description: `Withdrawal to ${accountNumber}`,
      payeeName: accountName || 'Unknown',
      payeeBankCode: bankCode,
      payeeBankAccNo: accountNumber,
      payeePhoneNo: phoneNumber,
      currency: currency.toUpperCase(),
      amount: amountInCents,
      notifyUrl: palmpayConfig.getWebhookUrl(),
      remark: `Withdrawal transaction for user ${user.id}`,
    });

    // Exact network fee from provider (kobo → NGN) + app ₦50+₦50 when amount > ₦10k.
    const networkFeeActual = feeNgnFromPalmpayResponse(palmpayResponse);
    const networkFeeNgn =
      networkFeeActual != null && Number.isFinite(networkFeeActual)
        ? networkFeeActual
        : networkFeePreview;
    const withdrawFee = networkFeeNgn + appFeeNgn;
    const totalDebit = amountDecimal + withdrawFee;

    let meta: Record<string, unknown> = {
      walletSource: isReferralSource ? 'referral' : 'fiat',
      withdrawalSource: isReferralSource ? 'referral' : 'fiat',
      previewFeeNgn: previewFee,
      appFeeNgn,
      networkFeePreviewNgn: networkFeePreview,
      networkFeeRaw: palmpayResponse.fee ?? null,
      networkFeeNgn,
      withdrawFeeNgn: withdrawFee,
    };
    try {
      const prev = transaction.metadata ? JSON.parse(String(transaction.metadata)) : {};
      meta = { ...prev, ...meta };
    } catch {
      /* keep meta */
    }

    // Update transaction with PalmPay response + exact fee
    await prisma.fiatTransaction.update({
      where: { id: transaction.id },
      data: {
        palmpayOrderNo: palmpayResponse.orderNo,
        palmpayStatus: palmpayResponse.orderStatus.toString(),
        palmpaySessionId: palmpayResponse.sessionId,
        fees: withdrawFee,
        totalAmount: totalDebit,
        metadata: JSON.stringify(meta),
        status: palmpayResponse.orderStatus === 2 ? 'completed' : 'pending',
        ...(palmpayResponse.orderStatus === 2 && { completedAt: new Date() }),
      },
    });

    // If PalmPay fee exceeded preview, ensure wallet covers the difference (referral already moved preview).
    if (withdrawFee > previewFee) {
      const extra = withdrawFee - previewFee;
      if (isReferralSource) {
        try {
          await transferReferralToFiatWallet(user.id, extra);
        } catch (err: any) {
          console.error('PalmPay fee exceeded referral preview hold:', {
            transactionId: transaction.id,
            previewFee,
            withdrawFee,
            err: err?.message,
          });
        }
      }
      const balance = await fiatWalletService.getBalance(wallet.id);
      if (!balance || parseFloat(balance.balance) < totalDebit) {
        console.error('PalmPay fee exceeds available balance after payout sent:', {
          transactionId: transaction.id,
          amount: amountDecimal,
          previewFee,
          withdrawFee,
          available: balance?.balance,
        });
      }
    }

    // Debit wallet for amount + exact PalmPay fee; bank receives amount only
    await fiatWalletService.debitWallet(wallet.id, totalDebit, transaction.id);

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        orderId: orderId,
        orderNo: palmpayResponse.orderNo,
        status: palmpayResponse.orderStatus === 2 ? 'completed' : 'pending',
        amount: amountDecimal,
        fees: withdrawFee,
        totalAmount: totalDebit,
        currency: currency.toUpperCase(),
        sessionId: palmpayResponse.sessionId,
        feeSource: networkFeeActual != null ? 'network_plus_app' : 'preview_plus_app',
      }, 'Payout initiated successfully')
    );
  } catch (error: unknown) {
    return next(toCustomerSafeError(error, 'Payout initiation error:'));
  }
};

/**
 * Check payout status
 * GET /api/v2/payments/palmpay/payout/:transactionId
 */
export const checkPayoutStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.body._user;
    const { transactionId } = req.params;

    // Get transaction
    const transaction = await prisma.fiatTransaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true },
    });

    if (!transaction) {
      return next(ApiError.notFound('Transaction not found'));
    }

    if (transaction.userId !== user.id) {
      return next(ApiError.unauthorized('Unauthorized access'));
    }

    // If transaction is already completed, return current status
    if (transaction.status === 'completed') {
      return res.status(200).json(
        new ApiResponse(200, {
          transactionId: transaction.id,
          orderId: transaction.palmpayOrderId,
          orderNo: transaction.palmpayOrderNo,
          status: transaction.status,
          amount: transaction.amount.toString(),
          fees: transaction.fees.toString(),
          totalAmount: transaction.totalAmount.toString(),
          currency: transaction.currency,
          completedAt: transaction.completedAt,
        }, 'Transaction status retrieved')
      );
    }

    // Query PalmPay for latest status
    if (transaction.palmpayOrderNo || transaction.palmpayOrderId) {
      try {
        const palmpayStatus = await palmpayPayout.queryPayStatus(
          transaction.palmpayOrderId || undefined,
          transaction.palmpayOrderNo || undefined
        );

        // Update transaction status
        let newStatus = transaction.status;
        if (palmpayStatus.orderStatus === 2) {
          newStatus = 'completed';
        } else if (palmpayStatus.orderStatus === 3) {
          newStatus = 'failed';
        } else if (palmpayStatus.orderStatus === 4) {
          newStatus = 'cancelled';
        }

        // Update transaction status (no fees - totalAmount equals amount)
        const totalAmount = transaction.amount.toNumber(); // Total equals amount (no fees)

        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayStatus: palmpayStatus.orderStatus.toString(),
            palmpaySessionId: palmpayStatus.sessionId,
            status: newStatus,
            fees: 0, // No fees
            totalAmount: totalAmount,
            ...(palmpayStatus.orderStatus === 2 && palmpayStatus.completedTime && {
              completedAt: new Date(palmpayStatus.completedTime),
            }),
          },
        });

        // Wallet is already debited immediately when withdrawal is initiated, so no need to debit again

        return res.status(200).json(
          new ApiResponse(200, {
            transactionId: transaction.id,
            orderId: transaction.palmpayOrderId,
            orderNo: transaction.palmpayOrderNo,
            status: newStatus,
            palmpayStatus: palmpayStatus.orderStatus,
            amount: transaction.amount.toString(),
            fees: '0', // No fees
            totalAmount: totalAmount.toString(),
            currency: transaction.currency,
            completedAt: palmpayStatus.completedTime ? new Date(palmpayStatus.completedTime).toISOString() : null,
          }, 'Transaction status retrieved')
        );
      } catch (error: any) {
        console.error('Error querying PalmPay status:', error);
        // Return current transaction status if query fails
      }
    }

    return res.status(200).json(
      new ApiResponse(200, {
        transactionId: transaction.id,
        orderId: transaction.palmpayOrderId,
        orderNo: transaction.palmpayOrderNo,
        status: transaction.status,
        amount: transaction.amount.toString(),
        fees: transaction.fees.toString(),
        totalAmount: transaction.totalAmount.toString(),
        currency: transaction.currency,
      }, 'Transaction status retrieved')
    );
  } catch (error: unknown) {
    return next(toCustomerSafeError(error, 'Check payout status error:'));
  }
};

