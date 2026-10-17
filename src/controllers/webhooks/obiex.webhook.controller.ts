import { NextFunction, Request, Response } from 'express';
import { verifyObiexWebhookSignature } from '../../services/obiex/obiex.webhook.verify';
import { handleObiexDepositWebhook } from '../../services/obiex/obiex.deposit.webhook.service';
import { handleObiexCollectionWebhook } from '../../services/obiex/obiex.collection.webhook.service';
import { handleObiexWithdrawalWebhook } from '../../services/obiex/obiex.settlement.service';

/**
 * POST /api/v2/webhooks/obiex
 * Configure URL in Obiex dashboard: Settings → Developers → Webhook Url
 */
export async function obiexWebhookController(req: Request, res: Response, _next: NextFunction) {
  try {
    const rawBody =
      (req as any).rawBody ||
      (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {}));
    const signature = String(req.headers['x-obiex-signature'] || '');

    if (!verifyObiexWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ status: 'error', message: 'Invalid webhook signature' });
    }

    const event =
      typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));

    const type = String(event?.type || '').toUpperCase();
    console.log(`[Obiex webhook] type=${type} ref=${event?.reference || '-'} status=${event?.status || '-'}`);

    let result: any = { handled: false };
    if (type === 'DEPOSIT') result = await handleObiexDepositWebhook(event);
    else if (type === 'WITHDRAWAL') result = await handleObiexWithdrawalWebhook(event);
    else if (type === 'COLLECTION') result = await handleObiexCollectionWebhook(event);
    else console.warn(`[Obiex webhook] unhandled type: ${type}`);

    return res.status(200).json({ status: 'success', result });
  } catch (error: any) {
    console.error('[Obiex webhook] error:', error?.message || error);
    // Still 200 to avoid endless retries for poison payloads after log
    return res.status(200).json({ status: 'error', message: error?.message || 'webhook error' });
  }
}
