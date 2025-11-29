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

