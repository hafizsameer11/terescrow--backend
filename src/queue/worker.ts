import { Worker, Processor } from 'bull';
import { redisConfig } from '../config/redis.config';
import { processBillPaymentStatusJob, BillPaymentStatusJobData } from './jobs/billpayment.status.job';

/**
 * Queue Worker
 * Processes jobs from queues (similar to Laravel's queue:work)
 * 
 * Usage:
 *   ts-node src/queue/worker.ts <queue-name>
 *   ts-node src/queue/worker.ts bill-payments
 */
class QueueWorker {
  private workers: Map<string, Worker> = new Map();

  /**
   * Start a worker for a specific queue
   */
  startWorker(queueName: string, processor: Processor) {
    if (this.workers.has(queueName)) {
      console.log(`[Worker] Worker for queue "${queueName}" is already running`);
      return;
    }

    const redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    const worker = new Worker(queueName, processor, {
      redis: redisConnection,
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '1'), // Process 1 job at a time by default
      limiter: {
        max: parseInt(process.env.QUEUE_MAX_JOBS || '10'), // Max 10 jobs per interval
        duration: parseInt(process.env.QUEUE_INTERVAL || '1000'), // Per 1 second
      },
    });

    // Event handlers
    worker.on('completed', (job) => {
      console.log(`[Worker:${queueName}] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[Worker:${queueName}] Job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (error) => {
      console.error(`[Worker:${queueName}] Error:`, error.message);
    });

    worker.on('stalled', (jobId) => {
      console.warn(`[Worker:${queueName}] Job ${jobId} stalled`);
    });

    this.workers.set(queueName, worker);
    console.log(`[Worker] Started worker for queue: "${queueName}"`);
  }

  /**
   * Stop a worker
   */
  async stopWorker(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (worker) {
      await worker.close();
      this.workers.delete(queueName);
      console.log(`[Worker] Stopped worker for queue: "${queueName}"`);
    }
  }

  /**
   * Stop all workers
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.workers.keys()).map((queueName) =>
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

  // Register job processors
  const processors: Record<string, Processor> = {
    'bill-payments': async (job) => {
      await processBillPaymentStatusJob(job as any);
    },
    // Add more processors here as needed
  };

  const processor = processors[queueName];
  if (!processor) {
    console.error(`[Worker] No processor found for queue: "${queueName}"`);
    console.error(`[Worker] Available queues: ${Object.keys(processors).join(', ')}`);
    process.exit(1);
  }

  // Start the worker
  queueWorker.startWorker(queueName, processor);

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

