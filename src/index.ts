import express, { NextFunction, Request, Response, urlencoded } from 'express';
import { app, httpServer } from './socketConfig';
import cors from 'cors';
import cookie from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.config';
import path from 'path';
import ApiError from './utils/ApiError';
import upload from './middlewares/multer.middleware';

// ============================================
// V2 API Routes - Crypto (Grouped by Action)
// ============================================
// Buy Crypto Flow
import cryptoBuyRouter from './routes/cutomer/crypto.buy.router';

// Sell Crypto Flow
import cryptoSellRouter from './routes/cutomer/crypto.sell.router';

// Crypto Assets Flow
import cryptoAssetRouter from './routes/cutomer/crypto.asset.router';

// Crypto Transactions Flow
import cryptoTransactionRouter from './routes/cutomer/crypto.transaction.router';

// User Wallets Flow
import userWalletRouter from './routes/cutomer/user.wallet.router';

// ============================================
// V2 API Routes - Other Services
// ============================================
import giftCardRouter from './routes/cutomer/giftcard.router';
import palmpayDepositRouter from './routes/cutomer/palmpay.deposit.router';
import palmpayPayoutRouter from './routes/cutomer/palmpay.payout.router';
import fiatWalletRouter from './routes/cutomer/fiat.wallet.router';
import kycRouter from './routes/cutomer/kyc.router';
import billPaymentRouter from './routes/cutomer/billpayment.router';
import supportChatRouter from './routes/cutomer/support.chat.router';

// ============================================
// V2 API Routes - Webhooks
// ============================================
import tatumWebhookRouter from './routes/webhooks/tatum.webhook.router';
import palmpayWebhookRouter from './routes/webhooks/palmpay.webhook.router';

// ============================================
// V2 API Routes - Admin (Crypto)
// ============================================
import cryptoRateRouter from './routes/admin/crypto.rate.router';
import masterWalletRouter from './routes/admin/master.wallet.router';

// ============================================
// V1 API Routes (Legacy - if any)
// ============================================
// Note: Currently no V1 routes, all routes are V2 or legacy without version

// ============================================
// Legacy Routes (No Version Prefix)
// ============================================
// Admin Routes
import giftCardAdminRouter from './routes/admin/giftcard.admin.router';
import adminAuthRouter from './routes/admin/auth.router';
import adminChatRouter from './routes/admin/chat.router';
import operationsRouter from './routes/admin/operations.router';
import adminAgentRouter from './routes/admin.agent.router';

// Agent Routes
import agentChatRouter from './routes/agent/chat.router';
import agentOperationsRouter from './routes/agent/agent.operations.router';
import agentauthRouter from './routes/agent/auth.router';

// Customer Routes (Legacy)
import customerRouter from './routes/cutomer/chat.router';
import customerUtilityrouter from './routes/cutomer/utilities.router';

// Auth & Public Routes
import authRouter from './routes/cutomer/auth.router';
import publicRouter from './routes/public.router';
const bodyParser = require('body-parser')

const port = process.env.PORT || 5000;

//middlewares
app.use(
  cors({
    methods: ['GET', 'POST'],
    origin: '*',
    credentials: false,
  })
);
app.use(express.json());
app.use(urlencoded({ extended: true }));
app.use(cookie());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================
// Middleware
// ============================================
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

// ============================================
// V2 API Routes - Crypto (Grouped by Action)
// ============================================

// ────────────────────────────────────────────
// Buy Crypto Flow
// ────────────────────────────────────────────
// GET  /api/v2/crypto/buy/currencies  - Get available currencies
// POST /api/v2/crypto/buy/quote       - Calculate quote (crypto → NGN)
// POST /api/v2/crypto/buy/preview     - Preview transaction
// POST /api/v2/crypto/buy              - Execute purchase
app.use('/api/v2/crypto', cryptoBuyRouter);

// ────────────────────────────────────────────
// Sell Crypto Flow
// ────────────────────────────────────────────
// GET  /api/v2/crypto/sell/currencies - Get available currencies (with balance)
// POST /api/v2/crypto/sell/quote      - Calculate quote (crypto → NGN)
// POST /api/v2/crypto/sell/preview     - Preview transaction
// POST /api/v2/crypto/sell             - Execute sale
app.use('/api/v2/crypto', cryptoSellRouter);

// ────────────────────────────────────────────
// Crypto Assets Flow
// ────────────────────────────────────────────
// GET /api/v2/crypto/assets                    - Get all user assets
// GET /api/v2/crypto/assets/:id                - Get asset detail
// GET /api/v2/crypto/receive/:accountId        - Get deposit address (by account)
// GET /api/v2/crypto/deposit-address/:currency/:blockchain - Get deposit address
app.use('/api/v2/crypto', cryptoAssetRouter);

// ────────────────────────────────────────────
// Crypto Transactions Flow
// ────────────────────────────────────────────
// GET /api/v2/crypto/transactions                    - Get all transactions
// GET /api/v2/crypto/transactions/:transactionId     - Get transaction detail
// GET /api/v2/crypto/assets/:virtualAccountId/transactions - Get asset transactions
app.use('/api/v2/crypto', cryptoTransactionRouter);

