// PalmPay API Types

// Request Types
export interface PalmPayCreateOrderRequest {
  requestTime: number; // Timestamp in milliseconds
  version: string; // "V1.1"
  nonceStr: string; // Random string (32 chars)
  orderId: string; // Unique merchant order ID (32 chars max)
  title?: string; // Order title (100 chars max)
  description?: string; // Order description (200 chars max)
  amount: number; // Amount in CENTS (e.g., 2500000 = 25,000.00 NGN)
  currency: string; // "NGN", "GHS", "TZS", "KES", "ZAR"
  notifyUrl: string; // Webhook callback URL
  callBackUrl: string; // Return URL after payment
  orderExpireTime?: number; // Order expiry in seconds (1800-86400, default 3600)
  goodsDetails?: string; // JSONArray string (required for global merchants)
  customerInfo?: string; // JSON string with customer info
  remark?: string; // Remarks (200 chars max)
  splitDetail?: string; // JSON string for split payments
  productType?: string; // "bank_transfer", "pay_wallet", "mmo"
  userId?: string; // Unique user ID on merchant (50 chars max)
  userMobileNo?: string; // User mobile phone number (15 chars max, e.g., 07011698742)
}

export interface PalmPayQueryOrderRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  orderId?: string; // Merchant order ID
  orderNo?: string; // PalmPay order number
}

export interface PalmPayQueryBankListRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  businessType: number; // 0 = all
}

export interface PalmPayQueryBankAccountRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  bankCode: string; // Bank or MMO code
  bankAccNo: string; // Bank account number (numeric only)
}

export interface PalmPayQueryAccountRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  palmpayAccNo: string; // PalmPay account number
}

export interface PalmPayPayoutRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  orderId: string; // Unique merchant order ID (32 chars max)
  title?: string;
  description?: string;
  payeeName?: string; // Name of payee (50 chars max)
  payeeBankCode: string; // Bank or MMO code (required except TZ)
  payeeBankAccNo: string; // Bank account number (numeric only, 50 chars max)
  payeePhoneNo?: string; // Phone number with country code (e.g., "023301234567890")
  currency: string; // "NGN", "GHS", "TZS", "KES"
  amount: number; // Amount in CENTS
  notifyUrl: string; // Webhook callback URL
  remark: string; // Remarks (200 chars max)
}

export interface PalmPayQueryPayStatusRequest {
  requestTime: number;
  version: string;
  nonceStr: string;
  orderId?: string; // Merchant order ID
  orderNo?: string; // PalmPay order number
}

// Response Types
export interface PalmPayBaseResponse<T> {
  respCode: string; // "00000000" = success
  respMsg: string; // "success" or error message
  data?: T;
}

export interface PalmPayCreateOrderResponse {
  orderNo: string; // PalmPay's order number
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  message: string;
  checkoutUrl?: string; // H5 payment URL
  payToken?: string; // Token for SDK payment
  payerAccountType?: string; // Account type (pay with bank transfer -1)
  payerAccountId?: string; // Unique account id (returned when -1)
  payerBankName?: string; // Bank name of virtual account (returned when -1)
  payerAccountName?: string; // Account name of virtual account (returned when -1)
  payerVirtualAccNo?: string; // Virtual account number (returned when -1)
  sdkSessionId: string;
  sdkSignKey: string;
  currency: string;
  orderAmount: number; // Amount in cents
  payMethod?: string; // "bank_transfer", "pay_wallet", "mmo"
}

export interface PalmPayQueryOrderResponse {
  orderId: string; // Merchant order ID
  orderNo: string; // PalmPay order number
  merchantId: string;
  currency: string;
  amount: number; // Amount in cents
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  payMethod?: string; // "pay_wallet", "bank_transfer", "mmo"
  productType?: string; // "pay_wallet", "bank_transfer", "mmo"
  remark?: string;
  errorMsg?: string;
  createdTime: number; // Timestamp in milliseconds
  completedTime?: number; // Timestamp in milliseconds
  payerBankName?: string;
  payerAccountName?: string;
  payerVirtualAccNo?: string;
}

