import { Request, Response } from 'express';
import { SubscriptionService } from '../services/subscription.service.js';
import { CreateSubscriptionCheckoutDTO } from '../dtos/subscription.dto.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import { UnauthorizedException } from '../errors/CustomError.js';

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
  createCheckoutSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
}
