/**
 * Tatum Logger Utility
 * 
 * Dedicated logging service for Tatum-related operations
 * Writes logs to a dedicated tatum.log file
 */

import fs from 'fs';
import path from 'path';

class TatumLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'tatum.log');

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
      console.error('Failed to write to tatum.log:', error);
      console.log(`[${level}] ${message}`, data || '');
    }
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.writeLog('INFO', message, data);
    console.log(`[TATUM INFO] ${message}`, data || '');
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.writeLog('WARN', message, data);
    console.warn(`[TATUM WARN] ${message}`, data || '');
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
    console.error(`[TATUM ERROR] ${message}`, errorData);
  }

  /**
   * Log webhook received
   */
  webhookReceived(webhookData: any, headers?: any, ipAddress?: string): void {
    this.writeLog('WEBHOOK_RECEIVED', 'Tatum webhook received', {
      webhookData,
      headers,
      ipAddress,
    });
    console.log('[TATUM WEBHOOK] Received webhook:', {
      accountId: webhookData?.accountId,
      reference: webhookData?.reference,
      txId: webhookData?.txId,
    });
  }

  /**
   * Log webhook processing
   */
  webhookProcessing(webhookData: any): void {
    this.writeLog('WEBHOOK_PROCESSING', 'Processing webhook', webhookData);
    console.log('[TATUM WEBHOOK] Processing:', {
      accountId: webhookData?.accountId,
      reference: webhookData?.reference,
    });
  }

  /**
   * Log webhook processed
   */
  webhookProcessed(result: any): void {
    this.writeLog('WEBHOOK_PROCESSED', 'Webhook processed successfully', result);
    console.log('[TATUM WEBHOOK] Processed:', result);
  }

  /**
   * Log virtual account operation
   */
  virtualAccount(operation: string, details: any): void {
    this.writeLog('VIRTUAL_ACCOUNT', operation, details);
    console.log(`[TATUM VA] ${operation}:`, details);
  }

  /**
   * Log balance update
   */
  balanceUpdate(accountId: string, balance: any, details?: any): void {
    this.writeLog('BALANCE_UPDATE', 'Balance updated', {
      accountId,
      balance,
      ...details,
    });
    console.log('[TATUM BALANCE] Updated:', { accountId, balance });
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
    console.error(`[TATUM EXCEPTION] ${operation}:`, exceptionData);
  }

  /**
   * Log API call to Tatum
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
    this.writeLog(level, `API call to Tatum ${endpoint}`, logData);
    
    if (error) {
      console.error(`[TATUM API ERROR] ${endpoint}:`, error);
    } else {
      console.log(`[TATUM API] ${endpoint}`);
    }
  }
}

// Export singleton instance
export const tatumLogger = new TatumLogger();
export default tatumLogger;

