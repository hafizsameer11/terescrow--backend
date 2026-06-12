import { queueManager } from '../../queue/queue.manager';

const KNOWN_QUEUES = ['default', 'tatum', 'bill-payments'] as const;

export type FailedCryptoJobRow = {
  id: string;
  queueName: string;
  name: string;
  failedAt: string | null;
  attemptsMade: number;
  data: unknown;
  failedReason: string | null;
};

export async function listFailedCryptoJobs(limit = 50): Promise<FailedCryptoJobRow[]> {
  const perQueue = Math.max(10, Math.ceil(limit / KNOWN_QUEUES.length));
  const rows: FailedCryptoJobRow[] = [];

  for (const queueName of KNOWN_QUEUES) {
    try {
      const queue = queueManager.getQueue(queueName);
      const jobs = await queue.getFailed(0, perQueue - 1);
      for (const job of jobs) {
        rows.push({
          id: String(job.id),
          queueName,
          name: job.name,
          failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          attemptsMade: job.attemptsMade ?? 0,
          data: job.data,
          failedReason: job.failedReason ?? null,
        });
      }
    } catch {
      /* queue may be unavailable in dev */
    }
  }

  rows.sort((a, b) => {
    const ta = a.failedAt ? new Date(a.failedAt).getTime() : 0;
    const tb = b.failedAt ? new Date(b.failedAt).getTime() : 0;
    return tb - ta;
  });

  return rows.slice(0, limit);
}

export async function retryFailedCryptoJob(queueName: string, jobId: string): Promise<void> {
  const qn = String(queueName || '').trim();
  if (!KNOWN_QUEUES.includes(qn as (typeof KNOWN_QUEUES)[number])) {
    throw new Error(`Unknown queue: ${queueName}`);
  }
  const queue = queueManager.getQueue(qn);
  const job = await queue.getJob(jobId);
  if (!job) {
    throw new Error('Job not found');
  }
  await job.retry();
}
