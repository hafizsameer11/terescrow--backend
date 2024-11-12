import { Response } from 'express';

class ApiResponse {
  statusCode: 200 | 201 | 204;
  data: any;
  message: string;
  token?: string;
  constructor(
    statusCode: 200 | 201 | 204,
    data: any,
    message = '',
    token?: string
  ) {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    token && (this.token = token);
  }

  send(res: Response) {
    res.status(this.statusCode).json({
      status: this.statusCode < 400 ? 'success' : 'error',
      message: this.message,
      data: this.data,
      token: this.token,
    });
  }
}

export default ApiResponse;
