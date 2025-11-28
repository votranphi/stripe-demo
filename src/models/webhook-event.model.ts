import mongoose, { Schema, Document } from 'mongoose';

export interface WebhookEvent {
  stripeId: string;
  eventType: string;
  orderId?: string;
  processedAt: Date;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
}

export interface WebhookEventDocument extends Document {
  stripeId: string;
  eventType: string;
  orderId?: string;
  processedAt: Date;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
}

const webhookEventSchema = new Schema<WebhookEventDocument>({
  stripeId: { type: String, required: true, index: true },
  eventType: { type: String, required: true },
  orderId: { type: String },
  processedAt: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: ['success', 'failed', 'pending'], required: true },
  errorMessage: { type: String }
});

webhookEventSchema.index({ stripeId: 1, eventType: 1 }, { unique: true });

export const WebhookEventModel = mongoose.model<WebhookEventDocument>('WebhookEvent', webhookEventSchema);
