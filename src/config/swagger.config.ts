import swaggerJsdoc from 'swagger-jsdoc';
import type { SwaggerDefinition } from 'swagger-jsdoc';

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'TereScrow Backend API',
    version: '2.0.0',
    description: 'Complete API documentation for TereScrow Backend - Escrow platform for gift cards and crypto trading. V2 APIs include: Gift Cards, PIN Management',
    contact: {
      name: 'API Support',
      email: 'support@tercescrow.io',
    },
  },
  tags: [
    // V2 API Routes (New - Top Priority)
    { name: 'V2 - Crypto Assets', description: 'Crypto asset management endpoints' },
    { name: 'V2 - Crypto Transactions', description: 'Crypto transaction endpoints (buy, sell, send, receive)' },
    { name: 'Admin - Crypto Rates', description: 'Crypto trade rate management (buy, sell, swap, send, receive)' },
    { name: 'Admin - Tatum', description: 'Tatum master wallet management' },
    { name: 'Webhooks', description: 'Webhook endpoints' },
    // V2 API Routes (Existing)
    { name: 'V2 - Gift Cards', description: 'Gift card management endpoints' },
    { name: 'V2 - PalmPay Deposit', description: 'PalmPay wallet deposit (top-up) endpoints' },
    { name: 'V2 - PalmPay Payout', description: 'PalmPay withdrawal (payout) endpoints' },
    { name: 'V2 - Fiat Wallet', description: 'Fiat wallet management endpoints' },
    { name: 'V2 - KYC Management', description: 'KYC tier verification endpoints' },
    { name: 'V2 - Bill Payments', description: 'Bill payment endpoints (Airtime, Data, Betting) using PalmPay' },
    { name: 'V2 - Support Chat', description: 'Support chat endpoints' },
    { name: 'V2 - PIN Management', description: 'PIN management endpoints' },
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

