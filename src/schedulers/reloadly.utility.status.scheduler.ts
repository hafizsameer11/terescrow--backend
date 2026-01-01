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
    
    // Get jobs for each state separately (since Bull doesn't expose job.state directly)
    const [waitingJobs, activeJobs, delayedJobs] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getDelayed(),
    ]);
    
    // Create a set of billPaymentIds that already have jobs queued (excluding failed jobs)
    const queuedPaymentIds = new Set<string>();
    
    // Add waiting, active, and delayed jobs (failed jobs will be re-queued)
    for (const jobs of [waitingJobs, activeJobs, delayedJobs]) {
      for (const job of jobs) {
        if (job.name === 'reloadly-utility-status' && job.data?.billPaymentId) {
          queuedPaymentIds.add(job.data.billPaymentId);
        }
      }
    }
    
    // Log queue status for debugging
    const stats = await queueManager.getQueueStats('bill-payments');
    console.log(`[RELOADLY UTILITY SCHEDULER] Queue stats:`, {
      waiting: stats.waiting,
      active: stats.active,
      failed: stats.failed,
      delayed: stats.delayed,
      completed: stats.completed,
    });

    let queuedCount = 0;
    let skippedCount = 0;

    // Queue status check job for each payment (only if not already queued)
    for (const payment of processingPayments) {
      try {
        // Skip if a job is already queued/active/delayed for this payment
        if (queuedPaymentIds.has(payment.id)) {
          console.log(`[RELOADLY UTILITY SCHEDULER] Skipping payment ${payment.id} - job already queued/active`);
          skippedCount++;
          continue;
        }

        const transactionId = payment.palmpayOrderNo ? parseInt(payment.palmpayOrderNo) : null;
        
        if (!transactionId) {
          console.warn(`[RELOADLY UTILITY SCHEDULER] Skipping payment ${payment.id} - no transaction ID`);
          skippedCount++;
          continue;
        }

        const job = await queueManager.addJob(
          'bill-payments',
          'reloadly-utility-status',
          {
            billPaymentId: payment.id,
            transactionId,
          },
          {
            attempts: 10, // Increased attempts for reliability
            backoff: {
              type: 'exponential',
              delay: 5000, // 5 seconds initial delay
            },
          }
        );

        queuedCount++;
        console.log(`[RELOADLY UTILITY SCHEDULER] Queued status check for payment ${payment.id} (job ID: ${job.id})`);
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