export interface PalmPayBankInfo {
  bankCode: string;
  bankName: string;
  bankUrl?: string; // Bank logo URL
  bg2Url?: string; // Small background picture
  bgUrl?: string; // Small background picture
}

export interface PalmPayQueryBankAccountResponse {
  status: string; // "Success" or "Failed"
  accountName: string; // Full name of account
  errorMessage?: string; // Error message if status is "Failed"
}

export interface PalmPayQueryAccountResponse {
  accountName: string; // Full name of PalmPay account
  accountStatus: number; // 0 = available, others = unavailable
}

export interface PalmPayPayoutResponse {
  currency: string;
  amount: number; // Amount in cents (only when orderStatus = 2)
  fee?: {
    fee: number;
    vat?: number;
  };
  orderNo: string; // PalmPay order number
  orderId: string; // Merchant order ID
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  sessionId?: string; // Channel response parameters
  message?: string;
  errorMsg?: string;
}

export interface PalmPayQueryPayStatusResponse {
  currency: string;
  amount: number; // Amount in cents (only when orderStatus = 2)
  fee?: {
    fee: number;
    vat?: number;
  };
  orderNo: string;
  orderId: string;
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  sessionId?: string;
  message?: string;
  errorMsg?: string;
  createdTime: number; // Timestamp in milliseconds
  completedTime?: number; // Timestamp in milliseconds
}

// Webhook Types
export interface PalmPayDepositWebhook {
  orderId: string; // Merchant order ID
  orderNo: string; // PalmPay order number
  appId: string; // Merchant App ID
  currency: string;
  amount: number; // Amount in CENTS
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  completeTime?: number; // Timestamp in milliseconds (only when orderStatus = 2)
  sign: string; // URL encoded signature
  payMethod?: string;
  payer?: any; // Only returned to whitelisted merchants
}

export interface PalmPayPayoutWebhook {
  orderId: string; // Merchant order ID
  orderNo: string; // PalmPay order number
  appId: string; // Merchant App ID
  currency: string;
  amount: number; // Amount in CENTS
  orderStatus: number; // 1=PENDING, 2=SUCCESS, 3=FAILED, 4=CANCELLED
  sessionId?: string; // Channel response parameters
  completeTime?: number; // Timestamp in milliseconds
  errorMsg?: string;
  sign: string; // URL encoded signature
}

// Order Status Enum
export enum PalmPayOrderStatus {
  PENDING = 1,
  SUCCESS = 2,
  FAILED = 3,
  CANCELLED = 4,
}

// Customer Info (for JSON string in customerInfo)
export interface PalmPayCustomerInfo {
  userId?: string;
  userName?: string;
  phone?: string;
  email?: string;
}

// ============================================
// Bill Payment Types (Biller Reseller API)
// ============================================

// Scene Codes
export type PalmPaySceneCode = 'airtime' | 'data' | 'betting';

// Query Biller Request
export interface PalmPayQueryBillerRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
}

// Biller Response
export interface PalmPayBiller {
  billerId: string; // Operator ID (e.g., "MTN", "GLO")
  billerName: string; // Operator Name
  billerIcon: string; // Operator Icon URL
  minAmount?: number; // Minimum recharge amount (in cents)
  maxAmount?: number; // Maximum recharge amount (in cents)
  status: number; // 0 = Unavailable, 1 = Available
}

// Query Item Request
export interface PalmPayQueryItemRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  billerId: string; // Operator ID
}

// Item Response
export interface PalmPayItem {
  billerId: string; // Carrier ID
  itemId: string; // Package ID
  itemName: string; // Package Name
  amount?: number; // Package Amount (in cents)
  minAmount?: number; // Minimum Recharge Amount (in cents)
  maxAmount?: number; // Maximum Recharge Amount (in cents)
  isFixAmount: number; // 0 = Non-fixed Amount, 1 = Fixed Amount
  status: number; // 0 = Unavailable, 1 = Available
  extInfo?: {
    validityDate?: number; // Package Validity Days
    itemSize?: string; // Package Size
    itemDescription?: Record<string, any>; // Package Usage Instructions
  };
}

