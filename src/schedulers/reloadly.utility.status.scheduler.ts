/**
 * Reloadly Utility Payment Status Scheduler
 * Periodically checks for PROCESSING Reloadly utility payments and queues status check jobs
 */

import { prisma } from '../utils/prisma';
import { queueManager } from '../queue/queue.manager';

/**
 * Check for PROCESSING Reloadly utility payments and queue status checks
 */
export async function checkProcessingReloadlyUtilityPayments() {
  try {
    console.log('[RELOADLY UTILITY SCHEDULER] Checking for PROCESSING payments...');

    // Find all Reloadly utility payments that are PROCESSING
    const processingPayments = await prisma.billPayment.findMany({
      where: {
        provider: 'reloadly',
        palmpayStatus: 'PROCESSING',
        status: 'pending',
        palmpayOrderNo: { not: null }, // Must have Reloadly transaction ID
      },
      select: {
        id: true,
        palmpayOrderNo: true,
        createdAt: true,
      },
      take: 100, // Process up to 100 at a time
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
    });

    console.log(`[RELOADLY UTILITY SCHEDULER] Found ${processingPayments.length} PROCESSING payments`);

    if (processingPayments.length === 0) {
      return;
    }

    // Queue status check job for each payment
    for (const payment of processingPayments) {
      try {
        const transactionId = payment.palmpayOrderNo ? parseInt(payment.palmpayOrderNo) : null;
        
        if (!transactionId) {
          console.warn(`[RELOADLY UTILITY SCHEDULER] Skipping payment ${payment.id} - no transaction ID`);
          continue;
        }

        // Check if a job is already queued for this payment (optional optimization)
        // For now, we'll queue it anyway - the job itself is idempotent

        await queueManager.addJob(
          'bill-payments',
          'reloadly-utility-status',
          {
            billPaymentId: payment.id,
            transactionId,
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000, // 5 seconds initial delay
            },
          }
        );

        console.log(`[RELOADLY UTILITY SCHEDULER] Queued status check for payment ${payment.id}`);
      } catch (error: any) {
        console.error(`[RELOADLY UTILITY SCHEDULER] Error queuing job for payment ${payment.id}:`, error.message);
      }
    }

    console.log(`[RELOADLY UTILITY SCHEDULER] Completed processing ${processingPayments.length} payments`);
  } catch (error: any) {
    console.error('[RELOADLY UTILITY SCHEDULER] Error checking processing payments:', error.message);
  }
}

/**
 * Start the scheduler (runs every 2 minutes)
 */
export function startReloadlyUtilityStatusScheduler() {
  // Run immediately on start
  checkProcessingReloadlyUtilityPayments();

  // Then run every 2 minutes (120000 ms)
  const interval = setInterval(() => {
    checkProcessingReloadlyUtilityPayments();
  }, 2 * 60 * 1000);

  console.log('[RELOADLY UTILITY SCHEDULER] Scheduler started (runs every 2 minutes)');

  // Return function to stop the scheduler
  return () => {
    clearInterval(interval);
    console.log('[RELOADLY UTILITY SCHEDULER] Scheduler stopped');
  };
}

