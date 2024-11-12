import express, { NextFunction, Request, Response, urlencoded } from 'express';
import { app, httpServer } from './socketConfig';
import cors from 'cors';
import cookie from 'cookie-parser';
import authRouter from './routes/auth.router';
import messageRouter from './routes/message.router';
import ApiError from './utils/ApiError';

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
app.use(urlencoded({ extended: false }));
app.use(cookie());

//routes
app.use('/api/auth', authRouter);
app.use('/api', messageRouter);
app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

//error handler
app.use(
  (err: Error | ApiError, req: Request, res: Response, next: NextFunction) => {
    // console.log(err);
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

httpServer.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
