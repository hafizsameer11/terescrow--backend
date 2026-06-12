/**
 * Reverse a mis-credited fake deposit and mark it fake_scam.
 *
 * Usage:
 *   npx ts-node scripts/mark-fake-deposit.ts 0x6a33e31061799433fa0b8d4f99e1a635d0842eb0dc9fa60fcfd5ad3a1f15a18e
 */
import { remediateMisCreditedFakeDeposit } from '../src/services/tatum/fake.deposit.service';

async function main() {
  const txHash = process.argv[2]?.trim();
  if (!txHash) {
    console.error('Usage: npx ts-node scripts/mark-fake-deposit.ts <txHash>');
    process.exit(1);
  }

  const result = await remediateMisCreditedFakeDeposit(txHash);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
