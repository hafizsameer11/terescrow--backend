/**
 * Crypto Logger Utility
 * 
 * Dedicated logging service for crypto-related operations
 * Writes logs to a dedicated crypto.log file
 */

import fs from 'fs';
import path from 'path';

class CryptoLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'crypto.log');

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
      console.error('Failed to write to crypto.log:', error);
      console.log(`[${level}] ${message}`, data || '');
    }
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.writeLog('INFO', message, data);
    console.log(`[CRYPTO INFO] ${message}`, data || '');
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.writeLog('WARN', message, data);
    console.warn(`[CRYPTO WARN] ${message}`, data || '');
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
    console.error(`[CRYPTO ERROR] ${message}`, errorData);
  }

  /**
   * Log transaction details
   */
  transaction(type: string, details: any): void {
    this.writeLog('TRANSACTION', `${type} transaction`, details);
    console.log(`[CRYPTO TRANSACTION] ${type}:`, details);
  }

  /**
   * Log balance check
   */
  balanceCheck(address: string, balance: string, currency: string, additionalInfo?: any): void {
    this.writeLog('BALANCE_CHECK', `Balance check for ${address}`, {
      address,
      balance,
      currency,
      ...additionalInfo,
    });
  }

  /**
   * Log gas fee estimation
   */
  gasEstimate(details: any): void {
    this.writeLog('GAS_ESTIMATE', 'Gas fee estimation', details);
    console.log('[CRYPTO GAS] Gas estimate:', details);
  }

  /**
   * Log blockchain transfer
   */
  transfer(direction: string, details: any): void {
    this.writeLog('TRANSFER', `${direction} transfer`, details);
    console.log(`[CRYPTO TRANSFER] ${direction}:`, details);
  }

  /**
   * Log master wallet operation
   */
  masterWallet(operation: string, details: any): void {
    this.writeLog('MASTER_WALLET', operation, details);
    console.log(`[CRYPTO MASTER WALLET] ${operation}:`, details);
  }

  /**
   * Log API call to external service (Tatum, etc.)
   */
  apiCall(service: string, endpoint: string, request?: any, response?: any, error?: any): void {
    const logData: any = {
      service,
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
    this.writeLog(level, `API call to ${service}`, logData);
    
    if (error) {
      console.error(`[CRYPTO API ERROR] ${service} ${endpoint}:`, error);
    } else {
      console.log(`[CRYPTO API] ${service} ${endpoint}`);
    }
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
    console.error(`[CRYPTO EXCEPTION] ${operation}:`, exceptionData);
  }
}

// Export singleton instance
export const cryptoLogger = new CryptoLogger();
export default cryptoLogger;

