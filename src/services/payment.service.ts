import Stripe from 'stripe';
import stripe from '../config/stripe.js';
import { OrderLineItem } from '../models/order.model.js';
import { UserModel } from '../models/user.model.js';
import {
  CheckoutSessionException,
  StripeRefundException,
  WebhookSignatureException,
  DatabaseException
} from '../errors/CustomError.js';

export class PaymentService {
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = stripe;
  }

  // Creates a Stripe checkout session for the given order
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

  // Retrieves a checkout session from Stripe
  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      throw new CheckoutSessionException(
        error instanceof Error ? error.message : 'Failed to retrieve session'
      );
    }
  }

  // Creates a refund for a payment intent
  async createRefund(paymentIntentId: string, orderId: string): Promise<void> {
    try {
      await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
    } catch (error) {
      throw new StripeRefundException(orderId, error instanceof Error ? error : undefined);
    }
  }

  // Verifies a Stripe webhook signature and constructs the event
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

  // Gets or creates a Stripe customer for a user
  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    try {
      // Check if user already has a Stripe customer ID
      const user = await UserModel.findOne({ id: userId });
      if (!user) {
        throw new DatabaseException('User not found');
      }

      if (user.stripeCustomerId) {
        return user.stripeCustomerId;
      }

      // Create new customer in Stripe
      const customer = await this.stripe.customers.create({
        email: email,
        metadata: {
          user_id: userId
        }
      });

      // Save customer ID to user document
      await UserModel.findOneAndUpdate(
        { id: userId },
        { $set: { stripeCustomerId: customer.id } }
      );

      return customer.id;
    } catch (error) {
      if (error instanceof DatabaseException) {
        throw error;
      }
      throw new CheckoutSessionException(
        error instanceof Error ? error.message : 'Failed to get or create customer'
      );
    }
  }

  // Creates a Stripe checkout session for a subscription
  async createSubscriptionCheckoutSession(
    customerId: string,
    priceId: string,
    userId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; url: string }> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
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
        error instanceof Error ? error.message : 'Failed to create subscription checkout session'
      );
    }
  }

  // Builds Stripe line items from order line items
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
