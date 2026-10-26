import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { verifyObiexWebhookSignature } from '../../services/obiex/obiex.webhook.verify';
import { handleObiexDepositWebhook } from '../../services/obiex/obiex.deposit.webhook.service';
import { handleObiexCollectionWebhook } from '../../services/obiex/obiex.collection.webhook.service';
import { handleObiexWithdrawalWebhook } from '../../services/obiex/obiex.settlement.service';

const rawWebhookModel = () => (prisma as any).obiexRawWebhook;

function clientIp(req: Request): string | null {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return xf || req.ip || null;
}

/**
 * POST /api/v2/webhooks/obiex
 * Configure URL in Obiex dashboard: Settings → Developers → Webhook Url
 * Every delivery is stored in obiex_raw_webhooks (even if credit is rejected).
 */
export async function obiexWebhookController(req: Request, res: Response, _next: NextFunction) {
  let rawWebhookId: number | null = null;
  const rawBody =
    (req as any).rawBody ||
    (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {}));
  const signature = String(req.headers['x-obiex-signature'] || '');
  const signatureOk = verifyObiexWebhookSignature(rawBody, signature);

  let event: any = {};
  try {
    event =
      typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
  } catch {
    event = { parseError: true, rawPreview: String(rawBody).slice(0, 500) };
  }

  try {
    const saved = await rawWebhookModel().create({
      data: {
        eventType: event?.type ? String(event.type).toUpperCase() : null,
        status: event?.status ? String(event.status) : null,
        reference: event?.reference ? String(event.reference) : null,
        transactionId: event?.transactionId ? String(event.transactionId) : null,
        signatureOk,
        rawData: typeof rawBody === 'string' ? rawBody : String(rawBody),
        headers: JSON.stringify({
          'x-obiex-signature': signature ? '[present]' : '[missing]',
          'content-type': req.headers['content-type'] || null,
        }),
        ipAddress: clientIp(req),
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : null,
        processed: false,
      },
    });
    rawWebhookId = saved.id;
  } catch (saveErr: any) {
    console.error('[Obiex webhook] failed to persist raw webhook', saveErr?.message || saveErr);
  }

  if (!signatureOk) {
    if (rawWebhookId) {
      await rawWebhookModel()
        .update({
          where: { id: rawWebhookId },
          data: { errorMessage: 'Invalid webhook signature' },
        })
        .catch(() => undefined);
    }
    return res.status(401).json({ status: 'error', message: 'Invalid webhook signature' });
  }

  try {
    const type = String(event?.type || '').toUpperCase();
    console.log(
      `[Obiex webhook] id=${rawWebhookId || '-'} type=${type} ref=${event?.reference || '-'} status=${event?.status || '-'}`
    );

    let result: any = { handled: false };
    if (type === 'DEPOSIT') result = await handleObiexDepositWebhook(event);
    else if (type === 'WITHDRAWAL') result = await handleObiexWithdrawalWebhook(event);
    else if (type === 'COLLECTION') result = await handleObiexCollectionWebhook(event);
    else {
      console.warn(`[Obiex webhook] unhandled type: ${type}`);
      result = { handled: false, reason: 'unhandled_type' };
    }

    if (rawWebhookId) {
      await rawWebhookModel()
        .update({
          where: { id: rawWebhookId },
          data: {
            processed: !!result?.handled || !!result?.tradeId,
            processedAt: new Date(),
            resultJson: JSON.stringify(result).slice(0, 65000),
            errorMessage:
              result?.handled === false && result?.reason
                ? String(result.reason).slice(0, 2000)
                : null,
          },
        })
        .catch(() => undefined);
    }

    return res.status(200).json({ status: 'success', result, rawWebhookId });
  } catch (error: any) {
    console.error('[Obiex webhook] error:', error?.message || error);
    if (rawWebhookId) {
      await rawWebhookModel()
        .update({
          where: { id: rawWebhookId },
          data: {
            processed: false,
            errorMessage: String(error?.message || 'webhook error').slice(0, 2000),
            resultJson: null,
          },
        })
        .catch(() => undefined);
    }
    // Still 200 to avoid endless retries for poison payloads after log
    return res.status(200).json({
      status: 'error',
      message: error?.message || 'webhook error',
      rawWebhookId,
    });
  }
}
