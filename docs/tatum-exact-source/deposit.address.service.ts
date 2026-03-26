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
      
      if (!userWallet || !userWallet.mnemonic) {
        throw new Error(`Failed to get or create user wallet for user ${virtualAccount.userId}, blockchain ${baseBlockchain}`);
      }

      // Check if this blockchain doesn't use xpub (returns address directly)
      // Solana and XRP don't use xpub - they return address directly
      const isNoXpub = baseBlockchain === 'solana' || baseBlockchain === 'sol' || 
                       baseBlockchain === 'xrp' || baseBlockchain === 'ripple';

      // Decrypt user wallet mnemonic/secret
      let mnemonic: string;
      try {
        mnemonic = decryptPrivateKey(userWallet.mnemonic);
      } catch (error) {
        throw new Error('Failed to decrypt user wallet mnemonic/secret');
      }

      let address: string;
      let privateKey: string;
      const addressIndex = 0; // Always 0 for user wallet addresses (one per blockchain)

      if (isNoXpub) {
        // For Solana/XRP, check if we already have an address stored in xpub field
        // These blockchains don't use HD derivation - one mnemonic/secret = one address/private key pair
        if (userWallet.xpub) {
          // Address already stored from previous generation
          address = userWallet.xpub;
          console.log(`Using existing ${baseBlockchain} address ${address} from user wallet`);
          
          // For Solana/XRP, the mnemonic field stores the private key/secret directly
          // Solana: We store privateKey in mnemonic field (since Tatum returns it and we can't derive it from mnemonic via API)
          // XRP: We store secret in mnemonic field (secret IS the private key)
          if (baseBlockchain === 'xrp' || baseBlockchain === 'ripple') {
            // XRP: secret is the private key (stored in mnemonic field)
            privateKey = mnemonic;
          } else if (baseBlockchain === 'solana' || baseBlockchain === 'sol') {
            // Solana: privateKey is stored in mnemonic field (we store it during wallet creation)
            // This is because Tatum returns privateKey directly and we can't derive it from mnemonic via API
            privateKey = mnemonic;
            console.log(`Solana: Using stored private key from mnemonic field`);
          } else {
            // Other non-xpub blockchains: try to generate private key from mnemonic
            try {
              privateKey = await tatumService.generatePrivateKey(baseBlockchain, mnemonic, 0);
            } catch (error: any) {
              console.error(`Failed to generate ${baseBlockchain} private key from mnemonic:`, error.message);
              throw new Error(`Failed to get ${baseBlockchain} private key: ${error.message}`);
            }
          }
        } else {
          // First time generating wallet for this user
          // Solana/XRP wallet generation returns address and privateKey/secret directly (not xpub-based)
          console.log(`Generating ${baseBlockchain} wallet to get address and private key for user ${virtualAccount.userId}`);
          const walletData = await tatumService.createWallet(baseBlockchain);
          
          if (!walletData.address) {
            throw new Error(`Failed to generate ${baseBlockchain} wallet: missing address`);
          }

          address = walletData.address;
          // XRP uses 'secret', Solana uses 'privateKey'
          privateKey = walletData.privateKey || walletData.secret || '';
          
          if (!privateKey) {
            throw new Error(`Failed to generate ${baseBlockchain} wallet: missing privateKey/secret`);
          }

          // Store address in xpub field (since these blockchains don't have xpub)
          // This allows us to reuse the address later
          await prisma.userWallet.update({
            where: { id: userWallet.id },
            data: { xpub: address }, // Store address in xpub field
          });
          console.log(`Stored ${baseBlockchain} address ${address} in user wallet xpub field`);
        }

        console.log(`Using ${baseBlockchain} address ${address} (${userWallet.xpub ? 'existing' : 'newly generated'})`);
      } else {
        // For other blockchains, use xpub-based address generation
        if (!userWallet.xpub) {
          throw new Error(`Failed to get or create user wallet: missing xpub for ${baseBlockchain}`);
        }

        const xpub = userWallet.xpub;
        console.log(`Using user wallet for user ${virtualAccount.userId}, blockchain ${baseBlockchain}`);

        console.log(`Generating new address for ${blockchain} using user wallet (user ${virtualAccount.userId}) with index ${addressIndex}`);

        // Generate address using the user's wallet xpub and index 0
        address = await tatumService.generateAddress(
          baseBlockchain,
          xpub,
          addressIndex
        );

        // Generate private key using the user's wallet mnemonic and index 0
        privateKey = await tatumService.generatePrivateKey(
          baseBlockchain,
          mnemonic,
          addressIndex
        );
      }

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

      // Register webhooks for this address (V4 API)
      // Use base blockchain for webhook registration
      // For blockchains that support fungible tokens, register both native and fungible subscriptions
      try {
        const webhookUrl = process.env.TATUM_WEBHOOK_URL || `${process.env.BASE_URL}/api/v2/webhooks/tatum`;
        
        // Check if this blockchain supports fungible tokens
        const hasFungibleTokens = await prisma.walletCurrency.findFirst({
          where: {
            blockchain: baseBlockchain.toLowerCase(),
            isToken: true,
            contractAddress: { not: null },
          },
        });

        // Always register native token subscription
        try {
          await tatumService.registerAddressWebhookV4(
            address,
            baseBlockchain,
            webhookUrl,
            {
              type: 'INCOMING_NATIVE_TX',
            }
          );
          console.log(`INCOMING_NATIVE_TX webhook registered for address ${address} on ${baseBlockchain}`);
        } catch (error: any) {
          console.error(`Failed to register INCOMING_NATIVE_TX webhook for address ${address}:`, error.message);
          // Continue - don't fail if one subscription fails
        }

        // Register fungible token subscription if blockchain supports tokens
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
            console.log(`INCOMING_FUNGIBLE_TX webhook registered for address ${address} on ${baseBlockchain}`);
          } catch (error: any) {
            console.error(`Failed to register INCOMING_FUNGIBLE_TX webhook for address ${address}:`, error.message);
            // Continue - don't fail if one subscription fails
          }
        }
      } catch (error: any) {
        console.error(`Failed to register webhooks for address ${address}:`, error.message);
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

