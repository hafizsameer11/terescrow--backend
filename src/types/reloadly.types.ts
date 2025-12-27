/**
 * Reloadly API Types
 * Type definitions for Reloadly Airtime, Gift Card, and Utilities API integration
 */

// Country
export interface ReloadlyCountry {
  isoName: string;
  name: string;
  continent?: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  flag: string;
  callingCodes: string[];
}

// Operator
export interface ReloadlyOperator {
  id: number;
  operatorId: number;
  name: string;
  bundle: boolean;
  data: boolean;
  comboProduct: boolean;
  pin: boolean;
  supportsLocalAmounts: boolean;
  denominationType: 'RANGE' | 'FIXED';
  senderCurrencyCode: string;
  senderCurrencySymbol: string;
  destinationCurrencyCode: string;
  destinationCurrencySymbol: string;
  commission: number;
  internationalDiscount: number;
  localDiscount: number;
  mostPopularAmount: number | null;
  minAmount: number;
  maxAmount: number;
  localMinAmount: number | null;
  localMaxAmount: number | null;
  country: {
    isoName: string;
    name: string;
  };
  fx?: {
    rate: number;
    currencyCode: string;
  };
  logoUrls: string[];
  fixedAmounts?: number[];
  fixedAmountsDescriptions?: string[];
  localFixedAmounts?: number[];
  localFixedAmountsDescriptions?: string[];
  suggestedAmounts?: number[];
  suggestedAmountsMap?: Record<string, number>;
  promotions?: any[];
  fees?: {
    international: number;
    internationalPercentage: number;
    local: number;
    localPercentage: number;
  };
}

// Operators Response
export interface ReloadlyOperatorsResponse {
  content: ReloadlyOperator[];
}

// Top-up Request
export interface ReloadlyTopupRequest {
  operatorId: string | number;
  amount: string; // Amount as string (e.g., "5.00")
  recipientPhone: {
    countryCode: string;
    number: string;
  };
  senderPhone?: {
    countryCode: string;
    number: string;
  };
  customIdentifier?: string;
  recipientEmail?: string;
  useLocalAmount?: boolean;
}

// Top-up Response
export interface ReloadlyTopupResponse {
  transactionId: number;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'REFUNDED';
  operatorTransactionId: string | null;
  customIdentifier: string | null;
  recipientPhone: number;
  recipientEmail: string | null;
  senderPhone: number | null;
  countryCode: string;
  operatorId: number;
  operatorName: string;
  discount: number;
  discountCurrencyCode: string;
  requestedAmount: number;
  requestedAmountCurrencyCode: string;
  deliveredAmount: number;
  deliveredAmountCurrencyCode: string;
  transactionDate: string;
  fee?: number;
  pinDetail?: {
    serial: number;
    info1: string;
    info2: string;
    info3: string;
    value: string | null;
    code: number;
    ivr: string;
    validity: string;
  };
  balanceInfo?: {
    oldBalance: number;
    newBalance: number;
    currencyCode: string;
    currencyName: string;
    updatedAt: string;
  };
}

// Top-up Status Response
export interface ReloadlyTopupStatusResponse {
  code: string | null;
  message: string | null;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'REFUNDED';
  transaction: ReloadlyTopupResponse;
}

// Account Balance Response
export interface ReloadlyBalanceResponse {
  balance: number;
  currencyCode: string;
  currencyName: string;
  updatedAt: string;
}

// Countries Response
export interface ReloadlyCountriesResponse {
  content: ReloadlyCountry[];
  totalElements?: number;
}

// Gift Card Product
export interface ReloadlyProduct {
  productId: number;
  productName: string;
  brandName?: string;
  countryCode: string;
  currencyCode: string;
  minValue?: number;
  maxValue?: number;
  fixedRecipientDenominations?: number[];
  fixedSenderDenominations?: number[];
  logoUrl?: string;
  logoUrls?: string[];
  isGlobal?: boolean;
  productType?: string;
  redeemInstruction?: string;
  description?: string;
  [key: string]: any; // Allow additional fields from Reloadly API
}

