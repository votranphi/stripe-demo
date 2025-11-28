import { SubscriptionPlanService } from './subscription-plan.service.js';
import { UserService } from './user.service.js';
import { PaymentService } from './payment.service.js';
import {
  SubscriptionPlanNotFoundException,
  DatabaseException,
  CheckoutSessionException
} from '../errors/CustomError.js';

export class SubscriptionService {
  private readonly subscriptionPlanService: SubscriptionPlanService;
  private readonly userService: UserService;
  private readonly paymentService: PaymentService;

  constructor(
    subscriptionPlanService?: SubscriptionPlanService,
    userService?: UserService,
    paymentService?: PaymentService
  ) {
    this.subscriptionPlanService = subscriptionPlanService || new SubscriptionPlanService();
    this.userService = userService || new UserService();
    this.paymentService = paymentService || new PaymentService();
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
      const successUrl = `${process.env.BASE_URL}/api/v1/subscriptions/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${process.env.BASE_URL}/api/v1/subscriptions/checkout/cancel`;

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
}
