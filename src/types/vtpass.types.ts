/**
 * VTpass API Types
 * 
 * Type definitions for VTpass API integration (Airtime & Data)
 */

// Purchase Product Request (Airtime)
export interface VtpassPurchaseRequest {
  request_id: string; // Unique reference (max 36 characters, alphanumeric)
  serviceID: string; // Service ID (e.g., "mtn", "glo", "airtel", "etisalat" for airtime)
  amount: number; // Amount to topup (for airtime)
  phone: string; // Phone number of recipient
}

// Purchase Product Request (Data)
export interface VtpassPurchaseDataRequest {
  request_id: string; // Unique reference
  serviceID: string; // Service ID (e.g., "mtn-data", "glo-data", "airtel-data", "etisalat-data")
  billersCode: string; // Phone number or account ID for subscription payment
  variation_code: string; // Variation code from service-variations endpoint
  amount?: number; // Optional amount (ignored, variation_code determines price)
  phone: string; // Phone number of customer/recipient
}

// Purchase Product Response
export interface VtpassPurchaseResponse {
  code: string; // Response code ("000" = success)
  content: {
    transactions: {
      status: string; // "delivered", "pending", "failed"
      product_name: string; // e.g., "MTN Airtime VTU" or "MTN Data"
      unique_element: string; // Phone number or account ID
      unit_price: string; // Amount as string
      quantity: number;
      service_verification: string | null;
      channel: string; // "api"
      commission: number;
      total_amount: number;
      discount: number | null;
      type: string; // "Airtime Recharge" or "Data Services"
      email: string;
      phone: string;
      name: string | null;
      convinience_fee: number;
      amount: string; // Amount as string
      platform: string; // "api"
      method: string; // "api" or "wallet"
      transactionId: string; // VTpass transaction ID
      commission_details?: {
        amount: number;
        rate: string;
        rate_type: string; // "percent"
        computation_type: string; // "default"
      };
      product_id?: number;
      extras?: any;
    };
  };
  response_description: string; // "TRANSACTION SUCCESSFUL" or error message
  requestId: string; // Same as request_id
  amount: number; // Amount as number
  transaction_date: string; // ISO 8601 format
  purchased_code?: string;
}

// Query Transaction Status Request
export interface VtpassQueryRequest {
  request_id: string; // The reference sent when purchasing
}

// Query Transaction Status Response (same structure as Purchase Response)
export type VtpassQueryResponse = VtpassPurchaseResponse;

// Service Variations Request (for Data)
// GET /api/service-variations?serviceID={serviceID}
// No request body needed

// Service Variations Response
export interface VtpassServiceVariationsResponse {
  response_description: string; // Usually "000" for success
  content: {
    ServiceName: string; // e.g., "MTN Data"
    serviceID: string; // e.g., "mtn-data"
    convinience_fee: string; // e.g., "0 %" or "N0"
    variations: VtpassVariation[];
    varations?: VtpassVariation[]; // Alternative spelling (typo in API)
  };
}

// Variation (Data Plan)
export interface VtpassVariation {
  variation_code: string; // Code to use when purchasing
  name: string; // Display name of the plan
  variation_amount: string; // Price as string
  fixedPrice: string; // "Yes" or "No"
}

// Transaction Status Values
export type VtpassTransactionStatus = 'delivered' | 'pending' | 'failed';

// Response Codes
export enum VtpassResponseCode {
  SUCCESS = '000',
  // Add other response codes as needed
}

// Service IDs for Airtime
export enum VtpassAirtimeServiceID {
  MTN = 'mtn',
  GLO = 'glo',
  AIRTEL = 'airtel',
  ETISALAT = 'etisalat', // 9mobile
  // Add other service IDs as needed
}

// Service IDs for Data
export enum VtpassDataServiceID {
  MTN = 'mtn-data',
  GLO = 'glo-data',
  AIRTEL = 'airtel-data',
  ETISALAT = 'etisalat-data', // 9mobile
  GLO_SME = 'glo-sme-data',
  SMILE = 'smile-direct',
  // Add other service IDs as needed
}

// Service IDs for Cable TV
export enum VtpassCableServiceID {
  DSTV = 'dstv',
  GOTV = 'gotv',
  STARTIMES = 'startimes',
  SHOWMAX = 'showmax',
  // Add other service IDs as needed
}

// Service IDs for Electricity
export enum VtpassElectricityServiceID {
  IKEDC = 'ikeja-electric',
  EKEDC = 'eko-electric',
  KEDCO = 'kano-electric',
  PHED = 'portharcourt-electric',
  JED = 'jos-electric',
  IBEDC = 'ibadan-electric',
  KAEDCO = 'kaduna-electric',
  AEDC = 'abuja-electric',
  EEDC = 'enugu-electric',
  BEDC = 'benin-electric',
  ABA = 'aba-electric',
  YEDC = 'yola-electric',
  // Add other service IDs as needed
}

