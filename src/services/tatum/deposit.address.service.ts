/**
 * Deposit Address Service
 * 
 * Handles deposit address generation and assignment
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';
import masterWalletService from './master.wallet.service';
import crypto from 'crypto';

// Blockchain groups that share the same address
const BLOCKCHAIN_GROUPS: { [key: string]: string[] } = {
  tron: ['tron', 'usdt_tron'],
  ethereum: ['eth', 'usdt', 'usdc'],
  bsc: ['bsc', 'usdt_bsc', 'usdc_bsc'],
};

/**
 * Encrypt private key
 */
function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const iv = crypto.randomBytes(16);
  // @ts-ignore - Buffer is valid for CipherKey, TypeScript type definition issue
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt private key
 */
function decryptPrivateKey(encryptedKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  // @ts-ignore - Buffer is valid for CipherKey, TypeScript type definition issue
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

class DepositAddressService {
  /**
   * Get blockchain group for a currency
   */
  private getBlockchainGroup(blockchain: string): string[] {
    for (const [key, group] of Object.entries(BLOCKCHAIN_GROUPS)) {
      if (group.includes(blockchain.toLowerCase())) {
        return group;
      }
    }
    return [blockchain.toLowerCase()];
  }

  /**
   * Generate and assign deposit address to virtual account
   */
  async generateAndAssignToVirtualAccount(virtualAccountId: number) {
    try {
      // Get virtual account
      const virtualAccount = await prisma.virtualAccount.findUnique({
        where: { id: virtualAccountId },
        include: { walletCurrency: true },
      });

      if (!virtualAccount) {
        throw new Error('Virtual account not found');
      }

      const blockchain = virtualAccount.blockchain.toLowerCase();
      const currency = virtualAccount.currency.toLowerCase();

      // Check for existing address in the same blockchain group
      const blockchainGroup = this.getBlockchainGroup(blockchain);
      const existingAddress = await prisma.depositAddress.findFirst({
        where: {
          virtualAccount: {
            userId: virtualAccount.userId,
            blockchain: {
              in: blockchainGroup.map((b) => b.charAt(0).toUpperCase() + b.slice(1)),
            },
          },
        },
        include: {
          virtualAccount: true,
        },
      });

      // If address exists in the same group, reuse it
      if (existingAddress) {
        // Check if this virtual account already has this address
        const existingForThisAccount = await prisma.depositAddress.findFirst({
          where: {
            virtualAccountId,
            address: existingAddress.address,
          },
        });

        if (!existingForThisAccount) {
          // Ensure index exists (should always be present, but add safeguard)
          if (existingAddress.index === null || existingAddress.index === undefined) {
            console.warn(`Warning: Existing address ${existingAddress.address} has no index stored. This should not happen.`);
            throw new Error(`Cannot reuse address ${existingAddress.address}: index is missing`);
          }

          // Assign existing address to this virtual account
          const depositAddress = await prisma.depositAddress.create({
            data: {
              virtualAccountId,
              blockchain: existingAddress.blockchain,
              currency: existingAddress.currency,
              address: existingAddress.address,
              index: existingAddress.index, // Store the index used for this address
              privateKey: existingAddress.privateKey, // Reuse encrypted key
            },
          });

          console.log(`Reused address ${existingAddress.address} with index ${existingAddress.index} for virtual account ${virtualAccountId}`);

          // Register webhook for this address (V4 API)
          if (existingAddress.blockchain) {
            try {
              const webhookUrl = process.env.TATUM_WEBHOOK_URL || `${process.env.BASE_URL}/api/v2/webhooks/tatum`;
              const addressBlockchain = existingAddress.blockchain; // Type narrowing
              await tatumService.registerAddressWebhookV4(
                existingAddress.address,
                addressBlockchain,
                webhookUrl,
                {
                  type: 'ADDRESS_EVENT',
                  templateId: 'enriched',
                }
              );
              console.log(`Webhook registered for address ${existingAddress.address}`);
            } catch (error: any) {
              console.error(`Failed to register webhook for address ${existingAddress.address}:`, error.message);
              // Don't fail the whole process if webhook registration fails
            }
          }

          return depositAddress;
        }
      }

      // Generate new address
      const masterWallet = await masterWalletService.lockMasterWallet(blockchain);
      if (!masterWallet || !masterWallet.xpub || !masterWallet.mnemonic) {
        throw new Error(`Master wallet not found or incomplete for ${blockchain}`);
      }

      // Decrypt mnemonic (it's stored encrypted)
      let mnemonic: string;
      try {
        mnemonic = decryptPrivateKey(masterWallet.mnemonic);
      } catch (error) {
        // If decryption fails, mnemonic might be stored in plaintext (old format)
        mnemonic = masterWallet.mnemonic;
      }

      // Calculate next index (starting from 5, incrementing by 1)
      // Master wallet uses index 0, so we start user addresses at 5 to avoid conflicts
      // Standard HD wallet derivation uses sequential indices (5, 6, 7, 8...)
      const maxIndex = await prisma.depositAddress.findFirst({
        where: {
          blockchain: blockchain,
          index: { not: null }, // Only consider addresses with valid indexes
        },
        orderBy: { index: 'desc' },
        select: { index: true },
      });

      // Use sequential indexing: next index = max + 1, or 5 if no addresses exist yet
      // Starting at 5 leaves room for master wallet (index 0) and system addresses
      const nextIndex = maxIndex?.index !== null && maxIndex?.index !== undefined 
        ? maxIndex.index + 1 
        : 5;

      console.log(`Generating new address for ${blockchain} using index ${nextIndex} (previous max: ${maxIndex?.index || 'none'})`);

      // Generate address using the calculated index
      const address = await tatumService.generateAddress(
        blockchain,
        masterWallet.xpub!, // Already checked above that xpub exists
        nextIndex
      );

      // Generate private key using the same index (mnemonic already decrypted above)
      const privateKey = await tatumService.generatePrivateKey(
        blockchain,
        mnemonic,
        nextIndex
      );

      // Encrypt private key
      const encryptedPrivateKey = encryptPrivateKey(privateKey);

      // Store in database with the index used for address and private key generation
      const depositAddress = await prisma.depositAddress.create({
        data: {
          virtualAccountId,
          blockchain,
          currency,
          address,
          index: nextIndex, // Store the index used for generating address and private key
          privateKey: encryptedPrivateKey,
        },
      });

      console.log(`Generated new address ${address} with index ${nextIndex} for virtual account ${virtualAccountId}`);

      // Register webhook for this address (V4 API)
      try {
        const webhookUrl = process.env.TATUM_WEBHOOK_URL || `${process.env.BASE_URL}/api/v2/webhooks/tatum`;
        await tatumService.registerAddressWebhookV4(
          address,
          blockchain,
          webhookUrl,
          {
            type: 'ADDRESS_EVENT',
            templateId: 'enriched',
          }
        );
        console.log(`Webhook registered for address ${address}`);
      } catch (error: any) {
        console.error(`Failed to register webhook for address ${address}:`, error.message);
        // Don't fail the whole process if webhook registration fails
      }

      return depositAddress;
    } catch (error: any) {
      console.error(`Error generating deposit address:`, error);
      throw new Error(`Failed to generate deposit address: ${error.message}`);
    }
  }

  /**
   * Get deposit address for a user's virtual account
   */
  async getDepositAddress(userId: number, currency: string, blockchain: string) {
    const virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency,
        blockchain,
      },
      include: {
        depositAddresses: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!virtualAccount || !virtualAccount.depositAddresses.length) {
      throw new Error('Deposit address not found');
    }

    return {
      address: virtualAccount.depositAddresses[0].address,
      blockchain: virtualAccount.depositAddresses[0].blockchain,
      currency: virtualAccount.depositAddresses[0].currency,
      virtualAccountId: virtualAccount.id,
    };
  }
}

export default new DepositAddressService();

