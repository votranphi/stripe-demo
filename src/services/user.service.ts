import { ClientSession } from 'mongoose';
import { UserModel, User } from '../models/user.model.js';
import { DatabaseException } from '../errors/CustomError.js';

export class UserService {
  // Find user by ID
  async findById(userId: string, session?: ClientSession): Promise<User | null> {
    try {
      const query = UserModel.findOne({ id: userId });
      if (session) {
        query.session(session);
      }
      const user = await query.exec();
      if (!user) {
        return null;
      }
      return {
        id: user.id,
        email: user.email,
        password: user.password,
        role: user.role,
        draftOrderId: user.draftOrderId,
        stripeCustomerId: user.stripeCustomerId
      };
    } catch (error) {
      throw new DatabaseException(
        'find user by ID',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Find user by email
  async findByEmail(email: string, session?: ClientSession): Promise<User | null> {
    try {
      const query = UserModel.findOne({ email });
      if (session) {
        query.session(session);
      }
      const user = await query.exec();
      if (!user) {
        return null;
      }
      return {
        id: user.id,
        email: user.email,
        password: user.password,
        role: user.role,
        draftOrderId: user.draftOrderId,
        stripeCustomerId: user.stripeCustomerId
      };
    } catch (error) {
      throw new DatabaseException(
        'find user by email',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Update user's draft order ID
  async updateDraftOrderId(userId: string, draftOrderId: string, session?: ClientSession): Promise<void> {
    try {
      const options: any = {};
      if (session) {
        options.session = session;
      }
      await UserModel.findOneAndUpdate(
        { id: userId },
        { $set: { draftOrderId } },
        options
      );
    } catch (error) {
      throw new DatabaseException(
        'update user draft order ID',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Update user's Stripe customer ID
  async updateStripeCustomerId(userId: string, stripeCustomerId: string, session?: ClientSession): Promise<void> {
    try {
      const options: any = {};
      if (session) {
        options.session = session;
      }
      await UserModel.findOneAndUpdate(
        { id: userId },
        { $set: { stripeCustomerId } },
        options
      );
    } catch (error) {
      throw new DatabaseException(
        'update user Stripe customer ID',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Get user's Stripe customer ID
  async getStripeCustomerId(userId: string): Promise<string | null> {
    try {
      const user = await this.findById(userId);
      return user?.stripeCustomerId || null;
    } catch (error) {
      throw new DatabaseException(
        'get user Stripe customer ID',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Check if user exists
  async exists(userId: string, session?: ClientSession): Promise<boolean> {
    try {
      const query = UserModel.countDocuments({ id: userId });
      if (session) {
        query.session(session);
      }
      const count = await query.exec();
      return count > 0;
    } catch (error) {
      throw new DatabaseException(
        'check user exists',
        error instanceof Error ? error : undefined
      );
    }
  }
}
