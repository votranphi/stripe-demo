export class CustomError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ProductNotFoundException extends CustomError {
  constructor(productId: string) {
    super(`Product with id ${productId} not found`, 404);
  }
}

export class InsufficientStockException extends CustomError {
  constructor(productName: string) {
    super(`Insufficient stock for product ${productName}`, 409);
  }
}

export class OrderNotFoundException extends CustomError {
  constructor(orderId: string) {
    super(`Order with id ${orderId} not found`, 404);
  }
}

export class ValidationException extends CustomError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class WebhookSignatureException extends CustomError {
  constructor() {
    super('Webhook signature verification failed', 400);
  }
}

export class DuplicateProcessingException extends CustomError {
  constructor(message: string) {
    super(message, 409);
  }
}
