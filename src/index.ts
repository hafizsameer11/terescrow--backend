import express, { NextFunction, Request, Response, urlencoded } from 'express';
import { app, httpServer } from './socketConfig';
import cors from 'cors';
import cookie from 'cookie-parser';
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
app.use('/api/public', publicRouter);
app.use('/api', adminAgentRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin', adminChatRouter);
app.use('/api/admin/operations', operationsRouter);
app.use('/api', adminAgentRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin', adminChatRouter);
app.use('/api/admin/operations', operationsRouter);
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
