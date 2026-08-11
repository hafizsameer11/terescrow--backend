export type PagocardGiftcard = {
  sku: string;
  title?: string;
  name?: string;
  currency?: string;
  region?: string;
  country?: string;
  minAmount?: number;
  maxAmount?: number;
  fixedAmounts?: number[];
  image?: string;
  imageUrl?: string;
  logo?: string;
  description?: string;
  category?: string;
  instructions?: string;
  raw: Record<string, unknown>;
};

export type PagocardGiftcardListResult = {
  items: PagocardGiftcard[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PagocardPurchaseResult = {
  referenceCode: string;
  status: string;
  sku: string;
  quantity: number;
  amount: number;
  shareLink?: string | null;
  cardCode?: string | null;
  cardPin?: string | null;
  raw: Record<string, unknown>;
};

function asNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : undefined;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (val != null && String(val).trim()) return String(val).trim();
  }
  return undefined;
}

export function normalizeGiftcard(raw: Record<string, unknown>): PagocardGiftcard | null {
  const sku = pickString(raw, ['sku', 'SKU', 'id', 'product_id', 'productId']);
  if (!sku) return null;

  const fixedAmountsRaw = raw.fixed_amounts || raw.fixedAmounts || raw.denominations || raw.amounts;
  const fixedAmounts = Array.isArray(fixedAmountsRaw)
    ? fixedAmountsRaw.map((v) => asNumber(v)).filter((v): v is number => v != null)
    : undefined;

  return {
    sku,
    title: pickString(raw, ['title', 'name', 'product_name', 'productName']),
    name: pickString(raw, ['name', 'title']),
    currency: pickString(raw, ['currency', 'currency_code', 'currencyCode']) || 'USD',
    region: pickString(raw, ['region', 'country', 'country_code', 'countryCode']),
    country: pickString(raw, ['country', 'region', 'country_name', 'countryName']),
    minAmount: asNumber(raw.min_amount ?? raw.minAmount ?? raw.min_value ?? raw.minValue),
    maxAmount: asNumber(raw.max_amount ?? raw.maxAmount ?? raw.max_value ?? raw.maxValue),
    fixedAmounts,
    image: pickString(raw, ['image', 'image_url', 'imageUrl', 'logo', 'logo_url', 'logoUrl']),
    imageUrl: pickString(raw, ['image_url', 'imageUrl', 'image', 'logo', 'logo_url', 'logoUrl']),
    logo: pickString(raw, ['logo', 'logo_url', 'logoUrl', 'image', 'image_url', 'imageUrl']),
    description: pickString(raw, ['description', 'details']),
    category: pickString(raw, ['category', 'type']),
    instructions: pickString(raw, ['instructions', 'redemption_instructions', 'redeem_instruction']),
    raw,
  };
}

