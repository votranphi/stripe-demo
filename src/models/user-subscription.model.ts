import mongoose, { Schema, Document } from 'mongoose';

export enum UserSubscriptionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface UserSubscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  status: UserSubscriptionStatus;
  currentPeriodEnd: Date;
  createdAt?: Date;
}

export interface UserSubscriptionDocument extends Document {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  status: UserSubscriptionStatus;
  currentPeriodEnd: Date;
  createdAt?: Date;
}

const userSubscriptionSchema = new Schema<UserSubscriptionDocument>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, ref: 'User' },
  stripeSubscriptionId: { type: String, required: true },
  status: { type: String, enum: Object.values(UserSubscriptionStatus), required: true },
  currentPeriodEnd: { type: Date, required: true }
}, {
  timestamps: true
});

export const UserSubscriptionModel = mongoose.model<UserSubscriptionDocument>('UserSubscription', userSubscriptionSchema);
