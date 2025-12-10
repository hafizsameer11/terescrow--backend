import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import { prisma } from '../../utils/prisma';
import { palmpayAuth } from '../../services/palmpay/palmpay.auth.service';
import { fiatWalletService } from '../../services/fiat/fiat.wallet.service';
import { PalmPayDepositWebhook, PalmPayPayoutWebhook, PalmPayOrderStatus, PalmPayBillPaymentWebhook } from '../../types/palmpay.types';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * PalmPay Webhook Handler
 * Handles both deposit and payout webhooks
 * POST /api/v2/webhooks/palmpay
 * 
 * CRITICAL: Must return plain text "success" (not JSON)
 */
export const palmpayWebhookController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // ============================================
  // ✅ SAVE RAW WEBHOOK ONLY
  // ============================================

  let rawWebhookId: number | null = null;

  try {
    const rawWebhook = await prisma.palmPayRawWebhook.create({
      data: {
        rawData: JSON.stringify(req.body),
        headers: JSON.stringify(req.headers),
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: req.get("user-agent") || null,
        processed: false,
      },
    });

    rawWebhookId = rawWebhook.id;
    console.log(`Saved raw PalmPay webhook (ID: ${rawWebhookId})`);
  } catch (saveError) {
    console.error("Failed to save raw PalmPay webhook:", saveError);
  }

  // ============================================
  // ❌ COMMENTED OUT FULL PROCESSING LOGIC
  // ============================================

  /*
  try {
    const webhookData = req.body as PalmPayDepositWebhook | PalmPayPayoutWebhook | PalmPayBillPaymentWebhook;

    // --- VERIFY SIGNATURE ---
    const signature = webhookData.sign;
    if (!signature) return res.status(200).send("success");

    const isValid = palmpayAuth.verifyWebhookSignature(webhookData, signature);
    if (!isValid) return res.status(200).send("success");

    // --- FIND TRANSACTION/BILL PAYMENT ---
    // (Commented full original logic)
    
    // --- PROCESS SUCCESS / FAILED / CANCELLED ---
    // (Commented full original logic)

    // --- UPDATE RAW WEBHOOK ---
    if (rawWebhookId) {
      await prisma.palmPayRawWebhook.update({
        where: { id: rawWebhookId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    return res.status(200).send("success");
  } catch (error: any) {
    console.error("PalmPay webhook error:", error);

    if (rawWebhookId) {
      await prisma.palmPayRawWebhook.update({
        where: { id: rawWebhookId },
        data: {
          processed: true,
          processedAt: new Date(),
          errorMessage: error?.message || "Unknown error",
        },
      });
    }

    return res.status(200).send("success and saved");
  }
  */

  // ============================================
  // 🔚 ALWAYS RETURN SUCCESS (so PalmPay doesn't retry)
  // ============================================
  return res.status(200).send("success - saved only");
};


