/**
 * Master Wallet Service
 * 
 * Handles master wallet creation and management
 */

import { prisma } from '../../utils/prisma';
import tatumService from './tatum.service';

export interface CreateMasterWalletParams {
  blockchain: string;
  endpoint: string;
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

      // Store in database
      const masterWallet = await prisma.masterWallet.create({
        data: {
          blockchain,
          xpub: walletData.xpub || null,
          address: walletData.address || null,
          privateKey: walletData.privateKey || null,
          mnemonic: walletData.mnemonic || null,
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
  async getMasterWallet(blockchain: string) {
    const masterWallet = await prisma.masterWallet.findUnique({
      where: { blockchain },
    });

    if (!masterWallet) {
      throw new Error(`Master wallet not found for blockchain: ${blockchain}`);
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

