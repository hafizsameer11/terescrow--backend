import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/prisma';
import { settleBushaTradeIfNeeded } from '../../services/busha/busha.settlement.service';
import { BUSHA_COMPLETED_STATUSES } from '../../services/busha/busha.trade.service';

const bushaCustomerModel = (prisma as any).bushaCustomer;
const bushaTradeLogModel = (prisma as any).bushaTradeLog;
const bushaKycApplicationModel = (prisma as any).bushaKycApplication;

function verifyBushaSignature(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
  const secret = process.env.BUSHA_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn('[Busha webhook] BUSHA_WEBHOOK_SECRET not set — skipping signature verify');
    return true;
  }
  if (!signatureHeader) return false;
  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'));
  } catch {
    return expected === provided;
  }
}

function mapTransferEventToStatus(event: string, dataStatus?: string): string {
  if (dataStatus) return String(dataStatus);
  const suffix = event.replace(/^transfer\./, '').replace(/^ramp\.transfer\./, '');
  return suffix || 'pending';
}

async function handleCustomerEvent(event: string, data: any) {
  const bushaProfileId = data.id || data.customer_id;
  if (!bushaProfileId) return;

  const status =
    data.status ||
    (event.includes('verification.') ? event.split('.').pop() : undefined) ||
    undefined;

  const updated = await bushaCustomerModel.updateMany({
    where: { bushaProfileId },
    data: {
      ...(status ? { status } : {}),
      providerData: data,
    },
  });

  if (updated.count > 0 && status) {
    const customer = await bushaCustomerModel.findFirst({ where: { bushaProfileId } });
    if (customer?.userId) {
      const appStatus =
        status === 'active'
          ? 'active'
          : status === 'rejected'
            ? 'rejected'
            : status === 'in_review'
              ? 'in_review'
              : undefined;
      if (appStatus) {
        await bushaKycApplicationModel.updateMany({
          where: { userId: customer.userId },
          data: { status: appStatus, errorMessage: status === 'rejected' ? 'Rejected by Busha' : null },
        });
      }
    }
  }
}

async function handleTransferLikeEvent(event: string, data: any, rawBody: any) {
  const transferId = data.id || data.transfer_id;
  if (!transferId) return;

  const bushaStatus = mapTransferEventToStatus(event, data.status);
  const trade = await bushaTradeLogModel.findFirst({
    where: { bushaTransferId: transferId },
    orderBy: { createdAt: 'desc' },
  });
  if (!trade) return;

  const isFailed = ['failed', 'cancelled', 'funds_not_delivered', 'funds_refunded'].includes(bushaStatus);
  const isComplete = BUSHA_COMPLETED_STATUSES.has(bushaStatus) || bushaStatus === 'funds_received';

  await bushaTradeLogModel.update({
    where: { id: trade.id },
    data: {
      bushaStatus,
      targetAmount: data.target_amount || trade.targetAmount,
      sourceAmount: data.source_amount || trade.sourceAmount,
      cryptoDepositAddress: data?.pay_in?.address || trade.cryptoDepositAddress,
      cryptoDepositNetwork: data?.pay_in?.network || trade.cryptoDepositNetwork,
      providerResponse: {
        ...(trade.providerResponse as object),
        webhook: rawBody,
        transfer: data,
      },
      ...(isFailed && !['wallet_credited', 'buy_reversed', 'completed'].includes(trade.status)
        ? { status: trade.status === 'awaiting_crypto_deposit' ? 'busha_failed' : trade.status }
        : {}),
      ...(isComplete && trade.status === 'awaiting_crypto_deposit'
        ? { status: 'settling' }
        : {}),
    },
  });

  if (trade.userId) {
    await settleBushaTradeIfNeeded(trade.id);
  }
}

async function handleDepositEvent(event: string, data: any, rawBody: any) {
  // deposit.success often mirrors a transfer — try transfer id fields
  const transferId = data.transfer_id || data.id || data.reference;
  if (transferId) {
    await handleTransferLikeEvent(event, { ...data, id: transferId, status: data.status || 'funds_received' }, rawBody);
  }
}

async function handlePaymentRequestEvent(event: string, data: any, rawBody: any) {
  const transferId = data.transfer_id || data.id;
  if (!transferId) return;
  const status =
    event.endsWith('completed')
      ? 'completed'
      : event.endsWith('failed') || event.endsWith('cancelled') || event.endsWith('expired')
        ? 'failed'
        : data.status || 'processing';
  await handleTransferLikeEvent(event, { ...data, id: transferId, status }, rawBody);
}

/**
 * POST /api/v2/webhooks/busha
 * Handles all documented Busha webhook families used for KYC + credit/debit settlement.
 */
export async function bushaWebhookController(req: Request, res: Response, _next: NextFunction) {
  try {
    const raw =
      (req as any).rawBody ||
      (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body || {}));
    const signature =
      (req.headers['x-busha-signature'] as string) ||
      (req.headers['x-bc-signature'] as string) ||
      (req.headers['x-signature'] as string);

    if (!verifyBushaSignature(raw, signature)) {
      return res.status(401).json({ status: 'error', message: 'Invalid webhook signature' });
    }

    const body =
      typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));

    const event = String(body.event || body.type || '');
    const data = body.data || {};

    console.log(`[Busha webhook] event=${event} id=${data?.id || '-'}`);

    if (event.startsWith('customer.')) {
      await handleCustomerEvent(event, data);
    } else if (event.startsWith('transfer.') || event.startsWith('ramp.transfer.')) {
      await handleTransferLikeEvent(event, data, body);
    } else if (event.startsWith('deposit.')) {
      await handleDepositEvent(event, data, body);
    } else if (event.startsWith('payment_request.')) {
      await handlePaymentRequestEvent(event, data, body);
    } else {
      console.warn(`[Busha webhook] unhandled event type: ${event}`);
    }

    return res.status(200).json({ status: 'success', message: 'ok' });
  } catch (error: any) {
    console.error('[Busha webhook] error:', error?.message || error);
    return res.status(200).json({ status: 'success', message: 'received_with_error' });
  }
}
