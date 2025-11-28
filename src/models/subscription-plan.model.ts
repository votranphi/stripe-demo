import mongoose, { Schema, Document } from 'mongoose';

export enum SubscriptionFrequency {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

export interface SubscriptionPlan {
  id: string;
  stripePriceId: string;
  productId: string;
  frequency: SubscriptionFrequency;
  currency: string;
  createdAt?: Date;
}

export interface SubscriptionPlanDocument extends Document {
  id: string;
  stripePriceId: string;
  productId: string;
  frequency: SubscriptionFrequency;
  currency: string;
  createdAt?: Date;
}

const subscriptionPlanSchema = new Schema<SubscriptionPlanDocument>({
  id: { type: String, required: true, unique: true },
  stripePriceId: { type: String, required: true },
  productId: { type: String, required: true, ref: 'Product' },
  frequency: { 
    type: String, 
    enum: Object.values(SubscriptionFrequency), 
    required: true 
  },
  currency: { type: String, default: 'usd', required: true }
}, {
  timestamps: true
});

export const SubscriptionPlanModel = mongoose.model<SubscriptionPlanDocument>('SubscriptionPlan', subscriptionPlanSchema);
