import { SubscriptionPlanModel } from '../models/subscription-plan.model.js';
import { UserModel } from '../models/user.model.js';
import { PaymentService } from './payment.service.js';
import {
  SubscriptionPlanNotFoundException,
  DatabaseException,
  CheckoutSessionException
} from '../errors/CustomError.js';

export class SubscriptionService {
  private readonly paymentService: PaymentService;

  constructor(paymentService?: PaymentService) {
    this.paymentService = paymentService || new PaymentService();
  }

  async createCheckoutSession(
    userId: string,
    planId: string
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    try {
      // Validate that the subscription plan exists
      const plan = await SubscriptionPlanModel.findOne({ id: planId });
      if (!plan) {
        throw new SubscriptionPlanNotFoundException(planId);
      }

      // Get user to retrieve email
      const user = await UserModel.findOne({ id: userId });
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
