/**
 * VTpass Bill Payment Service
 * Unified service for all VTpass bill payment operations
 * Similar interface to PalmPay bill payment service
 */

import { vtpassAirtimeService } from './vtpass.airtime.service';
import { vtpassDataService } from './vtpass.data.service';
import { vtpassCableService } from './vtpass.cable.service';
import { vtpassElectricityService } from './vtpass.electricity.service';
import { vtpassEducationService } from './vtpass.education.service';
import {
  VtpassPurchaseResponse,
  VtpassQueryResponse,
  VtpassServiceVariationsResponse,
  VtpassAirtimeServiceID,
  VtpassDataServiceID,
  VtpassCableServiceID,
  VtpassElectricityServiceID,
  VtpassEducationServiceID,
} from '../../types/vtpass.types';

// Map sceneCode to service types
export type VtpassSceneCode = 'airtime' | 'data' | 'cable' | 'electricity' | 'education';

// Biller (Provider) interface similar to PalmPay
export interface VtpassBiller {
  billerId: string;
  billerName: string;
  serviceID: string; // VTpass service ID
  sceneCode: VtpassSceneCode;
}

// Item (Package/Plan) interface similar to PalmPay
export interface VtpassItem {
  billerId: string;
  itemId: string; // Variation code for data/cable/electricity/education, empty for airtime
  itemName: string;
  amount: number;
  serviceID: string;
}

// Query Recharge Account Response (for verification)
export interface VtpassQueryRechargeAccountResponse {
  biller: string;
  billerId: string;
  valid: boolean;
  customerName?: string;
  meterType?: string;
  address?: string;
  dueDate?: string;
  currentBouquet?: string;
}

// Create Order Request
export interface VtpassCreateBillOrderRequest {
  sceneCode: VtpassSceneCode;
  serviceID: string; // VTpass service ID
  billerId: string; // Provider identifier (e.g., "MTN", "DSTV")
  itemId?: string; // Variation code (for data/cable/electricity/education)
  rechargeAccount: string; // Phone, meter, smartcard, etc.
  amount: number;
  phone: string; // Customer phone number
  requestId?: string; // Optional request ID
  meterType?: 'prepaid' | 'postpaid'; // For electricity
}

// Create Order Response
export interface VtpassCreateBillOrderResponse {
  requestId: string; // Our request ID
  transactionId: string; // VTpass transaction ID
  orderStatus: number; // 1 = pending, 2 = success, 3 = failed
  msg: string; // Response message
  amount: number;
  transaction_date: string;
}

