import { palmpayBanks } from '../palmpay/palmpay.banks.service';

type PalmPayBank = { bankCode: string; bankName: string };

let bankListCache: PalmPayBank[] | null = null;
let bankListCacheAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getPalmpayBanks(): Promise<PalmPayBank[]> {
  const now = Date.now();
  if (bankListCache && now - bankListCacheAt < CACHE_TTL_MS) {
    return bankListCache;
  }
  const banks = await palmpayBanks.queryBankList(0);
  bankListCache = banks.map((b) => ({
    bankCode: String(b.bankCode),
    bankName: String(b.bankName),
  }));
  bankListCacheAt = now;
  return bankListCache;
}

function normalizeBankName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve PalmPay bank code from Busha recipient_details.
 * Busha often returns bank_code directly; otherwise fuzzy-match bank_name.
 */
export async function resolvePalmpayBankCode(params: {
  bankCode?: string | null;
  bankName?: string | null;
}): Promise<{ bankCode: string; bankName?: string; matchedBy: 'busha_code' | 'name' | 'exact_code' }> {
  const directCode = params.bankCode?.trim();
  if (directCode) {
    const banks = await getPalmpayBanks();
    const exact = banks.find((b) => b.bankCode === directCode);
    if (exact) {
      return { bankCode: exact.bankCode, bankName: exact.bankName, matchedBy: 'exact_code' };
    }
    // Busha bank codes are often NUBAN-style; PalmPay may still accept them for payout.
    return { bankCode: directCode, bankName: params.bankName || undefined, matchedBy: 'busha_code' };
  }

  const bankName = params.bankName?.trim();
  if (!bankName) {
    throw new Error('Busha did not return bank_code or bank_name for the temporary account.');
  }

  const banks = await getPalmpayBanks();
  const normalized = normalizeBankName(bankName);
  const match =
    banks.find((b) => normalizeBankName(b.bankName) === normalized) ||
    banks.find((b) => normalizeBankName(b.bankName).includes(normalized)) ||
    banks.find((b) => normalized.includes(normalizeBankName(b.bankName)));

  if (!match) {
    throw new Error(`Could not map Busha bank "${bankName}" to a PalmPay bank code.`);
  }

  return { bankCode: match.bankCode, bankName: match.bankName, matchedBy: 'name' };
}
