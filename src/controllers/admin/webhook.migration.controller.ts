/**
 * Webhook Migration Controller
 * 
 * Handles migration of webhook subscriptions from ADDRESS_EVENT to INCOMING_NATIVE_TX and INCOMING_FUNGIBLE_TX
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/prisma';
import tatumService from '../../services/tatum/tatum.service';
import ApiResponse from '../../utils/ApiResponse';
import ApiError from '../../utils/ApiError';

/**
 * Migrate webhook subscriptions for all existing deposit addresses
 * POST /api/admin/webhooks/migrate-subscriptions
 */
export const migrateWebhookSubscriptionsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookUrl = process.env.TATUM_WEBHOOK_URL || `${process.env.BASE_URL}/api/v2/webhooks/tatum`;
    
    // Get all unique deposit addresses (group by address and blockchain)
    const depositAddresses = await prisma.depositAddress.findMany({
      select: {
        id: true,
        address: true,
        blockchain: true,
      },
      distinct: ['address', 'blockchain'],
    });

    const results = {
      total: depositAddresses.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ address: string; blockchain: string; error: string }>,
    };

    console.log(`[Webhook Migration] Starting migration for ${depositAddresses.length} addresses...`);

    for (const depositAddress of depositAddresses) {
      try {
        const address = depositAddress.address;
        
        // Skip if blockchain is null (shouldn't happen, but handle gracefully)
        if (!depositAddress.blockchain) {
          console.warn(`[Webhook Migration] ⚠️ Skipping address ${address} - blockchain is null`);
          results.skipped++;
          continue;
        }
        
        const blockchain = depositAddress.blockchain.toLowerCase();

        // Normalize blockchain name
        const BLOCKCHAIN_NORMALIZATION: { [key: string]: string } = {
          'ethereum': 'ethereum',
          'eth': 'ethereum',
          'tron': 'tron',
          'trx': 'tron',
          'bsc': 'bsc',
          'binance': 'bsc',
          'binancesmartchain': 'bsc',
        };
        const baseBlockchain = BLOCKCHAIN_NORMALIZATION[blockchain] || blockchain;

        // Check if this blockchain supports fungible tokens
        const hasFungibleTokens = await prisma.walletCurrency.findFirst({
          where: {
            blockchain: baseBlockchain.toLowerCase(),
            isToken: true,
            contractAddress: { not: null },
          },
        });

        let nativeRegistered = false;
        let fungibleRegistered = false;

        // Register INCOMING_NATIVE_TX subscription
        try {
          await tatumService.registerAddressWebhookV4(
            address,
            baseBlockchain,
            webhookUrl,
            {
              type: 'INCOMING_NATIVE_TX',
            }
          );
          console.log(`[Webhook Migration] ✅ INCOMING_NATIVE_TX registered for ${address} on ${baseBlockchain}`);
          nativeRegistered = true;
        } catch (error: any) {
          // Check if it's a duplicate/existing subscription error - this is OK, subscription already exists
          const errorMessage = error.message?.toLowerCase() || '';
          const responseData = error.response?.data;
          const isDuplicate = 
            errorMessage.includes('already exists') || 
            errorMessage.includes('duplicate') ||
            errorMessage.includes('subscription already') ||
            (responseData && (responseData.message?.toLowerCase().includes('already exists') || 
                             responseData.message?.toLowerCase().includes('duplicate')));
          
          if (isDuplicate) {
            console.log(`[Webhook Migration] ℹ️ INCOMING_NATIVE_TX already exists for ${address} on ${baseBlockchain} - skipping`);
            nativeRegistered = true; // Consider it successful since subscription exists
          } else {
            // Re-throw if it's a different error
            throw error;
          }
        }

        // Register INCOMING_FUNGIBLE_TX subscription if blockchain supports tokens
        if (hasFungibleTokens) {
          try {
            await tatumService.registerAddressWebhookV4(
              address,
              baseBlockchain,
              webhookUrl,
              {
                type: 'INCOMING_FUNGIBLE_TX',
              }
            );
            console.log(`[Webhook Migration] ✅ INCOMING_FUNGIBLE_TX registered for ${address} on ${baseBlockchain}`);
            fungibleRegistered = true;
          } catch (error: any) {
            // Check if it's a duplicate/existing subscription error - this is OK, subscription already exists
            const errorMessage = error.message?.toLowerCase() || '';
            const responseData = error.response?.data;
            const isDuplicate = 
              errorMessage.includes('already exists') || 
              errorMessage.includes('duplicate') ||
              errorMessage.includes('subscription already') ||
              (responseData && (responseData.message?.toLowerCase().includes('already exists') || 
                               responseData.message?.toLowerCase().includes('duplicate')));
            
            if (isDuplicate) {
              console.log(`[Webhook Migration] ℹ️ INCOMING_FUNGIBLE_TX already exists for ${address} on ${baseBlockchain} - skipping`);
              fungibleRegistered = true; // Consider it successful since subscription exists
            } else {
              // Re-throw if it's a different error
              throw error;
            }
          }
        }

        // Count as successful if at least one subscription was registered or already exists
        if (nativeRegistered && (hasFungibleTokens ? fungibleRegistered : true)) {
          results.successful++;
        } else if (nativeRegistered || fungibleRegistered) {
          // Partial success (one registered, one failed)
          results.successful++;
          results.skipped++;
        }
      } catch (error: any) {
        results.failed++;
        const errorMessage = error.message || 'Unknown error';
        results.errors.push({
          address: depositAddress.address,
          blockchain: depositAddress.blockchain || 'unknown',
          error: errorMessage,
        });
        console.error(`[Webhook Migration] ❌ Failed for ${depositAddress.address} on ${depositAddress.blockchain || 'unknown'}:`, errorMessage);
      }
    }

    console.log(`[Webhook Migration] Complete! Successful: ${results.successful}, Failed: ${results.failed}, Skipped: ${results.skipped}`);

    return new ApiResponse(
      200,
      {
        message: 'Webhook subscription migration completed',
        results,
      },
      'Migration completed successfully'
    ).send(res);
  } catch (error: any) {
    console.error('[Webhook Migration] Error:', error);
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(ApiError.internal(error.message || 'Failed to migrate webhook subscriptions'));
  }
};