class VtpassBillPaymentService {
  /**
   * Query Billers (Operators) for a scene code
   * Returns list of available providers for the given scene code
   */
  async queryBillers(sceneCode: VtpassSceneCode): Promise<VtpassBiller[]> {
    const billers: VtpassBiller[] = [];

    switch (sceneCode) {
      case 'airtime':
        billers.push(
          { billerId: 'MTN', billerName: 'MTN', serviceID: VtpassAirtimeServiceID.MTN, sceneCode: 'airtime' },
          { billerId: 'GLO', billerName: 'GLO', serviceID: VtpassAirtimeServiceID.GLO, sceneCode: 'airtime' },
          { billerId: 'AIRTEL', billerName: 'Airtel', serviceID: VtpassAirtimeServiceID.AIRTEL, sceneCode: 'airtime' },
          { billerId: '9MOBILE', billerName: '9mobile', serviceID: VtpassAirtimeServiceID.ETISALAT, sceneCode: 'airtime' },
        );
        break;

      case 'data':
        billers.push(
          { billerId: 'MTN', billerName: 'MTN Data', serviceID: VtpassDataServiceID.MTN, sceneCode: 'data' },
          { billerId: 'GLO', billerName: 'GLO Data', serviceID: VtpassDataServiceID.GLO, sceneCode: 'data' },
          { billerId: 'AIRTEL', billerName: 'Airtel Data', serviceID: VtpassDataServiceID.AIRTEL, sceneCode: 'data' },
          { billerId: '9MOBILE', billerName: '9mobile Data', serviceID: VtpassDataServiceID.ETISALAT, sceneCode: 'data' },
          { billerId: 'GLO_SME', billerName: 'GLO SME Data', serviceID: VtpassDataServiceID.GLO_SME, sceneCode: 'data' },
          { billerId: 'SMILE', billerName: 'Smile', serviceID: VtpassDataServiceID.SMILE, sceneCode: 'data' },
        );
        break;

      case 'cable':
        billers.push(
          { billerId: 'DSTV', billerName: 'DSTV', serviceID: VtpassCableServiceID.DSTV, sceneCode: 'cable' },
          { billerId: 'GOTV', billerName: 'GOTV', serviceID: VtpassCableServiceID.GOTV, sceneCode: 'cable' },
          { billerId: 'STARTIMES', billerName: 'Startimes', serviceID: VtpassCableServiceID.STARTIMES, sceneCode: 'cable' },
          { billerId: 'SHOWMAX', billerName: 'Showmax', serviceID: VtpassCableServiceID.SHOWMAX, sceneCode: 'cable' },
        );
        break;

      case 'electricity':
        billers.push(
          { billerId: 'IKEDC', billerName: 'Ikeja Electric', serviceID: VtpassElectricityServiceID.IKEDC, sceneCode: 'electricity' },
          { billerId: 'EKEDC', billerName: 'Eko Electric', serviceID: VtpassElectricityServiceID.EKEDC, sceneCode: 'electricity' },
          { billerId: 'KEDCO', billerName: 'Kano Electric', serviceID: VtpassElectricityServiceID.KEDCO, sceneCode: 'electricity' },
          { billerId: 'PHED', billerName: 'Port Harcourt Electric', serviceID: VtpassElectricityServiceID.PHED, sceneCode: 'electricity' },
          { billerId: 'JED', billerName: 'Jos Electric', serviceID: VtpassElectricityServiceID.JED, sceneCode: 'electricity' },
          { billerId: 'IBEDC', billerName: 'Ibadan Electric', serviceID: VtpassElectricityServiceID.IBEDC, sceneCode: 'electricity' },
          { billerId: 'KAEDCO', billerName: 'Kaduna Electric', serviceID: VtpassElectricityServiceID.KAEDCO, sceneCode: 'electricity' },
          { billerId: 'AEDC', billerName: 'Abuja Electric', serviceID: VtpassElectricityServiceID.AEDC, sceneCode: 'electricity' },
          { billerId: 'EEDC', billerName: 'Enugu Electric', serviceID: VtpassElectricityServiceID.EEDC, sceneCode: 'electricity' },
          { billerId: 'BEDC', billerName: 'Benin Electric', serviceID: VtpassElectricityServiceID.BEDC, sceneCode: 'electricity' },
          { billerId: 'ABA', billerName: 'Aba Electric', serviceID: VtpassElectricityServiceID.ABA, sceneCode: 'electricity' },
          { billerId: 'YEDC', billerName: 'Yola Electric', serviceID: VtpassElectricityServiceID.YEDC, sceneCode: 'electricity' },
        );
        break;

      case 'education':
        billers.push(
          { billerId: 'WAEC_REGISTRATION', billerName: 'WAEC Registration', serviceID: VtpassEducationServiceID.WAEC_REGISTRATION, sceneCode: 'education' },
          { billerId: 'JAMB', billerName: 'JAMB', serviceID: VtpassEducationServiceID.JAMB, sceneCode: 'education' },
          { billerId: 'WAEC_RESULT', billerName: 'WAEC Result Checker', serviceID: VtpassEducationServiceID.WAEC_RESULT_CHECKER, sceneCode: 'education' },
        );
        break;

      default:
        throw new Error(`Unsupported scene code: ${sceneCode}`);
    }

    return billers;
  }

