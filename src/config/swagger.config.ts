import swaggerJsdoc from 'swagger-jsdoc';
import type { SwaggerDefinition } from 'swagger-jsdoc';

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'TereScrow Backend API',
    version: '2.0.0',
    description: 'Complete API documentation for TereScrow Backend - Escrow platform for gift cards and crypto trading. V2 APIs include: Bank Accounts, Referrals, Wallet Transactions, Gift Cards, Bill Payments, Support Chat, KYC Management, and more.',
    contact: {
      name: 'API Support',
      email: 'support@tercescrow.io',
    },
  },
  tags: [
    // V2 API Routes - Top Priority (Bank Accounts, Referrals, Wallet Transactions)
    { name: 'V2 - Bank Accounts', description: 'Bank account management endpoints' },
    { name: 'V2 - Referrals', description: 'Referral code and statistics endpoints' },
    // V2 API Routes - Crypto (Grouped by Flow)
    { name: 'V2 - Crypto - Buy', description: 'Buy cryptocurrency flow: currencies → quote → preview → buy' },
    { name: 'V2 - Crypto - Sell', description: 'Sell cryptocurrency flow: currencies → quote → preview → sell' },
    { name: 'V2 - Crypto - Swap', description: 'Swap cryptocurrency flow: currencies → quote → preview → swap' },
    { name: 'V2 - Crypto - Assets', description: 'Crypto assets management: view assets, get details, deposit addresses' },
    { name: 'V2 - Crypto - Transactions', description: 'Crypto transaction history: list, details, asset transactions' },
    { name: 'V2 - Crypto - Wallets', description: 'User wallet management: export mnemonic, export private keys' },
    { name: 'V2 - Transactions', description: 'Transaction overview and chart data grouped by type' },
    { name: 'Admin - Crypto Rates', description: 'Crypto trade rate management (buy, sell, swap, send, receive)' },
    { name: 'Admin - Tatum', description: 'Tatum master wallet management' },
    { name: 'Webhooks', description: 'Webhook endpoints' },
    // V2 API Routes (Existing)
    { name: 'V2 - Gift Cards', description: 'Gift card management endpoints' },
    { name: 'V2 - PalmPay Deposit', description: 'PalmPay wallet deposit (top-up) endpoints' },
    { name: 'V2 - PalmPay Payout', description: 'PalmPay withdrawal (payout) endpoints' },
    { name: 'V2 - PalmPay Merchant Order', description: 'PalmPay merchant order creation with bank transfer endpoints' },
    { name: 'V2 - Fiat Wallet', description: 'Fiat wallet management endpoints' },
    { name: 'V2 - KYC Management', description: 'KYC tier verification endpoints' },
    { name: 'V2 - Bill Payments', description: 'Bill payment endpoints (Airtime, Data, Betting) using PalmPay' },
    { name: 'V2 - Support Chat', description: 'Support chat endpoints' },
    { name: 'V2 - PIN Management', description: 'PIN management endpoints' },
    { name: 'Testing - Gas Estimation', description: 'Gas fee estimation testing endpoints for Ethereum transactions' },
    // Admin Routes
    { name: 'Admin', description: 'Admin operations' },
    { name: 'Admin - Gift Cards', description: 'Admin gift card management' },
    { name: 'Admin Operations', description: 'Admin operations and management' },
    // Agent Routes
    { name: 'Agent Auth', description: 'Agent authentication endpoints' },
    { name: 'Agent Chat', description: 'Agent chat endpoints' },
    // Customer Routes
    { name: 'Customer Auth', description: 'Customer authentication endpoints' },
    { name: 'Customer Chat', description: 'Customer chat endpoints' },
    { name: 'Customer Utilities', description: 'Customer utility endpoints' },
    // Public Routes
    { name: 'Public', description: 'Public endpoints' },
  ],
  servers: [
    {
      url: 'http://localhost:8000',
      description: 'Development server',
    },
    {
      url: 'https://api.terescrow.com',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token obtained from login endpoint',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'token',
        description: 'JWT token stored in cookie',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string', format: 'email' },
          username: { type: 'string' },
          firstname: { type: 'string' },
          lastname: { type: 'string' },
          phoneNumber: { type: 'string' },
          country: { type: 'string' },
          profilePicture: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['admin', 'agent', 'customer', 'other'] },
          isVerified: { type: 'boolean' },
          pin: { type: 'string', maxLength: 4 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ApiResponse: {
        type: 'object',
        properties: {
          status: { type: 'integer' },
          data: { type: 'object' },
          message: { type: 'string' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          data: { type: 'object', nullable: true },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
    {
      cookieAuth: [],
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/**/*.ts', './src/controllers/**/*.ts'], // Paths to files containing OpenAPI definitions
};

export const swaggerSpec = swaggerJsdoc(options);

