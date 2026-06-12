import { prisma } from '../../utils/prisma';
import { blockchainDbVariants, canonicalEvmContract } from './deposit.token.resolver';

export function canonicalBlocklistContract(blockchain: string, contractAddress: string): string {
  const evm = canonicalEvmContract(contractAddress);
  if (evm) return evm;
  return contractAddress.trim();
}

/** True when contract is on the known scam blocklist for this chain. */
export async function isContractBlocklisted(
  chainSlug: string,
  contractAddress: string
): Promise<{ blocked: boolean; reason?: string }> {
  const canonical = canonicalBlocklistContract(chainSlug, contractAddress);
  const chains = blockchainDbVariants(chainSlug);

  const row = await prisma.scamContractBlocklist.findFirst({
    where: {
      blockchain: { in: chains },
      OR: [
        { contractAddress: canonical },
        { contractAddress: contractAddress.trim() },
        { contractAddress: contractAddress.trim().toLowerCase() },
      ],
    },
    select: { reason: true },
  });

  if (!row) return { blocked: false };
  return { blocked: true, reason: row.reason };
}

export async function listScamContracts(params: { page?: number; limit?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.scamContractBlocklist.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.scamContractBlocklist.count(),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function addScamContract(input: {
  blockchain: string;
  contractAddress: string;
  reason: string;
  source?: string;
}) {
  const blockchain = input.blockchain.trim().toLowerCase();
  const contractAddress = canonicalBlocklistContract(blockchain, input.contractAddress);

  return prisma.scamContractBlocklist.upsert({
    where: {
      blockchain_contractAddress: {
        blockchain,
        contractAddress,
      },
    },
    create: {
      blockchain,
      contractAddress,
      reason: input.reason.trim(),
      source: input.source?.trim() || 'manual',
    },
    update: {
      reason: input.reason.trim(),
      source: input.source?.trim() || 'manual',
    },
  });
}
