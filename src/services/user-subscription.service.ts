import { ClientSession } from 'mongoose';
import { UserSubscriptionModel, UserSubscriptionStatus } from '../models/user-subscription.model.js';
import { DatabaseException } from '../errors/CustomError.js';
import crypto from 'crypto';

export class UserSubscriptionService {
  // Find UserSubscription by Stripe subscription ID
  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
    session?: ClientSession
  ) {
    try {
      const query = UserSubscriptionModel.findOne({ stripeSubscriptionId });
      if (session) {
        query.session(session);
      }
      return await query.exec();
    } catch (error) {
      throw new DatabaseException(
        'find user subscription by stripe subscription ID',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Create or update UserSubscription
  async createOrUpdate(
    stripeSubscriptionId: string,
    userId: string,
    status: UserSubscriptionStatus,
    currentPeriodEnd: Date,
    session?: ClientSession
  ) {
    try {
      const updateData = {
        id: crypto.randomUUID(),
        userId,
        stripeSubscriptionId,
        status,
        currentPeriodEnd
      };

      const options: any = {
        upsert: true,
        setDefaultsOnInsert: true,
        new: true
      };

      if (session) {
        options.session = session;
      }

      return await UserSubscriptionModel.findOneAndUpdate(
        { stripeSubscriptionId },
        updateData,
        options
      );
    } catch (error) {
      throw new DatabaseException(
        'create or update user subscription',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Update UserSubscription status
  async updateStatus(
    stripeSubscriptionId: string,
    status: UserSubscriptionStatus,
    session?: ClientSession
  ) {
    try {
      const userSubscription = await this.findByStripeSubscriptionId(stripeSubscriptionId, session);

      if (!userSubscription) {
        throw new Error(`UserSubscription not found for subscription ${stripeSubscriptionId}`);
      }

      userSubscription.status = status;
      return await userSubscription.save({ session });
    } catch (error) {
      throw new DatabaseException(
        'update user subscription status',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Update UserSubscription status and current period end
  async updateStatusAndPeriodEnd(
    stripeSubscriptionId: string,
    status: UserSubscriptionStatus,
    currentPeriodEnd: Date,
    session?: ClientSession
  ) {
    try {
      const userSubscription = await this.findByStripeSubscriptionId(stripeSubscriptionId, session);

      if (!userSubscription) {
        throw new Error(`UserSubscription not found for subscription ${stripeSubscriptionId}`);
      }

      userSubscription.status = status;
      userSubscription.currentPeriodEnd = currentPeriodEnd;
      return await userSubscription.save({ session });
    } catch (error) {
      throw new DatabaseException(
        'update user subscription status and period end',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Check if UserSubscription exists
  async exists(stripeSubscriptionId: string, session?: ClientSession): Promise<boolean> {
    try {
      const query = UserSubscriptionModel.countDocuments({ stripeSubscriptionId });
      if (session) {
        query.session(session);
      }
      const count = await query.exec();
      return count > 0;
    } catch (error) {
      throw new DatabaseException(
        'check user subscription exists',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Get active subscriptions for a user
  async getActiveSubscriptionsByUserId(userId: string) {
    try {
      return await UserSubscriptionModel.find({
        userId,
        status: UserSubscriptionStatus.ACTIVE
      }).exec();
    } catch (error) {
      throw new DatabaseException(
        'get active user subscriptions',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Get all subscriptions for a user
  async getSubscriptionsByUserId(userId: string) {
    try {
      return await UserSubscriptionModel.find({ userId }).exec();
    } catch (error) {
      throw new DatabaseException(
        'get user subscriptions',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Find UserSubscription by ID
  async findById(subscriptionId: string) {
    try {
      return await UserSubscriptionModel.findOne({ id: subscriptionId }).exec();
    } catch (error) {
      throw new DatabaseException(
        'find user subscription by ID',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Get active subscription for a user with details
  async getActiveSubscriptionByUserId(userId: string) {
    try {
      return await UserSubscriptionModel.findOne({
        userId,
        status: UserSubscriptionStatus.ACTIVE
      }).exec();
    } catch (error) {
      throw new DatabaseException(
        'get active user subscription',
        error instanceof Error ? error : undefined
      );
    }
  }
}
