import express, { Request, Response, urlencoded } from 'express';
import { app, httpServer } from './socketConfig';
import cors from 'cors';
import cookie from 'cookie-parser';
import authRouter from './routes/auth.router';
import messageRouter from './routes/message.router';

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

httpServer.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
