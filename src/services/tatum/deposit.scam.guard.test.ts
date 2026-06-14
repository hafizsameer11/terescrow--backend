import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateIncomingDeposit,
  isFungibleTokenWebhook,
  isTokenContractIdentifier,
  looksLikeEvmContract,
  resolveWebhookContractAddress,
} from './deposit.scam.guard';
import { tokenContractMatches } from './deposit.token.resolver';
import { prisma } from '../../utils/prisma';

const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const FAKE_USDT_BSC = '0x10806b71136785250455cab1fbafa06b228e8888';

const mockUsdtBscCurrency = {
  id: 10,
  blockchain: 'bsc',
  currency: 'USDT_BSC',
  symbol: 'wallet_symbols/TUSDT.png',
  name: 'USDT BSC',
  price: 1,
  nairaPrice: 0,
  tokenType: 'BEP-20',
  contractAddress: USDT_BSC,
  decimals: 18,
  isToken: true,
  blockchainName: 'BEP-20',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function stubPrisma(
  t: { after: (fn: () => void) => void },
  stubs: {
    walletCurrencies?: unknown[];
    blocklistRow?: { reason: string } | null;
  }
) {
  const origWalletFindMany = prisma.walletCurrency.findMany.bind(prisma.walletCurrency);
  const origBlocklistFindFirst = prisma.scamContractBlocklist.findFirst.bind(prisma.scamContractBlocklist);

  (prisma.walletCurrency as any).findMany = async () => stubs.walletCurrencies ?? [];
  (prisma.scamContractBlocklist as any).findFirst = async () => stubs.blocklistRow ?? null;

  t.after(() => {
    (prisma.walletCurrency as any).findMany = origWalletFindMany;
    (prisma.scamContractBlocklist as any).findFirst = origBlocklistFindFirst;
  });
}

test('INCOMING_FUNGIBLE_TX is always a fungible token webhook', () => {
  assert.equal(isFungibleTokenWebhook('INCOMING_FUNGIBLE_TX'), true);
  assert.equal(isFungibleTokenWebhook('INCOMING_FUNGIBLE_TX', 'USDT'), true);
  assert.equal(isFungibleTokenWebhook('INCOMING_FUNGIBLE_TX', undefined), true);
});

test('looksLikeEvmContract detects 40-hex addresses', () => {
  assert.equal(looksLikeEvmContract(USDT_BSC), true);
  assert.equal(looksLikeEvmContract('USDT'), false);
});

test('isTokenContractIdentifier treats EVM contracts as tokens', () => {
  assert.equal(isTokenContractIdentifier(FAKE_USDT_BSC), true);
  assert.equal(isTokenContractIdentifier('BSC'), false);
});

test('tokenContractMatches is case-insensitive for EVM', () => {
  assert.equal(
    tokenContractMatches(USDT_BSC, USDT_BSC.toUpperCase()),
    true
  );
});

test('evaluateIncomingDeposit allows whitelisted USDT BSC contract', async (t) => {
  stubPrisma(t, { walletCurrencies: [mockUsdtBscCurrency], blocklistRow: null });

  const verdict = await evaluateIncomingDeposit({
    chainSlug: 'bsc',
    subscriptionType: 'INCOMING_FUNGIBLE_TX',
    contractAddress: USDT_BSC,
    assetField: 'USDT',
  });

  assert.equal(verdict.action, 'allow');
  if (verdict.action === 'allow') {
    assert.equal(verdict.isToken, true);
    assert.equal(verdict.walletCurrency?.currency, 'USDT_BSC');
  }
});

test('evaluateIncomingDeposit rejects unlisted fungible contract', async (t) => {
  stubPrisma(t, { walletCurrencies: [mockUsdtBscCurrency], blocklistRow: null });

  const verdict = await evaluateIncomingDeposit({
    chainSlug: 'bsc',
    subscriptionType: 'INCOMING_FUNGIBLE_TX',
    contractAddress: FAKE_USDT_BSC,
  });

  assert.equal(verdict.action, 'reject_fake');
  if (verdict.action === 'reject_fake') {
    assert.equal(verdict.reason, 'unlisted_token_contract');
  }
});

test('evaluateIncomingDeposit rejects INCOMING_FUNGIBLE_TX with ticker-only asset', async (t) => {
  stubPrisma(t, { walletCurrencies: [mockUsdtBscCurrency], blocklistRow: null });

  const verdict = await evaluateIncomingDeposit({
    chainSlug: 'bsc',
    subscriptionType: 'INCOMING_FUNGIBLE_TX',
    assetField: 'USDT',
  });

  assert.equal(verdict.action, 'reject_fake');
});

test('evaluateIncomingDeposit rejects blocklisted contract first', async (t) => {
  stubPrisma(t, {
    walletCurrencies: [mockUsdtBscCurrency],
    blocklistRow: { reason: 'Known scam' },
  });

  const verdict = await evaluateIncomingDeposit({
    chainSlug: 'bsc',
    subscriptionType: 'INCOMING_FUNGIBLE_TX',
    contractAddress: FAKE_USDT_BSC,
  });

  assert.equal(verdict.action, 'reject_fake');
  if (verdict.action === 'reject_fake') {
    assert.equal(verdict.reason, 'blocklisted_token_contract');
  }
});

test('evaluateIncomingDeposit allows native BTC INCOMING_NATIVE_TX with currency field', async (t) => {
  stubPrisma(t, { blocklistRow: null });

  const verdict = await evaluateIncomingDeposit({
    chainSlug: 'bitcoin-mainnet',
    subscriptionType: 'INCOMING_NATIVE_TX',
    currencyField: 'BTC',
    assetField: 'BTC',
  });

  assert.equal(verdict.action, 'allow');
  if (verdict.action === 'allow') {
    assert.equal(verdict.isToken, false);
    assert.equal(verdict.walletCurrency, null);
  }
});

test('resolveWebhookContractAddress ignores BTC asset on native webhook', () => {
  assert.equal(
    resolveWebhookContractAddress({
      subscriptionType: 'INCOMING_NATIVE_TX',
      asset: 'BTC',
      contractAddress: undefined,
    }),
    null
  );
});

test('evaluateIncomingDeposit allows native BSC deposit', async (t) => {
  stubPrisma(t, { blocklistRow: null });

  const verdict = await evaluateIncomingDeposit({
    chainSlug: 'bsc',
    subscriptionType: 'INCOMING_NATIVE_TX',
    assetField: 'BSC',
  });

  assert.equal(verdict.action, 'allow');
  if (verdict.action === 'allow') {
    assert.equal(verdict.isToken, false);
    assert.equal(verdict.walletCurrency, null);
  }
});

test('evaluateIncomingDeposit rejects banned user with whitelisted token', async (t) => {
  stubPrisma(t, { walletCurrencies: [mockUsdtBscCurrency], blocklistRow: null });

  const verdict = await evaluateIncomingDeposit({
    userStatus: 'banned',
    chainSlug: 'bsc',
    subscriptionType: 'INCOMING_FUNGIBLE_TX',
    contractAddress: USDT_BSC,
  });

  assert.equal(verdict.action, 'reject_banned');
});