  /**
   * Query Items (Packages/Plans) for a biller
   * For airtime: returns empty array (no fixed packages)
   * For data/cable/electricity/education: returns available plans/variations
   */
  async queryItems(sceneCode: VtpassSceneCode, billerId: string): Promise<VtpassItem[]> {
    // Get the service ID for this biller
    const billers = await this.queryBillers(sceneCode);
    const biller = billers.find(b => b.billerId === billerId);
    
    if (!biller) {
      throw new Error(`Invalid billerId: ${billerId} for sceneCode: ${sceneCode}`);
    }

    // For airtime, return empty array (no fixed packages)
    if (sceneCode === 'airtime') {
      return [];
    }

    // For other services, get variations
    let variationsResponse: VtpassServiceVariationsResponse;
    
    switch (sceneCode) {
      case 'data':
        variationsResponse = await vtpassDataService.getServiceVariations(biller.serviceID);
        break;
      case 'cable':
        variationsResponse = await vtpassCableService.getServiceVariations(biller.serviceID);
        break;
      case 'electricity':
        // Electricity has prepaid/postpaid as variations, return them manually
        return [
          {
            billerId,
            itemId: 'prepaid',
            itemName: 'Prepaid',
            amount: 0, // Amount is user-specified
            serviceID: biller.serviceID,
          },
          {
            billerId,
            itemId: 'postpaid',
            itemName: 'Postpaid',
            amount: 0, // Amount is user-specified
            serviceID: biller.serviceID,
          },
        ];
      case 'education':
        variationsResponse = await vtpassEducationService.getServiceVariations(biller.serviceID);
        break;
      default:
        return [];
    }

    // Convert variations to items
    const variations = variationsResponse.content.variations || variationsResponse.content.varations || [];
    
    return variations.map((variation) => ({
      billerId,
      itemId: variation.variation_code,
      itemName: variation.name,
      amount: parseFloat(variation.variation_amount) || 0,
      serviceID: biller.serviceID,
    }));
  }

  /**
   * Query Recharge Account (Verify account)
   * Verifies phone/meter/smartcard/profile and returns customer info
   */
  async queryRechargeAccount(
    sceneCode: VtpassSceneCode,
    rechargeAccount: string,
    billerId?: string,
    itemId?: string
  ): Promise<VtpassQueryRechargeAccountResponse> {
    if (!billerId) {
      throw new Error('billerId is required for verification');
    }

    const billers = await this.queryBillers(sceneCode);
    const biller = billers.find(b => b.billerId === billerId);
    
    if (!biller) {
      throw new Error(`Invalid billerId: ${billerId} for sceneCode: ${sceneCode}`);
    }

    try {
      switch (sceneCode) {
        case 'airtime':
        case 'data':
          // For data, check if it's Smile (requires email verification)
          if (biller.serviceID === VtpassDataServiceID.SMILE) {
            const verifyResponse = await vtpassDataService.verifySmileEmail(rechargeAccount);
            return {
              biller: biller.billerName,
              billerId: biller.billerId,
              valid: verifyResponse.code === '000',
              customerName: verifyResponse.content?.Customer_Name,
            };
          }
          // For other networks, just validate phone format
          if (!/^0\d{10}$/.test(rechargeAccount)) {
            throw new Error('INVALID_RECHARGE_ACCOUNT: Invalid phone number format');
          }
          return {
            biller: biller.billerName,
            billerId: biller.billerId,
            valid: true,
          };

        case 'cable':
          // Verify smartcard
          const cableVerifyResponse = await vtpassCableService.verifySmartcard(
            biller.serviceID as any,
            rechargeAccount
          );
          const cableContent = cableVerifyResponse.content as any;
          return {
            biller: biller.billerName,
            billerId: biller.billerId,
            valid: cableVerifyResponse.code === '000',
            customerName: cableContent.Customer_Name,
            currentBouquet: cableContent.Current_Bouquet,
            dueDate: cableContent.Due_Date,
          };

        case 'electricity':
          // Meter verification requires meter type
          if (!itemId || (itemId !== 'prepaid' && itemId !== 'postpaid')) {
            throw new Error('itemId is required and must be "prepaid" or "postpaid" for electricity');
          }
          const elecVerifyResponse = await vtpassElectricityService.verifyMeter(
            biller.serviceID,
            rechargeAccount,
            itemId as 'prepaid' | 'postpaid'
          );
          const elecContent = elecVerifyResponse.content;
          return {
            biller: biller.billerName,
            billerId: biller.billerId,
            valid: elecVerifyResponse.code === '000',
            customerName: elecContent.Customer_Name,
            meterType: elecContent.Meter_Type,
            address: elecContent.Address,
          };

        case 'education':
          // For JAMB, verify profile
          if (biller.serviceID === VtpassEducationServiceID.JAMB && itemId) {
            const jambVerifyResponse = await vtpassEducationService.verifyJambProfile(
              rechargeAccount,
              itemId
            );
            return {
              biller: biller.billerName,
              billerId: biller.billerId,
              valid: jambVerifyResponse.code === '000',
              customerName: jambVerifyResponse.content.Customer_Name,
            };
          }
          // For other education services, no verification needed
          return {
            biller: biller.billerName,
            billerId: biller.billerId,
            valid: true,
          };

        default:
          throw new Error(`Unsupported scene code: ${sceneCode}`);
      }
    } catch (error: any) {
      // If verification fails, return invalid
      if (error.message?.includes('INVALID') || error.response?.status === 400) {
        throw new Error('INVALID_RECHARGE_ACCOUNT: ' + (error.message || 'Invalid account'));
      }
      throw error;
    }
  }

