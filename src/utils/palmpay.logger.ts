/**
 * PalmPay Logger Utility
 * 
 * Dedicated logging service for PalmPay-related operations
 * Writes logs to a dedicated palmpay.log file
 */

import fs from 'fs';
import path from 'path';

class PalmPayLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'palmpay.log');

    // Ensure logs directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Format log entry with timestamp
   */
  private formatLogEntry(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data }),
    };
    return JSON.stringify(logEntry) + '\n';
  }

  /**
   * Write log entry to file
   */
  private writeLog(level: string, message: string, data?: any): void {
    try {
      const logEntry = this.formatLogEntry(level, message, data);
      fs.appendFileSync(this.logFile, logEntry, 'utf8');
    } catch (error) {
      // Fallback to console if file write fails
      console.error('Failed to write to palmpay.log:', error);
      console.log(`[${level}] ${message}`, data || '');
    }
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.writeLog('INFO', message, data);
    console.log(`[PALMPAY INFO] ${message}`, data || '');
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.writeLog('WARN', message, data);
    console.warn(`[PALMPAY WARN] ${message}`, data || '');
  }

  /**
   * Log error message
   */
  error(message: string, error?: any, data?: any): void {
    const errorData = {
      message: error?.message || message,
      stack: error?.stack,
      name: error?.name,
      ...(data && { context: data }),
    };
    this.writeLog('ERROR', message, errorData);
    console.error(`[PALMPAY ERROR] ${message}`, errorData);
  }

  /**
   * Log webhook received
   */
  webhookReceived(webhookData: any, headers?: any, ipAddress?: string): void {
    this.writeLog('WEBHOOK_RECEIVED', 'PalmPay webhook received', {
      webhookData,
      headers,
      ipAddress,
    });
    console.log('[PALMPAY WEBHOOK] Received webhook:', {
      orderNo: webhookData?.orderNo,
      orderStatus: webhookData?.orderStatus,
      outOrderNo: webhookData?.outOrderNo,
    });
  }

  /**
   * Log webhook processing
   */
  webhookProcessing(webhookData: any): void {
    this.writeLog('WEBHOOK_PROCESSING', 'Processing webhook', webhookData);
    console.log('[PALMPAY WEBHOOK] Processing:', {
      orderNo: webhookData?.orderNo,
      outOrderNo: webhookData?.outOrderNo,
    });
  }

  /**
   * Log webhook processed
   */
  webhookProcessed(result: any): void {
    this.writeLog('WEBHOOK_PROCESSED', 'Webhook processed successfully', result);
    console.log('[PALMPAY WEBHOOK] Processed:', result);
  }

  /**
   * Log bill payment operation
   */
  billPayment(operation: string, details: any): void {
    this.writeLog('BILL_PAYMENT', operation, details);
    console.log(`[PALMPAY BILL] ${operation}:`, details);
  }

  /**
   * Log wallet refund
   */
  refund(details: any): void {
    this.writeLog('REFUND', 'Wallet refund processed', details);
    console.log('[PALMPAY REFUND] Processed:', details);
  }

  /**
   * Log status check
   */
  statusCheck(details: any): void {
    this.writeLog('STATUS_CHECK', 'Bill payment status check', details);
    console.log('[PALMPAY STATUS] Check:', details);
  }

  /**
   * Log exception/error with full context
   */
  exception(operation: string, error: any, context?: any): void {
    const exceptionData = {
      operation,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      },
      context,
    };
    
    this.writeLog('EXCEPTION', `Exception in ${operation}`, exceptionData);
    console.error(`[PALMPAY EXCEPTION] ${operation}:`, exceptionData);
  }

  /**
   * Log API call to PalmPay
   */
  apiCall(endpoint: string, request?: any, response?: any, error?: any): void {
    const logData: any = {
      endpoint,
    };
    
    if (request) logData.request = request;
    if (response) logData.response = response;
    if (error) {
      logData.error = {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      };
    }

    const level = error ? 'ERROR' : 'INFO';
    this.writeLog(level, `API call to PalmPay ${endpoint}`, logData);
    
    if (error) {
      console.error(`[PALMPAY API ERROR] ${endpoint}:`, error);
    } else {
      console.log(`[PALMPAY API] ${endpoint}`);
    }
  }

  /**
   * Log transaction update
   */
  transactionUpdate(details: any): void {
    this.writeLog('TRANSACTION_UPDATE', 'Transaction updated', details);
    console.log('[PALMPAY TX] Updated:', details);
  }
}

// Export singleton instance
export const palmpayLogger = new PalmPayLogger();
export default palmpayLogger;

