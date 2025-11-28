import { Request, Response, NextFunction } from 'express';
import { UserSubscriptionService } from '../services/user-subscription.service.js';
import { ForbiddenException, UnauthorizedException } from '../errors/CustomError.js';

export class SubscriptionMiddleware {
  private userSubscriptionService: UserSubscriptionService;

  constructor() {
    this.userSubscriptionService = new UserSubscriptionService();
  }

  // Check if user has an active subscription
  isSubscribed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.userId) {
        throw new UnauthorizedException();
      }

      const activeSubscriptions = await this.userSubscriptionService.getActiveSubscriptionsByUserId(req.user.userId);

      if (activeSubscriptions && activeSubscriptions.length > 0) {
        next();
      } else {
        throw new ForbiddenException();
      }
    } catch (error) {
      next(error);
    }
  };
}
