/**
 * Reloadly API Types and Interfaces
 * 
 * This file contains all TypeScript types and interfaces for Reloadly API integration.
 * All types are based on Reloadly's API documentation and Postman collection.
 */

// ============================================
// Authentication Types
// ============================================

export interface ReloadlyAuthRequest {
  client_id: string;
  client_secret: string;
  grant_type: 'client_credentials';
  audience: string; // 'https://giftcards.reloadly.com' or 'https://giftcards-sandbox.reloadly.com'
}

export interface ReloadlyAuthResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope?: string;
}

// ============================================
// Product Types
// ============================================

export interface ReloadlyProduct {
  productId: number;
  productName: string;
  brandName?: string;
  countryCode: string;
  currencyCode: string;
  minValue?: number;
  maxValue?: number;
  denominationType?: 'FIXED' | 'RANGE';
  minRecipientDenomination?: number;
  maxRecipientDenomination?: number;
  fixedRecipientDenominations?: number[];
  fixedSenderDenominations?: number[];
  logoUrl?: string;
  logoUrls?: string[];
  isGlobal?: boolean;
  productType?: string;
  redeemInstruction?: string;
  description?: string;
}

export interface ReloadlyProductsResponse {
  content: ReloadlyProduct[];
  totalElements: number;
  totalPages: number;
  page?: number;
  size?: number;
}

export interface ReloadlyProductQueryParams {
  countryCode?: string;
  productName?: string;
  includeRange?: boolean;
  includeFixed?: boolean;
  page?: number;
  size?: number;
}

// ============================================
// Country Types
// ============================================

export interface ReloadlyCountry {
  isoName: string;
  name: string;
  currencyCode: string;
  currencyName: string;
  flag?: string;
}

export interface ReloadlyCountriesResponse {
  content: ReloadlyCountry[];
  totalElements?: number;
  totalPages?: number;
}

// ============================================
// Order Types (Official Reloadly API Structure)
// ============================================

export interface ReloadlyOrderRequest {
  productId: number; // required
  quantity: number; // required
  unitPrice: number; // required - must be from fixedRecipientDenominations or within min/max range
  senderName: string; // required
  customIdentifier?: string; // optional
  preOrder?: boolean; // optional, default false
  recipientEmail?: string; // optional
  recipientPhoneDetails?: {
    // optional object
    countryCode?: string;
    phoneNumber?: string;
  };
  productAdditionalRequirements?: Record<string, any>; // optional object
}

export interface ReloadlyOrderResponse {
  transactionId: number;
  amount: number;
  discount: number;
  currencyCode: string;
  fee: number;
  recipientEmail?: string;
  customIdentifier: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'PROCESSING' | 'REFUNDED' | 'FAILED';
  product: {
    productId: number;
    productName: string;
    countryCode: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    currencyCode: string;
    brand: {
      brandId: number;
      brandName: string;
    };
  };
  smsFee?: number;
  totalFee: number;
  receipientPhone?: number;
  transactionCreatedTime: string;
  preOrdered: boolean;
  balanceInfo: {
    oldBalance: number;
    newBalance: number;
    cost: number;
    currencyCode: string;
    currencyName: string;
    updatedAt: string;
  };
}

export interface ReloadlyCardCode {
  redemptionCode: string;
  pin?: string | null;
  serialNumber?: string | null;
  expiryDate?: string;
}

export interface ReloadlyCardCodesResponse {
  content: ReloadlyCardCode[];
}

// ============================================
// Transaction/Report Types
// ============================================

export interface ReloadlyTransaction {
  transactionId: number;
  orderId: number;
  status: string;
  productId: number;
  productName: string;
  countryCode: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currencyCode: string;
  redemptionCode?: string;
  pin?: string | null;
  serialNumber?: string | null;
  expiryDate?: string;
  redemptionInstructions?: string;
}

export interface ReloadlyTransactionsResponse {
  content: ReloadlyTransaction[];
  totalElements: number;
  totalPages: number;
}

export interface ReloadlyTransactionQueryParams {
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
}

// ============================================
// Discount Types
// ============================================

export interface ReloadlyDiscount {
  discountId: number;
  productId?: number;
  discountPercentage?: number;
  discountAmount?: number;
  validFrom?: string;
  validTo?: string;
}

export interface ReloadlyDiscountsResponse {
  content: ReloadlyDiscount[];
  totalElements?: number;
  totalPages?: number;
}

// ============================================
// Account Types
// ============================================

export interface ReloadlyAccountBalance {
  balance: number;
  currencyCode: string;
}

// ============================================
// Redeem Instructions Types
// ============================================

export interface ReloadlyRedeemInstruction {
  brandId?: number;
  instructions: string;
}

export interface ReloadlyRedeemInstructionsResponse {
  content: ReloadlyRedeemInstruction[];
}

// ============================================
// Our Internal Types
// ============================================

export interface GiftCardPurchaseRequest {
  productId: number;
  countryCode: string;
  cardType: string;
  faceValue: number;
  quantity: number;
  currencyCode: string;
  paymentMethod: 'wallet' | 'card' | 'bank_transfer';
  recipientEmail?: string;
  recipientPhone?: string;
  senderName?: string;
}

export interface GiftCardPurchaseValidationRequest {
  productId: number;
  countryCode: string;
  cardType: string;
  faceValue: number;
  quantity: number;
  currencyCode: string;
}

export interface GiftCardPurchaseValidationResponse {
  valid: boolean;
  faceValue: number;
  fees: number;
  totalAmount: number;
  currencyCode: string;
  errors?: string[];
}

// ============================================
// Error Types
// ============================================

export interface ReloadlyError {
  error: string;
  error_description?: string;
  message?: string;
  timestamp?: string;
  path?: string;
  status?: number;
}

