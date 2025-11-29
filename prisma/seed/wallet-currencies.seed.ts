/**
 * Wallet Currencies Seeder
 * 
 * Seeds the wallet_currencies table with supported cryptocurrencies
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const walletCurrencies = [
  {
    id: 2,
    blockchain: 'bitcoin',
    currency: 'BTC',
    symbol: 'wallet_symbols/btc.png',
    name: 'BTC',
    price: 104120,
    nairaPrice: 0,
    tokenType: null,
    contractAddress: null,
    decimals: 18,
    isToken: false,
    blockchainName: 'BITCOIN',
  },
  {
    id: 3,
    blockchain: 'Ethereum',
    currency: 'ETH',
    symbol: 'wallet_symbols/ETH.png',
    name: 'ETH',
    price: 2588.69,
    nairaPrice: 0,
    tokenType: null,
    contractAddress: null,
    decimals: 18,
    isToken: false,
    blockchainName: 'ETHERIUM',
  },
  {
    id: 4,
    blockchain: 'tron',
    currency: 'TRON',
    symbol: 'wallet_symbols/trx.png',
    name: 'TRON',
    price: 20990.27,
    nairaPrice: 0,
    tokenType: null,
    contractAddress: null,
    decimals: 18,
    isToken: false,
    blockchainName: 'TRON',
  },
  {
    id: 5,
    blockchain: 'ethereum',
    currency: 'USDT',
    symbol: 'wallet_symbols/TUSDT.png',
    name: 'USDT ETH',
    price: 1,
    nairaPrice: 0,
    tokenType: 'ERC-20',
    contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 18,
    isToken: true,
    blockchainName: 'ERC-20',
  },
  {
    id: 6,
    blockchain: 'tron',
    currency: 'USDT_TRON',
    symbol: 'wallet_symbols/TUSDT.png',
    name: 'USDT TRON',
    price: 1,
    nairaPrice: 0,
    tokenType: 'Token',
    contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 18,
    isToken: true,
    blockchainName: 'TRC-20',
  },
  {
    id: 7,
    blockchain: 'solana',
    currency: 'SOL',
    symbol: 'wallet_symbols/sol.png',
    name: 'SOL',
    price: 12,
    nairaPrice: 0,
    tokenType: 'Native',
    contractAddress: null,
    decimals: 18,
    isToken: false,
    blockchainName: 'SOLANA',
  },
  {
    id: 8,
    blockchain: 'Litecoin',
    currency: 'LTC',
    symbol: 'wallet_symbols/z4S6ddY7lGvUr6Qrc7AZwU6RHC4N6pDhHl6KMywQ.png',
    name: 'LTC',
    price: 1234,
    nairaPrice: 0,
    tokenType: 'Native',
    contractAddress: null,
    decimals: 18,
    isToken: false,
    blockchainName: 'LITECOIN',
  },
  {
    id: 9,
    blockchain: 'bsc',
    currency: 'BSC',
    symbol: 'wallet_symbols/BSC.png',
    name: 'BSC',
    price: 222,
    nairaPrice: 0,
    tokenType: 'Native',
    contractAddress: null,
    decimals: 18,
    isToken: true,
    blockchainName: 'BSC',
  },
  {
    id: 10,
    blockchain: 'bsc',
    currency: 'USDT_BSC',
    symbol: 'wallet_symbols/TUSDT.png',
    name: 'USDT BSC',
    price: 1,
    nairaPrice: 0,
    tokenType: 'BEP-20',
    contractAddress: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
    isToken: true,
    blockchainName: 'BEP-20',
  },
  {
    id: 11,
    blockchain: 'ethereum',
    currency: 'USDC',
    symbol: 'wallet_symbols/m3pJad6MwfLf6ZeaYnJ0624OhxToayjh2i3dYcPk.png',
    name: 'USDC',
    price: 1,
    nairaPrice: 0,
    tokenType: 'ERC-20',
    contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 18,
    isToken: true,
    blockchainName: 'ERC-20',
  },
  {
    id: 14,
    blockchain: 'bsc',
    currency: 'USDC_BSC',
    symbol: 'wallet_symbols/D5FKkwoDlCDbmbtRaFb0QvGxfSXzEj1MFsoFHNXj.png',
    name: 'USDC BSC',
    price: 1,
    nairaPrice: 0,
    tokenType: 'BEP-20',
    contractAddress: '0x64544969ed7EBf5f083679233325356EbE738930',
    decimals: 18,
    isToken: true,
    blockchainName: 'BEP-20',
  },
];

export async function seedWalletCurrencies() {
  console.log('🌱 Seeding wallet currencies...');

  for (const currency of walletCurrencies) {
    await prisma.walletCurrency.upsert({
      where: { id: currency.id },
      update: {
        blockchain: currency.blockchain,
        currency: currency.currency,
        symbol: currency.symbol,
        name: currency.name,
        price: currency.price,
        nairaPrice: currency.nairaPrice,
        tokenType: currency.tokenType,
        contractAddress: currency.contractAddress,
        decimals: currency.decimals,
        isToken: currency.isToken,
        blockchainName: currency.blockchainName,
      },
      create: currency,
    });
  }

  console.log(`✅ Seeded ${walletCurrencies.length} wallet currencies`);
}

if (require.main === module) {
  seedWalletCurrencies()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

