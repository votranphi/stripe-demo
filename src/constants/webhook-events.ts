export const WebhookEvents = {
  // Checkout Session Events
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
  CHECKOUT_SESSION_EXPIRED: 'checkout.session.expired',
  
  // Charge Events
  CHARGE_REFUNDED: 'charge.refunded',
  
  // Subscription Events
  CUSTOMER_SUBSCRIPTION_CREATED: 'customer.subscription.created',
  CUSTOMER_SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  
  // Invoice Events
  INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
} as const;

// Type for webhook event values
export type WebhookEventType = typeof WebhookEvents[keyof typeof WebhookEvents];
