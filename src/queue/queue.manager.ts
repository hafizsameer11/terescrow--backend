import Queue, { QueueOptions, JobOptions } from 'bull';
import { redisConfig } from '../config/redis.config';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Queue Manager
 * Manages all queues in the application (similar to Laravel's Queue system)
 */
class QueueManager {
  private queues: Map<string, Queue.Queue> = new Map();
  private redisConnection: any;

  constructor() {
    // Get Redis connection for all queues
    this.redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };
  }

  /**
   * Get or create a queue
   * @param queueName - Name of the queue
   * @param options - Optional queue options
   */
  getQueue(queueName: string, options?: QueueOptions): Queue.Queue {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName)!;
    }

    const defaultOptions: QueueOptions = {
      redis: this.redisConnection,
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
      ...options,
    };

    const queue = new Queue(queueName, defaultOptions);

    // Event handlers for monitoring
    queue.on('error', (error) => {
      console.error(`[Queue:${queueName}] Error:`, error.message);
    });

    queue.on('waiting', (jobId) => {
      // Silent - jobs waiting in queue
    });

    queue.on('active', (job) => {
      // Silent - job started processing
    });

    queue.on('completed', (job) => {
      // Silent - job completed successfully
    });

    queue.on('failed', (job, err) => {
      console.error(`[Queue:${queueName}] Job ${job?.id} failed:`, err.message);
    });

    queue.on('stalled', (jobId) => {
      console.warn(`[Queue:${queueName}] Job ${jobId} stalled`);
    });

    this.queues.set(queueName, queue);
    return queue;
  }

  /**
   * Add a job to a queue
   * @param queueName - Name of the queue
   * @param jobName - Name of the job
   * @param data - Job data
   * @param options - Optional job options
   */
  async addJob(
    queueName: string,
    jobName: string,
    data: any,
    options?: JobOptions
  ): Promise<Queue.Job> {
    const queue = this.getQueue(queueName);
    return queue.add(jobName, data, options);
  }

  /**
   * Close all queues (graceful shutdown)
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map((queue) =>
      queue.close()
    );
    await Promise.all(closePromises);
    this.queues.clear();
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string) {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const statsPromises = Array.from(this.queues.keys()).map((queueName) =>
      this.getQueueStats(queueName)
    );
    return Promise.all(statsPromises);
  }
}

// Export singleton instance
export const queueManager = new QueueManager();

