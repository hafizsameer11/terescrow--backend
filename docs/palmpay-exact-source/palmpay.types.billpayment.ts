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
