export class CustomError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 404 Errors
export class ProductNotFoundException extends CustomError {
  constructor(productId: string) {
    super(`Product with id ${productId} not found`, 404);
  }
}

export class OrderNotFoundException extends CustomError {
  constructor(orderId: string) {
    super(`Order with id ${orderId} not found`, 404);
  }
}

// 400 Errors
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

export class MissingSessionIdException extends CustomError {
  constructor() {
    super('Missing session_id in query parameters', 400);
  }
}

// 409 Errors
export class InsufficientStockException extends CustomError {
  constructor(productName: string) {
    super(`Insufficient stock for product ${productName}`, 409);
  }
}

export class DuplicateProcessingException extends CustomError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class InvalidOrderStatusException extends CustomError {
  constructor(currentStatus: string) {
    super(`Order is not in PENDING status. Current status: ${currentStatus}`, 409);
  }
}

// 500 Errors
export class DatabaseException extends CustomError {
  constructor(operation: string, originalError?: Error) {
    super(
      `Database operation failed: ${operation}${originalError ? ` - ${originalError.message}` : ''}`,
      500
    );
  }
}

export class CheckoutSessionException extends CustomError {
  constructor(message: string) {
    super(`Checkout session error: ${message}`, 500);
  }
}

// Product-specific exceptions
export class ProductCreationException extends CustomError {
  constructor(productName: string, originalError?: Error) {
    super(
      `Failed to create product ${productName}${originalError ? `: ${originalError.message}` : ''}`,
      500
    );
  }
}

export class ProductUpdateException extends CustomError {
  constructor(productId: string, originalError?: Error) {
    super(
      `Failed to update product ${productId}${originalError ? `: ${originalError.message}` : ''}`,
      500
    );
  }
}