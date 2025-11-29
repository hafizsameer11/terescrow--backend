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
          // Assign existing address to this virtual account
          await prisma.depositAddress.create({
            data: {
              virtualAccountId,
              blockchain: existingAddress.blockchain,
              currency: existingAddress.currency,
              address: existingAddress.address,
              index: existingAddress.index,
              privateKey: existingAddress.privateKey, // Reuse encrypted key
            },
          });

          // Assign to Tatum virtual account
          await tatumService.assignAddressToVirtualAccount(
            virtualAccount.accountId,
            existingAddress.address
          );

          console.log(`Reused address ${existingAddress.address} for virtual account ${virtualAccountId}`);
          return existingAddress;
        }
      }

      // Generate new address
      const masterWallet = await masterWalletService.lockMasterWallet(blockchain);
      if (!masterWallet || !masterWallet.xpub || !masterWallet.mnemonic) {
        throw new Error(`Master wallet not found or incomplete for ${blockchain}`);
      }

      // Calculate next index (starting from 5, incrementing by 40)
      const maxIndex = await prisma.depositAddress.findFirst({
        where: {
          blockchain: blockchain,
        },
        orderBy: { index: 'desc' },
        select: { index: true },
      });

      const nextIndex = maxIndex?.index ? maxIndex.index + 40 : 5;

      // Generate address
      const address = await tatumService.generateAddress(
        blockchain,
        masterWallet.xpub,
        nextIndex
      );

      // Generate private key
      const privateKey = await tatumService.generatePrivateKey(
        blockchain,
        masterWallet.mnemonic,
        nextIndex
      );

      // Encrypt private key
      const encryptedPrivateKey = encryptPrivateKey(privateKey);

      // Assign to Tatum virtual account
      await tatumService.assignAddressToVirtualAccount(virtualAccount.accountId, address);

      // Store in database
      const depositAddress = await prisma.depositAddress.create({
        data: {
          virtualAccountId,
          blockchain,
          currency,
          address,
          index: nextIndex,
          privateKey: encryptedPrivateKey,
        },
      });

      console.log(`Generated new address ${address} for virtual account ${virtualAccountId}`);
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

