/**
 * Create Virtual Account Job
 *
 * Background job to create virtual accounts for a user
 * Triggered after email verification
 * Uses Bull queue system for async processing
 */

import { Job } from 'bull';
import virtualAccountService from '../../services/tatum/virtual.account.service';
import depositAddressService from '../../services/tatum/deposit.address.service';
import { redisConfig } from '../../config/redis.config';
import { prisma } from '../../utils/prisma';

export interface CreateVirtualAccountJobData {
  userId: number;
}

const LOCK_TTL_SEC = 300;

/**
 * Process create virtual account job (for Bull queue)
 * This is the processor function that will be called by the queue worker
 */
export async function processCreateVirtualAccountJob(
  job: Job<CreateVirtualAccountJobData>
): Promise<void> {
  const { userId } = job.data;
  const lockKey = `lock:create-virtual-account:${userId}`;
  const redis = redisConfig.getClient();

  const acquired = await redis.set(lockKey, String(job.id), 'EX', LOCK_TTL_SEC, 'NX');
  if (!acquired) {
    console.log(`[Queue:Tatum] Skipping duplicate in-flight job for user ${userId}`);
    return;
  }

  try {
    console.log(`[Queue:Tatum] Starting virtual account creation for user ${userId}`);

    const virtualAccounts = await virtualAccountService.createVirtualAccountsForUser(userId);

    console.log(`[Queue:Tatum] Created ${virtualAccounts.length} virtual accounts for user ${userId}`);

    for (const account of virtualAccounts) {
      try {
        const hasAddress = await prisma.depositAddress.count({
          where: { virtualAccountId: account.id },
        });
        if (hasAddress > 0) {
          continue;
        }

        await depositAddressService.generateAndAssignToVirtualAccount(account.id);
        console.log(`[Queue:Tatum] Deposit address assigned for account ${account.accountId}`);
      } catch (error: any) {
        console.error(`[Queue:Tatum] Error processing account ${account.accountId}:`, error.message);
      }
    }

    console.log(`[Queue:Tatum] Completed virtual account creation for user ${userId}`);
  } catch (error: any) {
    console.error(`[Queue:Tatum] Error in createVirtualAccountJob for user ${userId}:`, error);
    throw error;
  } finally {
    await redis.del(lockKey);
  }
}
