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

/** Read code/name from nested objects or first item of arrays (e.g. regions[0], categories[0]). */
function firstNestedString(value: unknown, keys: string[]): string | undefined {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return pickString(first as Record<string, unknown>, keys);
    }
    if (first != null && String(first).trim()) return String(first).trim();
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return pickString(value as Record<string, unknown>, keys);
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

  const regionCode =
    firstNestedString(raw.regions, ['code', 'iso', 'isoName', 'iso_name', 'country_code', 'countryCode']) ||
    pickString(raw, ['region', 'country', 'country_code', 'countryCode']);
  const countryName =
    firstNestedString(raw.regions, ['name', 'country_name', 'countryName', 'title']) ||
    pickString(raw, ['country', 'region', 'country_name', 'countryName']);
  const categoryName =
    firstNestedString(raw.categories, ['name', 'title', 'category']) ||
    firstNestedString(raw.category, ['name', 'title', 'category']) ||
    pickString(raw, ['category', 'type']);

  return {
    sku,
    title: pickString(raw, ['title', 'name', 'product_name', 'productName']),
    name: pickString(raw, ['name', 'title']),
    currency: pickString(raw, ['currency', 'currency_code', 'currencyCode']) || 'USD',
    region: regionCode || countryName,
    country: countryName || regionCode,
    minAmount: asNumber(
      raw.min_amount ?? raw.minAmount ?? raw.min_price ?? raw.minPrice ?? raw.min_value ?? raw.minValue
    ),
    maxAmount: asNumber(
      raw.max_amount ?? raw.maxAmount ?? raw.max_price ?? raw.maxPrice ?? raw.max_value ?? raw.maxValue
    ),
    fixedAmounts,
    image: pickString(raw, ['image', 'image_url', 'imageUrl', 'logo', 'logo_url', 'logoUrl']),
    imageUrl: pickString(raw, ['image_url', 'imageUrl', 'image', 'logo', 'logo_url', 'logoUrl']),
    logo: pickString(raw, ['logo', 'logo_url', 'logoUrl', 'image', 'image_url', 'imageUrl']),
    description: pickString(raw, ['description', 'details']),
    category: categoryName,
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
  // PagoCards: { success, data: [...], meta: { current_page, per_page, total, last_page } }
  // Note: Array.isArray(x) ⇒ typeof x === 'object', so do not treat arrays as nested data objects.
  const dataObj =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const meta =
    root.meta && typeof root.meta === 'object' && !Array.isArray(root.meta)
      ? (root.meta as Record<string, unknown>)
      : {};

  const list: unknown[] = Array.isArray(root.data)
    ? root.data
    : (Array.isArray(dataObj?.giftcards) && (dataObj!.giftcards as unknown[])) ||
      (Array.isArray(dataObj?.items) && (dataObj!.items as unknown[])) ||
      (Array.isArray(dataObj?.data) && (dataObj!.data as unknown[])) ||
      (Array.isArray(root.giftcards) && (root.giftcards as unknown[])) ||
      (Array.isArray(root.items) && (root.items as unknown[])) ||
      (Array.isArray(payload) && (payload as unknown[])) ||
      [];

  const items = list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => normalizeGiftcard(item))
    .filter((item): item is PagocardGiftcard => !!item);

  const page =
    asNumber(meta.current_page ?? meta.page ?? dataObj?.page ?? dataObj?.current_page ?? root.page) || 1;
  const limit =
    asNumber(meta.per_page ?? meta.limit ?? dataObj?.limit ?? dataObj?.per_page ?? root.limit) ||
    items.length ||
    20;
  const total =
    asNumber(meta.total ?? meta.total_count ?? dataObj?.total ?? dataObj?.total_count ?? root.total) ||
    items.length;
  const totalPages =
    asNumber(
      meta.last_page ?? meta.total_pages ?? meta.totalPages ?? dataObj?.total_pages ?? dataObj?.totalPages ?? root.total_pages
    ) || Math.max(1, Math.ceil(total / Math.max(limit, 1)));

  return { items, page, limit, total, totalPages };
}

