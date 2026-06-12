#!/usr/bin/env node
/**
 * Live-fetch deposit verifier API samples (Tatum, Etherscan, TronScan).
 * Usage: node scripts/fetch-deposit-verifier-api-samples.mjs
 * Reads TATUM_API_KEY, ETHERSCAN_API_KEY, TRONSCAN_API_KEY from .env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'deposit-verifier-api-samples');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };

const SAMPLES = {
  ethereum_usdt: {
    chain: 'ethereum',
    label: 'Ethereum USDT ERC-20 deposit',
    hash: '0x3a8bbb5dfaa4e94ff87bf7045c7a8ca4293d27d842461cbe7f205e088222c46e',
    tatumChain: 'ethereum-mainnet',
    etherscanChainId: 1,
    etherscanDepositAddress: '0x1d3e8851e25882dfda90eb78863391da7a6a098a',
    etherscanTokenContract: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  },
  ethereum_native: {
    chain: 'ethereum',
    label: 'Ethereum native ETH transfer',
    hash: '0x5406ba85d2d54e8b559f76968a98fbf33cf017b1c092f7c91c0f63d7ddb3b466',
    tatumChain: 'ethereum-mainnet',
    etherscanChainId: 1,
  },
  bsc_fake_usdt: {
    chain: 'bsc',
    label: 'BSC fake USDT (hmstech incident)',
    hash: '0x6a33e31061799433fa0b8d4f99e1a635d0842eb0dc9fa60fcfd5ad3a1f15a18e',
    tatumChain: 'bsc-mainnet',
    etherscanChainId: 56,
    etherscanDepositAddress: '0x8e2fce4226e5ebdd627e924380633c78d6bf81d6',
    etherscanTokenContract: '0x10806b71136785250455cab1fbafa06b228e8888',
    note: 'Fake contract 0x10806b71... not real USDT 0x55d398...',
  },
  tron_usdt: {
    chain: 'tron',
    label: 'Tron USDT TRC-20 deposit',
    hash: 'a05c599ce3d1de178eab502daa44e508c870165330aac3f8245e80e4c605b9c9',
    tatumChain: 'tron-mainnet',
  },
  bitcoin: {
    chain: 'bitcoin',
    label: 'Bitcoin deposit',
    hash: '8d8c465eaec140f2f879f5ffac58312609414dfb0c26d0981e3c14e67bbc469a',
    tatumChain: 'bitcoin-mainnet',
  },
  litecoin: {
    chain: 'litecoin',
    label: 'Litecoin deposit',
    hash: 'e0ff43e3606405caf55ee9114b80a6753792743bcf8637530a956c567161841e',
    tatumChain: 'litecoin-mainnet',
    tatumChainWrong: 'litecoin-core-mainnet',
  },
  solana: {
    chain: 'solana',
    label: 'Solana deposit',
    hash: '3hwhEKqo7VhXL4d4TRiRrBiAFz1XjSYq9iu4UXrUo9K1K9hsnSYC9d78vbqSAg6934bh4oHQzZmEfYZGVrTSqJgw',
    tatumChain: 'solana-mainnet',
  },
};

async function fetchJson(url, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
    return {
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - started,
      body,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      error: String(err?.message || err),
    };
  }
}

function redactUrl(url) {
  return url.replace(/apikey=[^&]+/gi, 'apikey=REDACTED');
}

function writeJson(relPath, data) {
  const full = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + '\n');
  return relPath;
}

async function tatumTx(chain, hash) {
  const key = env.TATUM_API_KEY?.trim();
  const url = `https://api.tatum.io/v4/data/blockchains/transaction?chain=${encodeURIComponent(chain)}&hash=${encodeURIComponent(hash)}`;
  const headers = key ? { 'x-api-key': key } : {};
  const result = await fetchJson(url, headers);
  return {
    provider: 'tatum',
    endpoint: 'GET /v4/data/blockchains/transaction',
    request: { chain, hash, url: redactUrl(url), hasApiKey: Boolean(key) },
    ...result,
  };
}

async function etherscan(chainId, action, hash, extra = {}) {
  const key = env.ETHERSCAN_API_KEY?.trim() || '';
  const params = new URLSearchParams({
    chainid: String(chainId),
    module: extra.module || 'proxy',
    action,
    apikey: key || 'YourApiKeyToken',
    ...extra.params,
  });
  if (hash && extra.hashParam !== false) params.set(extra.hashParam || 'txhash', hash);
  const url = `https://api.etherscan.io/v2/api?${params}`;
  const result = await fetchJson(url);
  return {
    provider: 'etherscan',
    endpoint: `v2/api chainid=${chainId} ${action}`,
    request: {
      chainId,
      action,
      hash,
      url: redactUrl(url),
      hasApiKey: Boolean(key),
    },
    ...result,
  };
}

async function tronscanTx(hash) {
  const key = env.TRONSCAN_API_KEY?.trim();
  const url = `https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(hash)}`;
  const headers = { accept: 'application/json' };
  if (key) headers['TRON-PRO-API-KEY'] = key;
  const result = await fetchJson(url, headers);
  return {
    provider: 'tronscan',
    endpoint: 'GET /api/transaction-info',
    request: { hash, url, hasApiKey: Boolean(key) },
    ...result,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = {
    generatedAt: new Date().toISOString(),
    keysConfigured: {
      TATUM_API_KEY: Boolean(env.TATUM_API_KEY?.trim()),
      ETHERSCAN_API_KEY: Boolean(env.ETHERSCAN_API_KEY?.trim()),
      TRONSCAN_API_KEY: Boolean(env.TRONSCAN_API_KEY?.trim()),
    },
    samples: SAMPLES,
    files: [],
    results: [],
  };

  for (const [sampleId, sample] of Object.entries(SAMPLES)) {
    const sampleResults = { sampleId, ...sample, calls: [] };

    // Tatum
    const tatum = await tatumTx(sample.tatumChain, sample.hash);
    const tatumFile = writeJson(`tatum/${sampleId}.json`, tatum);
    sampleResults.calls.push({ file: tatumFile, ...tatum.request, ok: tatum.ok, status: tatum.status });

    if (sample.tatumChainWrong) {
      const tatumWrong = await tatumTx(sample.tatumChainWrong, sample.hash);
      const wrongFile = writeJson(`tatum/${sampleId}_wrong_chain_slug.json`, tatumWrong);
      sampleResults.calls.push({
        file: wrongFile,
        chain: sample.tatumChainWrong,
        note: 'intentionally wrong slug to document validation error',
        ok: tatumWrong.ok,
        status: tatumWrong.status,
      });
    }

    // Etherscan (EVM only)
    if (sample.etherscanChainId) {
      const receipt = await etherscan(sample.etherscanChainId, 'eth_getTransactionReceipt', sample.hash, {
        params: { txhash: sample.hash },
      });
      const receiptFile = writeJson(`etherscan/${sampleId}_receipt.json`, receipt);
      sampleResults.calls.push({ file: receiptFile, action: 'eth_getTransactionReceipt', ok: receipt.ok });

      const txByHash = await etherscan(sample.etherscanChainId, 'eth_getTransactionByHash', sample.hash, {
        params: { txhash: sample.hash },
      });
      const txFile = writeJson(`etherscan/${sampleId}_tx.json`, txByHash);
      sampleResults.calls.push({ file: txFile, action: 'eth_getTransactionByHash', ok: txByHash.ok });

      if (sample.etherscanDepositAddress && sample.etherscanTokenContract) {
        const tokentx = await etherscan(sample.etherscanChainId, 'tokentx', null, {
          module: 'account',
          hashParam: false,
          params: {
            address: sample.etherscanDepositAddress,
            contractaddress: sample.etherscanTokenContract,
            page: '1',
            offset: '10',
            sort: 'desc',
          },
        });
        const tokenFile = writeJson(`etherscan/${sampleId}_tokentx.json`, {
          ...tokentx,
          note: `Filter result[] where hash === ${sample.hash}`,
        });
        sampleResults.calls.push({ file: tokenFile, action: 'tokentx', ok: tokentx.ok });
      }
    }

    // TronScan
    if (sample.chain === 'tron') {
      const tron = await tronscanTx(sample.hash);
      const tronFile = writeJson(`tronscan/${sampleId}.json`, tron);
      sampleResults.calls.push({ file: tronFile, ...tron.request, ok: tron.ok, status: tron.status });
    }

    index.results.push(sampleResults);
    index.files.push(...sampleResults.calls.map((c) => c.file));
  }

  writeJson('index.json', index);
  console.log(`Wrote ${index.files.length + 1} files to ${OUT_DIR}`);
  console.log(JSON.stringify(index.keysConfigured, null, 2));
  for (const r of index.results) {
    console.log(`\n${r.sampleId} (${r.chain}):`);
    for (const c of r.calls) {
      console.log(`  ${c.file} ok=${c.ok} status=${c.status ?? '-'}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
