import { SubscriptionPlanService } from './subscription-plan.service.js';
import { UserService } from './user.service.js';
import { PaymentService } from './payment.service.js';
import { UserSubscriptionService } from './user-subscription.service.js';
import {
  SubscriptionPlanNotFoundException,
  DatabaseException,
  CheckoutSessionException,
  MissingStripeCustomerException,
  UserSubscriptionNotFoundException,
  ForbiddenException
} from '../errors/CustomError.js';

export class SubscriptionService {
  private readonly subscriptionPlanService: SubscriptionPlanService;
  private readonly userService: UserService;
  private readonly paymentService: PaymentService;
  private readonly userSubscriptionService: UserSubscriptionService;

  constructor(
    subscriptionPlanService?: SubscriptionPlanService,
    userService?: UserService,
    paymentService?: PaymentService,
    userSubscriptionService?: UserSubscriptionService
  ) {
    this.subscriptionPlanService = subscriptionPlanService || new SubscriptionPlanService();
    this.userService = userService || new UserService();
    this.paymentService = paymentService || new PaymentService();
    this.userSubscriptionService = userSubscriptionService || new UserSubscriptionService();
  }

  async createCheckoutSession(
    userId: string,
    planId: string
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    try {
      // Validate that the subscription plan exists
      const plan = await this.subscriptionPlanService.getPlanById(planId);
      if (!plan) {
        throw new SubscriptionPlanNotFoundException(planId);
      }

      // Get user to retrieve email
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new DatabaseException('User not found');
      }

      // Get or create Stripe customer
      const customerId = await this.paymentService.getOrCreateCustomer(userId, user.email);

      // Create success and cancel URLs
      const successUrl = `${process.env.FRONTEND_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${process.env.FRONTEND_BASE_URL}/cancel`;

      // Create subscription checkout session
      const { sessionId, url } = await this.paymentService.createSubscriptionCheckoutSession(
        customerId,
        plan.stripePriceId,
        userId,
        successUrl,
        cancelUrl
      );

      return {
        checkoutUrl: url,
        sessionId: sessionId
      };
    } catch (error) {
      if (
        error instanceof SubscriptionPlanNotFoundException ||
        error instanceof DatabaseException ||
        error instanceof CheckoutSessionException
      ) {
        throw error;
      }
      throw new DatabaseException(
        'create subscription checkout session',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Get current user's active subscription with plan details
  async getMySubscription(userId: string) {
    try {
      const subscription = await this.userSubscriptionService.getActiveSubscriptionByUserId(userId);
      return subscription;
    } catch (error) {
      if (error instanceof DatabaseException) {
        throw error;
      }
      throw new DatabaseException(
        'get my subscription',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Create billing portal session for self-service
  async createBillingPortalSession(
    userId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    try {
      // Get user to retrieve stripeCustomerId
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new DatabaseException('User not found');
      }

      // Ensure user has a Stripe customer ID
      if (!user.stripeCustomerId) {
        throw new MissingStripeCustomerException();
      }

      // Create billing portal session
      const { url } = await this.paymentService.createBillingPortalSession(
        user.stripeCustomerId,
        returnUrl
      );

      return { url };
    } catch (error) {
      if (
        error instanceof DatabaseException ||
        error instanceof MissingStripeCustomerException
      ) {
        throw error;
      }
      throw new DatabaseException(
        'create billing portal session',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Cancel subscription - does NOT update local DB, relies on webhook
  async cancelSubscription(userId: string, subscriptionId: string): Promise<void> {
    try {
      // Find the subscription
      const subscription = await this.userSubscriptionService.findById(subscriptionId);
      
      if (!subscription) {
        throw new UserSubscriptionNotFoundException(subscriptionId);
      }

      // Validate that the subscription belongs to the requesting user
      if (subscription.userId !== userId) {
        throw new ForbiddenException();
      }

      // Cancel subscription in Stripe
      // NOTE: We do NOT update local database here.
      // The WebhookService handles 'customer.subscription.deleted' event
      // which will update the local database state to ensure data consistency.
      await this.paymentService.cancelSubscription(subscription.stripeSubscriptionId);
    } catch (error) {
      if (
        error instanceof UserSubscriptionNotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof DatabaseException
      ) {
        throw error;
      }
      throw new DatabaseException(
        'cancel subscription',
        error instanceof Error ? error : undefined
      );
    }
  }
}
