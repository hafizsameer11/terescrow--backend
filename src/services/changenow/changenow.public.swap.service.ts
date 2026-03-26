/**
 * Temporary public test: master ETH → USDT (ERC20) via ChangeNOW, payout = same master address.
 * Remove or hard-disable after validation.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import * as cn from './changenow.client';
import { getQuote } from './changenow.admin.service';
import { resolveTickerForWalletCurrencyId } from './changenow.ticker.service';
import { payinMasterWalletEvmToChangeNow } from './changenow.payin.master.service';

const ERC20_USDT_MAINNET = '0xdac17f958d2ee523a2206206994597c13d831ec7';

function normAddr(a: string): string {
  return a.trim().toLowerCase();
}

function extractCreateId(data: cn.ChangeNowCreateExchangeResponse): string {
  const id =
    data.id ??
    (data as any).exchangeId ??
    (data as any).requestId ??
    (data as any).transactionId;
  if (!id || String(id).trim() === '') {
    throw ApiError.internal('ChangeNOW did not return exchange id');
  }
  return String(id);
}

function extractPayin(data: cn.ChangeNowCreateExchangeResponse): {
  address: string;
  extraId: string | null;
} {
  const address =
    data.payinAddress ?? (data as any).payin_address ?? (data as any).depositAddress;
  if (!address || String(address).trim() === '') {
    throw ApiError.internal('ChangeNOW did not return payin address');
  }
  const extraId =
    data.payinExtraId ?? (data as any).payinExtraId ?? (data as any).extraId ?? null;
  return { address: String(address).trim(), extraId: extraId ? String(extraId) : null };
}

async function findEthNativeWalletCurrency() {
  const wc = await prisma.walletCurrency.findFirst({
    where: {
      blockchain: 'ethereum',
      currency: 'ETH',
      isToken: false,
    },
  });
  if (!wc) {
    throw ApiError.internal('No native ETH WalletCurrency row for ethereum');
  }
  return wc;
}

async function findUsdtErc20WalletCurrency() {
  const byContract = await prisma.walletCurrency.findFirst({
    where: {
      blockchain: 'ethereum',
      isToken: true,
      contractAddress: ERC20_USDT_MAINNET,
    },
  });
  if (byContract) return byContract;
  return prisma.walletCurrency.findFirst({
    where: {
      blockchain: 'ethereum',
      isToken: true,
      currency: { contains: 'USDT' },
    },
  });
}

async function resolveAdminUserIdForPublicSwap(): Promise<number> {
  const fromEnv = process.env.CHANGENOW_PUBLIC_SWAP_ADMIN_USER_ID?.trim();
  if (fromEnv) {
    const id = parseInt(fromEnv, 10);
    if (!isNaN(id)) {
      const u = await prisma.user.findUnique({ where: { id } });
      if (!u) throw ApiError.internal('CHANGENOW_PUBLIC_SWAP_ADMIN_USER_ID user not found');
      return id;
    }
  }
  const admin = await prisma.user.findFirst({
    where: { role: 'admin' },
    orderBy: { id: 'asc' },
  });
  if (!admin) {
    throw ApiError.internal('No admin user — set CHANGENOW_PUBLIC_SWAP_ADMIN_USER_ID');
  }
  return admin.id;
}

export interface PublicMasterEthUsdtSwapResult {
  changeNowId: string;
  orderId: number;
  amountFromEth: string;
  usdNotional: number;
  ethUsdUsed: string;
  payinAddress: string;
  payoutAddress: string;
  outboundTxHash: string;
  masterWalletTxId: number;
  estimatedUsdt: string | null;
}

/**
 * Creates ChangeNOW exchange ETH→USDT (same chain payout), sends ETH from master wallet to pay-in address.
 */
