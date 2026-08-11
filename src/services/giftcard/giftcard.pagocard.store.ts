import { prisma } from '../../utils/prisma';
import { pagocardSkuToProductId } from '../pagocard/pagocard.giftcards.mapper';
import type { PagocardGiftcard } from '../pagocard/pagocard.giftcards.mapper';

export async function upsertPagocardGiftcardProduct(card: PagocardGiftcard) {
  const productId = pagocardSkuToProductId(card.sku);
  const fixedAmounts = card.fixedAmounts || [];
  const hasFixed = fixedAmounts.length > 0;
  const minValue = card.minAmount ?? (hasFixed ? Math.min(...fixedAmounts) : null);
  const maxValue = card.maxAmount ?? (hasFixed ? Math.max(...fixedAmounts) : null);
  const imageUrl = card.imageUrl || card.image || card.logo || null;

  return prisma.giftCardProduct.upsert({
    where: { reloadlyProductId: productId },
    update: {
      productName: card.title || card.name || `Gift Card ${card.sku}`,
      brandName: card.title || card.name || null,
      countryCode: card.region || 'US',
      currencyCode: card.currency || 'USD',
      minValue,
      maxValue,
      fixedValue: hasFixed && fixedAmounts.length === 1 ? fixedAmounts[0] : null,
      isVariableDenomination: !hasFixed,
      reloadlyImageUrl: imageUrl,
      imageUrl,
      description: card.description || null,
      redemptionInstructions: card.instructions || null,
      category: card.category || 'pagocard',
      productType: card.category || 'Gift Card',
      lastSyncedAt: new Date(),
    },
    create: {
      reloadlyProductId: productId,
      productName: card.title || card.name || `Gift Card ${card.sku}`,
      brandName: card.title || card.name || null,
      countryCode: card.region || 'US',
      currencyCode: card.currency || 'USD',
      minValue,
      maxValue,
      fixedValue: hasFixed && fixedAmounts.length === 1 ? fixedAmounts[0] : null,
      isVariableDenomination: !hasFixed,
      isGlobal: false,
      reloadlyImageUrl: imageUrl,
      imageUrl,
      description: card.description || `Pagocard SKU: ${card.sku}`,
      redemptionInstructions: card.instructions || null,
      category: card.category || 'pagocard',
      productType: card.category || 'Gift Card',
      status: 'active',
      lastSyncedAt: new Date(),
    },
  });
}

export function resolvePagocardSku(input: { sku?: string; productId?: string | number }) {
  if (input.sku && String(input.sku).trim()) return String(input.sku).trim();
  if (input.productId != null && String(input.productId).trim()) return String(input.productId).trim();
  return null;
}
