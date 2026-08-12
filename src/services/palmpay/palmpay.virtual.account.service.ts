import { v4 as uuidv4 } from 'uuid';
import { palmpayCheckout } from './palmpay.checkout.service';
import { palmpayConfig } from './palmpay.config';

export type PalmPayVirtualAccountDetails = {
  merchantOrderId: string;
  orderNo: string;
  orderStatus: number;
  amountNgn: number;
  amountCents: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  payerAccountId?: string;
  checkoutUrl?: string;
  raw: Record<string, unknown>;
};

/**
 * Create a one-time PalmPay virtual bank account (same flow as user wallet deposit).
 */
export async function createPalmpayVirtualBankAccount(params: {
  amountNgn: number;
  title: string;
  description: string;
  remark?: string;
  userId?: number | string;
  userMobileNo?: string;
  orderIdPrefix?: string;
}): Promise<PalmPayVirtualAccountDetails> {
  const amountNgn = Number(params.amountNgn);
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    throw new Error('amountNgn must be greater than 0');
  }

  const amountCents = Math.round(amountNgn * 100);
  if (amountCents < 10000) {
    throw new Error('Minimum PalmPay virtual account amount is 100 NGN');
  }

  const prefix = (params.orderIdPrefix || 'busha_sell_').replace(/[^a-z0-9_]/gi, '').substring(0, 12);
  const merchantOrderId = `${prefix}${uuidv4().replace(/-/g, '')}`.substring(0, 32);

  const palmpayResponse = await palmpayCheckout.createOrder({
    orderId: merchantOrderId,
    title: params.title,
    description: params.description,
    amount: amountCents,
    currency: 'NGN',
    notifyUrl: palmpayConfig.getWebhookUrl(),
    callBackUrl: `${process.env.FRONTEND_URL || 'https://app.terescrow.com'}/deposit/success`,
    productType: 'bank_transfer',
    goodsDetails: JSON.stringify([{ goodsId: '-1' }]),
    userId: params.userId != null ? String(params.userId) : 'admin_busha_test',
    userMobileNo: params.userMobileNo,
    remark: params.remark || 'Busha sell PalmPay payout account',
  });

  const accountNumber = palmpayResponse.payerVirtualAccNo?.trim();
  const bankName = palmpayResponse.payerBankName?.trim();
  const accountName = palmpayResponse.payerAccountName?.trim();

  if (!accountNumber || !bankName || !accountName) {
    throw new Error('PalmPay did not return virtual account bank details.');
  }

  return {
    merchantOrderId,
    orderNo: palmpayResponse.orderNo,
    orderStatus: palmpayResponse.orderStatus,
    amountNgn,
    amountCents,
    bankName,
    accountName,
    accountNumber,
    payerAccountId: palmpayResponse.payerAccountId,
    checkoutUrl: palmpayResponse.checkoutUrl,
    raw: palmpayResponse as unknown as Record<string, unknown>,
  };
}
