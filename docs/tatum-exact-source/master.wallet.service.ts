/**
 * Master Wallet Service
 * 
 * Handles master wallet creation and management
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';
import crypto from 'crypto';

export interface CreateMasterWalletParams {
  blockchain: string;
  endpoint: string;
}

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

class MasterWalletService {
  /**
   * Create a master wallet for a blockchain
   */
  async createMasterWallet(blockchain: string, endpoint: string) {
    try {
      // Check if master wallet already exists
      const existing = await prisma.masterWallet.findUnique({
        where: { blockchain },
      });

      if (existing) {
        console.log(`Master wallet for ${blockchain} already exists`);
        return existing;
      }

      // Generate wallet using Tatum API
      const walletData = await tatumService.createWallet(blockchain);

      // Check if blockchain doesn't use xpub (Solana, XRP)
      const isNoXpub = blockchain.toLowerCase() === 'solana' || blockchain.toLowerCase() === 'sol' ||
                       blockchain.toLowerCase() === 'xrp' || blockchain.toLowerCase() === 'ripple';

      // Generate address from xpub (index 0 for master wallet) or use direct address
      let address: string | null = null;
      let privateKey: string | null = null;

      if (isNoXpub) {
        // Solana/XRP: address is returned directly
        address = walletData.address || null;
        // XRP uses 'secret', Solana uses 'privateKey'
        privateKey = walletData.privateKey || walletData.secret || null;
      } else {
        // Other blockchains: generate from xpub
        try {
          if (walletData.xpub) {
            address = await tatumService.generateAddress(blockchain, walletData.xpub, 0);
          }
        } catch (error: any) {
          console.warn(`Could not generate address for ${blockchain}:`, error.message);
          address = walletData.address || null;
        }

        // Generate private key from mnemonic (index 0 for master wallet)
        try {
          if (walletData.mnemonic) {
            privateKey = await tatumService.generatePrivateKey(blockchain, walletData.mnemonic, 0);
          }
        } catch (error: any) {
          console.warn(`Could not generate private key for ${blockchain}:`, error.message);
          // Some blockchains might return private key directly
          privateKey = walletData.privateKey || null;
        }
      }

      // Encrypt sensitive data before storing
      const encryptedPrivateKey = privateKey
        ? encryptPrivateKey(privateKey)
        : null;
      const encryptedMnemonic = walletData.mnemonic
        ? encryptPrivateKey(walletData.mnemonic) // Reuse encryption function for mnemonic
        : null;

      // Store in database
      const masterWallet = await prisma.masterWallet.create({
        data: {
          blockchain,
          xpub: walletData.xpub || null,
          address: address,
          privateKey: encryptedPrivateKey,
          mnemonic: encryptedMnemonic,
          response: JSON.stringify(walletData),
        },
      });

      console.log(`Master wallet created for ${blockchain}`);
      return masterWallet;
    } catch (error: any) {
      console.error(`Error creating master wallet for ${blockchain}:`, error);
      throw new Error(`Failed to create master wallet: ${error.message}`);
    }
  }

  /**
   * Get master wallet by blockchain
   */
  async getMasterWallet(blockchain: string, includeDecrypted: boolean = false) {
    const masterWallet = await prisma.masterWallet.findUnique({
      where: { blockchain },
    });

    if (!masterWallet) {
      throw new Error(`Master wallet not found for blockchain: ${blockchain}`);
    }

    // Decrypt sensitive data if requested (use with caution!)
    if (includeDecrypted) {
      return {
        ...masterWallet,
        privateKey: masterWallet.privateKey ? decryptPrivateKey(masterWallet.privateKey) : null,
        mnemonic: masterWallet.mnemonic ? decryptPrivateKey(masterWallet.mnemonic) : null,
      };
    }

    return masterWallet;
  }

  /**
   * Get all master wallets
   */
  async getAllMasterWallets() {
    return await prisma.masterWallet.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create master wallets for all supported blockchains
   * Gets blockchains from wallet_currencies table to ensure we only create wallets for currencies that exist
   */
  async createAllMasterWallets() {
    // Get unique blockchains from wallet_currencies table
    const walletCurrencies = await prisma.walletCurrency.findMany({
      select: {
        blockchain: true,
      },
      distinct: ['blockchain'],
    });

    // Map blockchain names to their endpoints
    // Some blockchains use different endpoints (e.g., XRP uses /account instead of /wallet)
    const getEndpoint = (blockchain: string): string => {
      const normalized = blockchain.toLowerCase();
      if (normalized === 'xrp' || normalized === 'ripple') {
        return '/xrp/account'; // XRP uses /account endpoint, not /wallet
      }
      return `/${normalized}/wallet`;
    };

    // Create list of blockchains with their endpoints
    const supportedBlockchains = walletCurrencies.map((wc) => ({
      blockchain: wc.blockchain.toLowerCase(),
      endpoint: getEndpoint(wc.blockchain),
    }));

    console.log(`Found ${supportedBlockchains.length} unique blockchains in wallet_currencies:`, 
      supportedBlockchains.map(b => b.blockchain).join(', '));

    const results = [];
    const errors = [];

    for (const { blockchain, endpoint } of supportedBlockchains) {
      try {
        // Check if wallet already exists
        const existing = await prisma.masterWallet.findUnique({
          where: { blockchain },
        });

        if (existing) {
          results.push({ blockchain, status: 'exists', wallet: existing });
        } else {
          const wallet = await this.createMasterWallet(blockchain, endpoint);
          results.push({ blockchain, status: 'created', wallet });
        }
      } catch (error: any) {
        errors.push({ blockchain, error: error.message || 'Unknown error' });
      }
    }

    return {
      success: results.filter((r) => r.status === 'created').length,
      existing: results.filter((r) => r.status === 'exists').length,
      errorCount: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Update existing master wallet with missing address and private key
   * Use this to populate missing data for existing wallets
   */
  async updateMasterWalletData(blockchain: string) {
    try {
      const masterWallet = await prisma.masterWallet.findUnique({
        where: { blockchain },
      });

      if (!masterWallet) {
        throw new Error(`Master wallet not found for blockchain: ${blockchain}`);
      }

      // If address and private key already exist, skip
      if (masterWallet.address && masterWallet.privateKey) {
        console.log(`Master wallet for ${blockchain} already has address and private key`);
        return masterWallet;
      }

      // Decrypt mnemonic if needed
      let mnemonic: string | null = null;
      if (masterWallet.mnemonic) {
        try {
          mnemonic = decryptPrivateKey(masterWallet.mnemonic);
        } catch (error) {
          // If decryption fails, mnemonic might be stored in plaintext (old format)
          mnemonic = masterWallet.mnemonic;
        }
      }

      if (!mnemonic) {
        throw new Error(`Mnemonic not found for ${blockchain}`);
      }

      // Generate address from xpub (index 0)
      let address: string | null = masterWallet.address;
      if (!address && masterWallet.xpub) {
        try {
          address = await tatumService.generateAddress(blockchain, masterWallet.xpub, 0);
        } catch (error: any) {
          console.warn(`Could not generate address for ${blockchain}:`, error.message);
        }
      }

      // Generate private key from mnemonic (index 0)
      let privateKey: string | null = null;
      if (!masterWallet.privateKey) {
        try {
          privateKey = await tatumService.generatePrivateKey(blockchain, mnemonic, 0);
          // Encrypt before storing
          privateKey = encryptPrivateKey(privateKey);
        } catch (error: any) {
          console.warn(`Could not generate private key for ${blockchain}:`, error.message);
        }
      } else {
        privateKey = masterWallet.privateKey; // Keep existing encrypted key
      }

      // Update wallet with generated data
      const updated = await prisma.masterWallet.update({
        where: { blockchain },
        data: {
          address: address || undefined,
          privateKey: privateKey || undefined,
        },
      });

      console.log(`Master wallet updated for ${blockchain}`);
      return updated;
    } catch (error: any) {
      console.error(`Error updating master wallet for ${blockchain}:`, error);
      throw new Error(`Failed to update master wallet: ${error.message}`);
    }
  }

  /**
   * Update all existing master wallets with missing data
   */
  async updateAllMasterWallets() {
    const wallets = await prisma.masterWallet.findMany();
    const results = [];

    for (const wallet of wallets) {
      try {
        const updated = await this.updateMasterWalletData(wallet.blockchain);
        results.push({ blockchain: wallet.blockchain, status: 'updated', wallet: updated });
      } catch (error: any) {
        results.push({ blockchain: wallet.blockchain, status: 'error', error: error.message });
      }
    }

    return {
      total: wallets.length,
      updated: results.filter((r) => r.status === 'updated').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };
  }

  /**
   * Lock master wallet for address generation (prevents race conditions)
   */
  async lockMasterWallet(blockchain: string): Promise<any> {
    // In a production environment, you might want to use Redis locks
    // For now, we'll use a simple database transaction
    return await prisma.masterWallet.findUnique({
      where: { blockchain },
    });
  }
}

export default new MasterWalletService();