// Products Response
export interface ReloadlyProductsResponse {
  content: ReloadlyProduct[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
}

// Product Query Parameters
export interface ReloadlyProductQueryParams {
  countryCode?: string;
  productName?: string;
  includeRange?: boolean;
  includeFixed?: boolean;
  page?: number;
  size?: number;
}

// Error Response
export interface ReloadlyError {
  error?: string;
  message?: string;
  status?: number;
  statusText?: string;
  [key: string]: any;
}

// Gift Card Order Request
export interface ReloadlyOrderRequest {
  productId: number;
  quantity: number;
  unitPrice: number;
  senderName: string;
  customIdentifier?: string;
  preOrder?: boolean;
  recipientEmail?: string;
  recipientPhoneDetails?: {
    countryCode: string;
    phoneNumber: string;
  };
  productAdditionalRequirements?: any;
  countryCode?: string; // Optional, some products require it
}

// Gift Card Order Response
export interface ReloadlyOrderResponse {
  transactionId: number;
  orderId?: number;
  status: 'SUCCESSFUL' | 'PENDING' | 'PROCESSING' | 'REFUNDED' | 'FAILED';
  amount: number;
  discount?: number;
  currencyCode: string;
  fee: number;
  totalFee?: number;
  recipientEmail?: string;
  customIdentifier?: string;
  product: {
    productId: number;
    productName: string;
    countryCode?: string;
    quantity: number;
    unitPrice: number;
    totalPrice?: number;
    currencyCode?: string;
    brand?: {
      brandId: number;
      brandName: string;
    };
  };
  transactionCreatedTime?: string;
  preOrdered?: boolean;
  balanceInfo?: {
    oldBalance: number;
    newBalance: number;
    cost: number;
    currencyCode: string;
    currencyName: string;
    updatedAt: string;
  };
}

// Gift Card Codes Response
export interface ReloadlyCardCodesResponse {
  content: Array<{
    redemptionCode: string;
    pin?: string;
    expiryDate?: string;
    serialNumber?: string;
  }>;
  totalElements?: number;
}

// Gift Card Transaction
export interface ReloadlyTransaction {
  transactionId: number;
  orderId?: number;
  status: 'SUCCESSFUL' | 'PENDING' | 'PROCESSING' | 'REFUNDED' | 'FAILED';
  amount: number;
  discount?: number;
  currencyCode: string;
  fee: number;
  recipientEmail?: string;
  customIdentifier?: string;
  product?: {
    productId: number;
    productName: string;
    countryCode?: string;
    quantity: number;
    unitPrice: number;
    currencyCode?: string;
  };
  transactionCreatedTime?: string;
  [key: string]: any;
}

// Utility Biller
export interface ReloadlyUtilityBiller {
  id: number;
  name: string;
  countryIsoCode: string;
  type: 'ELECTRICITY_BILL_PAYMENT' | 'WATER_BILL_PAYMENT' | 'TV_BILL_PAYMENT' | 'INTERNET_BILL_PAYMENT';
  serviceType: 'PREPAID' | 'POSTPAID';
  localAmountSupported: boolean;
  localTransactionCurrencyCode: string;
  minLocalTransactionAmount: number;
  maxLocalTransactionAmount: number;
  localTransactionFee: number;
  localTransactionFeeCurrencyCode: string;
  localTransactionFeePercentage: number;
  localDiscountPercentage: number;
  internatonalAmountSupported: boolean;
  internationalTransactionCurrencyCode: string;
  minInternationalTransactionAmount: number;
  maxInternationalTransactionAmount: number;
  internationalTransactionFee: number;
  internationalTransactionFeePercentage: number;
  internationalTransactionFeeCurrencyCode: string;
  internationalDiscountPercentage: number;
  requiresInvoice: boolean;
  fx?: Array<{
    rate?: number;
    curencyCode?: string;
  }>;
}

// Utility Billers Response
export interface ReloadlyUtilityBillersResponse {
  content: ReloadlyUtilityBiller[];
}

// Pay Utility Bill Request
export interface ReloadlyPayUtilityRequest {
  billerId: number;
  subscriberAccountNumber: string;
  amount: number;
  referenceId?: string;
  amountId?: number;
  useLocalAmount?: boolean;
  additionalInfo?: Record<string, any>;
}

// Pay Utility Bill Response
export interface ReloadlyPayUtilityResponse {
  id: number;
  status: 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';
  referenceId: string;
  code: string;
  message: string;
  submittedAt: string;
  finalStatusAvailabilityAt?: string;
}

// Utility Transaction Details
export interface ReloadlyUtilityTransaction {
  id: number;
  status: 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';
  referenceId: string;
  amount: number;
  amountCurrencyCode: string;
  deliveryAmount: number;
  deliveryAmountCurrencyCode: string;
  fee: number;
  feeCurrencyCode: string;
  discount: number;
  discountCurrencyCode: string;
  submittedAt: string;
  balanceInfo?: {
    oldBalance: number;
    newBalance: number;
    cost: number;
    currencyCode: string;
    currencyName: string;
    updatedAt: string;
  };
  billDetails?: {
    type: string;
    billerId: number;
    billerName: string;
    billerCountryCode: string;
    billerReferenceId?: string;
    serviceType: 'PREPAID' | 'POSTPAID';
    completedAt?: string;
    subscriberDetails?: {
      invoiceId?: string | null;
      accountNumber: string;
    };
    pinDetails?: {
      token?: string;
      info1?: string;
      info2?: string | null;
      info3?: string | null;
    };
  };
}

// Utility Transaction Response
export interface ReloadlyUtilityTransactionResponse {
  code: string;
  message: string;
  transaction: ReloadlyUtilityTransaction;
}
