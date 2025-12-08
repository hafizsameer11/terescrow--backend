/**
 * User Wallet Service
 * 
 * Handles per-user wallet creation and management
 * Each user gets their own unique wallet (mnemonic) per blockchain
 */

import { prisma } from '../../utils/prisma';
import tatumService from '../tatum/tatum.service';
import crypto from 'crypto';

/**
 * Encrypt private key or mnemonic
 */
function encryptPrivateKey(data: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
  const iv = crypto.randomBytes(16);
  // @ts-ignore - Buffer is valid for CipherKey, TypeScript type definition issue
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt private key or mnemonic
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

class UserWalletService {
  /**
   * Get or create user wallet for a blockchain
   * Creates a unique wallet (mnemonic) for the user if it doesn't exist
   */
  async getOrCreateUserWallet(userId: number, blockchain: string) {
    try {
      // Normalize blockchain name
      const normalizedBlockchain = blockchain.toLowerCase();

      // Check if user wallet already exists
      let userWallet = await prisma.userWallet.findUnique({
        where: {
          userId_blockchain: {
            userId,
            blockchain: normalizedBlockchain,
          },
        },
      });

      if (userWallet) {
        console.log(`User wallet already exists for user ${userId}, blockchain ${normalizedBlockchain}`);
        return userWallet;
      }

      // Generate new wallet using Tatum API
      console.log(`Creating new user wallet for user ${userId}, blockchain ${normalizedBlockchain}`);
      const walletData = await tatumService.createWallet(normalizedBlockchain);

      if (!walletData.mnemonic || !walletData.xpub) {
        throw new Error(`Failed to generate wallet: missing mnemonic or xpub for ${normalizedBlockchain}`);
      }

      // Encrypt mnemonic before storing
      const encryptedMnemonic = encryptPrivateKey(walletData.mnemonic);

      // Determine derivation path based on blockchain
      const derivationPath = this.getDerivationPath(normalizedBlockchain);

      // Create user wallet in database
      userWallet = await prisma.userWallet.create({
        data: {
          userId,
          blockchain: normalizedBlockchain,
          mnemonic: encryptedMnemonic,
          xpub: walletData.xpub,
          derivationPath,
        },
      });

      console.log(`User wallet created for user ${userId}, blockchain ${normalizedBlockchain}`);
      return userWallet;
    } catch (error: any) {
      console.error(`Error getting/creating user wallet:`, error);
      throw new Error(`Failed to get or create user wallet: ${error.message}`);
    }
  }

  /**
   * Get user wallet by userId and blockchain
   */
  async getUserWallet(userId: number, blockchain: string) {
    const normalizedBlockchain = blockchain.toLowerCase();
    return await prisma.userWallet.findUnique({
      where: {
        userId_blockchain: {
          userId,
          blockchain: normalizedBlockchain,
        },
      },
    });
  }

  /**
   * Get all wallets for a user
   */
  async getUserWallets(userId: number) {
    return await prisma.userWallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Decrypt and return user's mnemonic (for export)
   * Requires PIN verification (should be done in controller)
   */
  async getDecryptedMnemonic(userId: number, blockchain: string): Promise<string> {
    const userWallet = await this.getUserWallet(userId, blockchain);
    if (!userWallet || !userWallet.mnemonic) {
      throw new Error('User wallet not found or mnemonic not available');
    }

    try {
      return decryptPrivateKey(userWallet.mnemonic);
    } catch (error: any) {
      throw new Error(`Failed to decrypt mnemonic: ${error.message}`);
    }
  }

  /**
   * Get derivation path for a blockchain
   */
  private getDerivationPath(blockchain: string): string {
    const paths: { [key: string]: string } = {
      bitcoin: "m/44'/0'/0'",
      ethereum: "m/44'/60'/0'",
      tron: "m/44'/195'/0'",
      bsc: "m/44'/60'/0'", // Same as Ethereum
      litecoin: "m/44'/2'/0'",
      solana: "m/44'/501'/0'",
    };

    const normalized = blockchain.toLowerCase();
    return paths[normalized] || "m/44'/60'/0'"; // Default to Ethereum path
  }

  /**
   * Get decrypted mnemonic for export (with PIN verification)
   * This should be called after PIN verification in the controller
   */
  async exportUserWallet(userId: number, blockchain: string) {
    const userWallet = await this.getUserWallet(userId, blockchain);
    if (!userWallet) {
      throw new Error('User wallet not found');
    }

    // Get all deposit addresses for this user wallet
    const depositAddresses = await prisma.depositAddress.findMany({
      where: {
        userWalletId: userWallet.id,
      },
      include: {
        virtualAccount: {
          select: {
            currency: true,
            blockchain: true,
          },
        },
      },
      orderBy: {
        index: 'asc',
      },
    });

    // Decrypt mnemonic
    let mnemonic: string;
    try {
      mnemonic = decryptPrivateKey(userWallet.mnemonic || '');
    } catch (error) {
      throw new Error('Failed to decrypt mnemonic');
    }

    // Prepare export data
    const exportData = {
      mnemonic,
      xpub: userWallet.xpub,
      derivationPath: userWallet.derivationPath,
      blockchain: userWallet.blockchain,
      addresses: depositAddresses.map((addr) => ({
        address: addr.address,
        currency: addr.currency,
        blockchain: addr.blockchain,
        index: addr.index,
        // Note: Private keys are not included in export for security
        // Users can export individual private keys separately if needed
      })),
    };

    return exportData;
  }
}

export default new UserWalletService();

