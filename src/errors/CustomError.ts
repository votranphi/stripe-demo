export class CustomError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 Errors
export class MissingStripeCustomerException extends CustomError {
  constructor() {
    super('User does not have a Stripe customer ID. Please complete a purchase first.', 400);
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

export class InvalidProductTypeException extends CustomError {
  constructor() {
    super('Subscription products cannot be added to the shopping cart. Please use the subscription checkout flow.', 400);
  }
}

// 401 Errors
export class UnauthorizedException extends CustomError {
  constructor() {
    super('Authentication required. Please provide a valid token', 401);
  }
}

export class InvalidCredentialsException extends CustomError {
  constructor() {
    super('Invalid email or password', 401);
  }
}

export class InvalidTokenException extends CustomError {
  constructor() {
    super('Invalid or expired token', 401);
  }
}

// 403 Errors
export class ForbiddenException extends CustomError {
  constructor() {
    super('Access denied. Insufficient permissions', 403);
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

export class DraftOrderNotFoundException extends CustomError {
  constructor(userId: string) {
    super(`Draft order not found for user ${userId}`, 404);
  }
}

export class SubscriptionPlanNotFoundException extends CustomError {
  constructor(planId: string) {
    super(`Subscription plan with id ${planId} not found`, 404);
  }
}

export class UserSubscriptionNotFoundException extends CustomError {
  constructor(subscriptionId: string) {
    super(`Subscription with id ${subscriptionId} not found`, 404);
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

export class ItemNotInDraftException extends CustomError {
  constructor(productId: string) {
    super(`Product ${productId} is not in the draft order`, 409);
  }
}

export class EmptyDraftException extends CustomError {
  constructor() {
    super('Cannot checkout with an empty cart', 409);
  }
}

export class UserAlreadyExistsException extends CustomError {
  constructor(email: string) {
    super(`User with email ${email} already exists`, 409);
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

export class StripeRefundException extends CustomError {
  constructor(orderId: string, originalError?: Error) {
    super(
      `Failed to refund payment for order ${orderId}${originalError ? `: ${originalError.message}` : ''}`,
      500
    );
  }
}

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

export class JWTSecretMissingException extends CustomError {
  constructor() {
    super('JWT_SECRET environment variable is not configured', 500);
  }
}

export class SubscriptionCancellationException extends CustomError {
  constructor(message: string) {
    super(`Subscription cancellation error: ${message}`, 500);
  }
}

export class BillingPortalException extends CustomError {
  constructor(message: string) {
    super(`Billing portal error: ${message}`, 500);
  }
}