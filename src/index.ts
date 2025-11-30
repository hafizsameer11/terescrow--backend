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
// V2 API Routes (New Routes - Top Priority)
// ============================================
import cryptoAssetRouter from './routes/cutomer/crypto.asset.router';
import cryptoRateRouter from './routes/admin/crypto.rate.router';
import masterWalletRouter from './routes/admin/master.wallet.router';
import tatumWebhookRouter from './routes/webhooks/tatum.webhook.router';

// ============================================
// V2 API Routes (Existing)
// ============================================
import giftCardRouter from './routes/cutomer/giftcard.router';
import palmpayDepositRouter from './routes/cutomer/palmpay.deposit.router';
import palmpayPayoutRouter from './routes/cutomer/palmpay.payout.router';
import fiatWalletRouter from './routes/cutomer/fiat.wallet.router';
import palmpayWebhookRouter from './routes/webhooks/palmpay.webhook.router';
import kycRouter from './routes/cutomer/kyc.router';
import billPaymentRouter from './routes/cutomer/billpayment.router';
import supportChatRouter from './routes/cutomer/support.chat.router';

// ============================================
// Admin Routes
// ============================================
import giftCardAdminRouter from './routes/admin/giftcard.admin.router';
import adminAuthRouter from './routes/admin/auth.router';
import adminChatRouter from './routes/admin/chat.router';
import operationsRouter from './routes/admin/operations.router';
import adminAgentRouter from './routes/admin.agent.router';

// ============================================
// Agent Routes
// ============================================
import agentChatRouter from './routes/agent/chat.router';
import agentOperationsRouter from './routes/agent/agent.operations.router';
import agentauthRouter from './routes/agent/auth.router';

// ============================================
// Customer Routes
// ============================================
import customerRouter from './routes/cutomer/chat.router';
import customerUtilityrouter from './routes/cutomer/utilities.router';

// ============================================
// Auth & Public Routes
// ============================================
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
// V2 API Routes (New Routes - Top Priority)
// ============================================
// Crypto Assets (User)
app.use('/api/v2/crypto', cryptoAssetRouter);

// Crypto Rates (Admin)
app.use('/api/admin/crypto', cryptoRateRouter);

// Master Wallet (Admin)
app.use('/api/admin/master-wallet', masterWalletRouter);

// Tatum Webhooks
app.use('/api/v2/webhooks/tatum', tatumWebhookRouter);

// ============================================
// V2 API Routes (Existing)
// ============================================
app.use('/api/v2/giftcards', giftCardRouter);
app.use('/api/v2/payments/palmpay/deposit', palmpayDepositRouter);
app.use('/api/v2/payments/palmpay', palmpayPayoutRouter);
app.use('/api/v2/wallets', fiatWalletRouter);
app.use('/api/v2/webhooks', palmpayWebhookRouter);
app.use('/api/v2/kyc', kycRouter);
app.use('/api/v2/bill-payments', billPaymentRouter);
app.use('/api/v2/support', supportChatRouter);

// ============================================
// Admin Routes
// ============================================
app.use('/api/admin/giftcards', giftCardAdminRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin', adminChatRouter);
app.use('/api/admin/operations', operationsRouter);
app.use('/api', adminAgentRouter);

// ============================================
// Agent Routes
// ============================================
app.use('/api/agent', agentChatRouter);
app.use('/api/agent/utilities', agentOperationsRouter);
app.use('/api/agent/auth', agentauthRouter);

// ============================================
// Customer Routes
// ============================================
app.use('/api/customer', customerRouter);
app.use('/api/customer/utilities', customerUtilityrouter);

// ============================================
// Auth & Public Routes
// ============================================
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/.well-known', express.static(path.join(__dirname, '../public/.well-known')));

// Swagger API Documentation - Custom tag sorter to put V2 routes first
const customTagsSorter = (a: string, b: string) => {
  // Priority order: V2 routes first, then Admin, then others
  const getPriority = (tag: string) => {
    if (tag.startsWith('V2 -')) return 0;
    if (tag.startsWith('Admin -')) return 1;
    if (tag.startsWith('Admin')) return 2;
    if (tag.startsWith('Agent')) return 3;
    if (tag.startsWith('Customer')) return 4;
    if (tag.startsWith('Public')) return 5;
    if (tag.startsWith('Webhooks')) return 0.5; // After V2 but before Admin
    return 10; // Others at the end
  };
  
  const priorityA = getPriority(a);
  const priorityB = getPriority(b);
  
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }
  
  // If same priority, sort alphabetically
  return a.localeCompare(b);
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TereScrow API Documentation',
  swaggerOptions: {
    tagsSorter: customTagsSorter as any,
    operationsSorter: 'alpha',
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
  res.send('Hello World!');
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