// Query Recharge Account Request
export interface PalmPayQueryRechargeAccountRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  rechargeAccount: string; // Phone number, meter number, etc. (max 15 chars)
  billerId?: string; // Operator ID (Required for Betting)
  itemId?: string; // Package ID (Required for Betting)
}

// Query Recharge Account Response
export interface PalmPayQueryRechargeAccountResponse {
  biller?: string; // Mobile phone number corresponding operator
}

// Create Bill Payment Order Request
export interface PalmPayCreateBillOrderRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  outOrderNo: string; // Merchant order number (max 64 chars, unique)
  amount: number; // Total order amount in CENTS
  notifyUrl: string; // Payment notification callback URL
  billerId: string; // Operator ID
  itemId: string; // Package ID
  rechargeAccount: string; // Recharge account (phone number, max 15 chars)
  title?: string; // Order title (max 50 chars)
  description?: string; // Order description (max 200 chars)
  relationId?: string; // User-defined associated ID (max 64 chars)
}

// Create Bill Payment Order Response
export interface PalmPayCreateBillOrderResponse {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  orderStatus: number; // Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
  msg?: string; // Status description
  amount: number; // Total order amount (in cents)
  sceneCode: PalmPaySceneCode;
}

// Query Bill Payment Order Request
export interface PalmPayQueryBillOrderRequest {
  requestTime: number;
  version: string; // "V1.1" or "V2"
  nonceStr: string;
  sceneCode: PalmPaySceneCode;
  outOrderNo?: string; // Merchant order number
  orderNo?: string; // PalmPay platform order number (at least one required)
}

// Query Bill Payment Order Response
export interface PalmPayQueryBillOrderResponse {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  billerId: string; // Operator ID
  itemId: string; // Package ID
  orderStatus: number; // Order status
  amount: number | null; // Total order amount (in cents, null if not completed)
  sceneCode: PalmPaySceneCode;
  currencySymbol: string; // e.g., "₦"
  currency: string; // e.g., "NGN"
  payerEmail: string; // Payer's email address
  payerMobileNo: string | null; // Associated system member's mobile number
  payerAccountId: string; // Payer's account ID
  payerAccountType: number; // Payer's account type
  payTime: number; // Payment time (timestamp in milliseconds)
  completedTime: number; // Order completion time (timestamp in milliseconds)
  merchantNo: string; // Merchant number
  errorMsg: string | null; // Return message
  notifyUrl?: string; // Notification URL
}

// Bill Payment Webhook
export interface PalmPayBillPaymentWebhook {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  appId: string; // Merchant APP ID
  amount: number; // Total order amount (in cents)
  rechargeAccount?: string; // Recharge account
  orderStatus: number; // Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
  completedTime: number; // Transaction completion time (timestamp)
  sign: string; // Signature (URL encoded)
  errorMsg?: string; // Error message
  country?: string; // Country code
}


// Bill Payment Types (Biller Reseller API)
// ============================================

// Scene Codes
// export type PalmPaySceneCode = 'airtime' | 'data' | 'betting';

// Query Biller Request
export interface PalmPayQueryBillerRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
}

// Biller Response
export interface PalmPayBiller {
  billerId: string; // Operator ID (e.g., "MTN", "GLO")
  billerName: string; // Operator Name
  billerIcon: string; // Operator Icon URL
  minAmount?: number; // Minimum recharge amount (in cents)
  maxAmount?: number; // Maximum recharge amount (in cents)
  status: number; // 0 = Unavailable, 1 = Available
}

// Query Item Request
export interface PalmPayQueryItemRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  billerId: string; // Operator ID
}

