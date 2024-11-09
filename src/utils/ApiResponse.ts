import { Response } from 'express';

class ApiResponse {
  statusCode: 200 | 201 | 204;
  data: any;
  message: string;
  constructor(statusCode: 200 | 201 | 204, data: any, message = '') {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
  }

  send(res: Response) {
    res.status(this.statusCode).json({
      status: this.statusCode < 400 ? 'success' : 'error',
      message: this.message,
      data: this.data,
    });
  }
}

export default ApiResponse;
