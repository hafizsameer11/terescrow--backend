/**
 * Wait for EVM tx inclusion + confirmations via Tatum JSON-RPC gateway.
 * Used before marking disbursements successful (avoids ghost "sent" when tx is dropped).
 */

import axios from 'axios';
import cryptoLogger from '../../utils/crypto.logger';
import type { EvmTatumPath } from './evm.tatum.transaction.service';

export type EvmTxConfirmationResult = {
  txHash: string;
  blockNumber: number;
  confirmations: number;
};

export class EvmTxConfirmationError extends Error {
  readonly txHash: string;
  readonly reason: 'timeout' | 'reverted' | 'dropped';

  constructor(message: string, txHash: string, reason: 'timeout' | 'reverted' | 'dropped') {
    super(message);
    this.name = 'EvmTxConfirmationError';
    this.txHash = txHash;
    this.reason = reason;
  }
}

function rpcUrlForPath(evmPath: EvmTatumPath, testnet: boolean): string {
  if (testnet) {
    return 'https://ethereum-sepolia.gateway.tatum.io';
  }
  if (evmPath === 'ethereum') return 'https://ethereum-mainnet.gateway.tatum.io';
  if (evmPath === 'bsc') return 'https://bsc-mainnet.gateway.tatum.io';
  return 'https://polygon-mainnet.gateway.tatum.io';
}

function apiKey(): string {
  const k = process.env.TATUM_API_KEY || '';
  if (!k) throw new Error('TATUM_API_KEY is required');
  return k;
}

async function jsonRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await axios.post<{ result?: T; error?: { message?: string } }>(
    rpcUrl,
    { jsonrpc: '2.0', method, params, id: 1 },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey(),
      },
    }
  );
  if (response.data.error) {
    throw new Error(response.data.error.message || `RPC ${method} failed`);
  }
  return response.data.result as T;
}

function parseHexBlock(n: string | number): number {
  if (typeof n === 'number') return n;
  return parseInt(String(n), 16);
}

function receiptFailed(status: string | number | null | undefined): boolean {
  if (status == null) return false;
  if (status === '0x0' || status === 0 || status === '0') return true;
  return false;
}

function readConfirmConfig(): {
  minConfirmations: number;
  timeoutMs: number;
  pollMs: number;
  dropGraceMs: number;
} {
  const minConfirmations = Math.max(
    1,
    parseInt(process.env.EVM_DISBURSEMENT_MIN_CONFIRMATIONS || '1', 10) || 1
  );
  const timeoutMs = Math.max(
    30_000,
    parseInt(process.env.EVM_DISBURSEMENT_CONFIRM_TIMEOUT_MS || '180000', 10) || 180_000
  );
  const pollMs = Math.max(
    2000,
    parseInt(process.env.EVM_DISBURSEMENT_CONFIRM_POLL_MS || '4000', 10) || 4000
  );
  const dropGraceMs = Math.max(
    30_000,
    parseInt(process.env.EVM_DISBURSEMENT_DROP_GRACE_MS || '90000', 10) || 90_000
  );
  return { minConfirmations, timeoutMs, pollMs, dropGraceMs };
}

/**
 * Poll until `minConfirmations` on-chain or timeout.
 * Default: 1 confirmation, 3 minute timeout (override via env).
 */
export async function waitForEvmTxConfirmation(params: {
  evmPath: EvmTatumPath;
  txHash: string;
  testnet?: boolean;
  minConfirmations?: number;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<EvmTxConfirmationResult> {
  const cfg = readConfirmConfig();
  const minConfirmations = params.minConfirmations ?? cfg.minConfirmations;
  const timeoutMs = params.timeoutMs ?? cfg.timeoutMs;
  const pollMs = params.pollMs ?? cfg.pollMs;
  const dropGraceMs = cfg.dropGraceMs;

  const txHash = params.txHash.startsWith('0x') ? params.txHash : `0x${params.txHash}`;
  const rpcUrl = rpcUrlForPath(params.evmPath, params.testnet ?? false);
  const deadline = Date.now() + timeoutMs;
  const started = Date.now();
  let everSeenInMempool = false;

  cryptoLogger.gasEstimate({
    type: 'evmTxConfirmationWaitStart',
    txHash,
    evmPath: params.evmPath,
    minConfirmations,
    timeoutMs,
  });

  while (Date.now() < deadline) {
    const receipt = await jsonRpc<{ blockNumber?: string; status?: string | number } | null>(
      rpcUrl,
      'eth_getTransactionReceipt',
      [txHash]
    );

    if (receipt?.blockNumber) {
      if (receiptFailed(receipt.status)) {
        throw new EvmTxConfirmationError(
          `Transaction ${txHash} reverted on-chain`,
          txHash,
          'reverted'
        );
      }
      const blockNumber = parseHexBlock(receipt.blockNumber);
      const latestHex = await jsonRpc<string>(rpcUrl, 'eth_blockNumber', []);
      const latest = parseHexBlock(latestHex);
      const confirmations = Math.max(1, latest - blockNumber + 1);
      if (confirmations >= minConfirmations) {
        cryptoLogger.gasEstimate({
          type: 'evmTxConfirmationWaitDone',
          txHash,
          blockNumber,
          confirmations,
        });
        return { txHash, blockNumber, confirmations };
      }
    } else {
      const tx = await jsonRpc<{ blockHash?: string | null } | null>(
        rpcUrl,
        'eth_getTransactionByHash',
        [txHash]
      );
      if (tx) everSeenInMempool = true;
      else if (everSeenInMempool === false && Date.now() - started >= dropGraceMs) {
        throw new EvmTxConfirmationError(
          `Transaction ${txHash} was not found on-chain (likely dropped before mining)`,
          txHash,
          'dropped'
        );
      }
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new EvmTxConfirmationError(
    `Transaction ${txHash} was not confirmed within ${Math.round(timeoutMs / 1000)}s`,
    txHash,
    'timeout'
  );
}