// Service IDs for Education
export enum VtpassEducationServiceID {
  WAEC_REGISTRATION = 'waec-registration',
  JAMB = 'jamb',
  WAEC_RESULT_CHECKER = 'waec',
  // Add other service IDs as needed
}

// Service ID type
export type VtpassServiceID = VtpassAirtimeServiceID | VtpassDataServiceID | VtpassCableServiceID | VtpassElectricityServiceID | VtpassEducationServiceID | string;

// Smile Email Verification Request
export interface VtpassSmileVerifyRequest {
  billersCode: string; // Smile email
  serviceID: string; // "smile-direct"
}

// Smile Email Verification Response
export interface VtpassSmileVerifyResponse {
  code: string; // "000" for success
  content: {
    Customer_Name: string;
    AccountList: {
      Account: Array<{
        AccountId: string;
        FriendlyName: string;
      }>;
      NumberOfAccounts: number;
    };
  };
}

// Cable TV Smartcard Verification Request
export interface VtpassCableVerifyRequest {
  billersCode: string; // Smartcard number
  serviceID: string; // "dstv", "gotv", "startimes"
}

// DSTV/GOTV Smartcard Verification Response
export interface VtpassDstvGotvVerifyResponse {
  code: string; // "000" for success
  content: {
    Customer_Name: string;
    Status: string; // "ACTIVE", etc.
    Due_Date: string; // ISO date or formatted date
    Customer_Number?: string;
    Customer_Type: string; // "DSTV" or "GOTV"
    Current_Bouquet?: string;
    Renewal_Amount?: string; // Amount for renewal (may have discount)
    commission_details?: {
      amount: number | null;
      rate: string;
      rate_type: string;
      computation_type: string;
    };
  };
}

// Startimes Smartcard Verification Response
export interface VtpassStartimesVerifyResponse {
  code: string; // "000" for success
  content: {
    Customer_Name: string;
    Balance: number;
    Smartcard_Number: string;
    WrongBillersCode: boolean;
    commission_details?: {
      amount: number | null;
      rate: string;
      rate_type: string;
      computation_type: string;
    };
  };
}

// Cable TV Purchase Request (Change Bouquet)
export interface VtpassCablePurchaseChangeRequest {
  request_id: string;
  serviceID: string; // "dstv", "gotv", "startimes", "showmax"
  billersCode: string; // Smartcard number or phone (for Showmax)
  variation_code: string; // Bouquet variation code
  amount?: number; // Optional (variation_code determines price)
  phone: string;
  subscription_type: 'change'; // For DSTV/GOTV
  quantity?: number; // Optional, number of months (for DSTV/GOTV)
}

// Cable TV Purchase Request (Renew Bouquet)
export interface VtpassCablePurchaseRenewRequest {
  request_id: string;
  serviceID: string; // "dstv" or "gotv"
  billersCode: string; // Smartcard number
  amount: number; // Renewal amount from verify response
  phone: string;
  subscription_type: 'renew'; // For DSTV/GOTV renewal
}

// Cable TV Purchase Request (Startimes/Showmax - simpler)
export interface VtpassCablePurchaseSimpleRequest {
  request_id: string;
  serviceID: string; // "startimes" or "showmax"
  billersCode: string; // Smartcard number (Startimes) or phone (Showmax)
  variation_code: string;
  amount?: number; // Optional
  phone: string;
}

// Electricity Meter Verification Request
export interface VtpassElectricityVerifyRequest {
  billersCode: string; // Meter number
  serviceID: string; // e.g., "ikeja-electric"
  type: 'prepaid' | 'postpaid'; // Meter type
}

// Electricity Meter Verification Response (Generic - varies by provider)
export interface VtpassElectricityVerifyResponse {
  code: string; // "000" for success
  content: {
    Customer_Name?: string;
    Address?: string;
    Meter_Number?: string;
    MeterNumber?: string;
    Account_Number?: string;
    Customer_Arrears?: string;
    Minimum_Amount?: string | number;
    Min_Purchase_Amount?: string | number;
    Can_Vend?: string; // "yes" or "no"
    Business_Unit?: string;
    Customer_Account_Type?: string; // "MD", "NMD", "PRIME", etc.
    Customer_District?: string;
    Customer_District_Reference?: string;
    Customer_Phone?: string;
    Customer_Number?: string;
    Meter_Type?: string; // "PREPAID" or "POSTPAID" or "prepaid" or "postpaid"
    Franchise?: string;
    WrongBillersCode?: boolean;
    MAX_Purchase_Amount?: string;
    Last_Purchase_Days?: string;
    KCT1?: string;
    KCT2?: string;
    Service_Band?: string | null; // IBEDC specific
    Outstanding?: number | null; // AEDC specific
    District?: string; // EEDC specific
    Tariff?: string; // EEDC, BEDC specific
    commission_details?: {
      amount: number | null;
      rate: string;
      rate_type: string;
      computation_type: string;
    };
  };
}