export function pagocardSkuToProductId(sku: string): number {
  const trimmed = sku.trim();
  const asInt = Number(trimmed);
  if (!Number.isNaN(asInt) && String(asInt) === trimmed) return asInt;
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (Math.imul(31, hash) + trimmed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

export function mapPagocardGiftcardToApiProduct(card: PagocardGiftcard) {
  const fixedRecipientDenominations = card.fixedAmounts?.length ? card.fixedAmounts : [];
  const hasFixed = fixedRecipientDenominations.length > 0;
  const minValue = card.minAmount ?? (hasFixed ? Math.min(...fixedRecipientDenominations) : null);
  const maxValue = card.maxAmount ?? (hasFixed ? Math.max(...fixedRecipientDenominations) : null);
  const productId = pagocardSkuToProductId(card.sku);

  return {
    productId,
    id: card.sku,
    sku: card.sku,
    provider: 'pagocard' as const,
    productName: card.title || card.name || `Gift Card ${card.sku}`,
    global: false,
    status: 'ACTIVE',
    supportsPreOrder: false,
    denominationType: hasFixed ? 'FIXED' : 'RANGE',
    recipientCurrencyCode: card.currency || 'USD',
    minRecipientDenomination: minValue,
    maxRecipientDenomination: maxValue,
    fixedRecipientDenominations,
    logoUrls: card.imageUrl || card.image || card.logo ? [card.imageUrl || card.image || card.logo as string] : [],
    brand: card.title || card.name ? { brandId: null, brandName: card.title || card.name, logoUrl: card.imageUrl || card.image || null } : null,
    category: card.category ? { id: null, name: card.category } : null,
    country: card.region ? { isoName: card.region, name: card.country || card.region, flagUrl: null } : null,
    redeemInstruction: card.instructions ? { concise: card.instructions, verbose: card.instructions } : null,
    brandName: card.title || card.name || null,
    countryCode: card.region || null,
    currencyCode: card.currency || 'USD',
    minValue,
    maxValue,
    fixedValue: hasFixed && fixedRecipientDenominations.length === 1 ? fixedRecipientDenominations[0] : null,
    isVariableDenomination: !hasFixed,
    imageUrl: card.imageUrl || card.image || card.logo || null,
    description: card.description || null,
  };
}

export function extractPagocardGiftcards(payload: unknown): PagocardGiftcardListResult {
  const root = (payload || {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;

  const list =
    (Array.isArray(data.giftcards) && data.giftcards) ||
    (Array.isArray(data.items) && data.items) ||
    (Array.isArray(data.data) && data.data) ||
    (Array.isArray(root.giftcards) && root.giftcards) ||
    (Array.isArray(payload) && payload) ||
    [];

  const items = (list as Record<string, unknown>[])
    .map((item) => normalizeGiftcard(item))
    .filter((item): item is PagocardGiftcard => !!item);

  const page = asNumber(data.page ?? data.current_page ?? root.page) || 1;
  const limit = asNumber(data.limit ?? data.per_page ?? root.limit) || items.length || 20;
  const total = asNumber(data.total ?? data.total_count ?? root.total) || items.length;
  const totalPages = asNumber(data.total_pages ?? data.totalPages ?? root.total_pages) || Math.max(1, Math.ceil(total / limit));

  return { items, page, limit, total, totalPages };
}

export function extractPagocardPurchase(payload: unknown, fallback: { sku: string; quantity: number; amount: number }): PagocardPurchaseResult {
  const root = (payload || {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;

  const referenceCode =
    pickString(data, ['referencecode', 'referenceCode', 'reference', 'order_id', 'orderId', 'id']) ||
    pickString(root, ['referencecode', 'referenceCode', 'reference', 'order_id', 'orderId', 'id']) ||
    '';

  const status =
    pickString(data, ['status', 'order_status', 'orderStatus']) ||
    pickString(root, ['status', 'order_status', 'orderStatus']) ||
    'pending';

  return {
    referenceCode,
    status,
    sku: pickString(data, ['sku', 'SKU']) || fallback.sku,
    quantity: asNumber(data.quantity) || fallback.quantity,
    amount: asNumber(data.amount ?? data.total_amount ?? data.totalAmount) || fallback.amount,
    shareLink: pickString(data, ['share_link', 'shareLink', 'url', 'link']) || pickString(root, ['share_link', 'shareLink', 'url', 'link']) || null,
    cardCode:
      pickString(data, ['card_code', 'cardCode', 'code', 'pin_code', 'redemption_code', 'redemptionCode']) ||
      pickString(root, ['card_code', 'cardCode', 'code', 'pin_code', 'redemption_code', 'redemptionCode']) ||
      null,
    cardPin: pickString(data, ['pin', 'card_pin', 'cardPin']) || pickString(root, ['pin', 'card_pin', 'cardPin']) || null,
    raw: root,
  };
}

export function extractPagocardOrder(payload: unknown): PagocardPurchaseResult | null {
  const root = (payload || {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const sku = pickString(data, ['sku', 'SKU']);
  if (!sku && !pickString(data, ['referencecode', 'referenceCode', 'reference', 'id'])) return null;
  return extractPagocardPurchase(payload, { sku: sku || '', quantity: asNumber(data.quantity) || 1, amount: asNumber(data.amount) || 0 });
}