// Item Response
export interface PalmPayItem {
  billerId: string; // Carrier ID
  itemId: string; // Package ID
  itemName: string; // Package Name
  amount?: number; // Package Amount (in cents)
  minAmount?: number; // Minimum Recharge Amount (in cents)
  maxAmount?: number; // Maximum Recharge Amount (in cents)
  isFixAmount: number; // 0 = Non-fixed Amount, 1 = Fixed Amount
  status: number; // 0 = Unavailable, 1 = Available
  extInfo?: {
    validityDate?: number; // Package Validity Days
    itemSize?: string; // Package Size
    itemDescription?: Record<string, any>; // Package Usage Instructions
  };
}

// Query Recharge Account Request
export interface PalmPayQueryRechargeAccountRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  rechargeAccount: string; // Phone number, meter number, etc. (max 15 chars)
  billerId?: string; // Operator ID (Required for Betting)
  itemId?: string; // Package ID (Required for Betting)
}

// Query Recharge Account Response
export interface PalmPayQueryRechargeAccountResponse {
  biller?: string; // Mobile phone number corresponding operator
}

// Create Bill Payment Order Request
export interface PalmPayCreateBillOrderRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  outOrderNo: string; // Merchant order number (max 64 chars, unique)
  amount: number; // Total order amount in CENTS
  notifyUrl: string; // Payment notification callback URL
  billerId: string; // Operator ID
  itemId: string; // Package ID
  rechargeAccount: string; // Recharge account (phone number, max 15 chars)
  title?: string; // Order title (max 50 chars)
  description?: string; // Order description (max 200 chars)
  relationId?: string; // User-defined associated ID (max 64 chars)
}

// Create Bill Payment Order Response
export interface PalmPayCreateBillOrderResponse {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  orderStatus: number; // Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
  msg?: string; // Status description
  amount: number; // Total order amount (in cents)
  sceneCode: PalmPaySceneCode;
}

// Query Bill Payment Order Request
export interface PalmPayQueryBillOrderRequest {
  requestTime: number;
  version: string; // "V1.1" or "V2"
  nonceStr: string;
  sceneCode: PalmPaySceneCode;
  outOrderNo?: string; // Merchant order number
  orderNo?: string; // PalmPay platform order number (at least one required)
}

// Query Bill Payment Order Response
export interface PalmPayQueryBillOrderResponse {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  billerId: string; // Operator ID
  itemId: string; // Package ID
  orderStatus: number; // Order status
  amount: number | null; // Total order amount (in cents, null if not completed)
  sceneCode: PalmPaySceneCode;
  currencySymbol: string; // e.g., "₦"
  currency: string; // e.g., "NGN"
  payerEmail: string; // Payer's email address
  payerMobileNo: string | null; // Associated system member's mobile number
  payerAccountId: string; // Payer's account ID
  payerAccountType: number; // Payer's account type
  payTime: number; // Payment time (timestamp in milliseconds)
  completedTime: number; // Order completion time (timestamp in milliseconds)
  merchantNo: string; // Merchant number
  errorMsg: string | null; // Return message
  notifyUrl?: string; // Notification URL
}

// Bill Payment Webhook
export interface PalmPayBillPaymentWebhook {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  appId: string; // Merchant APP ID
  amount: number; // Total order amount (in cents)
  rechargeAccount?: string; // Recharge account
  orderStatus: number; // Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
  completedTime: number; // Transaction completion time (timestamp)
  sign: string; // Signature (URL encoded)
  errorMsg?: string; // Error message
  country?: string; // Country code
}


// Bill Payment Types (Biller Reseller API)
// ============================================

// Scene Codes
// export type PalmPaySceneCode = 'airtime' | 'data' | 'betting';

// Query Biller Request
export interface PalmPayQueryBillerRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
}

// Biller Response
export interface PalmPayBiller {
  billerId: string; // Operator ID (e.g., "MTN", "GLO")
  billerName: string; // Operator Name
  billerIcon: string; // Operator Icon URL
  minAmount?: number; // Minimum recharge amount (in cents)
  maxAmount?: number; // Maximum recharge amount (in cents)
  status: number; // 0 = Unavailable, 1 = Available
}

