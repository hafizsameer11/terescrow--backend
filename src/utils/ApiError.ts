enum HttpStatusCodes {
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  INTERNAL_SERVER_ERROR = 500,
}

class ApiError extends Error {
  status: number;
  data?: any;
  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.message = message;
    this.data = data;
    this.name = this.constructor.name;
  }

  //following all are static methods that return new instances of ApiError
  //so there is no need to create new instances in the controllers i.e., new ApiError(..) format
  static badRequest(message: string, data?: any) {
    return new ApiError(HttpStatusCodes.BAD_REQUEST, message, data);
  }

  static internal(message: string, data?: any) {
    return new ApiError(HttpStatusCodes.INTERNAL_SERVER_ERROR, message, data);
  }

  static unauthorized(message: string, data?: any) {
    return new ApiError(HttpStatusCodes.UNAUTHORIZED, message, data);
  }

  static forbidden(message: string, data?: any) {
    return new ApiError(HttpStatusCodes.FORBIDDEN, message, data);
  }
}

export default ApiError;
