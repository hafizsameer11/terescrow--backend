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
import tatumService from '../../services/tatum/tatum.service';

export interface CreateVirtualAccountJobData {
  userId: number;
}

/**
 * Process create virtual account job (for Bull queue)
 * This is the processor function that will be called by the queue worker
 */
export async function processCreateVirtualAccountJob(
  job: Job<CreateVirtualAccountJobData>
): Promise<void> {
  const { userId } = job.data;

  try {
    console.log(`[Queue:Tatum] Starting virtual account creation for user ${userId}`);

    // Create virtual accounts for all supported currencies
    const virtualAccounts = await virtualAccountService.createVirtualAccountsForUser(userId);

    console.log(`[Queue:Tatum] Created ${virtualAccounts.length} virtual accounts for user ${userId}`);

    // For each virtual account, assign deposit address
    // Note: Webhook registration is now handled automatically in deposit.address.service.ts
    // after address generation using Tatum V4 API (address-based subscriptions)
    for (const account of virtualAccounts) {
      try {
        // Assign deposit address (this will also register webhook automatically)
        await depositAddressService.generateAndAssignToVirtualAccount(account.id);
        console.log(`[Queue:Tatum] Deposit address assigned for account ${account.accountId}`);
      } catch (error: any) {
        console.error(`[Queue:Tatum] Error processing account ${account.accountId}:`, error.message);
        // Continue with other accounts even if one fails
      }
    }

    console.log(`[Queue:Tatum] Completed virtual account creation for user ${userId}`);
  } catch (error: any) {
    console.error(`[Queue:Tatum] Error in createVirtualAccountJob for user ${userId}:`, error);
    throw error; // Re-throw to let Bull handle retries
  }
}