  /**
   * Create Bill Payment Order
   */
  async createOrder(request: VtpassCreateBillOrderRequest): Promise<VtpassCreateBillOrderResponse> {
    const { sceneCode, serviceID, rechargeAccount, amount, phone, requestId, meterType, itemId } = request;

    let purchaseResponse: VtpassPurchaseResponse;

    switch (sceneCode) {
      case 'airtime':
        purchaseResponse = await vtpassAirtimeService.purchaseAirtime(
          serviceID as VtpassAirtimeServiceID,
          rechargeAccount,
          amount,
          requestId
        );
        break;

      case 'data':
        if (!itemId) {
          throw new Error('itemId (variation_code) is required for data purchase');
        }
        purchaseResponse = await vtpassDataService.purchaseData(
          serviceID as VtpassDataServiceID,
          rechargeAccount, // Phone number for data
          itemId, // Variation code
          phone,
          undefined, // amount (optional, determined by variation)
          requestId
        );
        break;

      case 'cable':
        if (!itemId) {
          throw new Error('itemId (variation_code) is required for cable purchase');
        }
        purchaseResponse = await vtpassCableService.purchaseSimple(
          serviceID as VtpassCableServiceID,
          rechargeAccount, // Smartcard number
          itemId, // Variation code
          phone,
          0, // Amount is determined by variation
          requestId
        );
        break;

      case 'electricity':
        if (!meterType) {
          throw new Error('meterType is required for electricity purchase');
        }
        purchaseResponse = await vtpassElectricityService.purchaseElectricity(
          serviceID as VtpassElectricityServiceID,
          rechargeAccount, // Meter number
          meterType,
          amount,
          phone,
          requestId
        );
        break;

      case 'education':
        if (!itemId) {
          throw new Error('itemId (variation_code) is required for education purchase');
        }
        // For JAMB, rechargeAccount is the profileId (billersCode)
        // For others, it's not used
        const isJamb = serviceID === VtpassEducationServiceID.JAMB;
        const profileId = isJamb ? rechargeAccount : undefined;
        
        const educationPurchaseResponse = await vtpassEducationService.purchaseEducation(
          serviceID as VtpassEducationServiceID,
          itemId, // Variation code
          phone,
          profileId, // Profile ID (required for JAMB)
          undefined, // quantity
          amount, // amount
          requestId
        );
        // Cast to VtpassPurchaseResponse since they have similar structure
        purchaseResponse = educationPurchaseResponse as any;
        break;

      default:
        throw new Error(`Unsupported scene code: ${sceneCode}`);
    }

    // Convert VTpass response to our format
    const status = purchaseResponse.content.transactions.status;
    const orderStatus = status === 'delivered' ? 2 : status === 'pending' ? 1 : 3;

    return {
      requestId: purchaseResponse.requestId,
      transactionId: purchaseResponse.content.transactions.transactionId,
      orderStatus,
      msg: purchaseResponse.response_description,
      amount: purchaseResponse.amount,
      transaction_date: purchaseResponse.transaction_date,
    };
  }

  /**
   * Query Order Status
   */
  async queryOrderStatus(requestId: string): Promise<VtpassQueryResponse> {
    // All VTpass services use the same query endpoint
    return await vtpassAirtimeService.queryTransactionStatus(requestId);
  }
}

export const vtpassBillPaymentService = new VtpassBillPaymentService();