// Electricity Purchase Request
export interface VtpassElectricityPurchaseRequest {
  request_id: string;
  serviceID: string; // e.g., "ikeja-electric"
  billersCode: string; // Meter number
  variation_code: 'prepaid' | 'postpaid'; // Meter type
  amount: number; // Amount in Naira
  phone: string; // Customer phone number
}

// Electricity Purchase Response (Extends base response with electricity-specific fields)
export interface VtpassElectricityPurchaseResponse extends VtpassPurchaseResponse {
  customerName?: string | null;
  customerAddress?: string | null;
  address?: string | null;
  meterNumber?: string | null;
  accountNumber?: string | null;
  utilityName?: string | null;
  exchangeReference?: string | null;
  token?: string | null; // Token for prepaid meters
  tokenAmount?: number | string | null;
  tokenValue?: string | null;
  units?: string | null; // kWh units
  tariff?: string | null;
  fixChargeAmount?: number | null;
  taxAmount?: number | null;
  debtAmount?: number | null;
  kct1?: string | null;
  kct2?: string | null;
  KCT1?: string | null;
  KCT2?: string | null;
  penalty?: number | null;
  costOfUnit?: number | null;
  announcement?: string | null;
  meterCost?: number | null;
  currentCharge?: number | null;
  lossOfRevenue?: number | null;
  tariffBaseRate?: number | null;
  installationFee?: number | null;
  reconnectionFee?: number | null;
  meterServiceCharge?: number | null;
  administrativeCharge?: number | null;
  balance?: string | null;
  customerBalance?: string | null;
  customerNumber?: string | null;
  energyAmt?: string | null;
  vat?: string | number | null;
  arrears?: string | null;
  revenueLoss?: string | null;
  tariffCode?: string | null;
  tariffIndex?: string | null;
  debtTariff?: string | null;
  debtDescription?: string | null;
  debtValue?: string | number | null;
  debtRem?: string | null;
  resetToken?: string | null;
  configureToken?: string | null;
  mainToken?: string | null;
  mainTokenDescription?: string | null;
  mainTokenUnits?: string | null;
  mainTokenTax?: number | null;
  mainsTokenAmount?: number | null;
  bonusToken?: string | null;
  bonusTokenDescription?: string | null;
  bonusTokenUnits?: string | null;
  bonusTokenTax?: number | null;
  bonusTokenAmount?: number | null;
  Receipt?: string | null;
  Description?: string | null;
  Tax?: string | number | null;
  Amount?: number | null;
  businessCenter?: string | null;
  externalReference?: string | null;
  CustomerName?: string | null;
  CustomerAddress?: string | null;
  DebtTax?: string | number | null;
  DebtAmount?: string | number | null;
  FixedTax?: string | number | null;
  FixedAmount?: string | number | null;
  FixedValue?: string | number | null;
}

// Education Services Types

// JAMB Profile Verification Request
export interface VtpassJambVerifyRequest {
  billersCode: string; // Profile ID
  serviceID: string; // "jamb"
  type: string; // Variation code (e.g., "utme-mock", "utme-no-mock")
}

// JAMB Profile Verification Response
export interface VtpassJambVerifyResponse {
  code: string; // "000" for success
  content: {
    Customer_Name: string;
    commission_details?: {
      amount: number | null;
      rate: string;
      rate_type: string;
      computation_type: string;
    };
  };
}

// Education Purchase Request (WAEC Registration, WAEC Result Checker, JAMB)
export interface VtpassEducationPurchaseRequest {
  request_id: string;
  serviceID: string; // "waec-registration" or "waec" or "jamb"
  variation_code: string; // Variation code from service-variations
  amount?: number; // Optional (variation_code determines price)
  quantity?: number; // Optional (defaults to 1)
  phone: string; // Customer phone number
  billersCode?: string; // Required for JAMB (Profile ID)
}

// Education Purchase Response
export interface VtpassEducationPurchaseResponse extends VtpassPurchaseResponse {
  purchased_code?: string; // PIN or token code
  Pin?: string; // JAMB PIN
  tokens?: string[]; // WAEC Registration tokens array
  cards?: Array<{ // WAEC Result Checker cards
    Serial: string;
    Pin: string;
  }>;
}
