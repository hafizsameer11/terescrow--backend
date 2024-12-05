export const cryptoData = [
  {
    id: '1',
    icon: 'btc',
    heading: 'BTC',
    text: 'Bitcoin Wallet',
  },
  {
    icon: 'usdt',
    id: '2',
    heading: 'USDT',
    text: 'Tether Wallet',
  },
  {
    icon: 'eth',
    id: '3',
    heading: 'ETH',
    text: 'Ethereum Wallet',
  },
  {
    icon: 'solana',
    id: '4',
    heading: 'SOLANA',
    text: 'Tether Wallet',
  },
  {
    icon: 'shibaInu',
    id: '5',
    heading: 'SHIBU INU',
    text: 'Tether Wallet',
  },
  {
    icon: 'dogeCoin',
    id: '6',
    heading: 'DOGE COIN',
    text: 'Tether Wallet',
  },
  {
    icon: 'dollarCoin',
    id: '7',
    heading: 'USDC',
    text: 'Ethereum Wallet',
  },
  {
    icon: 'bnb',
    id: '8',
    heading: 'BNB',
    text: 'Tether Wallet',
  },
  {
    icon: 'tonCoin',
    id: '9',
    heading: 'TONCOIN',
    text: 'Ethereum Wallet',
  },
  {
    icon: 'tron',
    id: '10',
    heading: 'TRON',
    text: 'Tether Wallet',
  },
];

export const cardData = [
  { id: '1', card: 'amazonCard', text: 'Amazon' },
  { id: '2', card: 'americanExpressCard', text: 'American Express' },
  { id: '3', card: 'visaCard', text: 'Visa Card' },
  { id: '4', card: 'ebayCard', text: 'Ebay' },
  { id: '5', card: 'footLockerCard', text: 'Footlocker' },
  { id: '6', card: 'googlePlayCard', text: 'Google Play' },
  { id: '7', card: 'itunesCard', text: 'iTunes' },
  { id: '8', card: 'nikeCard', text: 'Nike' },
];
export const COUNTRIES = [
  { label: 'Nigeria', value: 'nigeria' },
  { label: 'Ghana', value: 'ghana' },
  { label: 'Cameroon', value: 'cameroon' },
  { label: 'South Africa', value: 'south africa' },
  { label: 'Kenya', value: 'kenya' },
];

export const amazonItems = [
  {
    title: 'USA Amazon with Receipt (50-100)',
    price: 35,
  },
  {
    title: 'USA Amazon with Receipt (100-500)',
    price: 40,
  },
  {
    title: 'USA Amazon with Receipt (25-500)',
    price: 45,
  },
  {
    title: 'Amazon with Receipt (101-500)',
    price: 38,
  },
  {
    title: 'USA Amazon Cash with Receipt (25-49)',
    price: 29,
  },
  {
    title: 'Amazon with Receipt (25-99)',
    price: 32,
  },
  {
    title: 'USA Amazon with Receipt',
    price: 47,
  },
];

export const cryptoDataArray = [
  { id: '1', title: 'Btc', price: 45000 }, // Bitcoin
  { id: '2', title: 'Usdt', price: 1.0 }, // Tether
  { id: '3', title: 'Eth', price: 3200 }, // Ethereum
  { id: '4', title: 'Solana', price: 85 }, // Solana
  { id: '5', title: 'Shibu Inu', price: 0.00007 }, // Shiba Inu
  { id: '6', title: 'Doge Coin', price: 0.25 }, // Doge Coin
  { id: '7', title: 'Usdc', price: 1.0 }, // USD Coin
  { id: '8', title: 'Bnb', price: 380 }, // Binance Coin
  { id: '9', title: 'Toncoin', price: 15 }, // Toncoin
  { id: '10', title: 'Tron', price: 0.12 }, // Tron
];

export const departmentData = [
  {
    icon: 'gift',
    key: '1',
    heading: 'Sell Gift Card',
    text: 'Exchange your gift cards for instant cash',
    route: '/sellgiftcard',
  },
  {
    icon: 'gift',
    key: '2',
    heading: 'Buy Gift Cards',
    text: 'Get great deals and instant delivery',
    route: '/buygiftcard',
  },
  {
    icon: 'bitCoin',
    key: '3',
    heading: 'Sell crypto',
    text: 'Convert your crypto into cash easily',
    route: '/sellcrypto',
  },
  {
    icon: 'bitCoin',
    key: '4',
    heading: 'Buy crypto',
    text: 'Purchase popular crypto quickly and securely',
    route: '/buycrypto',
  },
];

export function getRandomItems(array: any[]) {
  const shuffled = array.sort(() => 0.5 - Math.random()); // Shuffle the array
  return shuffled.slice(0, 5); // Return the first 8 items
}