export async function executePublicMasterEthToUsdtSwap(input: {
  /** Target notional in USD (e.g. 6–7) */
  usdNotional: number;
}): Promise<PublicMasterEthUsdtSwapResult> {
  if (!cn.getChangeNowApiKey()) {
    throw ApiError.internal('CHANGENOW_API_KEY is not configured');
  }

  const { usdNotional } = input;
  if (!Number.isFinite(usdNotional) || usdNotional <= 0 || usdNotional > 500) {
    throw ApiError.badRequest('usdNotional must be between 0 and 500');
  }

  const master = await prisma.masterWallet.findUnique({
    where: { blockchain: 'ethereum' },
  });
  if (!master?.address || !master.privateKey) {
    throw ApiError.internal('Ethereum master wallet not configured');
  }

  const expected = process.env.CHANGENOW_PUBLIC_SWAP_EXPECTED_ETH_ADDRESS?.trim();
  if (expected && normAddr(expected) !== normAddr(master.address)) {
    throw ApiError.internal(
      'Master wallet address does not match CHANGENOW_PUBLIC_SWAP_EXPECTED_ETH_ADDRESS'
    );
  }

  const ethWc = await findEthNativeWalletCurrency();
  const usdtWc = await findUsdtErc20WalletCurrency();
  const fromTicker = (await resolveTickerForWalletCurrencyId(ethWc.id)).trim();
  const toTicker = usdtWc
    ? (await resolveTickerForWalletCurrencyId(usdtWc.id)).trim()
    : 'usdt';

  /** Prefer DB `wallet_currencies.price` (USD); else env CHANGENOW_ETH_USD_FALLBACK (default 2060.45). */
  const fallbackUsd = process.env.CHANGENOW_ETH_USD_FALLBACK?.trim() || '2060.45';
  const ethUsd =
    ethWc.price != null && new Decimal(ethWc.price).gt(0)
      ? new Decimal(ethWc.price)
      : new Decimal(fallbackUsd);

  const ethAmount = new Decimal(usdNotional).div(ethUsd);
  const amountStr = ethAmount.toFixed(8);

  const quote = await getQuote({
    fromTicker,
    toTicker,
    amount: amountStr,
  });
  const expectedTo = quote.estimatedAmountTo ? new Decimal(quote.estimatedAmountTo) : null;

  let fromNet = (quote.fromNetwork ?? '').trim();
  let toNet = (quote.toNetwork ?? '').trim();
  if (!fromNet || !toNet) {
    const curList = await cn.listCurrencies();
    const guessed = cn.resolveNetworksForTickers(fromTicker, toTicker, curList);
    fromNet = fromNet || (guessed.fromNetwork ?? 'eth');
    toNet = toNet || (guessed.toNetwork ?? 'eth');
  }

  const payoutAddr = master.address.trim();
  const createPayload: Parameters<typeof cn.createExchange>[0] = {
    fromCurrency: fromTicker,
    toCurrency: toTicker,
    fromAmount: amountStr,
    address: payoutAddr,
    flow: 'standard',
    type: 'direct',
    fromNetwork: fromNet,
    toNetwork: toNet,
    refundAddress: payoutAddr,
  };

  const created = await cn.createExchange(createPayload);
  const changenowId = extractCreateId(created);
  const payin = extractPayin(created);

  const adminUserId = await resolveAdminUserIdForPublicSwap();
  const amountDec = new Decimal(amountStr);

  const order = await prisma.changeNowSwapOrder.create({
    data: {
      adminUserId,
      sourceType: 'master_wallet',
      status: 'awaiting_payin',
      masterWalletBlockchain: 'ethereum',
      payoutAddressId: null,
      changenowId,
      fromTicker,
      toTicker,
      flow: 'standard',
      amountFrom: amountDec,
      expectedAmountTo: expectedTo,
      payinAddress: payin.address,
      payinExtraId: payin.extraId,
      payoutAddress: payoutAddr,
      payoutExtraId: null,
      refundAddress: payoutAddr,
    },
  });

  try {
    const pay = await payinMasterWalletEvmToChangeNow({
      masterWalletBlockchain: 'ethereum',
      walletCurrencyId: ethWc.id,
      payinAddress: payin.address,
      amountFrom: amountDec,
      changeNowSwapOrderDbId: order.id,
    });
    await prisma.changeNowSwapOrder.update({
      where: { id: order.id },
      data: {
        status: 'payin_broadcast',
        outboundTxHash: pay.txHash,
        masterWalletTxId: pay.masterWalletTxId,
      },
    });

    return {
      changeNowId: changenowId,
      orderId: order.id,
      amountFromEth: amountStr,
      usdNotional,
      ethUsdUsed: ethUsd.toString(),
      payinAddress: payin.address,
      payoutAddress: payoutAddr,
      outboundTxHash: pay.txHash,
      masterWalletTxId: pay.masterWalletTxId,
      estimatedUsdt: expectedTo?.toString() ?? null,
    };
  } catch (e: any) {
    await prisma.changeNowSwapOrder.update({
      where: { id: order.id },
      data: {
        status: 'failed',
        errorMessage: (e?.message || String(e)).slice(0, 2000),
      },
    });
    throw e;
  }
}
