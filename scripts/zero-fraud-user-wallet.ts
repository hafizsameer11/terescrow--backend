/**
 * Force-zero fraud balances for a user (BSC ledger + NGN wallet) and mark txs revoked.
 *
 * Usage:
 *   npx ts-node scripts/zero-fraud-user-wallet.ts hmstech11@gmail.com \
 *     --receive-tx 0x6a33e31061799433fa0b8d4f99e1a635d0842eb0dc9fa60fcfd5ad3a1f15a18e
 */
import { fraudWalletCleanup } from '../src/services/admin/fraud.wallet.cleanup.service';

function parseArgs() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  let receiveTxHash: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--receive-tx' && args[i + 1]) receiveTxHash = args[i + 1];
  }
  return { email, receiveTxHash };
}

async function main() {
  const { email, receiveTxHash } = parseArgs();
  if (!email) {
    console.error(
      'Usage: npx ts-node scripts/zero-fraud-user-wallet.ts <email> [--receive-tx <txHash>]'
    );
    process.exit(1);
  }

  console.log('Fraud cleanup starting for', email);
  if (receiveTxHash) console.log('Receive tx:', receiveTxHash);

  const result = await fraudWalletCleanup({
    userEmail: email,
    receiveTxHash,
    zeroBscBalances: true,
    zeroNgnWallet: true,
    revokeRelatedCryptoTxs: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
