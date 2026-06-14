import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  parseEvmTokenTransferFromTatum,
  parseEvmTokenTransferFromReceipt,
  validateEvmTransfer,
} from './parsers/evm.parser';
import { parseTronScanTransactionInfo, validateTronTransfer } from './parsers/tronscan.parser';
import { parseUtxoOutputs, validateUtxoTransfer } from './parsers/utxo.parser';
import { getTatumV4Chain } from './chain.registry';

const SAMPLES = path.join(__dirname, '../../../../docs/deposit-verifier-api-samples');

function loadSample(...parts: string[]): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(SAMPLES, ...parts), 'utf8');
  const json = JSON.parse(raw) as { body: Record<string, unknown> };
  return json.body;
}

const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const FAKE_USDT_BSC = '0x10806b71136785250455cab1fbafa06b228e8888';
const DEPOSIT_BSC = '0x8e2fce4226e5ebdd627e924380633c78d6bf81d6';

test('getTatumV4Chain uses litecoin-mainnet not litecoin-core-mainnet', () => {
  assert.equal(getTatumV4Chain('litecoin'), 'litecoin-mainnet');
  assert.equal(getTatumV4Chain('ltc'), 'litecoin-mainnet');
});

test('BSC fake USDT tx — wrong contract detected vs whitelist', () => {
  const body = loadSample('tatum', 'bsc_fake_usdt.json');
  const parsedWhitelist = parseEvmTokenTransferFromTatum(body, DEPOSIT_BSC, USDT_BSC);
  assert.equal(parsedWhitelist, null);

  const parsedFake = parseEvmTokenTransferFromTatum(body, DEPOSIT_BSC, FAKE_USDT_BSC);
  assert.ok(parsedFake);
  assert.equal(parsedFake!.contractAddress?.toLowerCase(), FAKE_USDT_BSC.toLowerCase());
  const check = validateEvmTransfer(parsedFake, '100', 18);
  assert.equal(check.ok, true);
});

test('Ethereum USDT receipt — valid transfer to deposit address', () => {
  const receiptBody = loadSample('etherscan', 'ethereum_usdt_receipt.json');
  const receipt = receiptBody.result as Record<string, unknown>;
  const USDT_ETH = '0xdac17f958d2ee523a2206206994597c13d831ec7';
  const deposit = '0x1d3e8851e25882dfda90eb78863391da7a6a098a';
  const parsed = parseEvmTokenTransferFromReceipt(receipt, deposit, USDT_ETH);
  assert.ok(parsed);
  const check = validateEvmTransfer(parsed, '110.6', 6);
  assert.equal(check.ok, true);
});

test('TronScan USDT — trc20TransferInfo parses', () => {
  const body = loadSample('tronscan', 'tron_usdt.json');
  const USDT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const deposit = 'TT9ZXdChPcDDm9Nn31H7ijQ5RAUFVQ8pgQ';
  const parsed = parseTronScanTransactionInfo(body, deposit, USDT_TRON, true);
  assert.ok(parsed);
  const check = validateTronTransfer(parsed, '10', USDT_TRON, true);
  assert.equal(check.ok, true);
});

test('Bitcoin UTXO — outputs sum for deposit address', () => {
  const body = loadSample('tatum', 'bitcoin.json');
  const parsed = parseUtxoOutputs(body, '3Awm3FNpmwrbvAFVThRUFqgpbVuqWisni9');
  assert.ok(parsed);
  const check = validateUtxoTransfer(parsed, '3.14256763');
  assert.equal(check.ok, true);
});

test('Bitcoin UTXO — confirmed tx with wrong deposit address is address mismatch', () => {
  const body = {
    blockNumber: 953612,
    outputs: [
      { address: 'bc1qjvn55nluf7dur3586dv2quvcetn4m4cqw2usuc', value: 31052 },
      { address: 'bc1qrrw6hmevhj5gh4f0xp5j9avmq44q8rkqsl73k6', value: 127664 },
    ],
  };
  const parsed = parseUtxoOutputs(body, 'bc1qu5p5yz4fa33xpar3ayer7dw5uv8c3ksyzc3j60');
  assert.equal(parsed, null);
  const check = validateUtxoTransfer(parsed, '0.00031052', body);
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.reason, 'deposit_address_mismatch');
});