/** GET /api/getgiftcard/{sku} returns `{ success, giftcard: {...} }` (not wrapped in data). */
export function extractPagocardGiftcardBySku(payload: unknown): PagocardGiftcard | null {
  const root = (payload || {}) as Record<string, unknown>;
  const giftcard =
    root.giftcard && typeof root.giftcard === 'object' && !Array.isArray(root.giftcard)
      ? (root.giftcard as Record<string, unknown>)
      : root.data && typeof root.data === 'object' && !Array.isArray(root.data)
        ? (root.data as Record<string, unknown>)
        : null;
  if (!giftcard) return null;
  return normalizeGiftcard(giftcard);
}

export type PagocardAvailabilityResult = {
  available: boolean;
  message: string | null;
  deliveryType?: number;
  deliveryTypeText?: string;
  raw: Record<string, unknown>;
};

/** GET /api/checkskuavailability/{sku} → `{ success, availability: { availability, detail, ... } }` */
export function extractPagocardAvailability(payload: unknown): PagocardAvailabilityResult {
  const root = (payload || {}) as Record<string, unknown>;
  const availabilityObj =
    root.availability && typeof root.availability === 'object' && !Array.isArray(root.availability)
      ? (root.availability as Record<string, unknown>)
      : null;

  const available =
    availabilityObj?.availability === true ||
    availabilityObj?.available === true ||
    root.available === true ||
    root.is_available === true;

  const message =
    (availabilityObj && pickString(availabilityObj, ['detail', 'message', 'delivery_type_text'])) ||
    pickString(root, ['message', 'detail', 'error']) ||
    null;

  return {
    available,
    message,
    deliveryType: asNumber(availabilityObj?.delivery_type ?? availabilityObj?.deliveryType),
    deliveryTypeText: availabilityObj
      ? pickString(availabilityObj, ['delivery_type_text', 'deliveryTypeText'])
      : undefined,
    raw: root,
  };
}

export type PagocardCountry = { code: string; name: string };
export type PagocardCategory = { name: string };

export function extractPagocardCountries(payload: unknown): PagocardCountry[] {
  const root = (payload || {}) as Record<string, unknown>;
  const list = Array.isArray(root.data) ? root.data : Array.isArray(payload) ? (payload as unknown[]) : [];
  const countries: PagocardCountry[] = [];
  for (const item of list) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const code = pickString(row, ['code', 'iso', 'isoName', 'iso_name']) || '';
      const name = pickString(row, ['name', 'country', 'title']) || code;
      if (code || name) countries.push({ code: code || name, name: name || code });
    }
  }
  return countries;
}

/** Categories endpoint returns `data: string[]` (brand-ish names). */
export function extractPagocardCategories(payload: unknown): PagocardCategory[] {
  const root = (payload || {}) as Record<string, unknown>;
  const list = Array.isArray(root.data) ? root.data : Array.isArray(payload) ? (payload as unknown[]) : [];
  const categories: PagocardCategory[] = [];
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) {
      categories.push({ name: item.trim() });
      continue;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const name = pickString(item as Record<string, unknown>, ['name', 'title', 'category']);
      if (name) categories.push({ name });
    }
  }
  return categories;
}

/** True when Pagocard returns an HTML error page instead of JSON (bad SKU / unknown route). */
export function isPagocardHtmlResponse(data: unknown, contentType?: string | null): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true;
  if (typeof data === 'string') {
    const trimmed = data.trim().toLowerCase();
    return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function extractPagocardPurchase(payload: unknown, fallback: { sku: string; quantity: number; amount: number }): PagocardPurchaseResult {
  const root = (payload || {}) as Record<string, unknown>;
  const data = asRecord(root.data) || asRecord(root.order) || asRecord(root.giftcard) || root;

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
  const data = asRecord(root.data) || asRecord(root.order) || asRecord(root.giftcard) || root;
  const sku = pickString(data, ['sku', 'SKU']);
  if (!sku && !pickString(data, ['referencecode', 'referenceCode', 'reference', 'id'])) return null;
  return extractPagocardPurchase(payload, {
    sku: sku || '',
    quantity: asNumber(data.quantity) || 1,
    amount: asNumber(data.amount) || 0,
  });
}
