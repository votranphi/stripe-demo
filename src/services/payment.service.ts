import Stripe from 'stripe';
import stripe from '../config/stripe.js';
import { OrderLineItem } from '../models/order.model.js';
import {
  CheckoutSessionException,
  StripeRefundException,
  WebhookSignatureException
} from '../errors/CustomError.js';

/**
 * PaymentService handles all Stripe-specific payment operations.
 * This service encapsulates payment gateway interactions, providing a clean
 * abstraction layer between the business logic and Stripe SDK.
 */
export class PaymentService {
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = stripe;
  }

  /**
   * Creates a Stripe checkout session for the given order
   * @param lineItems - Array of order line items
   * @param orderId - The order ID to include in metadata
   * @param userId - The user ID to include in metadata
   * @param successUrl - URL to redirect after successful payment
   * @param cancelUrl - URL to redirect after cancelled payment
   * @returns The checkout session with URL
   */
  async createCheckoutSession(
    lineItems: OrderLineItem[],
    orderId: string,
    userId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; url: string }> {
    try {
      const stripeLineItems = this.buildStripeLineItems(lineItems);

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: stripeLineItems,
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          order_id: orderId,
          user_id: userId
        }
      });

      if (!session.url) {
        throw new CheckoutSessionException('Stripe session URL is null');
      }

      return {
        sessionId: session.id,
        url: session.url
      };
    } catch (error) {
      if (error instanceof CheckoutSessionException) {
        throw error;
      }
      throw new CheckoutSessionException(
        error instanceof Error ? error.message : 'Failed to create checkout session'
      );
    }
  }

  /**
   * Retrieves a checkout session from Stripe
   * @param sessionId - The Stripe session ID
   * @returns The checkout session
   */
  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      throw new CheckoutSessionException(
        error instanceof Error ? error.message : 'Failed to retrieve session'
      );
    }
  }

  /**
   * Creates a refund for a payment intent
   * @param paymentIntentId - The Stripe payment intent ID
   * @param orderId - The order ID for error reporting
   */
  async createRefund(paymentIntentId: string, orderId: string): Promise<void> {
    try {
      await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
    } catch (error) {
      throw new StripeRefundException(orderId, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Verifies a Stripe webhook signature and constructs the event
   * @param payload - The raw request body
   * @param signature - The Stripe signature header
   * @param webhookSecret - The webhook secret from environment
   * @returns The verified Stripe event
   */
  verifyWebhookSignature(
    payload: Buffer,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw new WebhookSignatureException();
    }
  }

  /**
   * Builds Stripe line items from order line items
   * @param lineItems - Array of order line items
   * @returns Array of Stripe line items
   */
  private buildStripeLineItems(lineItems: OrderLineItem[]): Stripe.Checkout.SessionCreateParams.LineItem[] {
    return lineItems.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name
        },
        unit_amount: item.price
      },
      quantity: item.quantity
    }));
  }
}
