import Queue, { Job } from 'bull';
import { redisConfig } from '../config/redis.config';
import { processBillPaymentStatusJob, BillPaymentStatusJobData } from './jobs/billpayment.status.job';
import { processReloadlyUtilityStatusJob, ReloadlyUtilityStatusJobData } from './jobs/reloadly.utility.status.job';
import { processCreateVirtualAccountJob, CreateVirtualAccountJobData } from '../jobs/tatum/create.virtual.account.job';
import { processRetrySellTokenTransferJob, RetrySellTokenTransferJobData } from '../jobs/tatum/retry.sell.token.transfer.job';

/**
 * Queue Worker
 * Processes jobs from queues (similar to Laravel's queue:work)
 * 
 * Usage:
 *   ts-node src/queue/worker.ts <queue-name>
 *   ts-node src/queue/worker.ts bill-payments
 */
class QueueWorker {
  private queues: Map<string, Queue.Queue> = new Map();

  /**
   * Start a worker for a specific queue with job name processors
   */
  startWorker(queueName: string, jobProcessors: Record<string, (job: Job) => Promise<void>>) {
    if (this.queues.has(queueName)) {
      console.log(`[Worker] Worker for queue "${queueName}" is already running`);
      return;
    }

    const redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    const queue = new Queue(queueName, {
      redis: redisConnection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000, // Keep max 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
          count: 5000, // Keep max 5000 failed jobs
        },
        attempts: 3, // Retry failed jobs 3 times
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 second delay
        },
        timeout: 60000, // Job timeout: 60 seconds (prevents hanging jobs)
      },
    });

    // Register processors for each job name
    for (const [jobName, processor] of Object.entries(jobProcessors)) {
      queue.process(
        jobName,
        parseInt(process.env.QUEUE_CONCURRENCY || '1'),
        async (job: Job) => {
          // Add timeout to prevent jobs from hanging forever
          const timeout = job.opts.timeout || 60000; // Default 60 seconds
          return Promise.race([
            processor(job),
            new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error(`Job ${job.id} timed out after ${timeout}ms`));
              }, timeout);
            }),
          ]);
        }
      );
      console.log(`[Worker:${queueName}] Registered processor for job: "${jobName}"`);
    }

    // Event handlers
    queue.on('completed', (job: Job) => {
      console.log(`[Worker:${queueName}] Job ${job.id} completed`);
    });

    queue.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[Worker:${queueName}] Job ${job?.id} failed:`, err.message);
    });

    queue.on('error', (error: Error) => {
      console.error(`[Worker:${queueName}] Error:`, error.message);
    });

    queue.on('stalled', (jobId: string) => {
      console.warn(`[Worker:${queueName}] Job ${jobId} stalled`);
    });

    this.queues.set(queueName, queue);
    console.log(`[Worker] Started worker for queue: "${queueName}"`);
  }

  /**
   * Stop a worker
   */
  async stopWorker(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.close();
      this.queues.delete(queueName);
      console.log(`[Worker] Stopped worker for queue: "${queueName}"`);
    }
  }

  /**
   * Stop all workers
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.queues.keys()).map((queueName) =>
      this.stopWorker(queueName)
    );
    await Promise.all(stopPromises);
  }
}

// Export singleton instance
export const queueWorker = new QueueWorker();

/**
 * Main worker process
 * This file can be run as a separate process to process queue jobs
 */
if (require.main === module) {
  const queueName = process.argv[2] || 'default';

    // Register job processors by queue name
    const queueProcessors: Record<string, Record<string, (job: Job) => Promise<void>>> = {
      'bill-payments': {
        'bill-payment-status': async (job: Job) => {
          await processBillPaymentStatusJob(job as Job<BillPaymentStatusJobData>);
        },
        'reloadly-utility-status': async (job: Job) => {
          await processReloadlyUtilityStatusJob(job as Job<ReloadlyUtilityStatusJobData>);
        },
      },
    'tatum': {
      'create-virtual-account': async (job: Job) => {
        await processCreateVirtualAccountJob(job as Job<CreateVirtualAccountJobData>);
      },
      'retry-sell-token-transfer': async (job: Job) => {
        await processRetrySellTokenTransferJob(job as Job<RetrySellTokenTransferJobData>);
      },
      // Add more tatum job processors here as needed
    },
    // Add more queues here as needed
  };

  const jobProcessors = queueProcessors[queueName];
  if (!jobProcessors) {
    console.error(`[Worker] No processors found for queue: "${queueName}"`);
    console.error(`[Worker] Available queues: ${Object.keys(queueProcessors).join(', ')}`);
    process.exit(1);
  }

  // Start the worker with job name processors
  queueWorker.startWorker(queueName, jobProcessors);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Worker] Received SIGTERM, shutting down gracefully...');
    await queueWorker.stopAll();
    await redisConfig.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[Worker] Received SIGINT, shutting down gracefully...');
    await queueWorker.stopAll();
    await redisConfig.close();
    process.exit(0);
  });
}

