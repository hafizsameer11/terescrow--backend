/**
 * Queue Clear Utility
 * 
 * Clears jobs from queues (waiting, active, completed, failed, delayed)
 * 
 * Usage:
 *   ts-node src/queue/clear.queue.ts <queue-name> [status]
 *   ts-node src/queue/clear.queue.ts tatum waiting
 *   ts-node src/queue/clear.queue.ts tatum all
 */

import Queue from 'bull';
import dotenv from 'dotenv';

dotenv.config();

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

async function clearQueue(queueName: string, status?: string) {
  const queue = new Queue(queueName, {
    redis: redisConnection,
  });

  try {
    let cleared = 0;

    if (!status || status === 'all') {
      // Clear all job types
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      // CRITICAL: Never remove active jobs in production
      if (process.env.NODE_ENV === 'production' && active.length > 0) {
        console.error('ERROR: Cannot remove active jobs in production. This is a safety measure.');
        console.error(`Found ${active.length} active jobs. Active jobs may be processing critical operations.`);
        console.error('Use specific status flags to clear only waiting/completed/failed jobs.');
        await queue.close();
        process.exit(1);
      }

      // Remove jobs (skip active in production, allow in dev/test)
      const removePromises = [
        ...waiting.map((job) => job.remove()),
        ...completed.map((job) => job.remove()),
        ...failed.map((job) => job.remove()),
        ...delayed.map((job) => job.remove()),
      ];

      // Only remove active jobs in non-production
      if (process.env.NODE_ENV !== 'production') {
        console.warn('WARNING: Removing active jobs. This should never be done in production!');
        removePromises.push(...active.map((job) => job.remove()));
      } else {
        console.warn(`Skipping ${active.length} active jobs (production safety)`);
      }

      await Promise.all(removePromises);

      cleared = waiting.length + (process.env.NODE_ENV !== 'production' ? active.length : 0) + completed.length + failed.length + delayed.length;
      console.log(`[Clear Queue] Cleared ${cleared} jobs from queue "${queueName}"`);
      console.log(`  - Waiting: ${waiting.length}`);
      console.log(`  - Active: ${active.length} ${process.env.NODE_ENV === 'production' ? '(skipped for safety)' : '(removed)'}`);
      console.log(`  - Completed: ${completed.length}`);
      console.log(`  - Failed: ${failed.length}`);
      console.log(`  - Delayed: ${delayed.length}`);
    } else {
      // Clear specific status
      let jobs: Queue.Job[] = [];
      let statusLabel = '';

      switch (status.toLowerCase()) {
        case 'waiting':
        case 'pending':
          jobs = await queue.getWaiting();
          statusLabel = 'waiting';
          break;
        case 'active':
          // CRITICAL: Never remove active jobs in production
          if (process.env.NODE_ENV === 'production') {
            console.error('ERROR: Cannot remove active jobs in production. This is a safety measure.');
            console.error('Active jobs may be processing payments or blockchain transactions.');
            console.error('Removing them can cause data loss, double refunds, or corrupted state.');
            await queue.close();
            process.exit(1);
          }
          console.warn('WARNING: Removing active jobs. This should never be done in production!');
          jobs = await queue.getActive();
          statusLabel = 'active';
          break;
        case 'completed':
          jobs = await queue.getCompleted();
          statusLabel = 'completed';
          break;
        case 'failed':
          jobs = await queue.getFailed();
          statusLabel = 'failed';
          break;
        case 'delayed':
          jobs = await queue.getDelayed();
          statusLabel = 'delayed';
          break;
        default:
          console.error(`[Clear Queue] Unknown status: "${status}"`);
          console.error(`[Clear Queue] Available statuses: waiting, active, completed, failed, delayed, all`);
          process.exit(1);
      }

      await Promise.all(jobs.map((job) => job.remove()));
      cleared = jobs.length;
      console.log(`[Clear Queue] Cleared ${cleared} ${statusLabel} jobs from queue "${queueName}"`);
    }

    await queue.close();
    console.log(`[Clear Queue] Queue "${queueName}" cleared successfully`);
  } catch (error: any) {
    console.error(`[Clear Queue] Error clearing queue:`, error.message);
    await queue.close();
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const queueName = process.argv[2];
  const status = process.argv[3];

  if (!queueName) {
    console.error('[Clear Queue] Usage: ts-node src/queue/clear.queue.ts <queue-name> [status]');
    console.error('[Clear Queue] Examples:');
    console.error('  ts-node src/queue/clear.queue.ts tatum');
    console.error('  ts-node src/queue/clear.queue.ts tatum waiting');
    console.error('  ts-node src/queue/clear.queue.ts tatum all');
    console.error('[Clear Queue] Status options: waiting, active, completed, failed, delayed, all');
    process.exit(1);
  }

  clearQueue(queueName, status)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Clear Queue] Fatal error:', error);
      process.exit(1);
    });
}

export { clearQueue };

