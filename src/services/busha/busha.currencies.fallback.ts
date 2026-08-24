/** Offline fallback — NGN pair buy/sell + wallet deposit/withdraw (matches BUSHA_CRYPTO_ASSETS). */
export const BUSHA_CRYPTO_ASSETS_FALLBACK = [
  { code: 'ADA', name: 'Cardano', networks: ['ADA'], defaultNetwork: 'ADA', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'BNB', name: 'BNB', networks: ['BSC'], defaultNetwork: 'BSC', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'BTC', name: 'Bitcoin', networks: ['BTC'], defaultNetwork: 'BTC', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'CNGN', name: 'cNGN', networks: ['BASE', 'BSC'], defaultNetwork: 'BASE', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'DOGE', name: 'Dogecoin', networks: ['DOGE'], defaultNetwork: 'DOGE', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'ETH', name: 'Ethereum', networks: ['ETH', 'BASE'], defaultNetwork: 'ETH', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'GRAM', name: 'Gram', networks: ['TON'], defaultNetwork: 'TON', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'LTC', name: 'Litecoin', networks: ['LTC'], defaultNetwork: 'LTC', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'POL', name: 'Polygon', networks: ['POL'], defaultNetwork: 'POL', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'SHIB', name: 'SHIBA INU', networks: ['BSC'], defaultNetwork: 'BSC', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'SOL', name: 'Solana', networks: ['SOL'], defaultNetwork: 'SOL', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'TRX', name: 'Tron', networks: ['TRX'], defaultNetwork: 'TRX', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'USDC', name: 'USD Coin', networks: ['ETH', 'SOL', 'BASE', 'CELO', 'POL', 'XLM'], defaultNetwork: 'ETH', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'USDT', name: 'Tether', networks: ['TRX', 'BSC', 'ETH', 'SOL', 'CELO', 'POL'], defaultNetwork: 'TRX', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'XLM', name: 'Stellar', networks: ['XLM'], defaultNetwork: 'XLM', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
  { code: 'XRP', name: 'Ripple', networks: ['XRP'], defaultNetwork: 'XRP', deposit: true, withdraw: true, rampBuy: true, rampSell: true },
];
