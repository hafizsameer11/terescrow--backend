import express, { Request, Response, urlencoded } from 'express';
import { app, httpServer } from './socketConfig';
import cors from 'cors';
import cookie from 'cookie-parser';
import authRouter from './routes/auth.router';
const port: number = 3000;

//middlewares
app.use(express.json());
app.use(urlencoded({ extended: false }));
app.use(
  cors({
    methods: ['GET', 'POST'],
    origin: '*',
    credentials: true,
  })
);
app.use(cookie());

//routes
app.use('/auth', authRouter);
app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

httpServer.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
