import Stripe from 'stripe';
import stripe from '../config/stripe.js';
import { OrderLineItem } from '../models/order.model.js';
import { UserService } from './user.service.js';
import {
  CheckoutSessionException,
  StripeRefundException,
  WebhookSignatureException,
  DatabaseException,
  BillingPortalException,
  SubscriptionCancellationException
} from '../errors/CustomError.js';

export class PaymentService {
  private readonly stripe: Stripe;
  private readonly userService: UserService;

  constructor(userService?: UserService) {
    this.stripe = stripe;
    this.userService = userService || new UserService();
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
      const user = await this.userService.findById(userId);
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
      await this.userService.updateStripeCustomerId(userId, customer.id);

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

  // Creates a Stripe Billing Portal session for customer self-service
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });

      return { url: session.url };
    } catch (error) {
      throw new BillingPortalException(
        error instanceof Error ? error.message : 'Failed to create billing portal session'
      );
    }
  }

  // Cancels a Stripe subscription
  async cancelSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const canceledSubscription = await this.stripe.subscriptions.cancel(stripeSubscriptionId);
      return canceledSubscription;
    } catch (error) {
      throw new SubscriptionCancellationException(
        error instanceof Error ? error.message : 'Failed to cancel subscription'
      );
    }
  }
}
