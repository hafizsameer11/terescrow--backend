import express, { NextFunction, Request, Response, urlencoded } from 'express';
import { app, httpServer } from './socketConfig';
import cors from 'cors';
import cookie from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.config';
import authRouter from './routes/cutomer/auth.router';
// import messageRouter from './routes/message.router';
import path from 'path';
import ApiError from './utils/ApiError';
import customerRouter from './routes/cutomer/chat.router';
import publicRouter from './routes/public.router';
import agentChatRouter from './routes/agent/chat.router';
import upload from './middlewares/multer.middleware';
// import operationsRouter from './routes/admin/operations.router';
// import adminAgentRouter from './routes/admin.agent.router';
// import agentOperationsRouter from './routes/agent/agent.operations.router';
// import adminAuthRouter from './routes/admin/auth.router';
// import customerUtilityrouter from './routes/cutomer/utilities.router';
import adminChatRouter from './routes/admin/chat.router';
// const bodyParser = require('body-parser');
import operationsRouter from './routes/admin/operations.router';
import adminAgentRouter from './routes/admin.agent.router';
import agentOperationsRouter from './routes/agent/agent.operations.router';
import adminAuthRouter from './routes/admin/auth.router';
import customerUtilityrouter from './routes/cutomer/utilities.router';
import agentauthRouter from './routes/agent/auth.router';
import giftCardRouter from './routes/cutomer/giftcard.router';
import giftCardAdminRouter from './routes/admin/giftcard.admin.router';
import palmpayDepositRouter from './routes/cutomer/palmpay.deposit.router';
import palmpayPayoutRouter from './routes/cutomer/palmpay.payout.router';
import fiatWalletRouter from './routes/cutomer/fiat.wallet.router';
import palmpayWebhookRouter from './routes/webhooks/palmpay.webhook.router';
import kycRouter from './routes/cutomer/kyc.router';
import billPaymentRouter from './routes/cutomer/billpayment.router';
import supportChatRouter from './routes/cutomer/support.chat.router';
import virtualAccountRouter from './routes/cutomer/virtual.account.router';
import masterWalletRouter from './routes/admin/master.wallet.router';
import tatumWebhookRouter from './routes/webhooks/tatum.webhook.router';
const bodyParser = require('body-parser')

const port = process.env.PORT || 8000;

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

//routes
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
app.use(bodyParser.json({ limit: '5mb' }))
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }))
app.use('/api/auth', authRouter);
app.use('/api/customer', customerRouter);
app.use('/api/customer/utilities', customerUtilityrouter);
app.use('/api/customer/utilities', customerUtilityrouter);
app.use('/api/agent', agentChatRouter);
app.use('/api/agent/utilities', agentOperationsRouter);
app.use('/api/agent', agentOperationsRouter);
app.use('/api/agent/auth',agentauthRouter);
app.use('/api/public', publicRouter);
app.use('/api', adminAgentRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin', adminChatRouter);
app.use('/api/admin/operations', operationsRouter);
app.use('/api', adminAgentRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin', adminChatRouter);
app.use('/api/admin/operations', operationsRouter);
app.use('/api/v2/giftcards', giftCardRouter);
app.use('/api/admin/giftcards', giftCardAdminRouter);
app.use('/api/v2/payments/palmpay/deposit', palmpayDepositRouter);
app.use('/api/v2/payments/palmpay', palmpayPayoutRouter);
app.use('/api/v2/wallets', fiatWalletRouter);
app.use('/api/v2/webhooks', palmpayWebhookRouter);
app.use('/api/v2/kyc', kycRouter);
app.use('/api/v2/bill-payments', billPaymentRouter);
app.use('/api/v2/support', supportChatRouter);
app.use('/api/v2/wallets', virtualAccountRouter);
app.use('/api/admin/master-wallet', masterWalletRouter);
app.use('/api/v2/webhooks/tatum', tatumWebhookRouter);
app.use('/.well-known', express.static(path.join(__dirname, '../public/.well-known')));

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TereScrow API Documentation',
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
