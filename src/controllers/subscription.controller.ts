import { Request, Response } from 'express';
import { SubscriptionService } from '../services/subscription.service.js';
import { CreateSubscriptionCheckoutDTO, CreateBillingPortalSessionDTO } from '../dtos/subscription.dto.js';
import { ErrorMiddleware } from '../middlewares/error.middleware.js';
import { MissingSessionIdException, UnauthorizedException } from '../errors/CustomError.js';

export class SubscriptionController {
  private subscriptionService: SubscriptionService | null = null;

  // For lazy initialization
  private getSubscriptionService(): SubscriptionService {
    if (!this.subscriptionService) {
      this.subscriptionService = new SubscriptionService();
    }
    return this.subscriptionService;
  }

  // POST /api/v1/subscriptions/checkout/create-session
  createCheckoutSession = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    // Validate request body using DTO
    const dto = new CreateSubscriptionCheckoutDTO(req.body);

    // Create checkout session
    const { checkoutUrl, sessionId } = await this.getSubscriptionService().createCheckoutSession(
      userId,
      dto.planId
    );

    res.status(201).json({
      success: true,
      data: {
        sessionId: sessionId,
        checkoutUrl: checkoutUrl
      }
    });
  });

  // GET /api/v1/subscriptions/me
  getMySubscription = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const subscription = await this.getSubscriptionService().getMySubscription(userId);

    res.status(200).json({
      success: true,
      data: subscription
    });
  });

  // POST /api/v1/subscriptions/portal-session
  createPortalSession = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    // Validate request body using DTO
    const dto = new CreateBillingPortalSessionDTO(req.body);

    const { url } = await this.getSubscriptionService().createBillingPortalSession(
      userId,
      dto.returnUrl
    );

    res.status(201).json({
      success: true,
      data: {
        portalUrl: url
      }
    });
  });

  // DELETE /api/v1/subscriptions/:id
  cancelSubscription = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const { id: subscriptionId } = req.params;
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    await this.getSubscriptionService().cancelSubscription(userId, subscriptionId);

    res.status(200).json({
      success: true,
      message: 'Subscription cancellation initiated. The subscription status will be updated shortly.'
    });
  });

  // GET /api/v1/subscriptions/checkout/success?session_id=xxx
  checkoutSuccess = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.query.session_id as string;

    if (!sessionId) {
      throw new MissingSessionIdException();
    }

    // Retrieve session info (DO NOT update status here - only webhook should do that)
    const { session } = await this.getSubscriptionService().retrieveCheckoutSession(sessionId);

    res.status(200).json({
      success: true,
      message: 'Subscription checkout successful! Your subscription is being processed.',
      data: {
        subscriptionId: session.subscription,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email
      }
    });
  });

  // GET /api/v1/subscriptions/checkout/cancel
  checkoutCancel = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      message: 'Subscription checkout was canceled. You can retry anytime.',
      data: {
        redirectUrl: '/subscription-plans'
      }
    });
  });
}