// Query Item Request
export interface PalmPayQueryItemRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  billerId: string; // Operator ID
}

// Item Response
export interface PalmPayItem {
  billerId: string; // Carrier ID
  itemId: string; // Package ID
  itemName: string; // Package Name
  amount?: number; // Package Amount (in cents)
  minAmount?: number; // Minimum Recharge Amount (in cents)
  maxAmount?: number; // Maximum Recharge Amount (in cents)
  isFixAmount: number; // 0 = Non-fixed Amount, 1 = Fixed Amount
  status: number; // 0 = Unavailable, 1 = Available
  extInfo?: {
    validityDate?: number; // Package Validity Days
    itemSize?: string; // Package Size
    itemDescription?: Record<string, any>; // Package Usage Instructions
  };
}

// Query Recharge Account Request
export interface PalmPayQueryRechargeAccountRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  rechargeAccount: string; // Phone number, meter number, etc. (max 15 chars)
  billerId?: string; // Operator ID (Required for Betting)
  itemId?: string; // Package ID (Required for Betting)
}

// Query Recharge Account Response
export interface PalmPayQueryRechargeAccountResponse {
  biller?: string; // Mobile phone number corresponding operator
}

// Create Bill Payment Order Request
export interface PalmPayCreateBillOrderRequest {
  requestTime: number;
  nonceStr: string;
  version: string; // "V2"
  sceneCode: PalmPaySceneCode;
  outOrderNo: string; // Merchant order number (max 64 chars, unique)
  amount: number; // Total order amount in CENTS
  notifyUrl: string; // Payment notification callback URL
  billerId: string; // Operator ID
  itemId: string; // Package ID
  rechargeAccount: string; // Recharge account (phone number, max 15 chars)
  title?: string; // Order title (max 50 chars)
  description?: string; // Order description (max 200 chars)
  relationId?: string; // User-defined associated ID (max 64 chars)
}

// Create Bill Payment Order Response
export interface PalmPayCreateBillOrderResponse {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  orderStatus: number; // Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
  msg?: string; // Status description
  amount: number; // Total order amount (in cents)
  sceneCode: PalmPaySceneCode;
}

// Query Bill Payment Order Request
export interface PalmPayQueryBillOrderRequest {
  requestTime: number;
  version: string; // "V1.1" or "V2"
  nonceStr: string;
  sceneCode: PalmPaySceneCode;
  outOrderNo?: string; // Merchant order number
  orderNo?: string; // PalmPay platform order number (at least one required)
}

// Query Bill Payment Order Response
export interface PalmPayQueryBillOrderResponse {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  billerId: string; // Operator ID
  itemId: string; // Package ID
  orderStatus: number; // Order status
  amount: number | null; // Total order amount (in cents, null if not completed)
  sceneCode: PalmPaySceneCode;
  currencySymbol: string; // e.g., "₦"
  currency: string; // e.g., "NGN"
  payerEmail: string; // Payer's email address
  payerMobileNo: string | null; // Associated system member's mobile number
  payerAccountId: string; // Payer's account ID
  payerAccountType: number; // Payer's account type
  payTime: number; // Payment time (timestamp in milliseconds)
  completedTime: number; // Order completion time (timestamp in milliseconds)
  merchantNo: string; // Merchant number
  errorMsg: string | null; // Return message
  notifyUrl?: string; // Notification URL
}

// Bill Payment Webhook
export interface PalmPayBillPaymentWebhook {
  outOrderNo: string; // Merchant order number
  orderNo: string; // PalmPay platform order number
  appId: string; // Merchant APP ID
  amount: number; // Total order amount (in cents)
  rechargeAccount?: string; // Recharge account
  orderStatus: number; // Order status (1=PENDING, 2=SUCCESS, 3=FAILED)
  completedTime: number; // Transaction completion time (timestamp)
  sign: string; // Signature (URL encoded)
  errorMsg?: string; // Error message
  country?: string; // Country code
}