// ────────────────────────────────────────────
// User Wallets Flow
// ────────────────────────────────────────────
// GET  /api/v2/crypto/wallets           - Get all user wallets
// POST /api/v2/crypto/wallets/export    - Export mnemonic
// POST /api/v2/crypto/wallets/export-key - Export private key
app.use('/api/v2/crypto', userWalletRouter);

// ============================================
// V2 API Routes - Other Services
// ============================================
app.use('/api/v2/giftcards', giftCardRouter);
app.use('/api/v2/payments/palmpay/deposit', palmpayDepositRouter);
app.use('/api/v2/payments/palmpay', palmpayPayoutRouter);
app.use('/api/v2/wallets', fiatWalletRouter);
app.use('/api/v2/kyc', kycRouter);
app.use('/api/v2/bill-payments', billPaymentRouter);
app.use('/api/v2/support', supportChatRouter);

// ============================================
// V2 API Routes - Webhooks
// ============================================
app.use('/api/v2/webhooks/tatum', tatumWebhookRouter);
app.use('/api/v2/webhooks', palmpayWebhookRouter);

// ============================================
// V2 API Routes - Admin (Crypto)
// ============================================
app.use('/api/admin/crypto', cryptoRateRouter);
app.use('/api/admin/master-wallet', masterWalletRouter);

// ============================================
// V1 API Routes (Legacy - if any)
// ============================================
// Currently no V1 routes

// ============================================
// Legacy Routes (No Version Prefix)
// ============================================
// Admin Routes
app.use('/api/admin/giftcards', giftCardAdminRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin', adminChatRouter);
app.use('/api/admin/operations', operationsRouter);
app.use('/api', adminAgentRouter);

// Agent Routes
app.use('/api/agent', agentChatRouter);
app.use('/api/agent/utilities', agentOperationsRouter);
app.use('/api/agent/auth', agentauthRouter);

// Customer Routes (Legacy)
app.use('/api/customer', customerRouter);
app.use('/api/customer/utilities', customerUtilityrouter);

// Auth & Public Routes
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/.well-known', express.static(path.join(__dirname, '../public/.well-known')));

// Swagger API Documentation - Custom tag sorter to put V2 routes first
const customTagsSorter = (a: string, b: string) => {
  // Priority order: V2 routes first, then Admin, then others
  const getPriority = (tag: string) => {
    // V2 Crypto flows in specific order
    if (tag === 'V2 - Crypto - Buy') return 0;
    if (tag === 'V2 - Crypto - Sell') return 1;
    if (tag === 'V2 - Crypto - Assets') return 2;
    if (tag === 'V2 - Crypto - Transactions') return 3;
    if (tag === 'V2 - Crypto - Wallets') return 4;
    if (tag.startsWith('V2 -')) return 5;
    if (tag.startsWith('Admin -')) return 6;
    if (tag.startsWith('Admin')) return 7;
    if (tag.startsWith('Agent')) return 8;
    if (tag.startsWith('Customer')) return 9;
    if (tag.startsWith('Public')) return 10;
    if (tag.startsWith('Webhooks')) return 5.5; // After V2 but before Admin
    return 20; // Others at the end
  };
  
  const priorityA = getPriority(a);
  const priorityB = getPriority(b);
  
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }
  
  // If same priority, sort alphabetically
  return a.localeCompare(b);
};

