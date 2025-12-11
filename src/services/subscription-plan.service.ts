import { SubscriptionPlan, SubscriptionPlanModel } from '../models/subscription-plan.model.js';
import { ProductModel } from '../models/product.model.js';
import {
  DatabaseException,
} from '../errors/CustomError.js';

export class SubscriptionPlanService {
  async getAllPlans(page: number = 1, limit: number = 10): Promise<{ plans: SubscriptionPlan[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      const total = await SubscriptionPlanModel.countDocuments({});
      const plans = await SubscriptionPlanModel.find({})
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
      
      const productIds = plans.map(p => p.productId);
      const products = await ProductModel.find({ id: { $in: productIds } });
      const productMap = new Map(products.map(p => [p.id, p]));

      return {
        plans: plans.map(plan => ({
          id: plan.id,
          stripePriceId: plan.stripePriceId,
          productId: plan.productId,
          product: productMap.get(plan.productId),
          frequency: plan.frequency,
          currency: plan.currency,
          createdAt: plan.createdAt
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new DatabaseException('fetch subscription plans', error instanceof Error ? error : undefined);
    }
  }

  async getPlanById(id: string): Promise<SubscriptionPlan | null> {
    try {
      const plan = await SubscriptionPlanModel.findOne({ id });
      if (!plan) {
        return null;
      }
      
      const product = await ProductModel.findOne({ id: plan.productId });

      return {
        id: plan.id,
        stripePriceId: plan.stripePriceId,
        productId: plan.productId,
        product: product || undefined,
        frequency: plan.frequency,
        currency: plan.currency,
        createdAt: plan.createdAt
      };
    } catch (error) {
      throw new DatabaseException('fetch subscription plan', error instanceof Error ? error : undefined);
    }
  }

  async createPlan(planData: Omit<SubscriptionPlan, 'id' | 'createdAt'>): Promise<SubscriptionPlan> {
    try {
      const newPlan = new SubscriptionPlanModel({
        id: crypto.randomUUID(),
        stripePriceId: planData.stripePriceId,
        productId: planData.productId,
        frequency: planData.frequency,
        currency: planData.currency
      });

      await newPlan.save();

      return {
        id: newPlan.id,
        stripePriceId: newPlan.stripePriceId,
        productId: newPlan.productId,
        frequency: newPlan.frequency,
        currency: newPlan.currency,
        createdAt: newPlan.createdAt
      };
    } catch (error) {
      throw new DatabaseException(
        `create subscription plan`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async updatePlan(
    id: string,
    planData: Partial<Omit<SubscriptionPlan, 'id' | 'createdAt'>>
  ): Promise<SubscriptionPlan | null> {
    try {
      const result = await SubscriptionPlanModel.findOneAndUpdate(
        { id },
        { $set: planData },
        { new: true }
      );

      if (!result) {
        return null;
      }

      return {
        id: result.id,
        stripePriceId: result.stripePriceId,
        productId: result.productId,
        frequency: result.frequency,
        currency: result.currency,
        createdAt: result.createdAt
      };
    } catch (error) {
      throw new DatabaseException(`update subscription plan ${id}`, error instanceof Error ? error : undefined);
    }
  }

  async deletePlan(id: string): Promise<boolean> {
    try {
      const result = await SubscriptionPlanModel.findOneAndDelete({ id });
      return !!result;
    } catch (error) {
      throw new DatabaseException('delete subscription plan', error instanceof Error ? error : undefined);
    }
  }
}
