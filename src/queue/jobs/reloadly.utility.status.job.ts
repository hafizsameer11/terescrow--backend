/**
 * Reloadly Utility Payment Status Check Job
 * Checks the status of a Reloadly utility payment and updates the database
 */

import { Job } from 'bull';
import { prisma } from '../../utils/prisma';
import { reloadlyUtilitiesService } from '../../services/reloadly/reloadly.utilities.service';

/**
 * Reloadly Utility Payment Status Check Job Data
 */
export interface ReloadlyUtilityStatusJobData {
  billPaymentId: string;
  transactionId?: number; // Reloadly transaction ID (palmpayOrderNo)
}

/**
 * Process Reloadly Utility Payment Status Check Job
 * This job queries Reloadly for the status of a utility payment order
 * and updates the local database accordingly.
 */
export async function processReloadlyUtilityStatusJob(
  job: Job<ReloadlyUtilityStatusJobData>
): Promise<void> {
  const { billPaymentId, transactionId } = job.data;

  try {
    console.log('[RELOADLY UTILITY STATUS] Checking status...', {
      billPaymentId,
      transactionId,
      jobId: job.id,
    });

    // Find the bill payment record
    const billPayment = await prisma.billPayment.findUnique({
      where: { id: billPaymentId },
      include: { transaction: true },
    });

    if (!billPayment) {
      const error = new Error(`Bill payment not found: ${billPaymentId}`);
      console.error('[RELOADLY UTILITY STATUS]', error.message);
      throw error;
    }

    // Skip if already completed or failed (idempotency check)
    if (['completed', 'failed', 'cancelled'].includes(billPayment.status)) {
      console.log(`[RELOADLY UTILITY STATUS] Bill payment ${billPaymentId} already in final state: ${billPayment.status}`);
      return;
    }

    // Get Reloadly transaction ID
    const reloadlyTransactionId = transactionId || (billPayment.palmpayOrderNo ? parseInt(billPayment.palmpayOrderNo) : null);

    if (!reloadlyTransactionId) {
      console.error(`[RELOADLY UTILITY STATUS] No Reloadly transaction ID found for bill payment ${billPaymentId}`);
      return;
    }

    console.log('[RELOADLY UTILITY STATUS] Querying Reloadly API...', {
      billPaymentId,
      reloadlyTransactionId,
    });

    // Query Reloadly for transaction status
    const reloadlyStatus = await reloadlyUtilitiesService.getTransactionById(reloadlyTransactionId);

    console.log('[RELOADLY UTILITY STATUS] Reloadly response:', JSON.stringify(reloadlyStatus, null, 2));

    // Handle different response structures
    // ReloadlyUtilityTransactionResponse can have transaction.status or status directly
    const reloadlyStatusString = reloadlyStatus.transaction?.status || reloadlyStatus.status || 'PROCESSING';

    // Map Reloadly status to our format
    const statusMap: Record<string, string> = {
      'SUCCESSFUL': 'completed',
      'PROCESSING': 'pending',
      'FAILED': 'failed',
      'REFUNDED': 'failed',
    };

    const newStatus = statusMap[reloadlyStatusString] || 'pending';

    // Update BillPayment and FiatTransaction records atomically
    await prisma.$transaction(async (tx) => {
      // Update BillPayment record
      await tx.billPayment.update({
        where: { id: billPayment.id },
        data: {
          palmpayStatus: reloadlyStatusString,
          status: newStatus,
          providerResponse: JSON.stringify(reloadlyStatus),
          ...(reloadlyStatusString === 'SUCCESSFUL' && {
            completedAt: new Date(),
            // For electricity/token-based payments, prioritize token (PIN) over billerReferenceId
            // Token format: "2288-6878-8467-9902-8849" (for prepaid electricity)
            billReference: reloadlyStatus.transaction?.billDetails?.pinDetails?.token
              || reloadlyStatus.transaction?.billDetails?.billerReferenceId
              || billPayment.palmpayOrderNo,
          }),
          ...(reloadlyStatusString === 'FAILED' && {
            errorMessage: reloadlyStatus.message || 'Payment failed',
          }),
        },
      });

      // Update related transaction
      await tx.fiatTransaction.update({
        where: { id: billPayment.transactionId },
        data: {
          palmpayStatus: reloadlyStatusString,
          status: newStatus,
          ...(reloadlyStatusString === 'SUCCESSFUL' && {
            completedAt: new Date(),
          }),
          ...(reloadlyStatusString === 'FAILED' && {
            errorMessage: reloadlyStatus.message || 'Payment failed',
          }),
        },
      });
    }, {
      timeout: 10000, // 10 second timeout
    });

    console.log('[RELOADLY UTILITY STATUS] Status updated', {
      billPaymentId,
      oldStatus: billPayment.status,
      newStatus,
      reloadlyStatus: reloadlyStatusString,
    });
  } catch (error: any) {
    console.error('[RELOADLY UTILITY STATUS] Error checking status:', {
      billPaymentId,
      jobId: job.id,
      error: error.message,
      stack: error.stack,
    });
    throw error; // Re-throw to mark job as failed
  }
}

