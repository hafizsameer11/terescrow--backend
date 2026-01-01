/**
 * Reloadly Utility Payment Status Scheduler
 * Periodically checks for PROCESSING Reloadly utility payments and queues status check jobs
 */

import { prisma } from '../utils/prisma';
import { queueManager } from '../queue/queue.manager';

/**
 * Check for PROCESSING Reloadly utility payments and queue status checks
 * Only queues jobs for payments that haven't been checked in the last 1 minute
 */
export async function checkProcessingReloadlyUtilityPayments() {
  try {
    console.log('[RELOADLY UTILITY SCHEDULER] Checking for PROCESSING payments...');

    // Find all Reloadly utility payments that are PROCESSING
    // Only check payments that were created more than 1 minute ago (to avoid checking too soon)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    
    const processingPayments = await prisma.billPayment.findMany({
      where: {
        provider: 'reloadly',
        palmpayStatus: 'PROCESSING',
        status: 'pending',
        palmpayOrderNo: { not: null }, // Must have Reloadly transaction ID
        createdAt: { lte: oneMinuteAgo }, // Only check payments older than 1 minute
      },
      select: {
        id: true,
        palmpayOrderNo: true,
        createdAt: true,
        updatedAt: true,
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

    // Get the queue to check for existing jobs
    const queue = queueManager.getQueue('bill-payments');
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
    
    // Create a set of billPaymentIds that already have jobs queued
    const queuedPaymentIds = new Set<string>();
    for (const job of jobs) {
      if (job.name === 'reloadly-utility-status' && job.data?.billPaymentId) {
        queuedPaymentIds.add(job.data.billPaymentId);
      }
    }

    let queuedCount = 0;
    let skippedCount = 0;

    // Queue status check job for each payment (only if not already queued)
    for (const payment of processingPayments) {
      try {
        // Skip if a job is already queued for this payment
        if (queuedPaymentIds.has(payment.id)) {
          skippedCount++;
          continue;
        }

        const transactionId = payment.palmpayOrderNo ? parseInt(payment.palmpayOrderNo) : null;
        
        if (!transactionId) {
          console.warn(`[RELOADLY UTILITY SCHEDULER] Skipping payment ${payment.id} - no transaction ID`);
          skippedCount++;
          continue;
        }

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

        queuedCount++;
        console.log(`[RELOADLY UTILITY SCHEDULER] Queued status check for payment ${payment.id}`);
      } catch (error: any) {
        console.error(`[RELOADLY UTILITY SCHEDULER] Error queuing job for payment ${payment.id}:`, error.message);
        skippedCount++;
      }
    }

    console.log(`[RELOADLY UTILITY SCHEDULER] Completed: ${queuedCount} queued, ${skippedCount} skipped`);
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