// Custom operations sorter to maintain flow order within each tag
const customOperationsSorter = (a: any, b: any) => {
  const pathA = a.get('path') || '';
  const pathB = b.get('path') || '';
  const methodA = a.get('method') || '';
  const methodB = b.get('method') || '';
  const tagA = a.get('tags')?.[0] || '';
  const tagB = b.get('tags')?.[0] || '';
  // Try to get x-order from the operation object
  const orderA = (a.get && a.get('x-order')) || (a.getIn && a.getIn(['x-order'])) || null;
  const orderB = (b.get && b.get('x-order')) || (b.getIn && b.getIn(['x-order'])) || null;

  // If both have x-order, use that
  if (orderA !== null && orderB !== null) {
    return orderA - orderB;
  }

  // Only apply custom sorting for V2 Crypto tags
  if (tagA.startsWith('V2 - Crypto -') && tagB.startsWith('V2 - Crypto -') && tagA === tagB) {
    // If x-order is available, use it (highest priority)
    if (orderA !== null && orderB !== null) {
      return orderA - orderB;
    }
    
    // Buy Crypto Flow
    if (tagA === 'V2 - Crypto - Buy') {
      const order: Record<string, number> = { '/buy/currencies': 1, '/buy/quote': 2, '/buy/preview': 3, '/buy': 4 };
      const keyA = Object.keys(order).find(k => pathA.includes(k));
      const keyB = Object.keys(order).find(k => pathB.includes(k));
      const orderA = keyA && keyA in order ? order[keyA] : 10;
      const orderB = keyB && keyB in order ? order[keyB] : 10;
      if (orderA !== orderB) return orderA - orderB;
    }
    // Sell Crypto Flow
    if (tagA === 'V2 - Crypto - Sell') {
      const order: Record<string, number> = { '/sell/currencies': 1, '/sell/quote': 2, '/sell/preview': 3, '/sell': 4 };
      const keyA = Object.keys(order).find(k => pathA.includes(k));
      const keyB = Object.keys(order).find(k => pathB.includes(k));
      const orderA = keyA && keyA in order ? order[keyA] : 10;
      const orderB = keyB && keyB in order ? order[keyB] : 10;
      if (orderA !== orderB) return orderA - orderB;
    }
    // Assets Flow
    if (tagA === 'V2 - Crypto - Assets') {
      const order = { '/assets': 1, '/assets/': 2, '/deposit-address/': 3, '/receive/': 4 };
      const getOrder = (path: string) => {
        if (path.includes('/assets') && !path.includes('/transactions') && !path.includes('/receive') && !path.includes('/deposit-address')) {
          return path.includes('/assets/') && path.match(/\/assets\/\d+$/) ? 2 : 1;
        }
        if (path.includes('/deposit-address/')) return 3;
        if (path.includes('/receive/')) return 4;
        return 10;
      };
      const orderA = getOrder(pathA);
      const orderB = getOrder(pathB);
      if (orderA !== orderB) return orderA - orderB;
    }
    // Transactions Flow
    if (tagA === 'V2 - Crypto - Transactions') {
      const order = { '/transactions': 1, '/transactions/': 2, '/assets/': 3 };
      const getOrder = (path: string) => {
        if (path.includes('/transactions') && !path.includes('/assets/')) {
          return path.match(/\/transactions\/[^/]+$/) ? 2 : 1;
        }
        if (path.includes('/assets/') && path.includes('/transactions')) return 3;
        return 10;
      };
      const orderA = getOrder(pathA);
      const orderB = getOrder(pathB);
      if (orderA !== orderB) return orderA - orderB;
    }
    // Wallets Flow
    if (tagA === 'V2 - Crypto - Wallets') {
      const order = { '/wallets': 1, '/wallets/export': 2, '/wallets/export-key': 3 };
      const getOrder = (path: string) => {
        if (path.includes('/wallets/export-key')) return 3;
        if (path.includes('/wallets/export') && !path.includes('/export-key')) return 2;
        if (path.includes('/wallets') && !path.includes('/export')) return 1;
        return 10;
      };
      const orderA = getOrder(pathA);
      const orderB = getOrder(pathB);
      if (orderA !== orderB) return orderA - orderB;
    }
  }

  // PalmPay Payout Flow
  if (tagA === 'V2 - PalmPay Payout' && tagB === 'V2 - PalmPay Payout') {
    const getPayoutOrder = (path: string) => {
      if (path.includes('/banks')) return 1;
      if (path.includes('/verify-account')) return 2;
      if (path.includes('/payout/initiate')) return 3;
      if (path.includes('/payout/') && !path.includes('/payout/initiate')) return 4; // /payout/:transactionId
      return 10;
    };
    const orderA = getPayoutOrder(pathA);
    const orderB = getPayoutOrder(pathB);
    if (orderA !== orderB) return orderA - orderB;
  }

  // Default: method first (GET before POST), then alphabetical
  if (methodA !== methodB) {
    const methodOrder: { [key: string]: number } = { 'get': 1, 'post': 2, 'put': 3, 'delete': 4 };
    return (methodOrder[methodA.toLowerCase()] || 10) - (methodOrder[methodB.toLowerCase()] || 10);
  }
  return pathA.localeCompare(pathB);
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TereScrow API Documentation',
  swaggerOptions: {
    tagsSorter: customTagsSorter as any,
    operationsSorter: customOperationsSorter as any,
    docExpansion: 'list',
  },
}));

app.post('/api/file', upload.single('file'), (req: Request, res: Response) => {
  if (req?.file) {
    return res.status(201).json({
      message: 'File uploaded successfully',
      fileUrl: `http://localhost:8000/uploads/${req.file.filename}`,
    });
  }
});

//error handler
app.use(
  (err: Error | ApiError, req: Request, res: Response, next: NextFunction) => {
    console.log(err);
    if (err instanceof ApiError) {
      return res.status(err.status).json({
        message: err.message,
        data: err.data,
      });
    }
    return res.status(500).json({
      message: 'Internal server error occured',
    });
  }
);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World! testung');
});
app.get('/', (req: Request, res: Response) => {
  res.send('Hello kali mata adssad');
});
httpServer.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

app.get('/.well-known/pki-validation/47895BDD2089A962BA5A725A31134A7C.txt', (req, res) => {
  const filePath = path.join(__dirname, '../uploads/47895BDD2089A962BA5A725A31134A7C.txt');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('File not found:', err);
      res.status(404).send('File not found');
    }
  });
});
