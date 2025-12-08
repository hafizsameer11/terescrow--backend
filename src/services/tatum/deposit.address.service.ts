/**
 * Deposit Address Service
 * 
 * Handles deposit address generation and assignment
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';
import masterWalletService from './master.wallet.service';
import userWalletService from '../user/user.wallet.service';
import crypto from 'crypto';

// Blockchain groups that share the same address
// All currencies on the same base blockchain share the same address
// This maps blockchain name variations to the base blockchain name used for master wallet lookup
// Note: In the database, blockchain field stores the actual blockchain name (e.g., 'ethereum', 'tron', 'bsc')
// Currencies with the same blockchain value share the same address
const BLOCKCHAIN_NORMALIZATION: { [key: string]: string } = {
  // Ethereum variations
  'ethereum': 'ethereum',
  'eth': 'ethereum',
  // Tron variations  
  'tron': 'tron',
  'trx': 'tron',
  // BSC variations
  'bsc': 'bsc',
  'binance': 'bsc',
  'binancesmartchain': 'bsc',
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
   * Normalize blockchain name to base blockchain for master wallet lookup
   * e.g., 'ethereum' -> 'ethereum', 'eth' -> 'ethereum', 'tron' -> 'tron'
   */
  private normalizeBlockchain(blockchain: string): string {
    const normalized = blockchain.toLowerCase();
    return BLOCKCHAIN_NORMALIZATION[normalized] || normalized;
  }
  
  /**
   * Get all blockchain name variations that map to the same base blockchain
   * Used for finding existing addresses within the same blockchain group
   */
  private getBlockchainGroup(blockchain: string): string[] {
    const baseBlockchain = this.normalizeBlockchain(blockchain);
    
    // Find all blockchain variations that map to the same base blockchain
    const variations: string[] = [baseBlockchain];
    for (const [variant, base] of Object.entries(BLOCKCHAIN_NORMALIZATION)) {
      if (base === baseBlockchain && variant !== baseBlockchain) {
        variations.push(variant);
      }
    }
    
    return variations;
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

      console.log(`Checking for existing address - Blockchain: ${blockchain}, Currency: ${currency}`);

      // Normalize blockchain name for consistent comparison
      // All currencies on the same blockchain share the same address
      const normalizedBlockchain = this.normalizeBlockchain(blockchain);
      console.log(`Normalized blockchain: ${normalizedBlockchain}`);

      // Check for existing deposit address on the same blockchain for this user
      // Get all deposit addresses for this user first, then filter by normalized blockchain
      const allUserAddresses = await prisma.depositAddress.findMany({
        where: {
          virtualAccount: {
            userId: virtualAccount.userId,
          },
        },
        include: {
          virtualAccount: true,
        },
        orderBy: {
          createdAt: 'asc', // Get the first created address
        },
      });

      // Find existing address on the same normalized blockchain (case-insensitive comparison)
      // All currencies on the same blockchain share the same address
      const existingAddress = allUserAddresses.find((addr) => {
        if (!addr.blockchain) return false;
        const addrNormalizedBlockchain = this.normalizeBlockchain(addr.blockchain);
        // If normalized blockchains match, they share the same address
        return addrNormalizedBlockchain === normalizedBlockchain;
      });

      // If address exists in the same group, reuse it
      if (existingAddress) {
        console.log(`Found existing address in group: ${existingAddress.address} for blockchain ${existingAddress.blockchain}`);
        
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
          // Store with current virtual account's currency and blockchain, but reuse the address and private key
          const depositAddress = await prisma.depositAddress.create({
            data: {
              virtualAccountId,
              userWalletId: existingAddress.userWalletId, // Preserve user wallet link if exists
              blockchain: blockchain, // Use current virtual account's blockchain
              currency: currency, // Use current virtual account's currency
              address: existingAddress.address, // Reuse the address
              index: existingAddress.index, // Store the index used for this address
              privateKey: existingAddress.privateKey, // Reuse encrypted key
            },
          });

          console.log(`Reused address ${existingAddress.address} with index ${existingAddress.index} for virtual account ${virtualAccountId} (${blockchain}/${currency})`);

          // Note: Webhook should already be registered for this address when it was first created
          // Skip webhook registration when reusing addresses to avoid duplicates
          // The webhook will monitor all transactions to this address regardless of which currency uses it

          return depositAddress;
        } else {
          console.log(`Address ${existingAddress.address} already assigned to this virtual account`);
          return existingForThisAccount;
        }
      }

      // Generate new address
      // Use the normalized base blockchain for wallet lookup
      // All currencies on the same blockchain share the same address
      const baseBlockchain = this.normalizeBlockchain(blockchain);
      console.log(`Generating new address using base blockchain: ${baseBlockchain} (requested: ${blockchain})`);
      
      // Get or create user wallet (per-user wallet approach - mandatory)
      // Each user gets their own unique wallet per blockchain
      const userWallet = await userWalletService.getOrCreateUserWallet(virtualAccount.userId, baseBlockchain);
      
      if (!userWallet || !userWallet.xpub || !userWallet.mnemonic) {
        throw new Error(`Failed to get or create user wallet for user ${virtualAccount.userId}, blockchain ${baseBlockchain}`);
      }

      // Decrypt user wallet mnemonic
      let mnemonic: string;
      try {
        mnemonic = decryptPrivateKey(userWallet.mnemonic);
      } catch (error) {
        throw new Error('Failed to decrypt user wallet mnemonic');
      }

      const xpub = userWallet.xpub;
      console.log(`Using user wallet for user ${virtualAccount.userId}, blockchain ${baseBlockchain}`);

      // Use index 0 for user wallet addresses (same as master wallet approach)
      // One address per blockchain per user (all currencies on same blockchain share the address)
      // This matches how master wallet works - index 0 for the wallet's address
      const addressIndex = 0;

      console.log(`Generating new address for ${blockchain} using user wallet (user ${virtualAccount.userId}) with index ${addressIndex}`);

      // Generate address using the user's wallet xpub and index 0
      const address = await tatumService.generateAddress(
        baseBlockchain,
        xpub,
        addressIndex
      );

      // Generate private key using the user's wallet mnemonic and index 0
      const privateKey = await tatumService.generatePrivateKey(
        baseBlockchain,
        mnemonic,
        addressIndex
      );

      // Encrypt private key
      const encryptedPrivateKey = encryptPrivateKey(privateKey);

      // Store in database with the index used for address and private key generation
      // Always link to user wallet (per-user wallet approach)
      // Index is always 0 (one address per blockchain per user, like master wallet)
      const depositAddress = await prisma.depositAddress.create({
        data: {
          virtualAccountId,
          userWalletId: userWallet.id, // Always link to user wallet
          blockchain,
          currency,
          address,
          index: addressIndex, // Always 0 for user wallet addresses (one per blockchain)
          privateKey: encryptedPrivateKey,
        },
      });

      console.log(`Generated new address ${address} with index ${addressIndex} for virtual account ${virtualAccountId}`);

      // Register webhook for this address (V4 API)
      // Use base blockchain for webhook registration
      try {
        const webhookUrl = process.env.TATUM_WEBHOOK_URL || `${process.env.BASE_URL}/api/v2/webhooks/tatum`;
        await tatumService.registerAddressWebhookV4(
          address,
          baseBlockchain, // Use base blockchain for webhook
          webhookUrl,
          {
            type: 'ADDRESS_EVENT',
          }
        );
        console.log(`Webhook registered for address ${address} on ${baseBlockchain}`);
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

